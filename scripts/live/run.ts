#!/usr/bin/env node
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { fullRegistry, runFullEntry } from "./full.ts";
import { sanitizeEvidence } from "./harness.ts";
import { defaultInstanceDeps, foreignMainPids, startIsolatedInstance } from "./instance.ts";
import { projectRoot, startMcp } from "./mcp.ts";
import { diffAgainstBaseline, formatResultLine, formatSummary, readBaseline, writeBaseline, writeRunReports } from "./report.ts";
import { connectWithRetry, createResetter, openHarnessDocument } from "./reset.ts";
import { exitCodeFor, runChecks, type PlannedCheck } from "./runner.ts";
import { withScratchDirectory } from "./scratch.ts";
import { installSignalCleanup } from "./signals.ts";
import { LiveSessionManager, type LiveSession } from "./session.ts";
import { smokeChecks } from "./smoke/index.ts";
import type { CheckResult, RunReport, Tier } from "./types.ts";

export const SMOKE_TIMEOUT_MS = 60_000;
export const FULL_TIMEOUT_MS = 300_000;

export interface RunOptions {
  tier: Tier;
  only: string[];
  updateBaseline: boolean;
  help: boolean;
}

export function parseRunArgs(argv: string[]): RunOptions {
  const options: RunOptions = { tier: "smoke", only: [], updateBaseline: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") options.help = true;
    else if (argument === "--update-baseline") options.updateBaseline = true;
    else if (argument === "--tier") {
      const value = argv[++index];
      if (value !== "smoke" && value !== "full") throw new Error("--tier must be smoke or full");
      options.tier = value;
    } else if (argument === "--only") {
      const value = argv[++index];
      if (!value) throw new Error("--only requires a comma-separated list of check names");
      options.only.push(...value.split(",").map((name) => name.trim()).filter(Boolean));
    } else throw new Error(`Unknown argument: ${String(argument)}`);
  }
  return options;
}

export function selectByName<T extends { name: string }>(items: T[], only: string[]): T[] {
  if (only.length === 0) return items;
  const known = items.map((item) => item.name);
  const unknown = only.filter((name) => !known.includes(name));
  if (unknown.length > 0) throw new Error(`Unknown check(s): ${unknown.join(", ")}. Available: ${known.join(", ")}`);
  return items.filter((item) => only.includes(item.name));
}

const HELP = `Usage:
  npm run test:live [-- --only NAME[,NAME]] [--update-baseline]
  npm run test:live:full [-- --only NAME[,NAME]] [--update-baseline]

Starts an isolated Plasticity with a temporary profile, runs live checks through the
real MCP server, writes live-runs/<timestamp>-<tier>/report.{json,md} and compares the
run with live-runs/baseline-<tier>.json. Your own Plasticity window is never touched.
Exit codes: 0 ok, 1 failures/regressions/aborted, 2 the harness could not start.`;

type Log = (line: string) => Promise<void>;

async function main(): Promise<number> {
  const options = parseRunArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return 0;
  }
  const smoke = options.tier === "smoke" ? selectByName(smokeChecks, options.only) : [];
  const full = options.tier === "full" ? selectByName(fullRegistry, options.only) : [];

  const runsRoot = join(projectRoot, "live-runs");
  const startedAt = new Date();
  const runDir = join(runsRoot, `${startedAt.toISOString().replace(/[:.]/g, "-")}-${options.tier}`);
  await mkdir(join(runDir, "checks"), { recursive: true });
  const scratchRoot = await mkdtemp(join(tmpdir(), "plasticity-live-run-"));
  const log: Log = async (line) => { await appendFile(join(runDir, "instance.log"), `${new Date().toISOString()} ${line}\n`); };

  const instanceDeps = defaultInstanceDeps();
  const userPlasticity = foreignMainPids(await instanceDeps.listProcesses());
  if (userPlasticity.length > 0) await log(`user Plasticity processes left untouched: ${userPlasticity.join(", ")}`);
  const sessions = new LiveSessionManager({
    startInstance: (registerStop) => startIsolatedInstance(undefined, registerStop),
    startMcp: (instance) => startMcp({ cdpUrl: instance.cdpUrl, stateDir: join(runDir, "mcp-state") }),
    connect: async (mcp, instance) => {
      await connectWithRetry(mcp, instance.targetId);
      // Never edit whatever document the new instance reopened (it may be a user's autosaved file).
      await openHarnessDocument(mcp, {
        fixture: join(projectRoot, "scripts", "live", "fixtures", "empty.plasticity"),
        target: join(runsRoot, "harness-document.plasticity"),
        backupPath: join(scratchRoot, `before-harness-document-${Date.now()}.plasticity`),
      });
    },
    log,
  });
  let finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true;
    await sessions.close();
    await rm(scratchRoot, { recursive: true, force: true });
    const vanished = userPlasticity.filter((pid) => !instanceDeps.isAlive(pid));
    if (vanished.length > 0) {
      const warning = `WARNING: user Plasticity process(es) ${vanished.join(", ")} are no longer running after the live run`;
      console.error(warning);
      await log(warning);
    }
  };
  const uninstallSignals = installSignalCleanup(finish);
  try {
    try {
      await sessions.open();
    } catch (error) {
      console.error(`Live harness could not start: ${error instanceof Error ? error.message : String(error)}`);
      return 2;
    }
    const current = (): LiveSession => {
      if (!sessions.current) throw new Error("Live session is closed");
      return sessions.current;
    };
    const resetDocument = createResetter(() => current().mcp);
    const reset = async () => {
      try {
        await resetDocument();
      } catch (error) {
        await log(`reset failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    };
    const restart = async () => {
      await sessions.restart();
    };

    const planned: PlannedCheck[] = options.tier === "smoke"
      ? smoke.map((check) => ({
        name: check.name,
        timeoutMs: SMOKE_TIMEOUT_MS,
        async execute() {
          const session = current();
          return await withScratchDirectory(scratchRoot, check.name, join(runDir, "checks", check.name), (workDir) =>
            check.run({ mcp: session.mcp, targetId: session.instance.targetId, cdpUrl: session.instance.cdpUrl, workDir }));
        },
      }))
      : full.map((entry) => ({
        name: entry.name,
        timeoutMs: FULL_TIMEOUT_MS,
        ...(entry.skipReason === undefined ? {} : { skipReason: entry.skipReason }),
        async execute(signal: AbortSignal) {
          const session = current();
          return await withScratchDirectory(scratchRoot, entry.name, join(runDir, "checks", entry.name), (checkDir) =>
            runFullEntry(entry, { cdpUrl: session.instance.cdpUrl, targetId: session.instance.targetId, checkDir, signal }));
        },
      }));

    const outcome = await runChecks(planned, {
      reset,
      restart,
      async onResult(result) {
        console.log(formatResultLine(result));
        await writeFile(join(runDir, "checks", `${result.name}.json`), `${JSON.stringify(sanitizeEvidence(result), null, 2)}\n`);
      },
    });
    const report: RunReport = {
      schemaVersion: 1,
      tier: options.tier,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      aborted: outcome.aborted,
      results: outcome.results.map((result) => sanitizeEvidence(result) as CheckResult),
    };
    const diff = diffAgainstBaseline(report, await readBaseline(runsRoot, options.tier));
    await writeRunReports(runDir, report, diff);
    console.log(formatSummary(report, diff));
    console.log(`Report: ${join(runDir, "report.md")}`);
    if (options.updateBaseline) {
      try {
        console.log(`Baseline updated: ${await writeBaseline(runsRoot, report)}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 1;
      }
    }
    return exitCodeFor(outcome, diff?.regressions.length ?? 0);
  } finally {
    uninstallSignals();
    await finish();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(
    (code) => { process.exitCode = code; },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
    },
  );
}

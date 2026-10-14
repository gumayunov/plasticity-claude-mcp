import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CheckResult, CheckStatus, RunReport, Tier } from "./types.ts";

export interface DriftEntry {
  name: string;
  path: string;
  baseline: number;
  current: number;
}

export interface BaselineDiff {
  regressions: string[];
  fixed: string[];
  added: string[];
  removed: string[];
  drift: DriftEntry[];
}

// Identifiers, revisions and history depth change between runs and must not count as drift.
const VOLATILE_KEY = /^(id|ids|revision|versionId|documentToken|undoDepth|redoDepth|durationMs|bytes)$|Ids?$/;

export function numericLeaves(value: unknown, prefix = "", out = new Map<string, number>()): Map<string, number> {
  if (typeof value === "number") {
    if (Number.isFinite(value)) out.set(prefix, value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => numericLeaves(item, `${prefix}[${index}]`, out));
    return out;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      if (VOLATILE_KEY.test(key)) continue;
      numericLeaves(entry, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

const isBroken = (status: CheckStatus) => status === "fail" || status === "error";

export function diffAgainstBaseline(current: RunReport, baseline: RunReport | null, tolerance = 0.01): BaselineDiff | null {
  if (!baseline) return null;
  const before = new Map(baseline.results.map((result) => [result.name, result]));
  const diff: BaselineDiff = { regressions: [], fixed: [], added: [], removed: [], drift: [] };
  for (const result of current.results) {
    const old = before.get(result.name);
    if (!old) {
      diff.added.push(result.name);
      continue;
    }
    if (old.status === "pass" && isBroken(result.status)) diff.regressions.push(result.name);
    if (isBroken(old.status) && result.status === "pass") diff.fixed.push(result.name);
    if (old.status !== "pass" || result.status !== "pass") continue;
    const now = numericLeaves(result.evidence ?? {});
    for (const [path, base] of numericLeaves(old.evidence ?? {})) {
      const value = now.get(path);
      if (value === undefined) continue;
      const changed = Number.isInteger(base) && Number.isInteger(value) ? base !== value : Math.abs(base - value) > tolerance;
      if (changed) diff.drift.push({ name: result.name, path, baseline: base, current: value });
    }
  }
  const currentNames = new Set(current.results.map((result) => result.name));
  for (const name of before.keys()) if (!currentNames.has(name)) diff.removed.push(name);
  return diff;
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)}s`;
  const seconds = Math.round(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const ICONS: Record<CheckStatus, string> = { pass: "✔", fail: "✘", error: "✘", skipped: "–" };

function firstLine(text: string): string {
  return text.split("\n")[0] ?? "";
}

export function formatResultLine(result: CheckResult): string {
  const base = `${ICONS[result.status]} ${result.name.padEnd(28)} ${formatDuration(result.durationMs).padStart(7)}`;
  if (!result.message) return base.trimEnd();
  const prefix = result.status === "error" ? "error: " : "";
  return `${base}  ${prefix}${firstLine(result.message)}`;
}

function count(report: RunReport, status: CheckStatus): number {
  return report.results.filter((result) => result.status === status).length;
}

export function formatSummary(report: RunReport, diff: BaselineDiff | null): string {
  const total = Date.parse(report.finishedAt) - Date.parse(report.startedAt);
  const counts = `${count(report, "pass")} pass, ${count(report, "fail")} fail, ${count(report, "error")} error, ${count(report, "skipped")} skipped`;
  const baseline = diff ? `${diff.regressions.length} regression(s) vs baseline` : "no baseline";
  return `${report.tier}: ${counts} · ${formatDuration(total)} · ${baseline}${report.aborted ? " · ABORTED" : ""}`;
}

function cell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function section(title: string, lines: string[]): string {
  return lines.length === 0 ? "" : `### ${title}\n\n${lines.map((line) => `- ${line}`).join("\n")}\n\n`;
}

export function renderMarkdown(report: RunReport, diff: BaselineDiff | null): string {
  const rows = report.results.map((result) =>
    `| ${result.name} | ${ICONS[result.status]} ${result.status} | ${formatDuration(result.durationMs)} | ${cell(result.message ?? "")} |`);
  const changes = diff
    ? [
      section("Regressions", diff.regressions),
      section("Fixed", diff.fixed),
      section("New", diff.added),
      section("Removed", diff.removed),
      section("Evidence drift", diff.drift.map((entry) => `${entry.name} \`${entry.path}\`: ${entry.baseline} → ${entry.current}`)),
    ].join("") || "No changes.\n"
    : "No baseline yet. Accept this run with `--update-baseline`.\n";
  return [
    `# Live run: ${report.tier}`,
    "",
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Result: ${formatSummary(report, diff)}`,
    "",
    "| Check | Status | Time | Message |",
    "|---|---|---|---|",
    ...rows,
    "",
    "## Changes since baseline",
    "",
    changes,
  ].join("\n");
}

export async function writeRunReports(runDir: string, report: RunReport, diff: BaselineDiff | null): Promise<void> {
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "report.json"), `${JSON.stringify({ ...report, baselineDiff: diff }, null, 2)}\n`);
  await writeFile(join(runDir, "report.md"), renderMarkdown(report, diff));
}

export function baselinePath(runsRoot: string, tier: Tier): string {
  return join(runsRoot, `baseline-${tier}.json`);
}

export async function readBaseline(runsRoot: string, tier: Tier): Promise<RunReport | null> {
  try {
    return JSON.parse(await readFile(baselinePath(runsRoot, tier), "utf8")) as RunReport;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeBaseline(runsRoot: string, report: RunReport): Promise<string> {
  if (report.aborted || report.results.some((result) => result.status === "error")) {
    throw new Error("Refusing to update baseline: the run has errors or was aborted");
  }
  const path = baselinePath(runsRoot, report.tier);
  await mkdir(runsRoot, { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  return path;
}

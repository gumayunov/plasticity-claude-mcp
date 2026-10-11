#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { discoverPlasticityTargets } from "../src/cdp/discovery.ts";
import { buildCompatibilityReport, renderCompatibilityMarkdown } from "../src/plasticity/compat/report.ts";
import { defaultRequirementSources, extractRequirements } from "../src/plasticity/compat/requirements.ts";
import { PlasticityRuntime } from "../src/plasticity/runtime.ts";
import { startIsolatedInstance, type IsolatedInstance } from "./live/instance.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const argv = process.argv.slice(2);
const isolated = argv.includes("--isolated");
const cdpIndex = argv.indexOf("--cdp");
const cdpUrl = cdpIndex >= 0 ? argv[cdpIndex + 1] : undefined;

async function main(): Promise<number> {
  let instance: IsolatedInstance | undefined;
  let runtime: PlasticityRuntime | undefined;
  try {
    instance = isolated ? await startIsolatedInstance() : undefined;
    const endpoint = instance?.cdpUrl ?? cdpUrl ?? process.env.PLASTICITY_CDP_URL ?? "http://127.0.0.1:9223";
    const targets = await discoverPlasticityTargets(endpoint);
    const target = instance ? targets.find((candidate) => candidate.id === instance!.targetId) : targets[0];
    if (!target) throw new Error(`No Plasticity window at ${endpoint}; start it with npm run start:plasticity or use --isolated`);
    runtime = await PlasticityRuntime.connect(target);
    const report = buildCompatibilityReport(await runtime.probeCompatibility(), extractRequirements(defaultRequirementSources(root)), runtime.getProfile());
    const markdown = renderCompatibilityMarkdown(report);
    const directory = join(root, "compat-reports");
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${new Date().toISOString().replace(/[:.]/g, "-")}-${report.plasticity.version ?? "unknown"}.md`);
    await writeFile(path, markdown);
    console.log(markdown);
    console.log(`Report: ${path}`);
    return report.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  } finally {
    runtime?.close();
    await instance?.stop();
  }
}

process.exitCode = await main();

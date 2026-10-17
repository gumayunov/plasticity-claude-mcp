#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { sanitizeEvidence } from "./verify-section-strength-live.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MATERIAL_PREFIX = "Delete acceptance probe";

export interface AppearanceDeleteAcceptanceOptions {
  help: boolean;
  target?: string;
  allowDisposableMutations: boolean;
  output?: string;
}

export function parseAppearanceDeleteAcceptanceArgs(argv: string[]): AppearanceDeleteAcceptanceOptions {
  if (argv.length === 0) return { help: true, allowDisposableMutations: false };
  const options: AppearanceDeleteAcceptanceOptions = { help: false, allowDisposableMutations: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") options.help = true;
    else if (argument === "--allow-disposable-mutations") options.allowDisposableMutations = true;
    else if (argument === "--target") {
      const value = argv[++index];
      if (!value) throw new Error("--target requires an explicit Plasticity window ID");
      options.target = value;
    } else if (argument === "--output") {
      const value = argv[++index];
      if (!value) throw new Error("--output requires a new directory path");
      options.output = value;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.help) return options;
  if (!options.target) throw new Error("Appearance delete acceptance requires --target with an explicit window ID");
  if (!options.allowDisposableMutations) throw new Error("Appearance delete acceptance requires --allow-disposable-mutations");
  if (!options.output) throw new Error("Appearance delete acceptance requires --output with a new directory");
  return options;
}

const HELP = `Usage:
  node scripts/verify-appearance-material-delete-live.ts --help
  node scripts/verify-appearance-material-delete-live.ts --target ID --allow-disposable-mutations --output NEW_DIRECTORY

With no arguments or --help, this command performs no connection or mutation.
Live mode requires an explicitly selected disposable Plasticity document with no
redo history. Through the production stdio MCP server it creates one
temporary box and one appearance material assigned to it, checks that deleting
the assigned material is refused without a history step, clears the assignment,
deletes the material, then checks that native Undo restores the material and
Redo deletes it again. Cleanup undoes every confirmed edit. Evidence directories
are never overwritten.`;

interface LiveMcp { client: Client; stderr: string[] }

async function main(): Promise<void> {
  const options = parseAppearanceDeleteAcceptanceArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }
  const output = resolve(options.output!);
  await mkdir(output, { mode: 0o700 });
  const evidence: Record<string, unknown> = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    explicitlySelectedTarget: true,
    documentMutationAttempted: false,
  };
  let live: LiveMcp | undefined;
  let initialState: any;
  let latest: any;
  let mutationOutcomeUncertain = false;
  const mutate = async (name: string, args: Record<string, unknown>): Promise<any> => {
    mutationOutcomeUncertain = true;
    evidence.documentMutationAttempted = true;
    const state = await call(live!.client, name, { ...args, revision: latest.revision });
    requireCondition(state.documentToken === initialState.documentToken, "Plasticity document changed during acceptance");
    latest = state;
    mutationOutcomeUncertain = false;
    return state;
  };
  const materialName = `${MATERIAL_PREFIX} ${Date.now()}`;
  try {
    live = await startMcp(output);
    const windows = await call(live.client, "plasticity_list_windows", {});
    requireCondition(windows.some((window: { targetId: string }) => window.targetId === options.target), "Explicit Plasticity target was not found");
    initialState = await call(live.client, "plasticity_connect", { targetId: options.target });
    latest = initialState;
    evidence.preflight = { bodyCount: bodyCount(initialState), undoDepth: initialState.undoDepth, redoDepth: initialState.redoDepth };
    requireCondition(initialState.redoDepth === 0, "Refusing disposable changes because a new edit would clear this document's redo history");

    const created = await mutate("plasticity_create_box", {
      originMm: [0, 0, 0], sizeMm: [10, 10, 10], name: "Delete acceptance box", intent: "Temporary appearance delete acceptance body",
    });
    const bodyId = created.change.added[0].id;
    await mutate("plasticity_set_appearance_material", {
      ids: [bodyId], name: materialName, colorHex: "#3366cc", intent: "Temporary appearance delete acceptance material",
    });
    const materialId = materialIdByName(await call(live.client, "plasticity_list_appearance_materials", {}), materialName);

    const beforeRefusal = latest;
    const refusal = await call(live.client, "plasticity_delete_appearance_materials", {
      materialIds: [materialId], intent: "Must be refused: material is assigned", revision: latest.revision,
    }).then(() => undefined, (error: unknown) => boundedError(error));
    requireCondition(refusal !== undefined && /still assigned/i.test(refusal), "Deleting an assigned material was not refused");
    const afterRefusal = await call(live.client, "plasticity_status", {});
    requireCondition(afterRefusal.revision === beforeRefusal.revision && afterRefusal.undoDepth === beforeRefusal.undoDepth, "A refused delete changed the document or its history");

    await mutate("plasticity_set_appearance_material", { ids: [bodyId], materialId: 0, intent: "Clear the acceptance material assignment" });
    const undoBeforeDelete = latest.undoDepth;
    const deleted = await mutate("plasticity_delete_appearance_materials", { materialIds: [materialId], intent: "Delete the unused acceptance material" });
    const catalogAfterDelete = await call(live.client, "plasticity_list_appearance_materials", {});
    requireCondition(!hasMaterial(catalogAfterDelete, materialId), "Deleted material is still in the catalog");
    requireCondition(deleted.undoDepth === undoBeforeDelete + 1, "Delete did not add exactly one Undo step");
    requireCondition(deleted.change?.materialsChanged === true, "Scene change tracking did not report the catalog change");

    await mutate("plasticity_undo", { intent: "Undo acceptance material delete" });
    requireCondition(hasMaterial(await call(live.client, "plasticity_list_appearance_materials", {}), materialId), "Undo did not restore the deleted material");
    await mutate("plasticity_redo", { intent: "Redo acceptance material delete" });
    requireCondition(!hasMaterial(await call(live.client, "plasticity_list_appearance_materials", {}), materialId), "Redo did not delete the material again");

    evidence.checks = {
      assignedDeleteRefused: true,
      refusalLeftRevisionAndHistory: true,
      deletedFromCatalog: true,
      singleUndoStep: true,
      materialsChangeTracked: true,
      undoRestored: true,
      redoDeleted: true,
    };
    latest = await undoConfirmedChanges(live.client, initialState, latest, (uncertain) => { mutationOutcomeUncertain = uncertain; });
    evidence.cleanup = { bodyCountRestored: bodyCount(latest) === bodyCount(initialState), undoDepthRestored: latest.undoDepth === initialState.undoDepth };
    evidence.completedAt = new Date().toISOString();
    await writeExclusive(join(output, "evidence.json"), sanitizeEvidence(evidence));
    console.log(JSON.stringify({ ok: true, output, evidence: join(output, "evidence.json"), discardDisposableDocumentAfterward: true }, null, 2));
  } catch (error) {
    evidence.failure = boundedError(error);
    if (live && initialState && latest && !mutationOutcomeUncertain && latest.undoDepth > initialState.undoDepth) {
      evidence.cleanup = await undoConfirmedChanges(live.client, initialState, latest, (uncertain) => { mutationOutcomeUncertain = uncertain; })
        .then((state) => ({ bodyCountRestored: bodyCount(state) === bodyCount(initialState), undoDepthRestored: state.undoDepth === initialState.undoDepth }))
        .catch((cleanupError) => ({ bodyCountRestored: false, reason: boundedError(cleanupError) }));
    } else if (mutationOutcomeUncertain) {
      evidence.cleanup = { bodyCountRestored: false, reason: "native mutation outcome is uncertain; automatic Undo was refused" };
    }
    await writeExclusive(join(output, "failure.json"), sanitizeEvidence(evidence)).catch(() => {});
    throw error;
  } finally {
    await live?.client.close().catch(() => {});
  }
}

export function materialIdByName(listing: any, name: string): number {
  const matches = (listing?.materials ?? []).filter((material: { name: string }) => material.name === name);
  requireCondition(matches.length === 1, `Expected exactly one appearance material named ${name}`);
  return matches[0].id;
}

export function hasMaterial(listing: any, id: number): boolean {
  return (listing?.materials ?? []).some((material: { id: number }) => material.id === id);
}

async function undoConfirmedChanges(client: Client, initial: any, latest: any, setUncertain: (uncertain: boolean) => void): Promise<any> {
  let state = latest;
  while (state.undoDepth > initial.undoDepth) {
    const current = await call(client, "plasticity_status", {});
    requireCondition(current.documentToken === initial.documentToken, "Plasticity document changed during cleanup");
    setUncertain(true);
    state = await call(client, "plasticity_undo", { intent: "Cleanup appearance delete acceptance", revision: current.revision });
    setUncertain(false);
  }
  requireCondition(bodyCount(state) === bodyCount(initial), "Cleanup changed the disposable document's initial body count");
  return state;
}

export function bodyCount(state: any): number {
  if (typeof state?.bodyPagination?.total === "number") return state.bodyPagination.total;
  if (Array.isArray(state?.bodies)) return state.bodies.length;
  if (typeof state?.bodyCount === "number") return state.bodyCount;
  throw new Error("Plasticity response omitted its body count");
}

async function startMcp(output: string): Promise<LiveMcp> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(projectRoot, "scripts", "run-server.ts")],
    cwd: projectRoot,
    env: {
      ...selectedEnvironment(process.env),
      PLASTICITY_CDP_URL: process.env.PLASTICITY_CDP_URL ?? "http://127.0.0.1:9223",
      PLASTICITY_STRENGTH_ROOT: join(output, "strength"),
      PLASTICITY_CONSTRUCTION_HISTORY_ROOT: join(output, "history"),
      PLASTICITY_REFERENCE_ROOT: join(output, "references"),
      PLASTICITY_REFERENCE_ARTIFACT_ROOT: join(output, "artifacts"),
    },
    stderr: "pipe",
  });
  const stderr: string[] = [];
  transport.stderr?.on("data", (chunk) => {
    stderr.push(String(chunk).slice(-4096));
    while (stderr.join("").length > 16384) stderr.shift();
  });
  const client = new Client({ name: "plasticity-appearance-delete-live", version: "1.0.0" });
  await client.connect(transport);
  return { client, stderr };
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<any> {
  const response = await client.callTool({ name, arguments: args });
  const text = toolText(response);
  if ("isError" in response && response.isError) throw new Error(text);
  return JSON.parse(text);
}

function toolText(response: unknown): string {
  if (typeof response !== "object" || response === null || !("content" in response) || !Array.isArray(response.content)) throw new Error("MCP tool returned no content");
  const item = response.content.find((entry): entry is { type: "text"; text: string } => typeof entry === "object" && entry !== null && "type" in entry && entry.type === "text" && "text" in entry && typeof entry.text === "string");
  if (!item) throw new Error("MCP tool returned no text content");
  return item.text;
}

function selectedEnvironment(environment: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(["PATH", "HOME", "TMPDIR", "PLASTICITY_CDP_URL"].flatMap((key) => typeof environment[key] === "string" ? [[key, environment[key]!]] : []));
}
function boundedError(error: unknown): string { return (error instanceof Error ? error.message : String(error)).slice(0, 4_000); }
function requireCondition(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function writeExclusive(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(boundedError(error));
    process.exitCode = 1;
  });
}

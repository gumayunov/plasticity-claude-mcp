#!/usr/bin/env node
import { mkdir, open, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { sanitizeEvidence } from "./verify-section-strength-live.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface ForkToolsAcceptanceOptions {
  help: boolean;
  target?: string;
  allowDisposableMutations: boolean;
  output?: string;
}

export function parseForkToolsAcceptanceArgs(argv: string[]): ForkToolsAcceptanceOptions {
  if (argv.length === 0) return { help: true, allowDisposableMutations: false };
  const options: ForkToolsAcceptanceOptions = { help: false, allowDisposableMutations: false };
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
  if (!options.target) throw new Error("Fork tools acceptance requires --target with an explicit window ID");
  if (!options.allowDisposableMutations) throw new Error("Fork tools acceptance requires --allow-disposable-mutations");
  if (!options.output) throw new Error("Fork tools acceptance requires --output with a new directory");
  return options;
}

export function changedBoundsMethod(result: any): string {
  const method = result?.change?.added?.[0]?.boundsMethod;
  if (typeof method !== "string") throw new Error("Changes-only mutation response omitted boundsMethod");
  return method;
}

const HELP = `Usage:
  node scripts/verify-fork-tools-live.ts --help
  node scripts/verify-fork-tools-live.ts --target ID --allow-disposable-mutations --output NEW_DIRECTORY

With no arguments or --help, this command performs no connection or mutation.
Live mode requires an explicitly selected empty disposable Plasticity document.
Through the production stdio MCP server started with --changes-only-responses it
checks plasticity_delete and its Undo, then plasticity_save_copy,
plasticity_open_document with a backup, plasticity_save and its refusal to write
over a different file. The window is left holding a temporary document from
NEW_DIRECTORY, so discard that disposable window afterwards. Evidence directories
are never overwritten.`;

async function main(): Promise<void> {
  const options = parseForkToolsAcceptanceArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }
  const output = resolve(options.output!);
  await mkdir(output, { mode: 0o700 });
  const evidence: Record<string, unknown> = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    explicitlySelectedTarget: true,
    documentMutationAttempted: false,
  };
  let client: Client | undefined;
  try {
    client = await startMcp(output);
    const live = client;
    const windows = await call(live, "plasticity_list_windows", {});
    requireCondition(windows.some((window: { targetId: string }) => window.targetId === options.target), "Explicit Plasticity target was not found");
    const initial = await call(live, "plasticity_connect", { targetId: options.target });
    requireEmpty(initial);
    let revision: string = initial.revision;
    const mutate = async (name: string, args: Record<string, unknown>): Promise<any> => {
      evidence.documentMutationAttempted = true;
      const result = await call(live, name, { ...args, intent: "Temporary fork tools acceptance", revision });
      revision = result.revision;
      return result;
    };

    const firstBox = await mutate("plasticity_create_box", { originMm: [0, 0, 0], sizeMm: [10, 10, 10], name: "Fork acceptance first" });
    const boundsMethod = changedBoundsMethod(firstBox);
    requireCondition(boundsMethod === "native-box" || boundsMethod === "native-extrema", `Unexpected boundsMethod ${boundsMethod}`);
    requireCondition(!("bodies" in firstBox), "Changes-only mutation response repeated the scene bodies");
    const firstId = firstBox.change.added[0].id;
    const secondBox = await mutate("plasticity_create_box", { originMm: [20, 0, 0], sizeMm: [10, 10, 10], name: "Fork acceptance second" });
    const secondId = secondBox.change.added[0].id;

    const deleted = await mutate("plasticity_delete", { ids: [firstId] });
    requireCondition(deleted.change?.removed?.length === 1 && deleted.change.removed[0].id === firstId, "plasticity_delete did not report exactly the requested body");
    requireCondition(!deleted.change.added && !deleted.change.modified, "plasticity_delete touched a body it was not asked to delete");
    const afterDelete = await call(live, "plasticity_status", {});
    requireCondition(bodyCount(afterDelete) === 1 && afterDelete.bodies[0].id === secondId, "The other body did not survive plasticity_delete");
    await mutate("plasticity_undo", {});
    requireCondition(bodyCount(await call(live, "plasticity_status", {})) === 2, "Undo did not restore the deleted body");

    const firstDocument = join(output, "first.plasticity");
    const backup = join(output, "backup-1.plasticity");
    await call(live, "plasticity_save_copy", { path: firstDocument });
    const opened = await mutate("plasticity_open_document", { path: firstDocument, backupPath: backup });
    requireCondition(opened.undoDepth === 0, "Opening a document left Undo history reaching the previous document");
    requireCondition(await hasPlasticityHeader(backup), "The open backup is not a Plasticity document");
    requireCondition(bodyCount(await call(live, "plasticity_status", {})) === 2, "The opened document lost bodies");

    const sizeBefore = (await stat(firstDocument)).size;
    await mutate("plasticity_create_box", { originMm: [40, 0, 0], sizeMm: [10, 10, 10], name: "Fork acceptance third" });
    const saved = await call(live, "plasticity_save", { expectedPath: firstDocument, revision });
    requireCondition(saved.hasUnsavedChanges === false, "plasticity_save left the unsaved-changes flag set");
    requireCondition((await stat(firstDocument)).size !== sizeBefore, "plasticity_save did not write the open document");
    const refusal = await call(live, "plasticity_save", { expectedPath: backup, revision })
      .then(() => undefined, (error: unknown) => boundedError(error));
    requireCondition(refusal !== undefined && /refusing to save over a different file/.test(refusal), "plasticity_save wrote over a file other than the open document");

    evidence.checks = {
      boundsMethod,
      changesOnlyResponses: true,
      deleteRemovedOnlyRequestedBody: true,
      deleteUndone: true,
      openResetUndo: true,
      backupWritten: true,
      saveWroteOpenFile: true,
      saveRefusedOtherFile: true,
    };
    evidence.completedAt = new Date().toISOString();
    await writeExclusive(join(output, "evidence.json"), sanitizeEvidence(evidence));
    console.log(JSON.stringify({ ok: true, output, evidence: join(output, "evidence.json"), discardDisposableWindowAfterward: true }, null, 2));
  } catch (error) {
    evidence.failure = boundedError(error);
    await writeExclusive(join(output, "failure.json"), sanitizeEvidence(evidence)).catch(() => {});
    throw error;
  } finally {
    await client?.close().catch(() => {});
  }
}

function requireEmpty(state: any): void {
  requireCondition(bodyCount(state) === 0 && (state.regions ?? []).length === 0 && (state.instances ?? []).length === 0
    && (state.referenceMeshes ?? []).length === 0 && (state.measurements ?? []).length === 0 && (state.sectionAnalyses ?? []).length === 0
    && (state.groups ?? []).every((group: { id: number }) => group.id === 0), "Refusing fork tools acceptance on a document that is not empty");
  requireCondition(state.redoDepth === 0, "Refusing disposable changes because a new edit would clear this document's redo history");
}

function bodyCount(state: any): number {
  if (typeof state?.bodyPagination?.total === "number") return state.bodyPagination.total;
  if (Array.isArray(state?.bodies)) return state.bodies.length;
  if (typeof state?.bodyCount === "number") return state.bodyCount;
  throw new Error("Plasticity response omitted its body count");
}

async function hasPlasticityHeader(path: string): Promise<boolean> {
  const handle = await open(path, "r");
  try {
    const header = Buffer.alloc(10);
    await handle.read(header, 0, header.length, 0);
    return header.toString() === "plasticity";
  } finally {
    await handle.close();
  }
}

async function startMcp(output: string): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(projectRoot, "scripts", "run-server.ts"), "--changes-only-responses"],
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
  const client = new Client({ name: "plasticity-fork-tools-live", version: "1.0.0" });
  await client.connect(transport);
  return client;
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

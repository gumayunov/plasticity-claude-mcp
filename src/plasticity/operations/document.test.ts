import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PlasticityOperations } from "../operations.ts";
import type { PlasticityRuntime, RuntimeState } from "../runtime.ts";
import { emptyConstruction } from "./test-support.ts";

test("screenshot refuses a stale renderer surface while Plasticity is hidden", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-screenshot-hidden-test-"));
  const calls: string[] = [];
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(1, 16);
  png.writeUInt32BE(1, 20);
  const runtime = {
    async cdp(method: string) { calls.push(method); },
    async read() { return true; },
    async captureScreenshot() { calls.push("captureScreenshot"); return png.toString("base64"); },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime, "session-1");
  const output = join(root, "view.png");
  try {
    await assert.rejects(operations.screenshot(output), /renderer is hidden.*activate Plasticity/i);
    assert.deepEqual(calls, ["Page.bringToFront"]);
    await assert.rejects(readFile(output), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("screenshot saves the validated PNG frame when Plasticity is visible", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-screenshot-visible-test-"));
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(1, 16);
  png.writeUInt32BE(1, 20);
  const runtime = {
    async cdp() {},
    async read() { return false; },
    async captureScreenshot() { return png.toString("base64"); },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime, "session-1");
  const output = join(root, "view.png");
  try {
    const result = await operations.screenshot(output);
    assert.equal(result.bytes, png.length);
    assert.deepEqual(await readFile(output), png);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("saves the open document over its own file through the native editor save", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-save-test-"));
  const real = await realpath(root);
  const documentPath = join(real, "part.plasticity");
  await writeFile(documentPath, "plasticity-old");
  let filename: string | null = documentPath;
  let header = "plasticity";
  const calls: Array<{ source: string; values: unknown[] }> = [];
  const state: RuntimeState = { targetId: "window-1", title: "part.plasticity - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 1, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = {
    async getState() { return state; },
    async read() { return filename; },
    async mutate(source: string, _bindings: string[], values: unknown[]) {
      calls.push({ source, values });
      await writeFile(documentPath, `${header}-new-content`);
      return { filename: documentPath, hasUnsavedChanges: false };
    },
    isUncertain() { return false; },
  } as unknown as PlasticityRuntime;
  try {
    const operations = new PlasticityOperations(runtime);

    // The caller may name the file through a symlinked path (/var vs /private/var on macOS).
    const result = await operations.saveDocument(join(root, "part.plasticity"), state.revision);

    assert.equal(calls.length, 1);
    assert.match(calls[0]?.source ?? "", /await this\.save\(\)/u);
    assert.deepEqual(calls[0]?.values, [{ filename: documentPath }]);
    assert.deepEqual(result, { path: documentPath, bytes: "plasticity-new-content".length, hasUnsavedChanges: false, revision: state.revision });

    await assert.rejects(operations.saveDocument(join(real, "other.plasticity"), state.revision), /refusing to save over a different file/u);
    await assert.rejects(operations.saveDocument(join(real, "part.step"), state.revision), /must end in \.plasticity/u);
    await assert.rejects(operations.saveDocument(documentPath, "stale-revision"), /stale reference/iu);
    filename = null;
    await assert.rejects(operations.saveDocument(documentPath, state.revision), /plasticity_save_copy/u);
    assert.equal(calls.length, 1, "rejected saves must not reach Plasticity");

    filename = documentPath;
    header = "corrupted!";
    await assert.rejects(operations.saveDocument(documentPath, state.revision), /invalid document/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("opens and backs up large documents with the long native timeout instead of the 10 s CDP default", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-open-test-"));
  const input = join(await realpath(root), "large.plasticity");
  await writeFile(input, "plasticity-large-document-fixture");
  const timeouts: Array<number | undefined> = [];
  const calls: Array<{ source: string; bindings: string[] }> = [];
  let openedFilename = input;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[], timeoutMs?: number) {
      timeouts.push(timeoutMs);
      calls.push({ source, bindings });
      if (typeof values[0] === "string") await writeFile(values[0], "plasticity-backup-fixture");
      return { filename: openedFilename };
    },
    isUncertain() { return false; },
  } as unknown as PlasticityRuntime;
  try {
    const operations = new PlasticityOperations(runtime);
    await operations.openDocument(input, join(root, "backup.plasticity"), state.revision);

    assert.equal(timeouts.length, 2, "backup save and open each reach Plasticity once");
    assert(timeouts.every((timeout) => timeout !== undefined && timeout >= 60_000), `expected long timeouts, got ${timeouts.join(", ")}`);
    // File > Open path: resets Undo history and the unsaved-changes flag of the previous document.
    assert.match(calls[1]?.source ?? "", /await this\.open\(args\.path\)/u);
    // The backup is already written, so the unsaved-changes prompt (a modal that blocks the renderer) is skipped.
    assert.match(calls[1]?.source ?? "", /this\._hasUnsavedChanges = false;[\s\S]*await this\.open\(args\.path\)/u);
    assert.deepEqual(calls[1]?.bindings, []);

    openedFilename = join(root, "other.plasticity");
    await assert.rejects(operations.openDocument(input, join(root, "backup-2.plasticity"), state.revision), /instead of/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

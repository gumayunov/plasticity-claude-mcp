import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { emptyStatus, fakeMcp } from "./fake-mcp.ts";
import { connectWithRetry, createResetter, openHarnessDocument } from "./reset.ts";

function clock() {
  let time = 0;
  return { now: () => time, sleep: async (ms: number) => { time += ms; } };
}

test("connectWithRetry retries until the window answers", async () => {
  let attempts = 0;
  const mcp = fakeMcp({ plasticity_connect: () => { attempts += 1; if (attempts < 3) throw new Error("editor not ready"); return { revision: "r1" }; } });
  assert.deepEqual(await connectWithRetry(mcp, "T1", { ...clock(), timeoutMs: 10_000, intervalMs: 1_000 }), { revision: "r1" });
  assert.equal(attempts, 3);
});

test("connectWithRetry gives up after the timeout with the last error", async () => {
  const mcp = fakeMcp({ plasticity_connect: () => { throw new Error("editor not ready"); } });
  await assert.rejects(connectWithRetry(mcp, "T1", { ...clock(), timeoutMs: 3_000, intervalMs: 1_000 }), /T1.*editor not ready/);
});

test("resetter deletes every body without opening a file and verifies emptiness", async () => {
  let bodies = [{ id: 4, type: "Solid", name: null, boundsMm: null, faceCount: 6, edgeCount: 12 }, { id: 9, type: "Wire", name: null, boundsMm: null, faceCount: 0, edgeCount: 4 }];
  const mcp = fakeMcp({
    plasticity_status: () => ({ ...emptyStatus("r9"), bodies, bodyPagination: { total: bodies.length } }),
    plasticity_delete: () => { bodies = []; return {}; },
  });
  await createResetter(() => mcp)();
  assert.deepEqual(mcp.calls.find((call) => call.tool === "plasticity_delete")?.args, { ids: [4, 9], intent: "Live harness reset", revision: "r9" });
  assert.equal(mcp.calls.some((call) => call.tool === "plasticity_open_document"), false);
});

test("resetter on an empty document changes nothing", async () => {
  const mcp = fakeMcp({ plasticity_status: () => emptyStatus() });
  await createResetter(() => mcp)();
  assert.deepEqual(mcp.calls.map((call) => call.tool), ["plasticity_status", "plasticity_status"]);
});

test("resetter fails when groups or instances remain", async () => {
  const mcp = fakeMcp({ plasticity_status: () => ({ ...emptyStatus(), instances: [{ id: 1 }] }) });
  await assert.rejects(createResetter(() => mcp)(), /instances=1/);
});

test("openHarnessDocument opens a fresh copy of the empty fixture before any change", async () => {
  const root = await mkdtemp(join(tmpdir(), "harness-document-test-"));
  try {
    const fixture = join(root, "fixture.plasticity");
    await writeFile(fixture, "plasticity-empty");
    const target = join(root, "runs", "harness-document.plasticity");
    await writeFile(join(root, "stale"), "x");
    const mcp = fakeMcp({
      plasticity_status: () => ({ ...emptyStatus("r4"), bodies: [{ id: 3, type: "Solid", name: null, boundsMm: null, faceCount: 6, edgeCount: 12 }], bodyPagination: { total: 1 } }),
      plasticity_open_document: () => ({}),
    });
    let opened = false;
    mcp.call = (async (tool: string, args: Record<string, unknown>) => {
      mcp.calls.push({ tool, args });
      if (tool === "plasticity_open_document") { opened = true; return {}; }
      if (tool === "plasticity_status") return opened ? emptyStatus("r5") : { ...emptyStatus("r4"), bodies: [{ id: 3, type: "Solid", name: null, boundsMm: null, faceCount: 6, edgeCount: 12 }], bodyPagination: { total: 1 } };
      throw new Error(`unexpected ${tool}`);
    }) as typeof mcp.call;
    await openHarnessDocument(mcp, { fixture, target, backupPath: join(root, "backup.plasticity") });
    assert.equal(await readFile(target, "utf8"), "plasticity-empty");
    const tools = mcp.calls.map((call) => call.tool);
    assert.deepEqual(tools, ["plasticity_status", "plasticity_open_document", "plasticity_status"]);
    assert.deepEqual(mcp.calls[1]!.args, { path: target, backupPath: join(root, "backup.plasticity"), intent: "Open the live harness document", revision: "r4" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("openHarnessDocument fails if the opened harness document is not empty", async () => {
  const root = await mkdtemp(join(tmpdir(), "harness-document-test-"));
  try {
    const fixture = join(root, "fixture.plasticity");
    await writeFile(fixture, "x");
    const mcp = fakeMcp({
      plasticity_status: () => ({ ...emptyStatus(), regions: [{ id: "r", displayBoundsMm: { min: [0, 0, 0], max: [1, 1, 0] } }] }),
      plasticity_open_document: () => ({}),
    });
    await assert.rejects(openHarnessDocument(mcp, { fixture, target: join(root, "doc.plasticity"), backupPath: join(root, "b.plasticity") }), /regions=1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

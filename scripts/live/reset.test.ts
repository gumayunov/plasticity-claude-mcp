import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { emptyStatus, fakeMcp } from "./fake-mcp.ts";
import { CheckFailure } from "./harness.ts";
import { connectWithRetry, createResetter, prepareTemplate } from "./reset.ts";

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

test("prepareTemplate saves the empty start document", async () => {
  const mcp = fakeMcp({ plasticity_status: () => emptyStatus(), plasticity_save_copy: () => ({ path: "x", bytes: 10 }) });
  const path = await prepareTemplate(mcp, "/runs/one");
  assert.equal(path, join("/runs/one", "empty.plasticity"));
  assert.deepEqual(mcp.calls.at(-1), { tool: "plasticity_save_copy", args: { path } });
});

test("prepareTemplate refuses a nonempty start document", async () => {
  const mcp = fakeMcp({
    plasticity_status: () => ({ ...emptyStatus(), bodies: [{ id: 1, type: "Solid", name: null, boundsMm: null, faceCount: 6, edgeCount: 12 }], bodyPagination: { total: 1 } }),
  });
  await assert.rejects(prepareTemplate(mcp, "/runs/one"), (error: unknown) => error instanceof CheckFailure && /startup document/.test(error.message));
  assert.equal(mcp.calls.some((call) => call.tool === "plasticity_save_copy"), false);
});

test("resetter opens the template with a fresh backup path and verifies emptiness", async () => {
  const mcp = fakeMcp({ plasticity_status: () => emptyStatus("r9"), plasticity_open_document: () => ({}) });
  const reset = createResetter(() => mcp, "/runs/one/empty.plasticity", "/runs/one/backups");
  await reset();
  await reset();
  const opens = mcp.calls.filter((call) => call.tool === "plasticity_open_document").map((call) => call.args);
  assert.equal(opens.length, 2);
  assert.equal(opens[0]!.path, "/runs/one/empty.plasticity");
  assert.equal(opens[0]!.revision, "r9");
  assert.notEqual(opens[0]!.backupPath, opens[1]!.backupPath);
  assert.match(String(opens[0]!.backupPath), /^\/runs\/one\/backups\/before-reset-\d+\.plasticity$/);
});

test("resetter fails when the document is still not empty", async () => {
  let opened = false;
  const mcp = fakeMcp({
    plasticity_status: () => opened ? { ...emptyStatus(), regions: [{ id: "r", displayBoundsMm: { min: [0, 0, 0], max: [1, 1, 0] } }] } : emptyStatus(),
    plasticity_open_document: () => { opened = true; return {}; },
  });
  await assert.rejects(createResetter(() => mcp, "/t.plasticity", "/b")(), /regions=1/);
});

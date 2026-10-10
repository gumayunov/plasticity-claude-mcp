import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { emptyStatus, fakeMcp } from "./fake-mcp.ts";
import { CheckFailure } from "./harness.ts";
import { clearStartupDocument, connectWithRetry, createResetter } from "./reset.ts";

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

test("clearStartupDocument leaves an empty document alone and never saves a file", async () => {
  const mcp = fakeMcp({ plasticity_status: () => emptyStatus() });
  await clearStartupDocument(mcp);
  assert.deepEqual(mcp.calls.map((call) => call.tool), ["plasticity_status"]);
});

test("clearStartupDocument deletes startup bodies of the isolated document", async () => {
  const body = { id: 7, type: "Solid", name: null, boundsMm: null, faceCount: 6, edgeCount: 12 };
  let cleared = false;
  const mcp = fakeMcp({
    plasticity_status: () => cleared ? emptyStatus("r2") : { ...emptyStatus("r1"), bodies: [body], bodyPagination: { total: 1 } },
    plasticity_delete: () => { cleared = true; return {}; },
  });
  await clearStartupDocument(mcp);
  assert.deepEqual(mcp.calls.find((call) => call.tool === "plasticity_delete")?.args, { ids: [7], intent: "Clear the isolated startup document", revision: "r1" });
  assert.equal(mcp.calls.some((call) => call.tool === "plasticity_save_copy"), false);
});

test("clearStartupDocument refuses a startup document with groups or instances", async () => {
  const mcp = fakeMcp({
    plasticity_status: () => ({ ...emptyStatus(), groups: [{ id: 0 }, { id: 3 }] }),
  });
  await assert.rejects(clearStartupDocument(mcp), (error: unknown) => error instanceof CheckFailure && /startup document/.test(error.message));
  assert.equal(mcp.calls.some((call) => call.tool === "plasticity_save_copy" || call.tool === "plasticity_delete"), false);
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

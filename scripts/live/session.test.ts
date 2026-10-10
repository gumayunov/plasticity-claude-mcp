import assert from "node:assert/strict";
import test from "node:test";

import type { IsolatedInstance } from "./instance.ts";
import { LiveSessionManager } from "./session.ts";
import type { McpCaller } from "./types.ts";

function fakes() {
  const events: string[] = [];
  let count = 0;
  let releaseConnect: (() => void) | undefined;
  const deps = {
    async startInstance(): Promise<IsolatedInstance> {
      count += 1;
      const id = count;
      events.push(`start ${id}`);
      return { cdpUrl: `http://127.0.0.1:${5000 + id}`, targetId: `T${id}`, userDataDirectory: `/tmp/p${id}`, rendererPort: 5000 + id, inspectorPort: 6000 + id, async stop() { events.push(`stop ${id}`); } };
    },
    async startMcp(): Promise<McpCaller> {
      return { async call() { return {}; }, async callRaw() { return {}; }, async close() { events.push("mcp close"); }, stderrTail() { return ""; } } as McpCaller;
    },
    connect: async () => {},
    async log() {},
  };
  return { deps, events, hangConnect() { deps.connect = () => new Promise<void>((resolve) => { releaseConnect = resolve; }); }, release() { releaseConnect?.(); } };
}

test("open, restart and close stop every instance", async () => {
  const { deps, events } = fakes();
  const manager = new LiveSessionManager(deps);
  await manager.open();
  await manager.restart();
  await manager.close();
  assert.deepEqual(events, ["start 1", "mcp close", "stop 1", "start 2", "mcp close", "stop 2"]);
  assert.equal(manager.current, undefined);
});

test("closing while an instance is still connecting stops that instance", async () => {
  const helpers = fakes();
  helpers.hangConnect();
  const manager = new LiveSessionManager(helpers.deps);
  const opening = manager.open().catch((error: unknown) => error);
  await new Promise((resolve) => setTimeout(resolve, 10));
  await manager.close();
  assert.ok(helpers.events.includes("stop 1"), helpers.events.join(", "));
  helpers.release();
  await opening;
});

test("a failed connect stops the instance and closes MCP", async () => {
  const { deps, events } = fakes();
  deps.connect = async () => { throw new Error("no editor"); };
  await assert.rejects(new LiveSessionManager(deps).open(), /no editor/);
  assert.deepEqual(events, ["start 1", "mcp close", "stop 1"]);
});

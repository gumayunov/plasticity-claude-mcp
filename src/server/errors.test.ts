import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { PlasticityOperations } from "../plasticity/operations/index.ts";
import { createServer, type SessionLike } from "./index.ts";

const state = { targetId: "t", title: "Part", documentToken: "d", revision: "r1", dbVersion: 1, undoDepth: 0, redoDepth: 0, bodies: [], regions: [], construction: { planes: [] } };

async function client(operations: Partial<PlasticityOperations>) {
  const session = {
    async windows() { return []; },
    async connect() { return state; },
    get() { return operations as PlasticityOperations; },
    capabilities() { return { bindings: [], operations: { constructionPlanes: { available: false, reason: "t" }, activeWorkplane: { available: false, reason: "t" } } }; },
    async captureSnapshot() { return {}; },
    async changesSince() { return {}; },
    async waitForChange() { return {}; },
  } as unknown as SessionLike;
  const server = createServer(session, undefined, undefined, undefined, null);
  const mcp = new Client({ name: "errors-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await mcp.connect(clientTransport);
  return mcp;
}

const text = (response: unknown) => (response as { content: Array<{ text: string }> }).content[0]!.text;

test("tool errors get a next step", async () => {
  const mcp = await client({
    async state() { return state as never; },
    async createBox() { throw new Error("Plasticity command failed: Error: Plasticity is busy"); },
  });
  const response = await mcp.callTool({ name: "plasticity_create_box", arguments: { originMm: [0, 0, 0], sizeMm: [1, 1, 1], revision: "r1" } });
  assert.equal(response.isError, true);
  assert.match(text(response), /Plasticity is busy\nNext step: A command is active/);
});

test("invalid arguments are listed compactly", async () => {
  const mcp = await client({ async state() { return state as never; } });
  const response = await mcp.callTool({ name: "plasticity_create_box", arguments: { originMm: [0, 0, 0], sizeMm: [1, 1, -1], revision: "r1" } });
  assert.equal(response.isError, true);
  assert.match(text(response), /Invalid arguments for plasticity_create_box:\n- sizeMm: All values must be positive/);
  assert.match(text(response), /Next step: request the schema with plasticity_call toolName="catalog" query="plasticity_create_box"/);
  assert.doesNotMatch(text(response), /"code":/);
});

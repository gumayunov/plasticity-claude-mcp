import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { PlasticityOperations } from "../plasticity/operations/index.ts";
import { createServer, type SessionLike } from "./index.ts";
import { TOOL_EXAMPLES } from "./tool-examples.ts";

test("every example belongs to a registered tool, passes its schema, and appears in the catalog", async () => {
  const session = {
    async windows() { return []; }, async connect() { return {}; }, get() { return {} as PlasticityOperations; },
    capabilities() { return { bindings: [], operations: { constructionPlanes: { available: false, reason: "t" }, activeWorkplane: { available: false, reason: "t" } } }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } as unknown as SessionLike;
  // createServer validates every example against its tool schema during registration and throws on mismatch.
  const server = createServer(session, undefined, undefined, undefined, null);
  const client = new Client({ name: "examples-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const names = new Set((await client.listTools()).tools.map((tool) => tool.name));
  for (const name of Object.keys(TOOL_EXAMPLES)) {
    assert.ok(names.has(name), `${name} is not a registered tool`);
    const response = await client.callTool({ name: "plasticity_call", arguments: { toolName: "catalog", query: name } });
    const page = JSON.parse((response.content as Array<{ text: string }>)[0]!.text);
    assert.deepEqual(page.tools[0].example, TOOL_EXAMPLES[name], name);
  }
});

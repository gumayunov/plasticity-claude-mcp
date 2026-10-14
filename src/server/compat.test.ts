import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { CompatibilityError } from "../plasticity/compat/errors.ts";
import type { PlasticityOperations } from "../plasticity/operations/index.ts";
import { createServer, type SessionLike } from "./index.ts";

const state = { targetId: "t", title: "Part", documentToken: "d", revision: "r1", dbVersion: 1, undoDepth: 0, redoDepth: 0, bodies: [], regions: [], construction: { planes: [] } };

function session(operations: Partial<PlasticityOperations>): SessionLike {
  return {
    async windows() { return []; },
    async connect() { return state; },
    get() { return operations as PlasticityOperations; },
    capabilities() { return { bindings: [], operations: { constructionPlanes: { available: false, reason: "t" }, activeWorkplane: { available: false, reason: "t" } } }; },
    async captureSnapshot() { return {}; },
    async changesSince() { return {}; },
    async waitForChange() { return {}; },
  } as unknown as SessionLike;
}

async function client(operations: Partial<PlasticityOperations>) {
  const server = createServer(session(operations), undefined, undefined, undefined, null);
  const mcp = new Client({ name: "compat-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await mcp.connect(clientTransport);
  return mcp;
}

const text = (response: unknown) => ((response as { content: Array<{ text: string }> }).content[0]!.text);

test("a CompatibilityError names the tool and points to the report", async () => {
  const mcp = await client({
    async state() { return state as never; },
    async createBox() { throw new CompatibilityError({ version: "27.0.0", profile: "26.1.3", missingBinding: "ThreePointBoxFactory" }); },
  });
  const response = await mcp.callTool({ name: "plasticity_create_box", arguments: { originMm: [0, 0, 0], sizeMm: [1, 1, 1], revision: "r1" } });
  assert.equal(response.isError, true);
  assert.match(text(response), /plasticity_create_box.*ThreePointBoxFactory.*plasticity_compatibility_report/s);
});

test("connect without a real runtime does not fail", async () => {
  const mcp = await client({ async state() { return state as never; } });
  const response = await mcp.callTool({ name: "plasticity_connect", arguments: { targetId: "t" } });
  assert.equal(response.isError, undefined);
  assert.equal(JSON.parse(text(response)).plasticity, undefined);
});

test("connect and the report expose the runtime compatibility", async () => {
  const compatibility = { version: "26.1.3", status: "supported", profile: "26.1.3", discoveryStrategy: "command-log-scopes", warnings: [] };
  const runtime = {
    getCompatibility: () => compatibility,
    getProfile: () => ({ version: "26.1.3", status: "supported", bindingAliases: {}, editorPaths: {}, notes: [] }),
    probeCompatibility: async () => ({ compatibility, bindings: [], commands: [], missingPaths: [] }),
  };
  const mcp = await client({ async state() { return state as never; }, runtime } as unknown as Partial<PlasticityOperations>);
  assert.deepEqual(JSON.parse(text(await mcp.callTool({ name: "plasticity_connect", arguments: { targetId: "t" } }))).plasticity, compatibility);
  const report = JSON.parse(text(await mcp.callTool({ name: "plasticity_compatibility_report", arguments: {} })));
  assert.equal(report.plasticity.status, "supported");
  assert.match(report.markdown, /# Plasticity compatibility: 26\.1\.3/);
});

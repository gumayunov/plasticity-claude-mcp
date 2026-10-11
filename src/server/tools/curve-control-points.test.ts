import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type SessionLike } from "../../server.ts";
import { PlasticityOperations } from "../../plasticity/operations.ts";
import { createServer, emptyState, unavailableConstruction } from "../test-support.ts";

test("MCP validates and forwards native curve-vertex conversion", async () => {
  const calls: unknown[][] = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async convertCurveVerticesToControlPoints(...arguments_: unknown[]) { calls.push(arguments_); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "convert-curve-vertices-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const vertices = [{ bodyId: 7, vertexId: 42 }, { bodyId: 7, vertexId: 43 }];
  const response = await client.callTool({ name: "plasticity_convert_curve_vertices_to_control_points", arguments: {
    vertices, intent: "Smooth two selected polyline corners", revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.deepEqual(calls, [[vertices, "r1"]]);

  const duplicate = await client.callTool({ name: "plasticity_convert_curve_vertices_to_control_points", arguments: {
    vertices: [vertices[0], vertices[0]], revision: "r1",
  } });
  assert.equal(duplicate.isError, true);
  assert.equal(calls.length, 1);
  await client.close(); await server.close();
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type SessionLike } from "../../server.ts";
import { PlasticityOperations } from "../../plasticity/operations.ts";
import { createServer, emptyState, unavailableConstruction } from "../test-support.ts";

test("MCP validates and forwards preserved native curve deformation", async () => {
  const calls: unknown[][] = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async deformCurvesBetweenFaces(...arguments_: unknown[]) { calls.push(arguments_); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "curve-deformation-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const response = await client.callTool({ name: "plasticity_deform_curves_between_faces", arguments: {
    ids: [7], sourceFace: { bodyId: 8, faceId: "source" }, targetFace: { bodyId: 9, faceId: "target" },
    scaleV: 0.75, flipNormal: true, mirror: true,
    intent: "Wrap the marking curve onto the enclosure", revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.deepEqual(calls, [[
    [7], { bodyId: 8, faceId: "source" }, { bodyId: 9, faceId: "target" },
    { scaleU: 1, scaleV: 0.75, scaleNormal: 1, flipUV: false, flipNormal: true, mirror: true }, "r1",
  ]]);

  const sameFace = await client.callTool({ name: "plasticity_deform_curves_between_faces", arguments: {
    ids: [7], sourceFace: { bodyId: 8, faceId: "same" }, targetFace: { bodyId: 8, faceId: "same" }, revision: "r1",
  } });
  const referenceBody = await client.callTool({ name: "plasticity_deform_curves_between_faces", arguments: {
    ids: [8], sourceFace: { bodyId: 8, faceId: "source" }, targetFace: { bodyId: 9, faceId: "target" }, revision: "r1",
  } });
  const zeroScale = await client.callTool({ name: "plasticity_deform_curves_between_faces", arguments: {
    ids: [7], sourceFace: { bodyId: 8, faceId: "source" }, targetFace: { bodyId: 9, faceId: "target" }, scaleU: 0, revision: "r1",
  } });
  assert.equal(sameFace.isError, true);
  assert.equal(referenceBody.isError, true);
  assert.equal(zeroScale.isError, true);
  assert.equal(calls.length, 1);
  await client.close(); await server.close();
});

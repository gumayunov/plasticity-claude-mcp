import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type SessionLike } from "../index.ts";
import { PlasticityOperations } from "../../plasticity/operations/index.ts";
import { createServer, emptyState, unavailableConstruction } from "../test-support.ts";

test("MCP forwards exact planar-face alignment and rejects duplicate moving bodies", async () => {
  const calls: unknown[][] = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async alignPlanarFaces(...arguments_: unknown[]) { calls.push(arguments_); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "alignment-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const response = await client.callTool({ name: "plasticity_align_planar_faces", arguments: {
    ids: [7, 9], sourceFace: { bodyId: 7, faceId: "17f1" }, targetFace: { bodyId: 8, faceId: "18f1" }, relation: "opposed", gapMm: 2, intent: "Seat the bracket", revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.deepEqual(calls, [[[7, 9], { bodyId: 7, faceId: "17f1" }, { bodyId: 8, faceId: "18f1" }, "opposed", 2, "r1"]]);

  const duplicate = await client.callTool({ name: "plasticity_align_planar_faces", arguments: {
    ids: [7, 7], sourceFace: { bodyId: 7, faceId: "17f1" }, targetFace: { bodyId: 8, faceId: "18f1" }, relation: "opposed", gapMm: 0, revision: "r1",
  } });
  assert.equal(duplicate.isError, true);
  assert.equal(calls.length, 1);
  await client.close(); await server.close();
});

test("MCP forwards cylindrical-axis alignment modes and validates axial offsets", async () => {
  const calls: unknown[][] = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async alignCylindricalFaces(...arguments_: unknown[]) { calls.push(arguments_); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "cylindrical-alignment-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const response = await client.callTool({ name: "plasticity_align_cylindrical_faces", arguments: {
    ids: [7, 9], sourceFace: { bodyId: 7, faceId: "17f1" }, targetFace: { bodyId: 8, faceId: "18f1" },
    relation: "same", axialMode: "anchor", axialOffsetMm: 2, rotationAroundAxisDeg: 90,
    intent: "Align a bolt with its hole", revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.deepEqual(calls, [[[7, 9], { bodyId: 7, faceId: "17f1" }, { bodyId: 8, faceId: "18f1" }, "same", "anchor", 2, 90, "r1"]]);

  const invalid = await client.callTool({ name: "plasticity_align_cylindrical_faces", arguments: {
    ids: [7], sourceFace: { bodyId: 7, faceId: "17f1" }, targetFace: { bodyId: 8, faceId: "18f1" },
    relation: "same", axialMode: "preserve", axialOffsetMm: 2, revision: "r1",
  } });
  assert.equal(invalid.isError, true);
  assert.equal(calls.length, 1);
  await client.close(); await server.close();
});

test("MCP forwards exact vertex and linear-edge assembly alignments", async () => {
  const calls: Array<{ name: string; arguments: unknown[] }> = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async alignVertices(...arguments_: unknown[]) { calls.push({ name: "vertices", arguments: arguments_ }); return state; },
    async alignLinearEdges(...arguments_: unknown[]) { calls.push({ name: "edges", arguments: arguments_ }); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "topology-alignment-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const vertexResponse = await client.callTool({ name: "plasticity_align_vertices", arguments: {
    ids: [7, 9], sourceVertex: { bodyId: 7, vertexId: 101 }, targetVertex: { bodyId: 8, vertexId: 201 },
    offsetMm: [1, 2, 3], intent: "Place exact corners", revision: "r1",
  } });
  const edgeResponse = await client.callTool({ name: "plasticity_align_linear_edges", arguments: {
    ids: [7], sourceEdge: { bodyId: 7, edgeId: "17e1" }, targetEdge: { bodyId: 8, edgeId: "18e1" },
    relation: "opposed", axialOffsetMm: 4, rotationAroundAxisDeg: 30, intent: "Seat straight edges", revision: "r2",
  } });
  assert.equal(vertexResponse.isError, undefined);
  assert.equal(edgeResponse.isError, undefined);
  assert.deepEqual(calls, [
    { name: "vertices", arguments: [[7, 9], { bodyId: 7, vertexId: 101 }, { bodyId: 8, vertexId: 201 }, [1, 2, 3], "r1"] },
    { name: "edges", arguments: [[7], { bodyId: 7, edgeId: "17e1" }, { bodyId: 8, edgeId: "18e1" }, "opposed", 4, 30, "r2"] },
  ]);

  const duplicateBodies = await client.callTool({ name: "plasticity_align_vertices", arguments: {
    ids: [7, 7], sourceVertex: { bodyId: 7, vertexId: 101 }, targetVertex: { bodyId: 8, vertexId: 201 }, revision: "r1",
  } });
  const zeroBody = await client.callTool({ name: "plasticity_align_linear_edges", arguments: {
    ids: [], sourceEdge: { bodyId: 7, edgeId: "17e1" }, targetEdge: { bodyId: 8, edgeId: "18e1" }, revision: "r2",
  } });
  assert.equal(duplicateBodies.isError, true);
  assert.equal(zeroBody.isError, true);
  assert.equal(calls.length, 2);
  await client.close(); await server.close();
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type SessionLike } from "../index.ts";
import { PlasticityOperations } from "../../plasticity/operations/index.ts";
import { createServer, emptyState, unavailableConstruction } from "../test-support.ts";

test("MCP forwards exact native face transforms and validates no-op input", async () => {
  const calls: Array<{ name: string; arguments: unknown[] }> = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async moveFaces(...arguments_: unknown[]) { calls.push({ name: "move", arguments: arguments_ }); return state; },
    async rotateFaces(...arguments_: unknown[]) { calls.push({ name: "rotate", arguments: arguments_ }); return state; },
    async scaleFaces(...arguments_: unknown[]) { calls.push({ name: "scale", arguments: arguments_ }); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "face-transform-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  const faces = [{ bodyId: 7, faceId: "17f1" }];

  const results = await Promise.all([
    client.callTool({ name: "plasticity_move_faces", arguments: { faces, deltaMm: [0, 0, 5], revision: "r1" } }),
    client.callTool({ name: "plasticity_rotate_faces", arguments: { faces, pivotMm: [10, 0, 10], axis: [0, 1, 0], degrees: -10, revision: "r1" } }),
    client.callTool({ name: "plasticity_scale_faces", arguments: { faces, pivotMm: [0, 0, 0], factors: [2, 2, 1], revision: "r1" } }),
  ]);
  assert(results.every((response) => response.isError === undefined));
  assert.deepEqual(calls, [
    { name: "move", arguments: [faces, [0, 0, 5], "r1"] },
    { name: "rotate", arguments: [faces, [10, 0, 10], [0, 1, 0], -10, "r1"] },
    { name: "scale", arguments: [faces, [0, 0, 0], [2, 2, 1], "r1"] },
  ]);

  const noMove = await client.callTool({ name: "plasticity_move_faces", arguments: { faces, deltaMm: [0, 0, 0], revision: "r1" } });
  const noRotate = await client.callTool({ name: "plasticity_rotate_faces", arguments: { faces, pivotMm: [0, 0, 0], axis: [0, 0, 1], degrees: 0, revision: "r1" } });
  const noScale = await client.callTool({ name: "plasticity_scale_faces", arguments: { faces, pivotMm: [0, 0, 0], factors: [1, 1, 1], revision: "r1" } });
  assert.equal(noMove.isError, true);
  assert.equal(noRotate.isError, true);
  assert.equal(noScale.isError, true);
  assert.equal(calls.length, 3);
  await client.close(); await server.close();
});

test("MCP forwards native face thickening, face-loop offsets, and Solid loop patches", async () => {
  const calls: Array<{ name: string; arguments: unknown[] }> = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async thickenFaces(...arguments_: unknown[]) { calls.push({ name: "thicken", arguments: arguments_ }); return state; },
    async offsetFaceLoops(...arguments_: unknown[]) { calls.push({ name: "offset-loops", arguments: arguments_ }); return state; },
    async patchSolidEdgeLoops(...arguments_: unknown[]) { calls.push({ name: "patch-loops", arguments: arguments_ }); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "face-construction-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  const faces = [{ bodyId: 7, faceId: "17f1" }];
  const edges = [{ bodyId: 7, edgeId: "17e1" }];

  const results = await Promise.all([
    client.callTool({ name: "plasticity_thicken_faces", arguments: { faces, frontMm: 2, backMm: 1, revision: "r1" } }),
    client.callTool({ name: "plasticity_offset_face_loops", arguments: { faces, distanceMm: -2, individual: false, revision: "r2" } }),
    client.callTool({ name: "plasticity_patch_solid_edge_loops", arguments: { edges, revision: "r3" } }),
  ]);
  assert(results.every((response) => response.isError === undefined));
  assert.deepEqual(calls, [
    { name: "thicken", arguments: [faces, 2, 1, "r1"] },
    { name: "offset-loops", arguments: [faces, -2, false, "r2"] },
    { name: "patch-loops", arguments: [edges, "r3"] },
  ]);

  const zeroThickness = await client.callTool({ name: "plasticity_thicken_faces", arguments: { faces, frontMm: 0, backMm: 0, revision: "r1" } });
  const zeroOffset = await client.callTool({ name: "plasticity_offset_face_loops", arguments: { faces, distanceMm: 0, revision: "r2" } });
  assert.equal(zeroThickness.isError, true);
  assert.equal(zeroOffset.isError, true);
  assert.equal(calls.length, 3);
  await client.close(); await server.close();
});

test("MCP forwards exact native edge edits and validates no-op input", async () => {
  const calls: Array<{ name: string; arguments: unknown[] }> = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async moveEdges(...arguments_: unknown[]) { calls.push({ name: "move", arguments: arguments_ }); return state; },
    async offsetEdges(...arguments_: unknown[]) { calls.push({ name: "offset", arguments: arguments_ }); return state; },
    async deleteEdges(...arguments_: unknown[]) { calls.push({ name: "delete", arguments: arguments_ }); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "edge-edit-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  const edges = [{ bodyId: 7, edgeId: "17e1" }];

  const moved = await client.callTool({ name: "plasticity_move_edges", arguments: { edges, deltaMm: [0, 0, 5], revision: "r1" } });
  const offset = await client.callTool({ name: "plasticity_offset_edges", arguments: { edges, distanceMm: -2, revision: "r2" } });
  const deleted = await client.callTool({ name: "plasticity_delete_edges", arguments: { edges, revision: "r3" } });
  assert.equal(moved.isError, undefined);
  assert.equal(offset.isError, undefined);
  assert.equal(deleted.isError, undefined);
  assert.deepEqual(calls, [
    { name: "move", arguments: [edges, [0, 0, 5], "r1"] },
    { name: "offset", arguments: [edges, -2, "r2"] },
    { name: "delete", arguments: [edges, "r3"] },
  ]);

  const noMove = await client.callTool({ name: "plasticity_move_edges", arguments: { edges, deltaMm: [0, 0, 0], revision: "r1" } });
  const noOffset = await client.callTool({ name: "plasticity_offset_edges", arguments: { edges, distanceMm: 0, revision: "r1" } });
  assert.equal(noMove.isError, true);
  assert.equal(noOffset.isError, true);
  assert.equal(calls.length, 3);
  await client.close(); await server.close();
});

test("MCP forwards exact native shell-vertex offsets and validates input", async () => {
  const calls: unknown[][] = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async offsetVertices(...arguments_: unknown[]) { calls.push(arguments_); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "vertex-offset-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  const vertices = [{ bodyId: 7, vertexId: 101 }, { bodyId: 7, vertexId: 102 }];

  const result = await client.callTool({ name: "plasticity_offset_vertices", arguments: { vertices, distanceMm: 5, revision: "r1" } });
  assert.equal(result.isError, undefined);
  assert.deepEqual(calls, [[vertices, 5, "r1"]]);

  const zero = await client.callTool({ name: "plasticity_offset_vertices", arguments: { vertices, distanceMm: 0, revision: "r1" } });
  const duplicate = await client.callTool({ name: "plasticity_offset_vertices", arguments: { vertices: [vertices[0], vertices[0]], distanceMm: 5, revision: "r1" } });
  assert.equal(zero.isError, true);
  assert.equal(duplicate.isError, true);
  assert.equal(calls.length, 1);
  await client.close(); await server.close();
});

test("MCP forwards native rectangular and radial face patterns", async () => {
  const calls: Array<{ name: string; arguments: unknown[] }> = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async rectangularFacePattern(...arguments_: unknown[]) { calls.push({ name: "rectangular", arguments: arguments_ }); return state; },
    async radialFacePattern(...arguments_: unknown[]) { calls.push({ name: "radial", arguments: arguments_ }); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "face-pattern-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  const faces = [{ bodyId: 7, faceId: "17f1" }, { bodyId: 7, faceId: "17f2" }];

  const rectangular = await client.callTool({ name: "plasticity_rectangular_face_pattern", arguments: { faces, direction1: [1, 0, 0], count1: 3, spacing1Mm: 15, direction2: [0, 1, 0], count2: 2, spacing2Mm: 10, revision: "r1" } });
  const radial = await client.callTool({ name: "plasticity_radial_face_pattern", arguments: { faces, centerMm: [30, 30, 0], axis: [0, 0, 1], count: 4, sweepDegrees: 360, revision: "r2" } });
  assert.equal(rectangular.isError, undefined);
  assert.equal(radial.isError, undefined);
  assert.deepEqual(calls, [
    { name: "rectangular", arguments: [faces, [1, 0, 0], 3, 15, [0, 1, 0], 2, 10, "r1"] },
    { name: "radial", arguments: [faces, [30, 30, 0], [0, 0, 1], 4, 360, "r2"] },
  ]);

  const zeroSpacing = await client.callTool({ name: "plasticity_rectangular_face_pattern", arguments: { faces, direction1: [1, 0, 0], count1: 3, spacing1Mm: 15, direction2: [0, 1, 0], count2: 2, spacing2Mm: 0, revision: "r1" } });
  const tooWideSweep = await client.callTool({ name: "plasticity_radial_face_pattern", arguments: { faces, centerMm: [0, 0, 0], axis: [0, 0, 1], count: 4, sweepDegrees: 361, revision: "r2" } });
  assert.equal(zeroSpacing.isError, true);
  assert.equal(tooWideSweep.isError, true);
  assert.equal(calls.length, 2);
  await client.close(); await server.close();
});

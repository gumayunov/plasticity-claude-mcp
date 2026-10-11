import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type SessionLike } from "../index.ts";
import { PlasticityOperations } from "../../plasticity/operations/index.ts";
import type { PlasticityRuntime } from "../../plasticity/runtime.ts";
import { createServer, emptyState, unavailableConstruction } from "../test-support.ts";

test("MCP validates and forwards native slot-profile creation", async () => {
  let received: unknown[] | undefined;
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async createSlotProfiles(...arguments_: unknown[]) { received = arguments_; return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "slot-profile-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const response = await client.callTool({ name: "plasticity_create_slot_profiles", arguments: {
    wireIds: [7, 8], widthMm: 6, intent: "Create routed channel profiles", revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.deepEqual(received, [[7, 8], 6, "r1"]);
  const duplicate = await client.callTool({ name: "plasticity_create_slot_profiles", arguments: { wireIds: [7, 7], widthMm: 6, revision: "r1" } });
  const zeroWidth = await client.callTool({ name: "plasticity_create_slot_profiles", arguments: { wireIds: [7], widthMm: 0, revision: "r1" } });
  const missingRevision = await client.callTool({ name: "plasticity_create_slot_profiles", arguments: { wireIds: [7], widthMm: 6 } });
  assert.equal(duplicate.isError, true);
  assert.equal(zeroWidth.isError, true);
  assert.equal(missingRevision.isError, true);
  await client.close(); await server.close();
});

test("serializes exact Curve Bridge endpoints and continuity modes", async () => {
  const nativeCalls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const state = emptyState();
  state.bodies = [
    { id: 7, versionId: 17, type: "Wire", name: "First", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
    { id: 8, versionId: 18, type: "Wire", name: "Second", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
  ];
  const directions = [
    { id: 7, versionId: 17, measurementSource: "native-brep" as const, closed: false, segments: [{ entityId: 91, startMm: [0, 0, 0], endMm: [10, 0, 0], startTangent: [1, 0, 0], endTangent: [1, 0, 0], lengthMm: 10 }] },
    { id: 8, versionId: 18, measurementSource: "native-brep" as const, closed: false, segments: [{ entityId: 92, startMm: [20, 10, 0], endMm: [30, 10, 0], startTangent: [1, 0, 0], endTangent: [1, 0, 0], lengthMm: 10 }] },
  ];
  const runtime = {
    getCapabilities() { return []; },
    async getState() { return state; },
    async readNative() { return directions; },
    async mutate(source: string, bindings: string[], values: unknown[]) { nativeCalls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime, "session-1");
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const bridged = await client.callTool({ name: "plasticity_bridge_curves", arguments: {
    first: { bodyId: 7, segmentEntityId: 91, at: "end" },
    second: { bodyId: 8, segmentEntityId: 92, at: "start" },
    startContinuity: "G1", endContinuity: "G3", revision: state.revision,
  } });
  assert.equal(bridged.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{
    first: { bodyId: 7, segmentEntityId: 91, at: "end" },
    second: { bodyId: 8, segmentEntityId: 92, at: "start" },
    startContinuity: "G1", endContinuity: "G3",
  }]);
  const invalid = await client.callTool({ name: "plasticity_bridge_curves", arguments: {
    first: { bodyId: 7, segmentEntityId: 91, at: "end" },
    second: { bodyId: 8, segmentEntityId: 92, at: "start" },
    startContinuity: "C1", revision: state.revision,
  } });
  assert.equal(invalid.isError, true);

  await client.close(); await server.close();
});

test("serializes exact open Wire vertices for Curve Vertex Bridge", async () => {
  const nativeCalls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const state = emptyState();
  state.bodies = [
    { id: 7, versionId: 17, type: "Wire", name: "First", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] },
    { id: 8, versionId: 18, type: "Wire", name: "Second", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] },
  ];
  const vertices = [
    { id: "7:101", bodyId: 7, bodyVersionId: 17, vertexId: 101, viewVersionId: "17v101", measurementSource: "native-brep", positionMm: [10, 0, 0], endpoint: true, adjacentEdgeEntityIds: [1001] },
    { id: "8:201", bodyId: 8, bodyVersionId: 18, vertexId: 201, viewVersionId: "18v201", measurementSource: "native-brep", positionMm: [20, 10, 0], endpoint: true, adjacentEdgeEntityIds: [2001] },
  ];
  const runtime = {
    getCapabilities() { return []; }, async getState() { return state; }, async readNative() { return vertices; },
    async mutate(source: string, bindings: string[], values: unknown[]) { nativeCalls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime, "session-1");
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const bridged = await client.callTool({ name: "plasticity_bridge_curve_vertices", arguments: {
    first: { bodyId: 7, vertexId: 101 }, second: { bodyId: 8, vertexId: 201 },
    startContinuity: "G1", endContinuity: "G3", revision: state.revision,
  } });
  assert.equal(bridged.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{
    first: { bodyId: 7, vertexId: 101 }, second: { bodyId: 8, vertexId: 201 },
    firstPosition: [0.01, 0, 0], secondPosition: [0.02, 0.01, 0],
    startContinuity: "G1", endContinuity: "G3",
  }]);
  const duplicate = await client.callTool({ name: "plasticity_bridge_curve_vertices", arguments: {
    first: { bodyId: 7, vertexId: 101 }, second: { bodyId: 7, vertexId: 101 }, revision: state.revision,
  } });
  assert.equal(duplicate.isError, true);
  const invalidContinuity = await client.callTool({ name: "plasticity_bridge_curve_vertices", arguments: {
    first: { bodyId: 7, vertexId: 101 }, second: { bodyId: 8, vertexId: 201 }, startContinuity: "C1", revision: state.revision,
  } });
  assert.equal(invalidContinuity.isError, true);

  await client.close(); await server.close();
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type SessionLike } from "../index.ts";
import { PlasticityOperations } from "../../plasticity/operations/index.ts";
import type { PlasticityRuntime } from "../../plasticity/runtime.ts";
import { createServer, emptyState, unavailableConstruction } from "../test-support.ts";

test("MCP validates and forwards native closed-Wire surface patches", async () => {
  const calls: unknown[][] = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async patchClosedWires(...arguments_: unknown[]) { calls.push(arguments_); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "closed-wire-patch-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const response = await client.callTool({ name: "plasticity_patch_closed_wires", arguments: {
    ids: [7, 8], intent: "Fill two spatial closed boundaries", revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.deepEqual(calls, [[[7, 8], "r1"]]);
  const duplicate = await client.callTool({ name: "plasticity_patch_closed_wires", arguments: { ids: [7, 7], revision: "r1" } });
  const empty = await client.callTool({ name: "plasticity_patch_closed_wires", arguments: { ids: [], revision: "r1" } });
  assert.equal(duplicate.isError, true);
  assert.equal(empty.isError, true);
  assert.equal(calls.length, 1);
  await client.close(); await server.close();
});

test("MCP validates and forwards preserved native face deformation", async () => {
  const calls: unknown[][] = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async deformBodiesBetweenFaces(...arguments_: unknown[]) { calls.push(arguments_); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "face-deformation-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const response = await client.callTool({ name: "plasticity_deform_bodies_between_faces", arguments: {
    ids: [7], sourceFace: { bodyId: 8, faceId: "source" }, targetFace: { bodyId: 9, faceId: "target" },
    scaleU: 1.5, flipUV: true, mirror: true,
    intent: "Wrap the raised mark onto the enclosure", revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.deepEqual(calls, [[
    [7], { bodyId: 8, faceId: "source" }, { bodyId: 9, faceId: "target" },
    { scaleU: 1.5, scaleV: 1, scaleNormal: 1, flipUV: true, flipNormal: false, mirror: true }, "r1",
  ]]);

  const sameFace = await client.callTool({ name: "plasticity_deform_bodies_between_faces", arguments: {
    ids: [7], sourceFace: { bodyId: 8, faceId: "same" }, targetFace: { bodyId: 8, faceId: "same" }, revision: "r1",
  } });
  const referenceBody = await client.callTool({ name: "plasticity_deform_bodies_between_faces", arguments: {
    ids: [8], sourceFace: { bodyId: 8, faceId: "source" }, targetFace: { bodyId: 9, faceId: "target" }, revision: "r1",
  } });
  const zeroScale = await client.callTool({ name: "plasticity_deform_bodies_between_faces", arguments: {
    ids: [7], sourceFace: { bodyId: 8, faceId: "source" }, targetFace: { bodyId: 9, faceId: "target" }, scaleNormal: 0, revision: "r1",
  } });
  assert.equal(sameFace.isError, true);
  assert.equal(referenceBody.isError, true);
  assert.equal(zeroScale.isError, true);
  assert.equal(calls.length, 1);
  await client.close(); await server.close();
});

test("serializes exact Solid and Sheet edge endpoints for Shell Edge Bridge", async () => {
  const nativeCalls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const firstEdge = { id: "17e1", curveType: "Line", line: true, circle: false, lengthMm: 10, centerMm: [0, 0, 5] as [number, number, number], tangent: [0, 0, 1] as [number, number, number], boundsMm: { min: [0, 0, 0] as [number, number, number], max: [0, 0, 10] as [number, number, number] }, faceIds: ["17f1"], vertexIds: [101, 102] };
  const secondEdge = { ...firstEdge, id: "18e1", centerMm: [20, 10, 25] as [number, number, number], boundsMm: { min: [20, 10, 20] as [number, number, number], max: [20, 10, 30] as [number, number, number] }, faceIds: ["18f1"], vertexIds: [201, 202] };
  const state = emptyState();
  state.bodies = [
    { id: 7, versionId: 17, type: "Solid", name: "First", boundsMm: null, faceIds: firstEdge.faceIds, edgeIds: [firstEdge.id], faces: [], edges: [firstEdge], vertices: [
      { id: 101, positionMm: [0, 0, 0], edgeIds: [firstEdge.id], faceIds: firstEdge.faceIds },
      { id: 102, positionMm: [0, 0, 10], edgeIds: [firstEdge.id], faceIds: firstEdge.faceIds },
    ] },
    { id: 8, versionId: 18, type: "Sheet", name: "Second", boundsMm: null, faceIds: secondEdge.faceIds, edgeIds: [secondEdge.id], faces: [], edges: [secondEdge], vertices: [
      { id: 201, positionMm: [20, 10, 20], edgeIds: [secondEdge.id], faceIds: secondEdge.faceIds },
      { id: 202, positionMm: [20, 10, 30], edgeIds: [secondEdge.id], faceIds: secondEdge.faceIds },
    ] },
  ];
  const runtime = {
    getCapabilities() { return []; }, async getState() { return state; },
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

  const bridged = await client.callTool({ name: "plasticity_bridge_shell_edges", arguments: {
    first: { bodyId: 7, edgeId: "17e1", vertexId: 102 },
    second: { bodyId: 8, edgeId: "18e1", vertexId: 201 },
    startContinuity: "G1", endContinuity: "G3", revision: state.revision,
  } });
  assert.equal(bridged.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{
    first: { bodyId: 7, edgeId: "17e1", vertexId: 102 },
    second: { bodyId: 8, edgeId: "18e1", vertexId: 201 },
    firstPosition: [0, 0, 0.01], secondPosition: [0.02, 0.01, 0.02],
    startContinuity: "G1", endContinuity: "G3",
  }]);
  const duplicate = await client.callTool({ name: "plasticity_bridge_shell_edges", arguments: {
    first: { bodyId: 7, edgeId: "17e1", vertexId: 101 },
    second: { bodyId: 7, edgeId: "17e1", vertexId: 102 }, revision: state.revision,
  } });
  assert.equal(duplicate.isError, true);
  const invalidContinuity = await client.callTool({ name: "plasticity_bridge_shell_edges", arguments: {
    first: { bodyId: 7, edgeId: "17e1", vertexId: 102 },
    second: { bodyId: 8, edgeId: "18e1", vertexId: 201 }, startContinuity: "C1", revision: state.revision,
  } });
  assert.equal(invalidContinuity.isError, true);

  await client.close(); await server.close();
});

test("serializes ordered planar face loft profiles and native end conditions", async () => {
  const nativeCalls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const profile = (id: string, z: number) => ({ id, surfaceType: "Plane", planar: true, centerMm: [0, 0, z] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [-5, -5, z] as [number, number, number], max: [5, 5, z] as [number, number, number] }, edgeIds: [] });
  const state = emptyState();
  state.bodies = [
    { id: 7, versionId: 17, type: "Solid", name: "First", boundsMm: null, faceIds: ["f1"], edgeIds: [], faces: [profile("f1", 0)], edges: [], vertices: [] },
    { id: 8, versionId: 18, type: "Sheet", name: "Second", boundsMm: null, faceIds: ["f2"], edgeIds: [], faces: [profile("f2", 20)], edges: [], vertices: [] },
    { id: 9, versionId: 19, type: "Wire", name: "Guide", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] },
  ];
  const runtime = {
    getCapabilities() { return []; }, async getState() { return state; },
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

  const lofted = await client.callTool({ name: "plasticity_loft_faces", arguments: {
    faces: [{ bodyId: 7, faceId: "f1" }, { bodyId: 8, faceId: "f2" }],
    guideIds: [9], trimGuides: false, simplify: false,
    startCondition: "clamped", endCondition: "natural", startMagnitude: 1.5, endMagnitude: 0.75,
    revision: state.revision,
  } });
  assert.equal(lofted.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.bindings, ["FaceLoftFactory", "LoftSurfaceCommand", "LoftCurvatureType"]);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{
    faces: [{ bodyId: 7, faceId: "f1" }, { bodyId: 8, faceId: "f2" }],
    guideIds: [9], trimGuides: false, simplify: false,
    startCondition: "Clamped", endCondition: "Natural", startMagnitude: 1.5, endMagnitude: 0.75,
  }]);
  const invalid = await client.callTool({ name: "plasticity_loft_faces", arguments: {
    faces: [{ bodyId: 7, faceId: "f1" }, { bodyId: 8, faceId: "f2" }], startCondition: "G1", revision: state.revision,
  } });
  assert.equal(invalid.isError, true);

  await client.close(); await server.close();
});

test("serializes ordered Wire loft profiles, guides, and native curvature", async () => {
  const nativeCalls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const state = emptyState();
  const wire = (id: number) => ({ id, versionId: id + 10, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] });
  state.bodies = [wire(7), wire(8), wire(9)];
  const runtime = {
    getCapabilities() { return []; }, async getState() { return state; },
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

  const lofted = await client.callTool({ name: "plasticity_loft_curves", arguments: {
    profileIds: [7, 8], guideIds: [9], trimGuides: false, trimProfiles: false,
    closed: false, simplify: false, curvature: "natural", startMagnitude: 2, endMagnitude: 0.5,
    revision: state.revision,
  } });
  assert.equal(lofted.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.bindings, ["CurveLoftFactory", "LoftEdgeCommand", "LoftCurvatureType"]);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{
    profileIds: [7, 8], guideIds: [9], trimGuides: false, trimProfiles: false,
    closed: false, simplify: false, curvature: "Natural", startMagnitude: 2, endMagnitude: 0.5,
  }]);
  const invalid = await client.callTool({ name: "plasticity_loft_curves", arguments: {
    profileIds: [7, 8], curvature: "G2", revision: state.revision,
  } });
  assert.equal(invalid.isError, true);

  await client.close(); await server.close();
});

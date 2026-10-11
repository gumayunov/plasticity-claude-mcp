import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type SessionLike } from "../../server.ts";
import { PlasticityOperations } from "../../plasticity/operations.ts";
import { createServer, emptyState, unavailableConstruction } from "../test-support.ts";

test("MCP forwards native linked-instance requests and validates instance identities", async () => {
  const calls: Array<{ name: string; arguments: unknown[] }> = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async listInstances(...arguments_: unknown[]) {
      calls.push({ name: "list", arguments: arguments_ });
      return { documentToken: state.documentToken, revision: state.revision, instances: [] };
    },
    async createInstance(...arguments_: unknown[]) { calls.push({ name: "create", arguments: arguments_ }); return state; },
    async duplicateBodies(...arguments_: unknown[]) { calls.push({ name: "duplicate-bodies", arguments: arguments_ }); return state; },
    async moveInstances(...arguments_: unknown[]) { calls.push({ name: "move", arguments: arguments_ }); return state; },
    async rotateInstances(...arguments_: unknown[]) { calls.push({ name: "rotate", arguments: arguments_ }); return state; },
    async scaleInstances(...arguments_: unknown[]) { calls.push({ name: "scale", arguments: arguments_ }); return state; },
    async realizeInstances(...arguments_: unknown[]) { calls.push({ name: "realize", arguments: arguments_ }); return state; },
    async deleteInstances(...arguments_: unknown[]) { calls.push({ name: "delete", arguments: arguments_ }); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "instance-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const responses = await Promise.all([
    client.callTool({ name: "plasticity_list_instances", arguments: {} }),
    client.callTool({ name: "plasticity_create_instance", arguments: { bodyId: 7, revision: "r1" } }),
    client.callTool({ name: "plasticity_duplicate_bodies", arguments: { ids: [7, 8], translationMm: [0, 30, 0], revision: "r1" } }),
    client.callTool({ name: "plasticity_move_instances", arguments: { ids: [0], deltaMm: [5, 0, 0], revision: "r1" } }),
    client.callTool({ name: "plasticity_rotate_instances", arguments: { ids: [0], pivotMm: [30, 0, 0], axis: [0, 0, 1], degrees: 90, revision: "r1" } }),
    client.callTool({ name: "plasticity_scale_instances", arguments: { ids: [0], pivotMm: [30, 0, 0], factors: [2, 1, 1], revision: "r1" } }),
    client.callTool({ name: "plasticity_realize_instances", arguments: { ids: [0], revision: "r1" } }),
    client.callTool({ name: "plasticity_delete_instances", arguments: { ids: [0], revision: "r1" } }),
  ]);
  assert(responses.every((response) => response.isError === undefined));
  assert.deepEqual(calls, [
    { name: "list", arguments: [] },
    { name: "create", arguments: [7, [0, 0, 0], "r1"] },
    { name: "duplicate-bodies", arguments: [[7, 8], [0, 30, 0], "r1"] },
    { name: "move", arguments: [[0], [5, 0, 0], "r1"] },
    { name: "rotate", arguments: [[0], [30, 0, 0], [0, 0, 1], 90, "r1"] },
    { name: "scale", arguments: [[0], [30, 0, 0], [2, 1, 1], "r1"] },
    { name: "realize", arguments: [[0], "r1"] },
    { name: "delete", arguments: [[0], "r1"] },
  ]);

  const negative = await client.callTool({ name: "plasticity_move_instances", arguments: { ids: [-1], deltaMm: [1, 0, 0], revision: "r1" } });
  const duplicate = await client.callTool({ name: "plasticity_delete_instances", arguments: { ids: [0, 0], revision: "r1" } });
  const duplicateBodies = await client.callTool({ name: "plasticity_duplicate_bodies", arguments: { ids: [7, 7], revision: "r1" } });
  assert.equal(negative.isError, true);
  assert.equal(duplicate.isError, true);
  assert.equal(duplicateBodies.isError, true);
  await client.close(); await server.close();
});

test("MCP forwards approximate reference-mesh import, selection, rename, transforms, and deletion", async () => {
  const calls: Array<{ name: string; arguments: unknown[] }> = [];
  const state = emptyState();
  const selection = {
    documentToken: state.documentToken, revision: state.revision, bodyIds: [], instanceIds: [], referenceMeshIds: [0],
    groupIds: [], faces: [], edges: [], regionIds: [], curveControlPoints: [],
  };
  const operations = {
    async state() { return state; },
    async listReferenceMeshes(...arguments_: unknown[]) {
      calls.push({ name: "list", arguments: arguments_ });
      return { documentToken: state.documentToken, revision: state.revision, referenceMeshes: [] };
    },
    async selectReferenceMeshes(...arguments_: unknown[]) { calls.push({ name: "select", arguments: arguments_ }); return selection; },
    async importReferenceMesh(...arguments_: unknown[]) { calls.push({ name: "import", arguments: arguments_ }); return state; },
    async moveReferenceMeshes(...arguments_: unknown[]) { calls.push({ name: "move", arguments: arguments_ }); return state; },
    async rotateReferenceMeshes(...arguments_: unknown[]) { calls.push({ name: "rotate", arguments: arguments_ }); return state; },
    async scaleReferenceMeshes(...arguments_: unknown[]) { calls.push({ name: "scale", arguments: arguments_ }); return state; },
    async renameReferenceMesh(...arguments_: unknown[]) { calls.push({ name: "rename", arguments: arguments_ }); return state; },
    async deleteReferenceMeshes(...arguments_: unknown[]) { calls.push({ name: "delete", arguments: arguments_ }); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "reference-mesh-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const responses = await Promise.all([
    client.callTool({ name: "plasticity_list_reference_meshes", arguments: {} }),
    client.callTool({ name: "plasticity_select_reference_meshes", arguments: { ids: [0], revision: "r1" } }),
    client.callTool({ name: "plasticity_import_reference_mesh", arguments: { path: "/tmp/phone.stl", sourceUnit: "millimeter", revision: "r1" } }),
    client.callTool({ name: "plasticity_move_reference_meshes", arguments: { ids: [0], deltaMm: [5, 0, 0], revision: "r1" } }),
    client.callTool({ name: "plasticity_rotate_reference_meshes", arguments: { ids: [0], pivotMm: [0, 0, 0], axis: [0, 0, 1], degrees: 90, revision: "r1" } }),
    client.callTool({ name: "plasticity_scale_reference_meshes", arguments: { ids: [0], pivotMm: [0, 0, 0], factors: [2, 1, 1], revision: "r1" } }),
    client.callTool({ name: "plasticity_rename_reference_mesh", arguments: { id: 0, name: "Phone envelope", revision: "r1" } }),
    client.callTool({ name: "plasticity_delete_reference_meshes", arguments: { ids: [0], revision: "r1" } }),
  ]);
  assert(responses.every((response) => response.isError === undefined));
  assert.deepEqual(calls, [
    { name: "list", arguments: [] },
    { name: "select", arguments: [[0], "r1"] },
    { name: "import", arguments: ["/tmp/phone.stl", "millimeter", "r1"] },
    { name: "move", arguments: [[0], [5, 0, 0], "r1"] },
    { name: "rotate", arguments: [[0], [0, 0, 0], [0, 0, 1], 90, "r1"] },
    { name: "scale", arguments: [[0], [0, 0, 0], [2, 1, 1], "r1"] },
    { name: "rename", arguments: [0, "Phone envelope", "r1"] },
    { name: "delete", arguments: [[0], "r1"] },
  ]);

  const duplicate = await client.callTool({ name: "plasticity_move_reference_meshes", arguments: { ids: [0, 0], deltaMm: [1, 0, 0], revision: "r1" } });
  const negative = await client.callTool({ name: "plasticity_delete_reference_meshes", arguments: { ids: [-1], revision: "r1" } });
  const zeroScale = await client.callTool({ name: "plasticity_scale_reference_meshes", arguments: { ids: [0], pivotMm: [0, 0, 0], factors: [1, 0, 1], revision: "r1" } });
  const badUnit = await client.callTool({ name: "plasticity_import_reference_mesh", arguments: { path: "/tmp/phone.stl", sourceUnit: "parsec", revision: "r1" } });
  assert.equal(duplicate.isError, true);
  assert.equal(negative.isError, true);
  assert.equal(zeroScale.isError, true);
  assert.equal(badUnit.isError, true);
  await client.close(); await server.close();
});

test("MCP forwards native group hierarchy and node-state requests with strict selection validation", async () => {
  const calls: Array<{ name: string; arguments: unknown[] }> = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async listGroups(...arguments_: unknown[]) {
      calls.push({ name: "list", arguments: arguments_ });
      return { documentToken: state.documentToken, revision: state.revision, activeGroupId: 0, groups: [] };
    },
    async selectNodes(...arguments_: unknown[]) { calls.push({ name: "select", arguments: arguments_ }); return { documentToken: state.documentToken, revision: state.revision, bodyIds: [7], instanceIds: [0], referenceMeshIds: [3], groupIds: [1], faces: [], edges: [], regionIds: [], curveControlPoints: [] }; },
    async selectCurves(...arguments_: unknown[]) { calls.push({ name: "select-curves", arguments: arguments_ }); return { documentToken: state.documentToken, revision: "r1", bodyIds: [], curveIds: [17], instanceIds: [], referenceMeshIds: [], groupIds: [], faces: [], edges: [], regionIds: [], curveControlPoints: [] }; },
    async selectFaces(...arguments_: unknown[]) { calls.push({ name: "select-faces", arguments: arguments_ }); return { documentToken: state.documentToken, revision: state.revision, bodyIds: [], instanceIds: [], groupIds: [], faces: [{ bodyId: 7, faceId: "17f1" }], edges: [], regionIds: [], curveControlPoints: [] }; },
    async selectEdges(...arguments_: unknown[]) { calls.push({ name: "select-edges", arguments: arguments_ }); return { documentToken: state.documentToken, revision: state.revision, bodyIds: [], instanceIds: [], groupIds: [], faces: [], edges: [{ bodyId: 7, edgeId: "17e1" }], regionIds: [], curveControlPoints: [] }; },
    async selectCurveControlPoints(...arguments_: unknown[]) { calls.push({ name: "select-curve-control-points", arguments: arguments_ }); return { documentToken: state.documentToken, revision: state.revision, bodyIds: [], instanceIds: [], groupIds: [], faces: [], edges: [], regionIds: [], curveControlPoints: [{ bodyId: 7, kind: "vertex", pointId: 101 }, { bodyId: 7, kind: "control-point", pointId: 2 }] }; },
    async createGroup(...arguments_: unknown[]) { calls.push({ name: "create", arguments: arguments_ }); return state; },
    async moveToGroup(...arguments_: unknown[]) { calls.push({ name: "move", arguments: arguments_ }); return state; },
    async renameGroup(...arguments_: unknown[]) { calls.push({ name: "rename", arguments: arguments_ }); return state; },
    async activateGroup(...arguments_: unknown[]) { calls.push({ name: "activate", arguments: arguments_ }); return state; },
    async dissolveGroups(...arguments_: unknown[]) { calls.push({ name: "dissolve", arguments: arguments_ }); return state; },
    async setNodeVisibility(...arguments_: unknown[]) { calls.push({ name: "visibility", arguments: arguments_ }); return state; },
    async setNodeLocked(...arguments_: unknown[]) { calls.push({ name: "locked", arguments: arguments_ }); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "group-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const responses = await Promise.all([
    client.callTool({ name: "plasticity_list_groups", arguments: {} }),
    client.callTool({ name: "plasticity_select_nodes", arguments: { bodyIds: [7], instanceIds: [0], referenceMeshIds: [3], groupIds: [1], revision: "r1" } }),
    client.callTool({ name: "plasticity_select_curves", arguments: { ids: [17], revision: "r1" } }),
    client.callTool({ name: "plasticity_select_faces", arguments: { faces: [{ bodyId: 7, faceId: "17f1" }], revision: "r1" } }),
    client.callTool({ name: "plasticity_select_edges", arguments: { edges: [{ bodyId: 7, edgeId: "17e1" }], revision: "r1" } }),
    client.callTool({ name: "plasticity_select_curve_control_points", arguments: { points: [{ bodyId: 7, kind: "vertex", pointId: 101 }, { bodyId: 7, kind: "control-point", pointId: 2 }], revision: "r1" } }),
    client.callTool({ name: "plasticity_create_group", arguments: { bodyIds: [7], instanceIds: [0], referenceMeshIds: [3], groupIds: [1], name: "Bracket", revision: "r1" } }),
    client.callTool({ name: "plasticity_move_to_group", arguments: { groupIds: [1], destinationGroupId: 2, revision: "r1" } }),
    client.callTool({ name: "plasticity_rename_group", arguments: { id: 1, name: "Module", revision: "r1" } }),
    client.callTool({ name: "plasticity_activate_group", arguments: { id: 2, revision: "r1" } }),
    client.callTool({ name: "plasticity_dissolve_groups", arguments: { ids: [1], revision: "r1" } }),
    client.callTool({ name: "plasticity_set_visibility", arguments: { bodyIds: [7], referenceMeshIds: [3], visible: false, revision: "r1" } }),
    client.callTool({ name: "plasticity_set_locked", arguments: { instanceIds: [0], referenceMeshIds: [3], locked: true, revision: "r1" } }),
  ]);
  assert(responses.every((response) => response.isError === undefined));
  assert.deepEqual(calls, [
    { name: "list", arguments: [] },
    { name: "select", arguments: [[7], [0], [3], [1], "r1"] },
    { name: "select-curves", arguments: [[17], "r1"] },
    { name: "select-faces", arguments: [[{ bodyId: 7, faceId: "17f1" }], "r1"] },
    { name: "select-edges", arguments: [[{ bodyId: 7, edgeId: "17e1" }], "r1"] },
    { name: "select-curve-control-points", arguments: [[{ bodyId: 7, kind: "vertex", pointId: 101 }, { bodyId: 7, kind: "control-point", pointId: 2 }], "r1"] },
    { name: "create", arguments: [[7], [0], [3], [1], "Bracket", "r1"] },
    { name: "move", arguments: [[], [], [], [1], 2, "r1"] },
    { name: "rename", arguments: [1, "Module", "r1"] },
    { name: "activate", arguments: [2, "r1"] },
    { name: "dissolve", arguments: [[1], "r1"] },
    { name: "visibility", arguments: [[7], [], [3], [], false, "r1"] },
    { name: "locked", arguments: [[], [0], [3], [], true, "r1"] },
  ]);

  const empty = await client.callTool({ name: "plasticity_create_group", arguments: { revision: "r1" } });
  const duplicate = await client.callTool({ name: "plasticity_set_visibility", arguments: { groupIds: [1, 1], visible: false, revision: "r1" } });
  const duplicateReference = await client.callTool({ name: "plasticity_set_locked", arguments: { referenceMeshIds: [3, 3], locked: true, revision: "r1" } });
  const rootRename = await client.callTool({ name: "plasticity_rename_group", arguments: { id: 0, name: "No", revision: "r1" } });
  const duplicateFaces = await client.callTool({ name: "plasticity_select_faces", arguments: { faces: [{ bodyId: 7, faceId: "17f1" }, { bodyId: 7, faceId: "17f1" }], revision: "r1" } });
  assert.equal(empty.isError, true);
  assert.equal(duplicate.isError, true);
  assert.equal(duplicateReference.isError, true);
  assert.equal(rootRename.isError, true);
  assert.equal(duplicateFaces.isError, true);
  const duplicateCurvePoints = await client.callTool({ name: "plasticity_select_curve_control_points", arguments: { points: [{ bodyId: 7, kind: "vertex", pointId: 101 }, { bodyId: 7, kind: "vertex", pointId: 101 }], revision: "r1" } });
  assert.equal(duplicateCurvePoints.isError, true);
  assert.equal(calls.length, 13);
  await client.close(); await server.close();
});

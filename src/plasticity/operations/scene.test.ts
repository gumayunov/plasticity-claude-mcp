import assert from "node:assert/strict";
import { test } from "node:test";
import { PlasticityOperations } from "../operations.ts";
import type { PlasticityRuntime, RuntimeState } from "../runtime.ts";
import { emptyConstruction } from "./test-support.ts";

test("lists, renames, transforms, and deletes revision-bound reference meshes through native empty commands", async () => {
  const mesh = {
    id: 0, type: "ReferenceMesh" as const, name: "phone.stl", sourcePath: "/tmp/phone.stl", sourceFormat: "stl" as const,
    measurementSource: "reference-mesh" as const,
    boundsMm: { min: [0, 0, 0] as [number, number, number], max: [72, 9, 158] as [number, number, number] },
    translationMm: [0, 0, 0] as [number, number, number], rotationQuaternion: [0, 0, 0, 1] as [number, number, number, number],
    sceneScaleToMeters: [0.001, 0.001, 0.001] as [number, number, number], vertexEntries: 36, triangles: 12,
    visible: true, hidden: false, locked: false,
  };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [], referenceMeshes: [mesh],
  };
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  assert.deepEqual(await operations.listReferenceMeshes(), {
    documentToken: state.documentToken,
    revision: state.revision,
    referenceMeshes: [mesh],
  });
  await operations.moveReferenceMeshes([0], [10, 20, 30], state.revision);
  await operations.rotateReferenceMeshes([0], [10, 20, 30], [0, 0, 2], 90, state.revision);
  await operations.scaleReferenceMeshes([0], [10, 20, 30], [2, 0.5, 1], state.revision);
  await operations.renameReferenceMesh(0, "Phone envelope", state.revision);
  await operations.deleteReferenceMeshes([0], state.revision);

  assert.deepEqual(calls[0]?.bindings, ["MoveItemAndEmptyFactory"]);
  assert.deepEqual(calls[0]?.values, [{ ids: [0], delta: [0.01, 0.02, 0.03] }]);
  assert.match(calls[0]?.source ?? "", /Empties_ObjectEmpty/u);
  assert.deepEqual(calls[1]?.bindings, ["RotateItemAndEmptyFactory", "Vector3", "Quaternion"]);
  assert.deepEqual(calls[1]?.values, [{ ids: [0], pivot: [0.01, 0.02, 0.03], axis: [0, 0, 1], radians: Math.PI / 2 }]);
  assert.deepEqual(calls[2]?.bindings, ["ProjectingScaleItemAndEmptyFactory"]);
  assert.deepEqual(calls[2]?.values, [{ ids: [0], pivot: [0.01, 0.02, 0.03], factors: [2, 0.5, 1] }]);
  assert.deepEqual(calls[3]?.bindings, []);
  assert.deepEqual(calls[3]?.values, [{ id: 0, name: "Phone envelope" }]);
  assert.match(calls[3]?.source ?? "", /db\.nodes\.setName/u);
  assert.deepEqual(calls[4]?.bindings, []);
  assert.match(calls[4]?.source ?? "", /addEmpty/u);

  const beforeInvalid = calls.length;
  await assert.rejects(operations.moveReferenceMeshes([], [1, 0, 0], state.revision), /nonempty unique/u);
  await assert.rejects(operations.moveReferenceMeshes([1], [1, 0, 0], state.revision), /unknown current reference mesh/iu);
  await assert.rejects(operations.rotateReferenceMeshes([0], [0, 0, 0], [0, 0, 0], 90, state.revision), /axis.*zero|zero.*axis/iu);
  await assert.rejects(operations.scaleReferenceMeshes([0], [0, 0, 0], [1, 0, 1], state.revision), /positive finite/u);
  await assert.rejects(operations.deleteReferenceMeshes([0], "stale"), /stale reference/iu);
  assert.equal(calls.length, beforeInvalid);
});

test("creates and transforms native instances through their empty transforms", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const body = { id: 7, versionId: 17, type: "Solid", name: "Source", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const instance = {
    id: 0, type: "Instance" as const, targetKey: 10, targetName: "Source", sourceBodyIds: [7],
    translationMm: [30, 0, 0] as [number, number, number], rotationQuaternion: [0, 0, 0, 1] as [number, number, number, number],
    scale: [1, 1, 1] as [number, number, number], matrixWorldMm: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 30, 0, 0, 1], visible: true, hidden: false, locked: false,
  };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body], instances: [instance] };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  assert.deepEqual(await operations.listInstances(), { documentToken: state.documentToken, revision: state.revision, instances: [instance] });
  await operations.createInstance(7, [30, 0, 0], state.revision);
  await operations.moveInstances([0], [5, 0, 0], state.revision);
  await operations.rotateInstances([0], [0, 0, 0], [0, 0, 1], 90, state.revision);
  await operations.scaleInstances([0], [0, 0, 0], [2, 1, 1], state.revision);

  assert.deepEqual(calls[0]?.bindings, ["CreateInstanceFactory", "MoveItemAndEmptyFactory"]);
  assert.deepEqual(calls[0]?.values, [{ bodyId: 7, translation: [0.03, 0, 0] }]);
  assert.match(calls[0]?.source ?? "", /create\.items = \[find\(args\.bodyId\)\]/);
  assert.match(calls[0]?.source ?? "", /move\.empties = created/);
  assert.deepEqual(calls[1]?.bindings, ["MoveItemAndEmptyFactory"]);
  assert.deepEqual(calls[1]?.values, [{ ids: [0], delta: [0.005, 0, 0] }]);
  assert.match(calls[1]?.source ?? "", /const store = this\.db\.empties\.write/);
  assert.match(calls[1]?.source ?? "", /const copy = original\.clone\(false\)/);
  assert.match(calls[1]?.source ?? "", /store\.id2empty\.set\(id, copy\)/);
  assert.match(calls[1]?.source ?? "", /factory\.empties = args\.ids\.map\(find\)/);
  assert.deepEqual(calls[2]?.bindings, ["RotateItemAndEmptyFactory", "Vector3", "Quaternion"]);
  assert.deepEqual(calls[3]?.bindings, ["ProjectingScaleItemAndEmptyFactory"]);
});

test("duplicates independent native Solid and Sheet bodies in one grouped operation", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const solid = { id: 7, versionId: 17, type: "Solid", name: "Solid source", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const sheet = { id: 8, versionId: 18, type: "Sheet", name: "Sheet source", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const wire = { id: 9, versionId: 19, type: "Wire", name: "Wire source", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid, sheet, wire],
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.duplicateBodies([7, 8], [30, 0, 0], state.revision);

  assert.deepEqual(calls[0]?.bindings, ["CreateInstanceFactory", "MoveItemAndEmptyFactory", "RealizeInstanceFactory"]);
  assert.deepEqual(calls[0]?.values, [{ ids: [7, 8], translation: [0.03, 0, 0] }]);
  assert.match(calls[0]?.source ?? "", /new this\.commands\.GroupSelectedCommand/);
  assert.match(calls[0]?.source ?? "", /create\.items = args\.ids\.map\(find\)/);
  assert.match(calls[0]?.source ?? "", /created\.every\(item => item\?\.constructor\?\.name === 'InstanceEmpty'\)/);
  assert.match(calls[0]?.source ?? "", /move\.empties = created/);
  assert.match(calls[0]?.source ?? "", /realize\.empties = created/);

  const mutationCount = calls.length;
  await assert.rejects(operations.duplicateBodies([], [0, 0, 0], state.revision), /nonempty unique list/i);
  await assert.rejects(operations.duplicateBodies([7, 7], [0, 0, 0], state.revision), /nonempty unique list/i);
  await assert.rejects(operations.duplicateBodies([99], [0, 0, 0], state.revision), /unknown current body/i);
  await assert.rejects(operations.duplicateBodies([9], [0, 0, 0], state.revision), /Solid or Sheet/i);
  await assert.rejects(operations.duplicateBodies([7], [Number.NaN, 0, 0], state.revision), /finite/i);
  await assert.rejects(operations.duplicateBodies([7], [0, 0, 0], "old-revision"), /stale reference/i);
  assert.equal(calls.length, mutationCount);
});

test("deletes exactly the requested bodies and undoes a delete that touched anything else", async () => {
  const body = (id: number, versionId: number, type = "Solid") => ({ id, versionId, type, name: `Body ${id}`, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] });
  const stateWith = (revision: string, bodies: ReturnType<typeof body>[]): RuntimeState => ({ targetId: "window-1", title: "part.plasticity - Plasticity", documentToken: "document-1", revision, dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies });
  const initial = stateWith("current-revision", [body(7, 70), body(8, 80), body(9, 90)]);
  let current = initial;
  let nextAfterDelete = stateWith("after-delete", [body(9, 90)]);
  const calls: Array<{ source: string; values: unknown[]; timeoutMs: number | undefined }> = [];
  const runtime = {
    async getState() { return current; },
    async mutate(source: string, _bindings: string[], values: unknown[], timeoutMs?: number) {
      calls.push({ source, values, timeoutMs });
      if (source.includes("DeleteCommand")) current = nextAfterDelete;
      else if (source.includes("this.undo()")) current = initial;
      return {};
    },
    isUncertain() { return false; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  const result = await operations.remove([7, 8], initial.revision);

  assert.deepEqual(result.bodies.map((item) => item.id), [9]);
  assert.equal(calls.length, 1);
  const source = calls[0]?.source ?? "";
  assert.match(source, /command\.execute = async function \(\) \{\s*try \{\s*const selected = editor\.selection\.selected;\s*selected\.removeAll\(\);/u, "selection is set inside execute, right before the native delete");
  assert.match(source, /Selection for delete is not exactly the requested bodies/u);
  assert(calls[0]?.timeoutMs !== undefined && calls[0].timeoutMs >= 60_000);

  // The native delete removed a face of body 8 (it became a Sheet) instead of deleting 7 and 8.
  current = initial;
  calls.length = 0;
  nextAfterDelete = stateWith("after-bad-delete", [body(7, 70), body(8, 81, "Sheet"), body(9, 90)]);
  await assert.rejects(operations.remove([7, 8], initial.revision), /undone \(not removed: 7, 8; changed: none; added: none\)/u);
  assert.equal(calls.length, 2);
  assert.match(calls[1]?.source ?? "", /this\.undo\(\)/u);
  assert.deepEqual(current, initial);

  // Another body changed while the requested ones were removed.
  calls.length = 0;
  nextAfterDelete = stateWith("after-wide-delete", [body(9, 91, "Sheet")]);
  await assert.rejects(operations.remove([7, 8], initial.revision), /changed: 9/u);
  assert.match(calls[1]?.source ?? "", /this\.undo\(\)/u);

  calls.length = 0;
  await assert.rejects(operations.remove([], initial.revision), /nonempty unique/u);
  await assert.rejects(operations.remove([7, 7], initial.revision), /nonempty unique/u);
  await assert.rejects(operations.remove([42], initial.revision), /Unknown current body IDs: 42/u);
  await assert.rejects(operations.remove([7], "stale-revision"), /stale reference/iu);
  assert.equal(calls.length, 0, "rejected deletes must not reach Plasticity");
});

test("realizes and deletes current native instances while rejecting stale identities", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const instance = {
    id: 0, type: "Instance" as const, targetKey: 10, targetName: "Source", sourceBodyIds: [7],
    translationMm: [30, 0, 0] as [number, number, number], rotationQuaternion: [0, 0, 0, 1] as [number, number, number, number],
    scale: [1, 1, 1] as [number, number, number], matrixWorldMm: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 30, 0, 0, 1], visible: true, hidden: false, locked: false,
  };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [], instances: [instance] };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.realizeInstances([0], state.revision);
  await operations.deleteInstances([0], state.revision);

  assert.deepEqual(calls[0]?.bindings, ["RealizeInstanceFactory"]);
  assert.match(calls[0]?.source ?? "", /factory\.empties = args\.ids\.map\(find\)/);
  assert.deepEqual(calls[1]?.bindings, []);
  assert.match(calls[1]?.source ?? "", /selection\.selected\.addEmpty\(empty\)/);
  assert.match(calls[1]?.source ?? "", /new this\.commands\.DeleteCommand/);

  const mutationCount = calls.length;
  await assert.rejects(operations.moveInstances([1], [1, 0, 0], state.revision), /unknown current native instance/i);
  await assert.rejects(operations.realizeInstances([0, 0], state.revision), /nonempty unique list/i);
  await assert.rejects(operations.deleteInstances([0], "old-revision"), /stale reference/i);
  await assert.rejects(operations.createInstance(99, [0, 0, 0], state.revision), /unknown current body/i);
  assert.equal(calls.length, mutationCount);
});

test("manages native groups, hierarchy, visibility, and locks through document history", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const body = { id: 7, versionId: 17, type: "Solid", name: "Body", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const instance = {
    id: 0, type: "Instance" as const, targetKey: 10, targetName: "Body", sourceBodyIds: [7],
    translationMm: [30, 0, 0] as [number, number, number], rotationQuaternion: [0, 0, 0, 1] as [number, number, number, number],
    scale: [1, 1, 1] as [number, number, number], matrixWorldMm: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 30, 0, 0, 1],
    visible: true, hidden: false, locked: false,
  };
  const referenceMesh = {
    id: 3, type: "ReferenceMesh" as const, name: "Phone", sourcePath: "/tmp/phone.stl", sourceFormat: "stl" as const,
    measurementSource: "reference-mesh" as const, boundsMm: null, translationMm: [0, 0, 0] as [number, number, number],
    rotationQuaternion: [0, 0, 0, 1] as [number, number, number, number], sceneScaleToMeters: [0.001, 0.001, 0.001] as [number, number, number],
    vertexEntries: 3, triangles: 1, visible: true, hidden: false, locked: false,
  };
  const root = { id: 0, name: "Scene", parentId: null, childGroupIds: [1, 2], bodyIds: [7], instanceIds: [0], referenceMeshIds: [3], otherNodeKeys: [4], visible: true, hidden: false, locked: false };
  const group1 = { id: 1, name: "Parts", parentId: 0, childGroupIds: [], bodyIds: [], instanceIds: [], referenceMeshIds: [], otherNodeKeys: [], visible: true, hidden: false, locked: false };
  const group2 = { id: 2, name: "Housing", parentId: 0, childGroupIds: [], bodyIds: [], instanceIds: [], referenceMeshIds: [], otherNodeKeys: [], visible: true, hidden: false, locked: false };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body], instances: [instance], referenceMeshes: [referenceMesh],
    activeGroupId: 0, groups: [root, group1, group2],
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  assert.deepEqual(await operations.listGroups(), {
    documentToken: state.documentToken, revision: state.revision, activeGroupId: 0, groups: state.groups,
  });
  await operations.createGroup([7], [0], [3], [1], "Bracket assembly", state.revision);
  await operations.moveToGroup([7], [0], [3], [1], 2, state.revision);
  await operations.renameGroup(1, "Bracket", state.revision);
  await operations.activateGroup(2, state.revision);
  await operations.activateGroup(0, state.revision);
  await operations.dissolveGroups([1], state.revision);
  await operations.setNodeVisibility([7], [0], [3], [1], false, state.revision);
  await operations.setNodeLocked([7], [0], [3], [1], true, state.revision);

  assert.deepEqual(calls[0]?.bindings, []);
  assert.deepEqual(calls[0]?.values, [{ bodyIds: [7], instanceIds: [0], referenceMeshIds: [3], groupIds: [1], name: "Bracket assembly" }]);
  assert.match(calls[0]?.source ?? "", /findReferenceMesh/u);
  assert.match(calls[0]?.source ?? "", /selected\.addGroup\(group\)/);
  assert.match(calls[0]?.source ?? "", /command\.execute = async function/);
  assert.match(calls[0]?.source ?? "", /db\.nodes\.setName/);
  assert.deepEqual(calls[1]?.bindings, ["MoveSelectionToGroupCommand"]);
  assert.deepEqual(calls[1]?.values, [{ bodyIds: [7], instanceIds: [0], referenceMeshIds: [3], groupIds: [1], destinationGroupId: 2 }]);
  assert.match(calls[1]?.source ?? "", /new Command\(this, findGroup\(args\.destinationGroupId\)\)/);
  assert.match(calls[2]?.source ?? "", /db\.nodes\.setName/);
  assert.match(calls[2]?.source ?? "", /selection\.selected\.removeAll\(\)/);
  assert.deepEqual(calls[3]?.bindings, ["ActivateGroupCommand"]);
  assert.deepEqual(calls[3]?.values, [{ id: 2 }]);
  assert.match(calls[3]?.source ?? "", /new Command\(this, group\)/);
  assert.deepEqual(calls[4]?.values, [{ id: 0 }]);
  assert.deepEqual(calls[5]?.bindings, ["DissolveGroupCommand"]);
  assert.match(calls[5]?.source ?? "", /selected\.addGroup\(group\)/);
  assert.deepEqual(calls[6]?.values, [{ flag: "visibility", bodyIds: [7], instanceIds: [0], referenceMeshIds: [3], groupIds: [1], value: false }]);
  assert.match(calls[6]?.source ?? "", /db\.nodes\.setVisible/);
  assert.match(calls[6]?.source ?? "", /selection\.selected\.removeAll\(\)/);
  assert.deepEqual(calls[7]?.values, [{ flag: "locked", bodyIds: [7], instanceIds: [0], referenceMeshIds: [3], groupIds: [1], value: true }]);
  assert.match(calls[7]?.source ?? "", /db\.nodes\.setLocked/);
  assert.match(calls[7]?.source ?? "", /selection\.selected\.removeAll\(\)/);
});

test("rejects stale, missing, duplicate, root, empty, and cyclic group operations before mutation", async () => {
  let mutations = 0;
  const body = { id: 7, versionId: 17, type: "Solid", name: "Body", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const root = { id: 0, name: "Scene", parentId: null, childGroupIds: [1], bodyIds: [7], instanceIds: [], referenceMeshIds: [], otherNodeKeys: [4], visible: true, hidden: false, locked: false };
  const group1 = { id: 1, name: "Parent", parentId: 0, childGroupIds: [2], bodyIds: [], instanceIds: [], referenceMeshIds: [], otherNodeKeys: [], visible: true, hidden: false, locked: false };
  const group2 = { id: 2, name: "Child", parentId: 1, childGroupIds: [], bodyIds: [], instanceIds: [], referenceMeshIds: [], otherNodeKeys: [], visible: true, hidden: false, locked: false };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body], instances: [],
    activeGroupId: 0, groups: [root, group1, group2],
  };
  const runtime = {
    async getState() { return state; }, async mutate() { mutations += 1; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.createGroup([], [], [], [], undefined, state.revision), /at least one body, instance, reference mesh, or group/i);
  await assert.rejects(operations.createGroup([7, 7], [], [], [], undefined, state.revision), /body IDs must be unique/i);
  await assert.rejects(operations.createGroup([99], [], [], [], undefined, state.revision), /unknown current body/i);
  await assert.rejects(operations.createGroup([], [99], [], [], undefined, state.revision), /unknown current native instance/i);
  await assert.rejects(operations.createGroup([], [], [], [0], undefined, state.revision), /root Scene group is protected/i);
  await assert.rejects(operations.renameGroup(0, "No", state.revision), /root Scene group is protected/i);
  await assert.rejects(operations.activateGroup(99, state.revision), /unknown current group/i);
  await assert.rejects(operations.dissolveGroups([99], state.revision), /unknown current group/i);
  await assert.rejects(operations.moveToGroup([], [], [], [1], 2, state.revision), /would create a group cycle/i);
  await assert.rejects(operations.moveToGroup([], [], [], [1], 1, state.revision), /would create a group cycle/i);
  await assert.rejects(operations.setNodeVisibility([], [], [], [], false, state.revision), /at least one body, instance, reference mesh, or group/i);
  await assert.rejects(operations.setNodeLocked([7], [], [], [], true, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("reads and replaces mixed native body, instance, and group selections", async () => {
  const reads: Array<{ source: string; values: unknown[] }> = [];
  const body = { id: 7, versionId: 17, type: "Solid", name: "Body", boundsMm: null, faceIds: ["17f1"], edgeIds: ["17e1"], faces: [], edges: [] };
  const instance = {
    id: 0, type: "Instance" as const, targetKey: 10, targetName: "Body", sourceBodyIds: [7],
    translationMm: [0, 0, 0] as [number, number, number], rotationQuaternion: [0, 0, 0, 1] as [number, number, number, number],
    scale: [1, 1, 1] as [number, number, number], matrixWorldMm: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    visible: true, hidden: false, locked: false,
  };
  const root = { id: 0, name: "Scene", parentId: null, childGroupIds: [1], bodyIds: [7], instanceIds: [0], referenceMeshIds: [], otherNodeKeys: [4], visible: true, hidden: false, locked: false };
  const group = { id: 1, name: "Assembly", parentId: 0, childGroupIds: [], bodyIds: [], instanceIds: [], referenceMeshIds: [], otherNodeKeys: [], visible: true, hidden: false, locked: false };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body], instances: [instance], activeGroupId: 0, groups: [root, group],
  };
  const selected = { bodyIds: [7], curveIds: [], instanceIds: [0], referenceMeshIds: [], groupIds: [1], faces: [], edges: [], regionIds: [], curveControlPoints: [] };
  const runtime = {
    async getState() { return state; },
    async read(source: string, values: unknown[]) {
      reads.push({ source, values });
      return source.includes("const selection = this.selection.selected;") ? selected : undefined;
    },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  const result = await operations.selectNodes([7], [0], [], [1], state.revision);

  assert.deepEqual(result, { documentToken: state.documentToken, revision: state.revision, ...selected });
  assert.deepEqual(reads[0]?.values, [{ bodyIds: [7], instanceIds: [0], referenceMeshIds: [], groupIds: [1] }]);
  assert.match(reads[0]?.source ?? "", /selected\.addEmpty\(empty\)/);
  assert.match(reads[0]?.source ?? "", /selected\.addGroup\(group\)/);
  assert.match(reads[1]?.source ?? "", /selection\.empties/);
  assert.match(reads[1]?.source ?? "", /selection\.groups/);

  await operations.selectFaces([{ bodyId: 7, faceId: "17f1" }], state.revision);
  await operations.selectEdges([{ bodyId: 7, edgeId: "17e1" }], state.revision);
  assert.deepEqual(reads[2]?.values, [{ references: [{ bodyId: 7, faceId: "17f1" }] }]);
  assert.match(reads[2]?.source ?? "", /selected\.addFace/);
  assert.deepEqual(reads[4]?.values, [{ references: [{ bodyId: 7, edgeId: "17e1" }] }]);
  assert.match(reads[4]?.source ?? "", /selected\.addEdge/);

  const readCount = reads.length;
  await assert.rejects(operations.selectNodes([], [], [], [], state.revision), /at least one body, instance, reference mesh, or group/i);
  await assert.rejects(operations.selectNodes([99], [], [], [], state.revision), /unknown current body/i);
  await assert.rejects(operations.selectNodes([7], [], [], [], "old-revision"), /stale reference/i);
  await assert.rejects(operations.selectFaces([{ bodyId: 7, faceId: "missing" }], state.revision), /unknown current face/i);
  await assert.rejects(operations.selectFaces([{ bodyId: 7, faceId: "17f1" }, { bodyId: 7, faceId: "17f1" }], state.revision), /face references must be unique/i);
  await assert.rejects(operations.selectEdges([], state.revision), /at least one edge reference/i);
  await assert.rejects(operations.selectEdges([{ bodyId: 7, edgeId: "missing" }], state.revision), /unknown current edge/i);
  assert.equal(reads.length, readCount);
});

test("selects whole native Wire curves by current revision-bound body ID", async () => {
  const reads: Array<{ source: string; values: unknown[] }> = [];
  const wire = { id: 7, versionId: 17, type: "Wire", name: "Profile", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const solid = { id: 8, versionId: 18, type: "Solid", name: "Body", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire, solid] };
  const selected = { bodyIds: [7], curveIds: [7], instanceIds: [], referenceMeshIds: [], groupIds: [], faces: [], edges: [], regionIds: [], curveControlPoints: [] };
  const runtime = {
    async getState() { return state; },
    async read(source: string, values: unknown[]) {
      reads.push({ source, values });
      return source.includes("const selection = this.selection.selected;") ? selected : undefined;
    },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  const result = await operations.selectCurves([7], state.revision);

  assert.deepEqual(result, { documentToken: state.documentToken, revision: state.revision, ...selected });
  assert.deepEqual(reads[0]?.values, [{ ids: [7] }]);
  assert.match(reads[0]?.source ?? "", /selected\.addCurve\(find\(id\)\)/u);
  assert.match(reads[1]?.source ?? "", /selection\.curveIds/u);

  const readCount = reads.length;
  await assert.rejects(operations.selectCurves([], state.revision), /Wire IDs must be a nonempty unique list/u);
  await assert.rejects(operations.selectCurves([7, 7], state.revision), /Wire IDs must be a nonempty unique list/u);
  await assert.rejects(operations.selectCurves([99], state.revision), /Unknown current Wire ID/u);
  await assert.rejects(operations.selectCurves([8], state.revision), /current Wire IDs only/u);
  await assert.rejects(operations.selectCurves([7], "old-revision"), /Stale reference/u);
  assert.equal(reads.length, readCount);
});

test("reads and replaces revision-bound native curve control-point selections", async () => {
  const reads: Array<{ source: string; values: unknown[] }> = [];
  const wire = { id: 7, versionId: 17, type: "Wire", name: "Guide", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const points = [{ bodyId: 7, kind: "vertex" as const, pointId: 101 }, { bodyId: 7, kind: "control-point" as const, pointId: 2 }];
  const inventory = [{
    id: 7, versionId: 17, positionSource: "native-control-handle" as const,
    boundaryVertices: [{ reference: points[0], versionId: "17v101", positionMm: [0, 0, 0] as [number, number, number] }],
    interiorControlPoints: [{ reference: points[1], versionId: "17c2", positionMm: [10, 20, 0] as [number, number, number] }],
  }];
  const selected = { bodyIds: [], instanceIds: [], groupIds: [], faces: [], edges: [], regionIds: [], curveControlPoints: points };
  const runtime = {
    async getState() { return state; },
    async readNative() { return inventory; },
    async read(source: string, values: unknown[]) { reads.push({ source, values }); return source.includes("const selection = this.selection.selected;") ? selected : undefined; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  assert.deepEqual(await operations.selectCurveControlPoints(points, state.revision), { documentToken: state.documentToken, revision: state.revision, ...selected });
  assert.deepEqual(reads[0]?.values, [{ points }]);
  assert.match(reads[0]?.source ?? "", /selected\.addVertex/);
  assert.match(reads[0]?.source ?? "", /selected\.addCurveCV/);
  assert.match(reads[1]?.source ?? "", /selection\.curveVertices/);
  assert.match(reads[1]?.source ?? "", /selection\.curveCVs/);
});

test("clears topology selection before renaming a body through document history", async () => {
  let call: { source: string; values: unknown[] } | undefined;
  const body = { id: 7, versionId: 17, type: "Solid", name: "Before", boundsMm: null, faceIds: ["17f1"], edgeIds: ["17e1"], faces: [], edges: [] };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body],
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, _bindings: string[], values: unknown[]) { call = { source, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.rename(7, "After", state.revision);

  assert.deepEqual(call?.values, [{ id: 7, name: "After" }]);
  assert.match(call?.source ?? "", /selection\.selected\.removeAll\(\)/);
});

test("lists and assigns native Plasticity appearance materials", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const body = { id: 7, versionId: 17, type: "Solid", name: "Part", materialId: 0, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const materials = [{ id: 2, name: "Blue", colorHex: "#3366cc", roughness: 0.42, metalness: 0.1, opacity: 1 }];
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body], materials };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  assert.deepEqual(await operations.listAppearanceMaterials(), {
    documentToken: state.documentToken,
    revision: state.revision,
    materials,
    assignments: [{ bodyId: 7, materialId: 0 }],
  });
  await operations.setAppearanceMaterial([7], { materialId: 2 }, state.revision);

  assert.deepEqual(call?.bindings, []);
  assert.deepEqual(call?.values, [{ ids: [7], material: { materialId: 2 } }]);
  assert.match(call?.source ?? "", /selection\.selected\.removeAll\(\)/);
  assert.match(call?.source ?? "", /editor\.db\.nodes\.setMaterial\(editor\.db\.nodes\.item2key\(view\), materialId\)/);
});

test("creates bounded appearance materials through native document history", async () => {
  let call: { source: string; values: unknown[] } | undefined;
  const body = { id: 7, versionId: 17, type: "Sheet", name: null, materialId: 0, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body], materials: [] };
  const runtime = { async getState() { return state; }, async mutate(source: string, _bindings: string[], values: unknown[]) { call = { source, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const material = { name: "Signal orange", colorHex: "#ff6600", roughness: 0.6, metalness: 0, opacity: 0.8 };

  await operations.setAppearanceMaterial([7], material, state.revision);

  assert.deepEqual(call?.values, [{ ids: [7], material }]);
  assert.match(call?.source ?? "", /editor\.db\.materials\.default\.clone\(\)/);
  assert.match(call?.source ?? "", /editor\.db\.materials\.add\(args\.material\.name, appearance\)/);
  assert.match(call?.source ?? "", /new this\.commands\.GroupSelectedCommand\(this\)/);
});

test("rejects stale, missing, duplicate, and invalid appearance references before mutation", async () => {
  let mutations = 0;
  const body = { id: 7, versionId: 17, type: "Solid", name: null, materialId: 0, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body], materials: [] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.setAppearanceMaterial([], { materialId: 0 }, state.revision), /at least one body/i);
  await assert.rejects(operations.setAppearanceMaterial([7, 7], { materialId: 0 }, state.revision), /unique/i);
  await assert.rejects(operations.setAppearanceMaterial([99], { materialId: 0 }, state.revision), /current body/i);
  await assert.rejects(operations.setAppearanceMaterial([7], { materialId: 2 }, state.revision), /unknown current/i);
  await assert.rejects(operations.setAppearanceMaterial([7], { name: "Bad", colorHex: "orange", roughness: 0.5, metalness: 0, opacity: 1 }, state.revision), /#RRGGBB/i);
  await assert.rejects(operations.setAppearanceMaterial([7], { name: "Bad", colorHex: "#ff6600", roughness: 2, metalness: 0, opacity: 1 }, state.revision), /roughness/i);
  await assert.rejects(operations.setAppearanceMaterial([7], { materialId: 0 }, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

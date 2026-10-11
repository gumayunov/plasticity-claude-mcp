import assert from "node:assert/strict";
import { test } from "node:test";
import { PlasticityOperations } from "../operations.ts";
import type { PlasticityRuntime, RuntimeState } from "../runtime.ts";
import { emptyConstruction } from "./test-support.ts";

test("rejects stale body references before a mutation", async () => {
  let mutated = false;
  const state: RuntimeState = {
    targetId: "window-1",
    title: "Untitled - Plasticity",
    documentToken: "document-1",
    revision: "current-revision",
    dbVersion: 1,
    undoDepth: 0,
    redoDepth: 0,
    regions: [],
    construction: emptyConstruction,
    bodies: [],
  };
  const runtime = {
    async getState() { return state; },
    async mutate() { mutated = true; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(
    operations.move([1], [1, 0, 0], "old-revision"),
    /stale reference/i,
  );
  assert.equal(mutated, false);
});

test("aligns a moving body set between exact planar face centers in one history step", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const faceBounds = { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] };
  const moving = {
    id: 7, versionId: 17, type: "Solid", name: "Moving", boundsMm: null,
    faceIds: ["17f1"], edgeIds: [],
    faces: [{ id: "17f1", surfaceType: "Plane", planar: true, centerMm: [30, 5, 22.5] as [number, number, number], normal: [-1, 0, 0] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: faceBounds, edgeIds: [] }],
    edges: [],
  };
  const companion = { ...moving, id: 9, versionId: 19, name: "Companion", faceIds: [], faces: [] };
  const fixed = {
    id: 8, versionId: 18, type: "Solid", name: "Fixed", boundsMm: null,
    faceIds: ["18f1"], edgeIds: [],
    faces: [{ id: "18f1", surfaceType: "Plane", planar: true, centerMm: [10, 10, 5] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: faceBounds, edgeIds: [] }],
    edges: [],
  };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [moving, fixed, companion],
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.alignPlanarFaces([7, 9], { bodyId: 7, faceId: "17f1" }, { bodyId: 8, faceId: "18f1" }, "opposed", 2, state.revision);

  assert.deepEqual(call?.bindings, ["RotateItemAndEmptyFactory", "MoveItemAndEmptyFactory", "Vector3", "Quaternion"]);
  assert.deepEqual(call?.values, [{ ids: [7, 9], pivot: [0.03, 0.005, 0.0225], sourceNormal: [-1, 0, 0], targetNormal: [0, 0, -1], delta: [-0.02, 0.005, -0.0155] }]);
  assert.match(call?.source ?? "", /new this\.commands\.GroupSelectedCommand/);
  assert.match(call?.source ?? "", /selection\.selected\.removeAll\(\)/);
  assert.match(call?.source ?? "", /new RotateFactory/);
  assert.match(call?.source ?? "", /new MoveFactory/);

  await operations.alignPlanarFaces([7], { bodyId: 7, faceId: "17f1" }, { bodyId: 8, faceId: "18f1" }, "same", -1, state.revision);
  assert.deepEqual(call?.values, [{ ids: [7], pivot: [0.03, 0.005, 0.0225], sourceNormal: [-1, 0, 0], targetNormal: [0, 0, 1], delta: [-0.02, 0.005, -0.0185] }]);
});

test("rejects invalid planar-face alignments before native mutation", async () => {
  let mutations = 0;
  const faceBounds = { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] };
  const planar = { id: "17f1", surfaceType: "Plane", planar: true, centerMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: faceBounds, edgeIds: [] };
  const curved = { ...planar, id: "17f2", surfaceType: "Cylinder", planar: false };
  const target = { ...planar, id: "18f1", centerMm: [0, 0, 10] as [number, number, number], normal: [0, 0, -1] as [number, number, number] };
  const bodies = [
    { id: 7, versionId: 17, type: "Solid", name: "Moving", boundsMm: null, faceIds: ["17f1", "17f2"], edgeIds: [], faces: [planar, curved], edges: [] },
    { id: 8, versionId: 18, type: "Solid", name: "Fixed", boundsMm: null, faceIds: ["18f1"], edgeIds: [], faces: [target], edges: [] },
  ];
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.alignPlanarFaces([], { bodyId: 7, faceId: "17f1" }, { bodyId: 8, faceId: "18f1" }, "opposed", 0, state.revision), /at least one moving body/i);
  await assert.rejects(operations.alignPlanarFaces([7, 7], { bodyId: 7, faceId: "17f1" }, { bodyId: 8, faceId: "18f1" }, "opposed", 0, state.revision), /moving body IDs must be unique/i);
  await assert.rejects(operations.alignPlanarFaces([8], { bodyId: 7, faceId: "17f1" }, { bodyId: 8, faceId: "18f1" }, "opposed", 0, state.revision), /source face must belong/i);
  await assert.rejects(operations.alignPlanarFaces([7, 8], { bodyId: 7, faceId: "17f1" }, { bodyId: 8, faceId: "18f1" }, "opposed", 0, state.revision), /target face must remain fixed/i);
  await assert.rejects(operations.alignPlanarFaces([7], { bodyId: 7, faceId: "17f2" }, { bodyId: 8, faceId: "18f1" }, "opposed", 0, state.revision), /source face must be planar/i);
  await assert.rejects(operations.alignPlanarFaces([7], { bodyId: 7, faceId: "17f1" }, { bodyId: 8, faceId: "missing" }, "opposed", 0, state.revision), /unknown current target face/i);
  await assert.rejects(operations.alignPlanarFaces([7], { bodyId: 7, faceId: "17f1" }, { bodyId: 8, faceId: "18f1" }, "opposed", Number.NaN, state.revision), /gap must be finite/i);
  await assert.rejects(operations.alignPlanarFaces([7], { bodyId: 7, faceId: "17f1" }, { bodyId: 8, faceId: "18f1" }, "opposed", 0, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("aligns exact cylindrical axes while preserving or anchoring axial position", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const faceBounds = { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] };
  const cylinder = (id: string, origin: [number, number, number], axis: [number, number, number]) => ({
    id, surfaceType: "Cylinder", planar: false, centerMm: origin, normal: [0, 1, 0] as [number, number, number],
    radiusMm: 5, blendRadiusMm: null, axisOriginMm: origin, axisDirection: axis, boundsMm: faceBounds, edgeIds: [],
  });
  const sourceFace = cylinder("17f1", [30, 5, 2.5], [1, 0, 0]);
  const targetFace = cylinder("18f1", [10, 10, 5], [0, 0, 1]);
  const moving = { id: 7, versionId: 17, type: "Solid", name: "Moving", boundsMm: null, faceIds: [sourceFace.id], edgeIds: [], faces: [sourceFace], edges: [] };
  const companion = { ...moving, id: 9, versionId: 19, name: "Companion", faceIds: [], faces: [] };
  const fixed = { id: 8, versionId: 18, type: "Solid", name: "Fixed", boundsMm: null, faceIds: [targetFace.id], edgeIds: [], faces: [targetFace], edges: [] };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [moving, fixed, companion],
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.alignCylindricalFaces([7, 9], { bodyId: 7, faceId: "17f1" }, { bodyId: 8, faceId: "18f1" }, "opposed", "preserve", 0, 90, state.revision);

  assert.deepEqual(call?.bindings, ["RotateItemAndEmptyFactory", "MoveItemAndEmptyFactory", "Vector3", "Quaternion"]);
  assert.deepEqual(call?.values, [{
    ids: [7, 9], pivot: [0.03, 0.005, 0.0025], sourceAxis: [1, 0, 0], targetAxis: [0, 0, -1],
    fixedAxis: [0, 0, 1], delta: [-0.02, 0.005, 0], targetOrigin: [0.01, 0.01, 0.005], rollRadians: Math.PI / 2,
  }]);
  assert.match(call?.source ?? "", /new this\.commands\.GroupSelectedCommand/);
  assert.match(call?.source ?? "", /setFromUnitVectors/);
  assert.match(call?.source ?? "", /setFromAxisAngle/);
  assert.match(call?.source ?? "", /selection\.selected\.removeAll\(\)/);

  await operations.alignCylindricalFaces([7], { bodyId: 7, faceId: "17f1" }, { bodyId: 8, faceId: "18f1" }, "same", "anchor", 2, 0, state.revision);
  assert.deepEqual(call?.values, [{
    ids: [7], pivot: [0.03, 0.005, 0.0025], sourceAxis: [1, 0, 0], targetAxis: [0, 0, 1],
    fixedAxis: [0, 0, 1], delta: [-0.02, 0.005, 0.0045], targetOrigin: [0.01, 0.01, 0.005], rollRadians: 0,
  }]);
});

test("rejects invalid cylindrical-face alignments before native mutation", async () => {
  let mutations = 0;
  const faceBounds = { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] };
  const cylinder = { id: "17f1", surfaceType: "Cylinder", planar: false, centerMm: [0, 0, 0] as [number, number, number], normal: [1, 0, 0] as [number, number, number], radiusMm: 5, blendRadiusMm: null, axisOriginMm: [0, 0, 0] as [number, number, number], axisDirection: [0, 0, 1] as [number, number, number], boundsMm: faceBounds, edgeIds: [] };
  const plane = { ...cylinder, id: "17f2", surfaceType: "Plane", planar: true, axisOriginMm: null, axisDirection: null };
  const target = { ...cylinder, id: "18f1", axisOriginMm: [10, 0, 0] as [number, number, number] };
  const bodies = [
    { id: 7, versionId: 17, type: "Solid", name: "Moving", boundsMm: null, faceIds: ["17f1", "17f2"], edgeIds: [], faces: [cylinder, plane], edges: [] },
    { id: 8, versionId: 18, type: "Solid", name: "Fixed", boundsMm: null, faceIds: ["18f1"], edgeIds: [], faces: [target], edges: [] },
  ];
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const source = { bodyId: 7, faceId: "17f1" };
  const fixed = { bodyId: 8, faceId: "18f1" };

  await assert.rejects(operations.alignCylindricalFaces([], source, fixed, "same", "preserve", 0, 0, state.revision), /at least one moving body/i);
  await assert.rejects(operations.alignCylindricalFaces([7, 7], source, fixed, "same", "preserve", 0, 0, state.revision), /moving body IDs must be unique/i);
  await assert.rejects(operations.alignCylindricalFaces([8], source, fixed, "same", "preserve", 0, 0, state.revision), /source face must belong/i);
  await assert.rejects(operations.alignCylindricalFaces([7, 8], source, fixed, "same", "preserve", 0, 0, state.revision), /target face must remain fixed/i);
  await assert.rejects(operations.alignCylindricalFaces([7], { bodyId: 7, faceId: "17f2" }, fixed, "same", "preserve", 0, 0, state.revision), /source face must be cylindrical/i);
  await assert.rejects(operations.alignCylindricalFaces([7], source, { bodyId: 8, faceId: "missing" }, "same", "preserve", 0, 0, state.revision), /unknown current target face/i);
  await assert.rejects(operations.alignCylindricalFaces([7], source, fixed, "same", "preserve", 2, 0, state.revision), /axial offset.*anchor/i);
  await assert.rejects(operations.alignCylindricalFaces([7], source, fixed, "same", "anchor", Number.NaN, 0, state.revision), /axial offset must be finite/i);
  await assert.rejects(operations.alignCylindricalFaces([7], source, fixed, "same", "anchor", 0, Number.POSITIVE_INFINITY, state.revision), /rotation.*finite/i);
  await assert.rejects(operations.alignCylindricalFaces([7], source, fixed, "same", "anchor", 0, 0, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("aligns an exact native vertex to a fixed vertex in one history step", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const moving = { id: 7, versionId: 17, type: "Solid", name: "Moving", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [{ id: 101, positionMm: [1, 2, 3] as [number, number, number], edgeIds: [], faceIds: [] }] };
  const fixed = { id: 8, versionId: 18, type: "Solid", name: "Fixed", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [{ id: 201, positionMm: [10, 20, 30] as [number, number, number], edgeIds: [], faceIds: [] }] };
  const companion = { ...moving, id: 9, versionId: 19, name: "Companion", vertices: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [moving, fixed, companion] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.alignVertices([7, 9], { bodyId: 7, vertexId: 101 }, { bodyId: 8, vertexId: 201 }, [0, 0, 2], state.revision);

  assert.deepEqual(call?.bindings, ["MoveItemAndEmptyFactory"]);
  assert.deepEqual(call?.values, [{ ids: [7, 9], delta: [0.009, 0.018, 0.029] }]);
  assert.match(call?.source ?? "", /new this\.commands\.GroupSelectedCommand/);
  assert.match(call?.source ?? "", /new MoveFactory/);
  assert.match(call?.source ?? "", /selection\.selected\.removeAll\(\)/);
});

test("rejects invalid and no-op native vertex alignments before mutation", async () => {
  let mutations = 0;
  const moving = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [{ id: 101, positionMm: [1, 2, 3] as [number, number, number], edgeIds: [], faceIds: [] }] };
  const fixed = { ...moving, id: 8, versionId: 18, vertices: [{ id: 201, positionMm: [10, 20, 30] as [number, number, number], edgeIds: [], faceIds: [] }] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [moving, fixed] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const source = { bodyId: 7, vertexId: 101 };
  const target = { bodyId: 8, vertexId: 201 };

  await assert.rejects(operations.alignVertices([], source, target, [0, 0, 0], state.revision), /at least one moving body/i);
  await assert.rejects(operations.alignVertices([7, 7], source, target, [0, 0, 0], state.revision), /moving body IDs must be unique/i);
  await assert.rejects(operations.alignVertices([8], source, target, [0, 0, 0], state.revision), /source vertex must belong/i);
  await assert.rejects(operations.alignVertices([7, 8], source, target, [0, 0, 0], state.revision), /target vertex must remain fixed/i);
  await assert.rejects(operations.alignVertices([7], { bodyId: 7, vertexId: 999 }, target, [0, 0, 0], state.revision), /source vertex.*current/i);
  await assert.rejects(operations.alignVertices([7], source, target, [0, Number.NaN, 0], state.revision), /offset must be finite/i);
  await assert.rejects(operations.alignVertices([7], source, target, [-9, -18, -27], state.revision), /would not move/i);
  await assert.rejects(operations.alignVertices([7], source, target, [0, 0, 0], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("aligns exact native Line edges with an axial offset and roll in one history step", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const sourceEdge = { id: "17e1", curveType: "Line", line: true, circle: false, lengthMm: 20, centerMm: [10, 0, 0] as [number, number, number], tangent: [1, 0, 0] as [number, number, number], boundsMm: { min: [0, 0, 0] as [number, number, number], max: [20, 0, 0] as [number, number, number] }, faceIds: [], vertexIds: [101, 102] };
  const targetEdge = { ...sourceEdge, id: "18e1", lengthMm: 30, centerMm: [0, 20, 10] as [number, number, number], tangent: [0, 1, 0] as [number, number, number], boundsMm: { min: [0, 5, 10] as [number, number, number], max: [0, 35, 10] as [number, number, number] }, vertexIds: [201, 202] };
  const moving = { id: 7, versionId: 17, type: "Solid", name: "Moving", boundsMm: null, faceIds: [], edgeIds: [sourceEdge.id], faces: [], edges: [sourceEdge], vertices: [] };
  const fixed = { id: 8, versionId: 18, type: "Solid", name: "Fixed", boundsMm: null, faceIds: [], edgeIds: [targetEdge.id], faces: [], edges: [targetEdge], vertices: [] };
  const companion = { ...moving, id: 9, versionId: 19, name: "Companion", edgeIds: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [moving, fixed, companion] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.alignLinearEdges([7, 9], { bodyId: 7, edgeId: sourceEdge.id }, { bodyId: 8, edgeId: targetEdge.id }, "opposed", 3, 90, state.revision);

  assert.deepEqual(call?.bindings, ["RotateItemAndEmptyFactory", "MoveItemAndEmptyFactory", "Vector3", "Quaternion"]);
  assert.deepEqual(call?.values, [{
    ids: [7, 9], sourcePivot: [0.01, 0, 0], targetPivot: [0, 0.023, 0.01],
    sourceDirection: [1, 0, 0], targetDirection: [0, -1, 0], fixedDirection: [0, 1, 0],
    delta: [-0.01, 0.023, 0.01], rollRadians: Math.PI / 2,
  }]);
  assert.match(call?.source ?? "", /new this\.commands\.GroupSelectedCommand/);
  assert.match(call?.source ?? "", /setFromUnitVectors/);
  assert.match(call?.source ?? "", /setFromAxisAngle/);
});

test("rejects invalid and no-op native linear-edge alignments before mutation", async () => {
  let mutations = 0;
  const line = { id: "17e1", curveType: "Line", line: true, circle: false, lengthMm: 20, centerMm: [0, 0, 0] as [number, number, number], tangent: [1, 0, 0] as [number, number, number], boundsMm: { min: [-10, 0, 0] as [number, number, number], max: [10, 0, 0] as [number, number, number] }, faceIds: [], vertexIds: [101, 102] };
  const curve = { ...line, id: "17e2", curveType: "Circle", line: false, circle: true };
  const target = { ...line, id: "18e1" };
  const bodies = [
    { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [line.id, curve.id], faces: [], edges: [line, curve], vertices: [] },
    { id: 8, versionId: 18, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [target.id], faces: [], edges: [target], vertices: [] },
  ];
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const source = { bodyId: 7, edgeId: line.id };
  const fixed = { bodyId: 8, edgeId: target.id };

  await assert.rejects(operations.alignLinearEdges([], source, fixed, "same", 0, 0, state.revision), /at least one moving body/i);
  await assert.rejects(operations.alignLinearEdges([7, 7], source, fixed, "same", 0, 0, state.revision), /moving body IDs must be unique/i);
  await assert.rejects(operations.alignLinearEdges([8], source, fixed, "same", 0, 0, state.revision), /source edge must belong/i);
  await assert.rejects(operations.alignLinearEdges([7, 8], source, fixed, "same", 0, 0, state.revision), /target edge must remain fixed/i);
  await assert.rejects(operations.alignLinearEdges([7], { bodyId: 7, edgeId: curve.id }, fixed, "same", 0, 0, state.revision), /source edge must be.*Line/i);
  await assert.rejects(operations.alignLinearEdges([7], source, { bodyId: 8, edgeId: "missing" }, "same", 0, 0, state.revision), /unknown current target edge/i);
  await assert.rejects(operations.alignLinearEdges([7], source, fixed, "same", Number.NaN, 0, state.revision), /axial offset must be finite/i);
  await assert.rejects(operations.alignLinearEdges([7], source, fixed, "same", 0, Number.POSITIVE_INFINITY, state.revision), /rotation.*finite/i);
  await assert.rejects(operations.alignLinearEdges([7], source, fixed, "same", 0, 0, state.revision), /would not transform/i);
  await assert.rejects(operations.alignLinearEdges([7], source, fixed, "same", 0, 0, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("sets native block dimensions in one Plasticity history operation", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const solid = { id: 7, versionId: 17, type: "Solid", name: "Block", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid] };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.setBlockDimensions(7, 15, 25, 35, state.revision);

  assert.deepEqual(call?.bindings, ["DimensionBlockCommand", "DimensionBlockFactory"]);
  assert.deepEqual(call?.values, [{ id: 7, width: 0.015, length: 0.025, height: 0.035 }]);
  assert.match(call?.source ?? "", /collection\?\.HasBlock/);
  assert.match(call?.source ?? "", /factory\.width = args\.width/);
  assert.match(call?.source ?? "", /new this\.commands\.GroupSelectedCommand\(this\)/);
});

test("rejects invalid block dimension targets and values before mutation", async () => {
  let mutations = 0;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const solid = { ...wire, id: 8, versionId: 18, type: "Solid" };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire, solid] };
  const runtime = {
    async getState() { return state; },
    async mutate() { mutations += 1; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.setBlockDimensions(7, 10, 20, 30, state.revision), /current Solid/i);
  await assert.rejects(operations.setBlockDimensions(99, 10, 20, 30, state.revision), /current Solid/i);
  await assert.rejects(operations.setBlockDimensions(8, 0, 20, 30, state.revision), /widthMm/i);
  await assert.rejects(operations.setBlockDimensions(8, 10, Number.NaN, 30, state.revision), /lengthMm/i);
  await assert.rejects(operations.setBlockDimensions(8, 10, 20, -1, state.revision), /heightMm/i);
  await assert.rejects(operations.setBlockDimensions(8, 10, 20, 30, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("sets an exact native radius dimension on one cylindrical face", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const cylinder = { id: "17f2", surfaceType: "Cylinder", planar: false, centerMm: [0, 0, 10] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: 5, blendRadiusMm: null, axisOriginMm: [0, 0, 0] as [number, number, number], axisDirection: [0, 0, 1] as [number, number, number], boundsMm: { min: [-5, -5, 0] as [number, number, number], max: [5, 5, 20] as [number, number, number] }, edgeIds: [] };
  const solid = { id: 7, versionId: 17, type: "Solid", name: "Cylinder", boundsMm: cylinder.boundsMm, faceIds: [cylinder.id], edgeIds: [], faces: [cylinder], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid] };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.setRadiusDimension({ bodyId: 7, faceId: "17f2" }, 7, state.revision);

  assert.deepEqual(call?.bindings, ["DimensionRadiusCommand", "DimensionRadiusFactory"]);
  assert.deepEqual(call?.values, [{ face: { bodyId: 7, faceId: "17f2" }, radius: 0.007 }]);
  assert.match(call?.source ?? "", /selected\.addFace/);
  assert.match(call?.source ?? "", /collection\?\.HasRadius/);
  assert.match(call?.source ?? "", /factory\.radius = args\.radius/);
});

test("rejects stale, noncylindrical, and invalid radius dimension inputs", async () => {
  let mutations = 0;
  const plane = { id: "17f1", surfaceType: "Plane", planar: true, centerMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 10, 0] as [number, number, number] }, edgeIds: [] };
  const solid = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [plane.id], edgeIds: [], faces: [plane], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid] };
  const runtime = {
    async getState() { return state; },
    async mutate() { mutations += 1; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.setRadiusDimension({ bodyId: 7, faceId: plane.id }, 5, state.revision), /cylindrical face/i);
  await assert.rejects(operations.setRadiusDimension({ bodyId: 7, faceId: "missing" }, 5, state.revision), /cylindrical face/i);
  const cylindricalState = { ...state, bodies: [{ ...solid, faceIds: ["17f2"], faces: [{ ...plane, id: "17f2", surfaceType: "Cylinder", planar: false, radiusMm: 5 }] }] };
  const cylindricalRuntime = { async getState() { return cylindricalState; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const cylindricalOperations = new PlasticityOperations(cylindricalRuntime);
  await assert.rejects(cylindricalOperations.setRadiusDimension({ bodyId: 7, faceId: "17f2" }, 0, state.revision), /radiusMm/i);
  await assert.rejects(cylindricalOperations.setRadiusDimension({ bodyId: 7, faceId: "17f2" }, 7, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("sets native dimensions on a recognized closed rectangular Wire", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wire = { id: 7, versionId: 17, type: "Wire", name: "Rectangle", boundsMm: { min: [0, 0, 0] as [number, number, number], max: [20, 10, 0] as [number, number, number] }, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const region = { id: "17r21", entityId: 21, islandVersionId: 17, sketchId: 3, sketchWireIds: [7], measurementSource: "render-mesh" as const, displayBoundsMm: wire.boundsMm };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [region], bodies: [wire] };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.setRectangleDimensions(7, 15, 25, state.revision);

  assert.deepEqual(call?.bindings, ["DimensionRectangleCommand", "DimensionRectangleFactory"]);
  assert.deepEqual(call?.values, [{ id: 7, width: 0.015, length: 0.025 }]);
  assert.match(call?.source ?? "", /collection\?\.HasRectangle/);
  assert.match(call?.source ?? "", /factory\.width = args\.width/);
  assert.match(call?.source ?? "", /factory\.length = args\.length/);
});

test("rejects open, non-Wire, stale, and invalid rectangle dimension inputs", async () => {
  let mutations = 0;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const solid = { ...wire, id: 8, versionId: 18, type: "Solid" };
  const region = { id: "17r21", entityId: 21, islandVersionId: 17, sketchId: 3, sketchWireIds: [7], measurementSource: "render-mesh" as const, displayBoundsMm: { min: [0, 0, 0] as [number, number, number], max: [20, 10, 0] as [number, number, number] } };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [region], bodies: [wire, solid] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.setRectangleDimensions(8, 15, 25, state.revision), /closed planar Wire/i);
  const openState = { ...state, regions: [] };
  const openRuntime = { async getState() { return openState; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const openOperations = new PlasticityOperations(openRuntime);
  await assert.rejects(openOperations.setRectangleDimensions(7, 15, 25, state.revision), /closed planar Wire/i);
  await assert.rejects(operations.setRectangleDimensions(7, 0, 25, state.revision), /widthMm/i);
  await assert.rejects(operations.setRectangleDimensions(7, 15, Number.POSITIVE_INFINITY, state.revision), /lengthMm/i);
  await assert.rejects(operations.setRectangleDimensions(7, 15, 25, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

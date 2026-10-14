import assert from "node:assert/strict";
import { test } from "node:test";
import { PlasticityOperations } from "./index.ts";
import type { PlasticityRuntime, RuntimeState } from "../runtime.ts";
import { emptyConstruction } from "./test-support.ts";

test("offsets planar Wire bodies with a signed millimeter distance", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
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
    async mutate(source: string, bindings: string[], values: unknown[]) {
      call = { source, bindings, values };
      return {};
    },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.offsetPlanarCurves([7, 8], -2.5, state.revision);

  assert.deepEqual(call?.bindings, ["OffsetPlanarCurvesFactory"]);
  assert.deepEqual(call?.values, [{ ids: [7, 8], distance: -0.0025 }]);
  assert.match(call?.source ?? "", /OffsetPlanarCurveCommand/);
  assert.match(call?.source ?? "", /factory\.curves = args\.ids\.map\(findWire\)/);
  assert.match(call?.source ?? "", /factory\.distance1 = args\.distance/);
});

test("rejects zero and duplicate planar curve offsets before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [],
  };
  const runtime = {
    async getState() { return state; },
    async mutate() { mutations += 1; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.offsetPlanarCurves([7], 0, state.revision), /nonzero/i);
  await assert.rejects(operations.offsetPlanarCurves([7, 7], 2, state.revision), /unique/i);
  await assert.rejects(operations.offsetPlanarCurves([7], 2, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("offsets explicit native Regions within one sketch", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, bodies: [],
    regions: [{
      id: "12r34", entityId: 34, islandVersionId: 12, sketchId: 3, sketchWireIds: [7],
      measurementSource: "render-mesh", displayBoundsMm: { min: [0, 0, 0], max: [20, 10, 0] },
    }],
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.offsetRegions(["12r34"], [2, -1], false, state.revision);

  assert.deepEqual(call?.bindings, ["OffsetRegionFactory"]);
  assert.deepEqual(call?.values, [{ regionIds: ["12r34"], islandVersionId: 12, distance1: 0.002, distance2: -0.001, individual: false }]);
  assert.match(call?.source ?? "", /factory\.sketch = island\.view/);
  assert.match(call?.source ?? "", /factory\.regions = regions/);
});

test("rejects stale, missing, cross-sketch, zero, and duplicate Region offsets before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, bodies: [],
    regions: [
      { id: "12r34", entityId: 34, islandVersionId: 12, sketchId: 3, sketchWireIds: [7], measurementSource: "render-mesh", displayBoundsMm: { min: [0, 0, 0], max: [20, 10, 0] } },
      { id: "13r35", entityId: 35, islandVersionId: 13, sketchId: 4, sketchWireIds: [8], measurementSource: "render-mesh", displayBoundsMm: { min: [30, 0, 0], max: [40, 10, 0] } },
    ],
  };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.offsetRegions([], [2], true, state.revision), /at least one/i);
  await assert.rejects(operations.offsetRegions(["missing"], [2], true, state.revision), /stale or unknown/i);
  await assert.rejects(operations.offsetRegions(["12r34", "13r35"], [2], true, state.revision), /same sketch/i);
  await assert.rejects(operations.offsetRegions(["12r34"], [0], true, state.revision), /nonzero/i);
  await assert.rejects(operations.offsetRegions(["12r34"], [2, 2], true, state.revision), /unique/i);
  await assert.rejects(operations.offsetRegions(["12r34"], [2], true, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("trims explicit native curve fragments", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [],
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.trimCurveFragments(["12s34", "13s35"], state.revision);

  assert.deepEqual(call?.bindings, ["TrimFactory"]);
  assert.deepEqual(call?.values, [{ fragmentIds: ["12s34", "13s35"] }]);
  assert.match(call?.source ?? "", /factory\.segments = selected/);
  assert.match(call?.source ?? "", /Stale or unknown curve fragments/);
});

test("rejects duplicate curve fragment references before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [],
  };
  const runtime = {
    async getState() { return state; },
    async mutate() { mutations += 1; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.trimCurveFragments([], state.revision), /at least one/i);
  await assert.rejects(operations.trimCurveFragments(["12s34", "12s34"], state.revision), /unique/i);
  await assert.rejects(operations.trimCurveFragments(["12s34"], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("extends explicit native curve endpoints by millimeters", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [],
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.extendCurveEndpoints(["10v42", "11v43"], 2.5, state.revision);

  assert.deepEqual(call?.bindings, ["MultiExtendVertexFactory"]);
  assert.deepEqual(call?.values, [{ endpointIds: ["10v42", "11v43"], distance: 0.0025 }]);
  assert.match(call?.source ?? "", /factory\.vertices = selected/);
  assert.match(call?.source ?? "", /factory\.distance = args\.distance/);
  assert.match(call?.source ?? "", /model\.IsSpur\(\)/);
});

test("rejects nonpositive and duplicate curve endpoint extensions before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [],
  };
  const runtime = {
    async getState() { return state; }, async mutate() { mutations += 1; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.extendCurveEndpoints(["10v42"], 0, state.revision), /positive/i);
  await assert.rejects(operations.extendCurveEndpoints(["10v42", "10v42"], 2, state.revision), /unique/i);
  await assert.rejects(operations.extendCurveEndpoints(["10v42"], 2, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("fillets exact closed Wire vertices with a native radius in metres", async () => {
  let mutation: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [],
  };
  const listed = [{
    id: "7:42", bodyId: 7, bodyVersionId: 17, vertexId: 42, viewVersionId: "17v42",
    measurementSource: "native-brep" as const, positionMm: [0, 0, 0] as [number, number, number],
    endpoint: false, adjacentEdgeEntityIds: [98, 99],
  }];
  const runtime = {
    async getState() { return state; },
    async readNative() { return listed; },
    async mutate(source: string, bindings: string[], values: unknown[]) { mutation = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.filletCurveVertices([{ bodyId: 7, vertexId: 42 }], 3, state.revision);

  assert.deepEqual(mutation?.bindings, ["FilletVertexFactory"]);
  assert.deepEqual(mutation?.values, [{ vertices: [{ bodyId: 7, vertexId: 42 }], radius: 0.003 }]);
  assert.match(mutation?.source ?? "", /FilletVertexCommand/);
  assert.match(mutation?.source ?? "", /factory\.vertices = selected/);
  assert.match(mutation?.source ?? "", /factory\.radius = args\.radius/);
});

test("rejects invalid curve fillet vertices before native mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [],
  };
  let listed: Array<Record<string, unknown>> = [];
  const runtime = {
    async getState() { return state; }, async readNative() { return listed; },
    async mutate() { mutations += 1; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const reference = { bodyId: 7, vertexId: 42 };

  await assert.rejects(operations.filletCurveVertices([], 3, state.revision), /at least one/i);
  await assert.rejects(operations.filletCurveVertices([reference, reference], 3, state.revision), /unique/i);
  await assert.rejects(operations.filletCurveVertices([reference], 0, state.revision), /positive/i);
  await assert.rejects(operations.filletCurveVertices([reference], 3, "old-revision"), /stale reference/i);
  await assert.rejects(operations.filletCurveVertices([reference], 3, state.revision), /stale or unknown/i);
  listed = [{ id: "7:42", bodyId: 7, bodyVersionId: 17, vertexId: 42, viewVersionId: "17v42", measurementSource: "native-brep", positionMm: [0, 0, 0], endpoint: true, adjacentEdgeEntityIds: [99] }];
  await assert.rejects(operations.filletCurveVertices([reference], 3, state.revision), /interior or closed/i);
  listed = [{ ...listed[0]!, endpoint: false, adjacentEdgeEntityIds: [98, 99, 100] }];
  await assert.rejects(operations.filletCurveVertices([reference], 3, state.revision), /exactly two/i);
  assert.equal(mutations, 0);
});

test("unjoins compound native Wire bodies into separate curves", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.unjoinCurves([7], state.revision);

  assert.deepEqual(call?.bindings, ["UnjoinCurvesCommand", "UnjoinCurvesFactory"]);
  assert.deepEqual(call?.values, [{ ids: [7] }]);
  assert.match(call?.source ?? "", /factory\.curves = args\.ids\.map\(find\)/);
});

test("rejects invalid native curve unjoin inputs before mutation", async () => {
  let mutations = 0;
  const solid = { id: 8, versionId: 18, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.unjoinCurves([], state.revision), /at least one/i);
  await assert.rejects(operations.unjoinCurves([7, 7], state.revision), /unique/i);
  await assert.rejects(operations.unjoinCurves([7], state.revision), /current Wire/i);
  await assert.rejects(operations.unjoinCurves([8], state.revision), /current Wire/i);
  await assert.rejects(operations.unjoinCurves([7], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("duplicates native Wire bodies as independent editable curves", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wires = [7, 8].map((id) => ({ id, versionId: id + 10, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] }));
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: wires };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.duplicateCurves([7, 8], state.revision);

  assert.deepEqual(call?.bindings, ["CurveDuplicateFactory"]);
  assert.deepEqual(call?.values, [{ ids: [7, 8] }]);
  assert.match(call?.source ?? "", /this\.commands\.DuplicateCommand/);
  assert.match(call?.source ?? "", /factory\.curves = args\.ids\.map\(find\)/);
});

test("rejects invalid native curve duplication inputs before mutation", async () => {
  let mutations = 0;
  const solid = { id: 8, versionId: 18, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.duplicateCurves([], state.revision), /at least one/i);
  await assert.rejects(operations.duplicateCurves([7, 7], state.revision), /unique/i);
  await assert.rejects(operations.duplicateCurves([8], state.revision), /current Wire/i);
  await assert.rejects(operations.duplicateCurves([7], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("creates independent native curves from exact current Regions", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const region = { id: "20r1", entityId: 41, islandVersionId: 20, sketchId: 3, sketchWireIds: [7], measurementSource: "render-mesh" as const, displayBoundsMm: { min: [0, 0, 0] as [number, number, number], max: [20, 10, 0] as [number, number, number] } };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [region], bodies: [] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.createCurvesFromRegions([region.id], state.revision);

  assert.deepEqual(call?.bindings, ["CreateCurvesFromRegionsFactory"]);
  assert.deepEqual(call?.values, [{ regionIds: [region.id] }]);
  assert.match(call?.source ?? "", /this\.commands\.DuplicateCommand/);
  assert.match(call?.source ?? "", /factory\.regions = regions/);
});

test("rejects stale or ambiguous Region boundary duplication before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.createCurvesFromRegions([], state.revision), /at least one/i);
  await assert.rejects(operations.createCurvesFromRegions(["20r1", "20r1"], state.revision), /unique/i);
  await assert.rejects(operations.createCurvesFromRegions(["20r1"], state.revision), /stale or unknown Region/i);
  await assert.rejects(operations.createCurvesFromRegions(["20r1"], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("joins separate native Wire bodies into a compound curve", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wires = [7, 8].map((id) => ({ id, versionId: id + 10, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] }));
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: wires };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.joinCurves([7, 8], state.revision);

  assert.deepEqual(call?.bindings, ["JoinCurvesCommand", "JoinCurvesFactory"]);
  assert.deepEqual(call?.values, [{ ids: [7, 8] }]);
  assert.match(call?.source ?? "", /factory\.curves = args\.ids\.map\(find\)/);
});

test("rejects invalid native curve join inputs before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.joinCurves([7], state.revision), /at least two/i);
  await assert.rejects(operations.joinCurves([7, 7], state.revision), /unique/i);
  await assert.rejects(operations.joinCurves([7, 8], state.revision), /current Wire/i);
  await assert.rejects(operations.joinCurves([7, 8], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("rebuilds native curves by tolerance, control-point count, or degree and spans", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.rebuildCurves([7], { method: "tolerance", toleranceMm: 0.1 }, state.revision);
  await operations.rebuildCurves([7], { method: "control-points", pointCount: 9, preserveChain: false }, state.revision);
  await operations.rebuildCurves([7], { method: "degree-spans", degree: 5, spans: 3, keepCorners: false }, state.revision);

  assert.deepEqual(calls.map((call) => call.bindings), [["RebuildCurveFactory"], ["RebuildCurveFactory"], ["RebuildCurveFactory"]]);
  assert.deepEqual(calls.map((call) => call.values[0]), [
    { ids: [7], method: 0, parameters: { tolerance: 0.0001 }, preserveParameterization: false, preserveChain: true, keepCorners: true },
    { ids: [7], method: 1, parameters: { pointCount: 9 }, preserveParameterization: false, preserveChain: false, keepCorners: true },
    { ids: [7], method: 2, parameters: { degree: 5, spans: 3 }, preserveParameterization: false, preserveChain: true, keepCorners: false },
  ]);
  assert.match(calls[0]?.source ?? "", /RebuildCurveCommand/);
  assert.match(calls[0]?.source ?? "", /factory\.method = args\.method/);
  assert.match(calls[0]?.source ?? "", /factory\.tolerance = args\.parameters\.tolerance/);
  assert.match(calls[0]?.source ?? "", /factory\.pointCount = args\.parameters\.pointCount/);
  assert.match(calls[0]?.source ?? "", /factory\.degree = args\.parameters\.degree/);
});

test("rejects invalid curve rebuild inputs before mutation", async () => {
  let mutations = 0;
  const solid = { id: 8, versionId: 18, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.rebuildCurves([], { method: "tolerance", toleranceMm: 0.1 }, state.revision), /at least one/i);
  await assert.rejects(operations.rebuildCurves([7, 7], { method: "tolerance", toleranceMm: 0.1 }, state.revision), /unique/i);
  await assert.rejects(operations.rebuildCurves([8], { method: "tolerance", toleranceMm: 0.1 }, state.revision), /current Wire/i);
  await assert.rejects(operations.rebuildCurves([8], { method: "tolerance", toleranceMm: 0.1 }, "old-revision"), /stale reference/i);
  const wireState = { ...state, bodies: [{ ...solid, id: 7, type: "Wire" }] };
  const wireRuntime = { async getState() { return wireState; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const wireOperations = new PlasticityOperations(wireRuntime);
  await assert.rejects(wireOperations.rebuildCurves([7], { method: "tolerance", toleranceMm: 0 }, wireState.revision), /tolerance/i);
  await assert.rejects(wireOperations.rebuildCurves([7], { method: "control-points", pointCount: 3 }, wireState.revision), /control-point count/i);
  await assert.rejects(wireOperations.rebuildCurves([7], { method: "degree-spans", degree: 16, spans: 1 }, wireState.revision), /degree/i);
  await assert.rejects(wireOperations.rebuildCurves([7], { method: "degree-spans", degree: 5, spans: 10_000 }, wireState.revision), /spans/i);
  assert.equal(mutations, 0);
});

test("raises native curve degree and subdivides native curves in one history step each", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.raiseCurveDegree([7], state.revision);
  await operations.subdivideCurves([7], state.revision);

  assert.deepEqual(calls.map((call) => call.bindings), [
    ["RaiseDegreeCurveFactory", "RaiseDegreeCurveCommand"],
    ["SubdivideCurveFactory", "SubdivideCurveCommand"],
  ]);
  assert.deepEqual(calls.map((call) => call.values), [[{ ids: [7] }], [{ ids: [7] }]]);
  assert.match(calls[0]?.source ?? "", /const command = new Command\(editor\)/);
  assert.match(calls[1]?.source ?? "", /factory\.curves = args\.ids\.map\(find\)/);
});

test("inserts one native B-Spline knot at a normalized segment parameter", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;

  await new PlasticityOperations(runtime).insertCurveKnot({ bodyId: 7, segmentEntityId: 99 }, 0.5, state.revision);

  assert.deepEqual(call?.bindings, ["InsertKnotFactory", "InsertKnotCommand"]);
  assert.deepEqual(call?.values, [{ reference: { bodyId: 7, segmentEntityId: 99 }, normalizedParameter: 0.5 }]);
  assert.match(call?.source ?? "", /edge\.Denormalize\(args\.normalizedParameter\)/);
  assert.match(call?.source ?? "", /factory\._segment\.model = new Proxy/);
  assert.match(call?.source ?? "", /target\.InsertKnot\(nativeParameter\)/);
  assert.match(call?.source ?? "", /return await factory\.commit\(\)/);
});

test("rejects invalid native knot insertion inputs before mutation", async () => {
  let mutations = 0;
  const solid = { id: 8, versionId: 18, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.insertCurveKnot({ bodyId: 8, segmentEntityId: 99 }, 0.5, state.revision), /current Wire/i);
  await assert.rejects(operations.insertCurveKnot({ bodyId: 8, segmentEntityId: 99 }, 0.5, "old-revision"), /stale reference/i);
  const wireState = { ...state, bodies: [{ ...solid, id: 7, type: "Wire" }] };
  const wireRuntime = { async getState() { return wireState; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const wireOperations = new PlasticityOperations(wireRuntime);
  for (const parameter of [0, 1, -0.1, 1.1, Number.NaN]) {
    await assert.rejects(wireOperations.insertCurveKnot({ bodyId: 7, segmentEntityId: 99 }, parameter, wireState.revision), /parameter/i);
  }
  await assert.rejects(wireOperations.insertCurveKnot({ bodyId: 7, segmentEntityId: 0 }, 0.5, wireState.revision), /segment entity ID/i);
  assert.equal(mutations, 0);
});

test("splits one nonperiodic native Wire segment at a normalized parameter", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;

  await new PlasticityOperations(runtime).splitCurveSegment({ bodyId: 7, segmentEntityId: 99 }, 0.5, state.revision);

  assert.deepEqual(call?.bindings, ["SplitSegmentFactory", "SplitSegmentCommand"]);
  assert.deepEqual(call?.values, [{ reference: { bodyId: 7, segmentEntityId: 99 }, normalizedParameter: 0.5 }]);
  assert.match(call?.source ?? "", /edge\.IsPeriodic\(\)/);
  assert.match(call?.source ?? "", /factory\._segment\.model = new Proxy/);
  assert.match(call?.source ?? "", /target\.SplitAt\(args\.normalizedParameter\)/);
  assert.doesNotMatch(call?.source ?? "", /Denormalize/);
});

test("rejects invalid native curve segment splits before mutation", async () => {
  let mutations = 0;
  const solid = { id: 8, versionId: 18, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  await assert.rejects(operations.splitCurveSegment({ bodyId: 8, segmentEntityId: 99 }, 0.5, state.revision), /current Wire/i);
  await assert.rejects(operations.splitCurveSegment({ bodyId: 8, segmentEntityId: 99 }, 0.5, "old-revision"), /stale reference/i);
  const wireState = { ...state, bodies: [{ ...solid, id: 7, type: "Wire" }] };
  const wireRuntime = { async getState() { return wireState; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const wireOperations = new PlasticityOperations(wireRuntime);
  await assert.rejects(wireOperations.splitCurveSegment({ bodyId: 7, segmentEntityId: 0 }, 0.5, wireState.revision), /segment entity ID/i);
  for (const parameter of [0, 1, -0.1, 1.1, Number.NaN]) {
    await assert.rejects(wireOperations.splitCurveSegment({ bodyId: 7, segmentEntityId: 99 }, parameter, wireState.revision), /parameter/i);
  }
  assert.equal(mutations, 0);
});

test("rejects invalid degree-elevation and subdivision references before mutation", async () => {
  let mutations = 0;
  const solid = { id: 8, versionId: 18, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  for (const run of [
    () => operations.raiseCurveDegree([], state.revision),
    () => operations.raiseCurveDegree([8], state.revision),
    () => operations.raiseCurveDegree([8], "old-revision"),
    () => operations.subdivideCurves([8, 8], state.revision),
    () => operations.subdivideCurves([8], state.revision),
    () => operations.planarizeCurves([], [0, 0, 0], [0, 0, 1], state.revision),
    () => operations.planarizeCurves([8], [0, 0, 0], [0, 0, 1], state.revision),
  ]) await assert.rejects(run(), /at least one|unique|current Wire|stale reference/i);
  const wireState = { ...state, bodies: [{ ...solid, id: 7, type: "Wire" }] };
  const wireRuntime = { async getState() { return wireState; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  await assert.rejects(new PlasticityOperations(wireRuntime).planarizeCurves([7], [0, 0, 0], [0, 0, 0], wireState.revision), /zero|normalize/i);
  assert.equal(mutations, 0);
});

test("planarizes native Wires onto an explicit normalized world plane", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.planarizeCurves([7], [0, 0, 5], [0, 0, 2], state.revision);

  assert.deepEqual(call?.bindings, ["PlanarizeCurveFactory", "DeformCurveCommand", "Vector3"]);
  assert.deepEqual(call?.values, [{ ids: [7], origin: [0, 0, 0.005], normal: [0, 0, 1] }]);
  assert.match(call?.source ?? "", /factory\.origin\.copy/);
  assert.match(call?.source ?? "", /factory\.normal\.copy/);
});

test("reverses native Wire directions in one history step", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.reverseCurves([7], state.revision);

  assert.deepEqual(call?.bindings, ["ReverseCurveCommand", "ReverseCurveFactory"]);
  assert.deepEqual(call?.values, [{ ids: [7] }]);
  assert.match(call?.source ?? "", /factory\.curves = args\.ids\.map\(find\)/);
});

test("rejects invalid curve and Sheet reversal references before mutation", async () => {
  let mutations = 0;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const sheet = { id: 8, versionId: 18, type: "Sheet", name: null, boundsMm: null, faceIds: ["f1"], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire, sheet] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.reverseCurves([], state.revision), /at least one/i);
  await assert.rejects(operations.reverseCurves([7, 7], state.revision), /unique/i);
  await assert.rejects(operations.reverseCurves([8], state.revision), /current Wire/i);
  await assert.rejects(operations.reverseSheets([], state.revision), /at least one/i);
  await assert.rejects(operations.reverseSheets([8, 8], state.revision), /unique/i);
  await assert.rejects(operations.reverseSheets([7], state.revision), /current Sheet/i);
  await assert.rejects(operations.reverseSheets([8], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("projects native Wire bodies onto a target body along an explicit vector", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [],
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.projectCurvesOntoBody(7, [11, 12], [0, 0, -5], {
    bidirectional: false,
    occlude: true,
    completion: "face-set",
  }, state.revision);

  assert.deepEqual(call?.bindings, ["ProjectCurveBodyFactory", "Vector3", "ProjectionMethod", "ProjectionCompletionType"]);
  assert.deepEqual(call?.values, [{
    targetId: 7,
    curveIds: [11, 12],
    direction: [0, 0, -1],
    bidirectional: false,
    occlude: true,
    completionName: "FaceSet",
  }]);
  assert.match(call?.source ?? "", /factory\.method = ProjectionMethod\.Vector/);
  assert.match(call?.source ?? "", /ProjectionCompletionType\[args\.completionName\]/);
});

test("rejects invalid native curve projection inputs before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [],
  };
  const runtime = {
    async getState() { return state; }, async mutate() { mutations += 1; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.projectCurvesOntoBody(7, [], [0, 0, -1], {}, state.revision), /at least one/i);
  await assert.rejects(operations.projectCurvesOntoBody(7, [11, 11], [0, 0, -1], {}, state.revision), /unique/i);
  await assert.rejects(operations.projectCurvesOntoBody(7, [7], [0, 0, -1], {}, state.revision), /must not include/i);
  await assert.rejects(operations.projectCurvesOntoBody(7, [11], [0, 0, 0], {}, state.revision), /nonzero/i);
  await assert.rejects(operations.projectCurvesOntoBody(7, [11], [0, 0, -1], {}, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("creates independent native intersection curves while preserving source bodies", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const target = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: ["f1"], edgeIds: [], faces: [], edges: [] };
  const tool = { ...target, id: 8, versionId: 18, type: "Sheet" };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [target, tool] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.createBodyIntersectionCurves(7, [8], state.revision);

  assert.deepEqual(call?.bindings, ["ProjectBodyBodyCommand", "ProjectBodyBodyFactory"]);
  assert.deepEqual(call?.values, [{ targetId: 7, toolIds: [8] }]);
  assert.match(call?.source ?? "", /factory\.target = find\(args\.targetId\)/);
  assert.match(call?.source ?? "", /factory\.tools = args\.toolIds\.map\(find\)/);
});

test("rejects invalid body-intersection curve references before mutation", async () => {
  let mutations = 0;
  const solid = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: ["f1"], edgeIds: [], faces: [], edges: [] };
  const wire = { ...solid, id: 8, versionId: 18, type: "Wire" };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid, wire] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.createBodyIntersectionCurves(7, [], state.revision), /at least one/i);
  await assert.rejects(operations.createBodyIntersectionCurves(7, [7], state.revision), /cannot also be a tool/i);
  await assert.rejects(operations.createBodyIntersectionCurves(7, [8], state.revision), /current Solid or Sheet/i);
  await assert.rejects(operations.createBodyIntersectionCurves(99, [7], state.revision), /target.*Solid or Sheet/i);
  await assert.rejects(operations.createBodyIntersectionCurves(7, [8, 8], state.revision), /unique/i);
  await assert.rejects(operations.createBodyIntersectionCurves(7, [8], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("projects two native Wire bodies into one independent spatial curve", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const first = { id: 11, versionId: 21, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const second = { ...first, id: 12, versionId: 22 };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [first, second] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.projectCurvePair(11, [0, 0, 5], 12, [0, -2, 0], 1000, state.revision);

  assert.deepEqual(call?.bindings, ["ProjectCurveCurveCommand", "ProjectCurveCurveFactory", "Vector3"]);
  assert.deepEqual(call?.values, [{ firstId: 11, firstDirection: [0, 0, 1], secondId: 12, secondDirection: [0, -1, 0], projectionDepth: 1 }]);
  assert.match(call?.source ?? "", /factory\.extrude1\.distance2 = -args\.projectionDepth/);
  assert.match(call?.source ?? "", /factory\.extrude2\.direction\.copy/);
});

test("rejects invalid native curve-pair projection inputs before mutation", async () => {
  let mutations = 0;
  const wire = { id: 11, versionId: 21, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const second = { ...wire, id: 12, versionId: 22 };
  const solid = { ...wire, id: 13, versionId: 23, type: "Solid", faceIds: ["f1"] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire, second, solid] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.projectCurvePair(11, [0, 0, 1], 11, [0, 1, 0], 10, state.revision), /distinct/i);
  await assert.rejects(operations.projectCurvePair(11, [0, 0, 1], 13, [0, 1, 0], 10, state.revision), /current Wire/i);
  await assert.rejects(operations.projectCurvePair(11, [0, 0, 0], 12, [0, 1, 0], 10, state.revision), /nonzero/i);
  await assert.rejects(operations.projectCurvePair(11, [0, 0, 1], 12, [0, 0, -1], 10, state.revision), /must not be parallel/i);
  await assert.rejects(operations.projectCurvePair(11, [0, 0, 1], 12, [0, 1, 0], 0, state.revision), /depth must be positive/i);
  await assert.rejects(operations.projectCurvePair(11, [0, 0, 1], 12, [0, 1, 0], 10, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("creates native body outlines at the source silhouette or explicit workplane", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const plane = {
    id: "standard:top", nativeId: "Top", name: "Top", source: "standard" as const,
    originMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number],
    xDirection: [1, 0, 0] as [number, number, number], yDirection: [0, 1, 0] as [number, number, number],
  };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [],
    construction: { ...emptyConstruction, planes: [plane], activePlaneId: "standard:front" },
    bodies: [
      { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
      { id: 8, versionId: 18, type: "Sheet", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
    ],
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime, "session-a");
  const identity = { id: plane.id, sessionId: "session-a", documentToken: state.documentToken, revision: state.revision };

  await operations.createBodyOutlines([7, 8], identity, "source", state.revision);
  await operations.createBodyOutlines([7], identity, "workplane", state.revision);

  assert.deepEqual(calls.map((call) => call.bindings), [
    ["CreateOutlineFromShellsFactory", "ConstructionPlaneDatabase"],
    ["ProjectOutlineFromShellsFactory", "ConstructionPlaneDatabase"],
  ]);
  assert.deepEqual(calls[0]?.values, [{ ids: [7, 8], plane: { id: plane.id, nativeId: "Top", source: "standard" } }]);
  assert.match(calls[0]?.source ?? "", /viewport\.constructionPlane = selected/);
  assert.match(calls[0]?.source ?? "", /factory\.shells = shells/);
  assert.match(calls[0]?.source ?? "", /GroupSelectedCommand/);
});

test("rejects invalid native body outline inputs before mutation", async () => {
  let mutations = 0;
  const plane = {
    id: "standard:top", nativeId: "Top", name: "Top", source: "standard" as const,
    originMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number],
    xDirection: [1, 0, 0] as [number, number, number], yDirection: [0, 1, 0] as [number, number, number],
  };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: { ...emptyConstruction, planes: [plane] },
    bodies: [{ id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] }],
  };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime, "session-a");
  const identity = { id: plane.id, sessionId: "session-a", documentToken: state.documentToken, revision: state.revision };

  await assert.rejects(operations.createBodyOutlines([], identity, "source", state.revision), /at least one/i);
  await assert.rejects(operations.createBodyOutlines([7, 7], identity, "source", state.revision), /unique/i);
  await assert.rejects(operations.createBodyOutlines([7], identity, "source", state.revision), /Solid or Sheet/i);
  await assert.rejects(operations.createBodyOutlines([99], identity, "source", state.revision), /Solid or Sheet/i);
  await assert.rejects(operations.createBodyOutlines([7], identity, "invalid" as "source", state.revision), /placement/i);
  await assert.rejects(operations.createBodyOutlines([7], identity, "source", "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("patterns native Solid and Sheet bodies along a Wire spine", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction,
    bodies: [
      { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
      { id: 8, versionId: 18, type: "Sheet", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
      { id: 9, versionId: 19, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
    ],
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.curvePattern([7, 8], 9, 5, state.revision);

  assert.deepEqual(call?.bindings, ["CurveArrayFactory"]);
  assert.deepEqual(call?.values, [{ ids: [7, 8], spineId: 9, count: 5 }]);
  assert.match(call?.source ?? "", /factory\.items = args\.ids\.map\(find\)/);
  assert.match(call?.source ?? "", /factory\.curve = spine/);
  assert.match(call?.source ?? "", /factory\.num = args\.count/);
  assert.match(call?.source ?? "", /factory\.shouldMakeInstances = false/);
});

test("rejects invalid native curve-pattern inputs before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction,
    bodies: [
      { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
      { id: 8, versionId: 18, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
    ],
  };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.curvePattern([], 8, 3, state.revision), /at least one/i);
  await assert.rejects(operations.curvePattern([7, 7], 8, 3, state.revision), /unique/i);
  await assert.rejects(operations.curvePattern([8], 8, 3, state.revision), /Solid or Sheet/i);
  await assert.rejects(operations.curvePattern([99], 8, 3, state.revision), /Solid or Sheet/i);
  await assert.rejects(operations.curvePattern([7], 7, 3, state.revision), /Wire spine/i);
  await assert.rejects(operations.curvePattern([7], 99, 3, state.revision), /Wire spine/i);
  await assert.rejects(operations.curvePattern([7], 8, 1, state.revision), /between 2 and 1000/i);
  await assert.rejects(operations.curvePattern([7], 8, 3.5, state.revision), /between 2 and 1000/i);
  await assert.rejects(operations.curvePattern([7], 8, 3, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("creates preserved native curve copies deformed between exact faces", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const face = (id: string, type: "Plane" | "Cylinder") => ({
    id, surfaceType: type, planar: type === "Plane",
    centerMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number],
    radiusMm: type === "Cylinder" ? 10 : null, blendRadiusMm: null,
    axisOriginMm: type === "Cylinder" ? [0, 0, 0] as [number, number, number] : null,
    axisDirection: type === "Cylinder" ? [0, 0, 1] as [number, number, number] : null,
    boundsMm: { min: [-10, -10, 0] as [number, number, number], max: [10, 10, 20] as [number, number, number] },
    edgeIds: [],
  });
  const sourceFace = face("source-face", "Plane");
  const targetFace = face("target-face", "Cylinder");
  const wire = { id: 7, versionId: 17, type: "Wire", name: "mark", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const source = { id: 8, versionId: 18, type: "Sheet", name: "development", boundsMm: null, faceIds: [sourceFace.id], edgeIds: [], faces: [sourceFace], edges: [] };
  const target = { id: 9, versionId: 19, type: "Solid", name: "cylinder", boundsMm: null, faceIds: [targetFace.id], edgeIds: [], faces: [targetFace], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire, source, target] };
  const runtime = { async getState() { return state; }, async mutate(sourceCode: string, bindings: string[], values: unknown[]) { call = { source: sourceCode, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const options = { scaleU: 1.5, scaleV: 0.75, scaleNormal: 2, flipUV: true, flipNormal: false, mirror: true };

  await operations.deformCurvesBetweenFaces(
    [7],
    { bodyId: 8, faceId: sourceFace.id },
    { bodyId: 9, faceId: targetFace.id },
    options,
    state.revision,
  );

  assert.deepEqual(call?.bindings, ["DeformCurveFactory", "DeformCurveCommand"]);
  assert.deepEqual(call?.values, [{
    ids: [7], sourceFace: { bodyId: 8, faceId: sourceFace.id }, targetFace: { bodyId: 9, faceId: targetFace.id }, options,
  }]);
  assert.match(call?.source ?? "", /factory\.curves = args\.ids\.map/);
  assert.match(call?.source ?? "", /factory\.keepTools = true/);
  assert.match(call?.source ?? "", /factory\.offsetU = 0/);
  assert.match(call?.source ?? "", /factory\.mirror = args\.options\.mirror/);
});

test("rejects unsafe or stale native curve-deformation inputs before mutation", async () => {
  let mutations = 0;
  const face = (id: string) => ({ id, surfaceType: "Plane", planar: true, centerMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 0] as [number, number, number] }, edgeIds: [] });
  const sourceFace = face("source");
  const targetFace = face("target");
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const source = { id: 8, versionId: 18, type: "Sheet", name: null, boundsMm: null, faceIds: [sourceFace.id], edgeIds: [], faces: [sourceFace], edges: [] };
  const target = { id: 9, versionId: 19, type: "Solid", name: null, boundsMm: null, faceIds: [targetFace.id], edgeIds: [], faces: [targetFace], edges: [] };
  const solid = { id: 10, versionId: 20, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire, source, target, solid] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const sourceRef = { bodyId: 8, faceId: sourceFace.id };
  const targetRef = { bodyId: 9, faceId: targetFace.id };
  const valid = { scaleU: 1, scaleV: 1, scaleNormal: 1, flipUV: false, flipNormal: false, mirror: false };

  await assert.rejects(operations.deformCurvesBetweenFaces([], sourceRef, targetRef, valid, state.revision), /nonempty unique/i);
  await assert.rejects(operations.deformCurvesBetweenFaces([7, 7], sourceRef, targetRef, valid, state.revision), /nonempty unique/i);
  await assert.rejects(operations.deformCurvesBetweenFaces([99], sourceRef, targetRef, valid, state.revision), /unknown current/i);
  await assert.rejects(operations.deformCurvesBetweenFaces([10], sourceRef, targetRef, valid, state.revision), /Wire bodies/i);
  await assert.rejects(operations.deformCurvesBetweenFaces([7], { bodyId: 8, faceId: "missing" }, targetRef, valid, state.revision), /unknown current face/i);
  await assert.rejects(operations.deformCurvesBetweenFaces([7], sourceRef, sourceRef, valid, state.revision), /must be different/i);
  await assert.rejects(operations.deformCurvesBetweenFaces([8], sourceRef, targetRef, valid, state.revision), /must be separate|Wire bodies/i);
  await assert.rejects(operations.deformCurvesBetweenFaces([7], sourceRef, targetRef, { ...valid, scaleV: 0 }, state.revision), /scaleV must be positive/i);
  await assert.rejects(operations.deformCurvesBetweenFaces([7], sourceRef, targetRef, { ...valid, scaleNormal: 1001 }, state.revision), /scaleNormal must be positive/i);
  await assert.rejects(operations.deformCurvesBetweenFaces([7], sourceRef, targetRef, valid, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

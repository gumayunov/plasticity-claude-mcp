import assert from "node:assert/strict";
import { test } from "node:test";
import { PlasticityOperations } from "./index.ts";
import type { PlasticityRuntime, RuntimeState } from "../runtime.ts";
import { mutationOutcomeIsUncertain } from "../runtime.ts";
import { emptyConstruction } from "./test-support.ts";

test("rejects a cutter face that belongs to a cut target before a mutation", async () => {
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
    operations.cutWithFaces([7], [{ bodyId: 7, faceId: "face-1" }], state.revision),
    /must not overlap/i,
  );
  assert.equal(mutated, false);
});

test("cuts current Solid or Sheet bodies with current planar cutter faces", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const target = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: null, faceIds: ["target-face"], edgeIds: [], faces: [], edges: [] };
  const cutterFace = { id: "cutter-face", surfaceType: "Plane", planar: true, centerMm: [8, 0, 0] as [number, number, number], normal: [1, 0, 0] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [8, -5, -5] as [number, number, number], max: [8, 15, 5] as [number, number, number] }, edgeIds: [] };
  const cutter = { id: 9, versionId: 19, type: "Sheet", name: null, boundsMm: null, faceIds: [cutterFace.id], edgeIds: [], faces: [cutterFace], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [target, cutter] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.cutWithFaces([7], [{ bodyId: 9, faceId: "cutter-face" }], state.revision);

  assert.deepEqual(call?.bindings, ["MultiCutFactory"]);
  assert.deepEqual(call?.values, [{ targetIds: [7], cutterFaces: [{ bodyId: 9, faceId: "cutter-face" }] }]);
  assert.match(call?.source ?? "", /factory\.shells = args\.targetIds\.map\(find\)/);
  assert.match(call?.source ?? "", /factory\.faces = args\.cutterFaces\.map/);
});

test("rejects invalid native cut references before mutation", async () => {
  let mutations = 0;
  const plane = { id: "plane", surfaceType: "Plane", planar: true, centerMm: [0, 0, 0] as [number, number, number], normal: [1, 0, 0] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 0] as [number, number, number], max: [0, 1, 1] as [number, number, number] }, edgeIds: [] };
  const curved = { ...plane, id: "curved", surfaceType: "Cylinder", planar: false };
  const solid = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const wire = { ...solid, id: 8, versionId: 18, type: "Wire" };
  const cutter = { ...solid, id: 9, versionId: 19, type: "Sheet", faceIds: [plane.id, curved.id], faces: [plane, curved] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid, wire, cutter] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.cutWithFaces([], [{ bodyId: 9, faceId: "plane" }], state.revision), /at least one.*target/i);
  await assert.rejects(operations.cutWithFaces([7, 7], [{ bodyId: 9, faceId: "plane" }], state.revision), /target.*unique/i);
  await assert.rejects(operations.cutWithFaces([7], [], state.revision), /at least one.*cutter/i);
  await assert.rejects(operations.cutWithFaces([7], [{ bodyId: 9, faceId: "plane" }, { bodyId: 9, faceId: "plane" }], state.revision), /cutter.*unique/i);
  await assert.rejects(operations.cutWithFaces([8], [{ bodyId: 9, faceId: "plane" }], state.revision), /current Solid or Sheet/i);
  await assert.rejects(operations.cutWithFaces([99], [{ bodyId: 9, faceId: "plane" }], state.revision), /current Solid or Sheet/i);
  await assert.rejects(operations.cutWithFaces([7], [{ bodyId: 99, faceId: "plane" }], state.revision), /current planar cutter faces/i);
  await assert.rejects(operations.cutWithFaces([7], [{ bodyId: 9, faceId: "missing" }], state.revision), /current planar cutter faces/i);
  await assert.rejects(operations.cutWithFaces([7], [{ bodyId: 9, faceId: "curved" }], state.revision), /current planar cutter faces/i);
  await assert.rejects(operations.cutWithFaces([7], [{ bodyId: 9, faceId: "plane" }], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("converts a positive chamfer distance to the native negative fillet distance", async () => {
  let values: unknown[] | undefined;
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
    async mutate(_source: string, _bindings: string[], args: unknown[]) {
      values = args;
      return {};
    },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.chamfer(7, ["edge-1"], 2, state.revision);

  assert.deepEqual(values, [{ id: 7, edgeIds: ["edge-1"], distance: -0.002 }]);
});

test("removes recognized native fillets from current shell bodies", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const solid = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: ["f1"], edgeIds: [], faces: [], edges: [] };
  const sheet = { ...solid, id: 8, versionId: 18, type: "Sheet" };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid, sheet] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.removeFillets([7, 8], state.revision);

  assert.deepEqual(call?.bindings, ["RemoveFilletsFromShellFactory"]);
  assert.deepEqual(call?.values, [{ ids: [7, 8] }]);
  assert.match(call?.source ?? "", /RemoveFilletsFromShellCommand/);
  assert.match(call?.source ?? "", /factory\.shells = args\.ids\.map\(find\)/);
  assert.match(call?.source ?? "", /factory\.radius = 0/);
});

test("rejects invalid fillet-removal shell references before mutation", async () => {
  let mutations = 0;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.removeFillets([], state.revision), /at least one/i);
  await assert.rejects(operations.removeFillets([7, 7], state.revision), /unique/i);
  await assert.rejects(operations.removeFillets([7], state.revision), /current Solid or Sheet/i);
  await assert.rejects(operations.removeFillets([99], state.revision), /current Solid or Sheet/i);
  await assert.rejects(operations.removeFillets([7], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("changes recognized native fillet radii by a signed delta", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const face = { id: "f1", surfaceType: "Cylinder", planar: false, centerMm: [0, 0, 0] as [number, number, number], normal: [1, 0, 0] as [number, number, number], radiusMm: 2, blendRadiusMm: 2, axisOriginMm: [0, 0, 0] as [number, number, number], axisDirection: [0, 0, 1] as [number, number, number], boundsMm: { min: [0, 0, 0] as [number, number, number], max: [2, 2, 10] as [number, number, number] }, edgeIds: [] };
  const solid = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.refilletFaces([{ bodyId: 7, faceId: "f1" }], 1, state.revision);

  assert.deepEqual(call?.bindings, ["RefilletFaceCommand", "RefilletFaceFactory"]);
  assert.deepEqual(call?.values, [{ faces: [{ bodyId: 7, faceId: "f1" }], distance: 0.001 }]);
  assert.match(call?.source ?? "", /factory\.shells = Array\.from\(shells\)/);
  assert.match(call?.source ?? "", /factory\.faces = args\.faces\.map/);
});

test("rejects invalid refillet inputs before mutation", async () => {
  let mutations = 0;
  const blend = { id: "blend", surfaceType: "Cylinder", planar: false, centerMm: [0, 0, 0] as [number, number, number], normal: [1, 0, 0] as [number, number, number], radiusMm: 2, blendRadiusMm: 2, axisOriginMm: [0, 0, 0] as [number, number, number], axisDirection: [0, 0, 1] as [number, number, number], boundsMm: { min: [0, 0, 0] as [number, number, number], max: [2, 2, 10] as [number, number, number] }, edgeIds: [] };
  const plane = { ...blend, id: "plane", surfaceType: "Plane", planar: true, blendRadiusMm: null, radiusMm: null };
  const solid = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [blend.id, plane.id], edgeIds: [], faces: [blend, plane], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const reference = { bodyId: 7, faceId: blend.id };

  await assert.rejects(operations.refilletFaces([], 1, state.revision), /at least one/i);
  await assert.rejects(operations.refilletFaces([reference, reference], 1, state.revision), /unique/i);
  await assert.rejects(operations.refilletFaces([{ bodyId: 7, faceId: "missing" }], 1, state.revision), /stale or unknown/i);
  await assert.rejects(operations.refilletFaces([{ bodyId: 7, faceId: plane.id }], 1, state.revision), /recognized fillet/i);
  await assert.rejects(operations.refilletFaces([reference], 0, state.revision), /nonzero/i);
  await assert.rejects(operations.refilletFaces([reference], -2, state.revision), /positive radius/i);
  await assert.rejects(operations.refilletFaces([reference], 1, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("an impossible spin explains how to fix a profile edge lying on the axis", async () => {
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [],
  };
  const runtime = {
    async getState() { return state; },
    async mutate() {
      throw new Error("Plasticity command failed: Error: Operation failed at PK_BODY_spin with error `PK_ERROR_impossible_spin` (55)");
    },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.revolveProfile(4, [0, 0, 0], [1, 0, 0], 360, state.revision), (error: Error) => {
    assert.match(error.message, /^Plasticity command failed: .*PK_ERROR_impossible_spin/, "the native error stays first");
    assert.match(error.message, /open Wire whose two endpoints lie on the axis/);
    assert.equal(mutationOutcomeIsUncertain(error), false, "a rejected spin is a definite failure, not an uncertain outcome");
    return true;
  });
});

test("converts a revolve axis origin to meters and keeps public degrees", async () => {
  let values: unknown[] | undefined;
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
    async mutate(_source: string, _bindings: string[], args: unknown[]) {
      values = args;
      return {};
    },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.revolveProfile(11, [1000, 2000, 3000], [0, 0, 5], 270, state.revision);

  assert.deepEqual(values, [{
    id: 11,
    axisOrigin: [1, 2, 3],
    axis: [0, 0, 5],
    angleDegrees: 270,
  }]);
});

test("hollows current native Solids as closed shells with a signed wall thickness", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const solids = [7, 8].map((id) => ({
    id, versionId: id + 10, type: "Solid", name: null, boundsMm: null,
    faceIds: [], edgeIds: [], faces: [], edges: [],
  }));
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: solids,
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.hollowSolids([7, 8], 2, "inward", state.revision);

  assert.deepEqual(call?.bindings, ["HollowSolidsFactory"]);
  assert.deepEqual(call?.values, [{ ids: [7, 8], thickness: -0.002 }]);
  assert.match(call?.source ?? "", /HollowSolidsCommand/);
  assert.match(call?.source ?? "", /factory\.solids = solids/);
  assert.match(call?.source ?? "", /factory\.local = false/);
});

test("rejects invalid closed-solid hollowing before native mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction,
    bodies: [{ id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] }],
  };
  const runtime = {
    async getState() { return state; }, async mutate() { mutations += 1; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.hollowSolids([], 2, "inward", state.revision), /at least one/i);
  await assert.rejects(operations.hollowSolids([7, 7], 2, "inward", state.revision), /unique/i);
  await assert.rejects(operations.hollowSolids([7], 0, "inward", state.revision), /positive/i);
  await assert.rejects(operations.hollowSolids([7], 2, "inward", "old-revision"), /stale reference/i);
  await assert.rejects(operations.hollowSolids([8], 2, "inward", state.revision), /current Solids/i);
  await assert.rejects(operations.hollowSolids([7], 2, "sideways" as "inward", state.revision), /direction/i);
  assert.equal(mutations, 0);
});

test("extrudes closed profiles and explicit regions through native Region inputs", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
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
      calls.push({ source, bindings, values });
      return {};
    },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.extrudeProfile(7, 12, state.revision);
  await operations.extrudeRegions(["5r42", "6r43"], -4, state.revision);

  assert.match(calls[0]!.source, /factory\.regions = regions/);
  assert.match(calls[0]!.source, /IsClosed/);
  assert.doesNotMatch(calls[0]!.source, /factory\.curves = \[view\]/);
  assert.deepEqual(calls[0]!.bindings, ["ExtrudeFactory"]);
  assert.deepEqual(calls[0]!.values, [{ id: 7, distance: 0.012 }]);
  assert.match(calls[1]!.source, /Stale or unknown regions/);
  assert.deepEqual(calls[1]!.values, [{ regionIds: ["5r42", "6r43"], distance: -0.004 }]);
});

test("rejects stale and duplicate explicit region references before mutation", async () => {
  let mutations = 0;
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
    async mutate() { mutations += 1; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.extrudeRegions(["5r42"], 10, "old-revision"), /stale reference/i);
  await assert.rejects(operations.extrudeRegions([], 10, state.revision), /at least one/i);
  await assert.rejects(operations.extrudeRegions(["5r42", "5r42"], 10, state.revision), /unique/i);
  assert.equal(mutations, 0);
});

test("imprints native Wire bodies onto a target body along an explicit vector", async () => {
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

  await operations.imprintCurvesOnBody(7, [11], [0, 0, -5], {
    bidirectional: false,
    occlude: true,
    completion: "none",
  }, state.revision);

  assert.deepEqual(call?.bindings, ["ImprintCurveBodyFactory", "Vector3", "ProjectionMethod", "ProjectionCompletionType"]);
  assert.deepEqual(call?.values, [{
    targetId: 7,
    curveIds: [11],
    direction: [0, 0, -1],
    bidirectional: false,
    occlude: true,
    completionName: "None",
  }]);
  assert.match(call?.source ?? "", /ImprintCurveBodyCommand/);
  assert.match(call?.source ?? "", /factory\.method = ProjectionMethod\.Vector/);
});

test("rejects invalid native curve imprint inputs before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [],
  };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.imprintCurvesOnBody(7, [], [0, 0, -1], {}, state.revision), /at least one/i);
  await assert.rejects(operations.imprintCurvesOnBody(7, [11, 11], [0, 0, -1], {}, state.revision), /unique/i);
  await assert.rejects(operations.imprintCurvesOnBody(7, [7], [0, 0, -1], {}, state.revision), /must not include/i);
  await assert.rejects(operations.imprintCurvesOnBody(7, [11], [0, 0, 0], {}, state.revision), /nonzero/i);
  await assert.rejects(operations.imprintCurvesOnBody(7, [11], [0, 0, -1], {}, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("imprints native body intersections onto a target shell", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const target = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: ["f1"], edgeIds: [], faces: [], edges: [] };
  const tool = { ...target, id: 8, versionId: 18 };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [target, tool] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.imprintBodies(7, [8], state.revision);

  assert.deepEqual(call?.bindings, ["ImprintBodyBodyCommand", "ImprintBodyBodyFactory"]);
  assert.deepEqual(call?.values, [{ targetId: 7, toolIds: [8] }]);
  assert.match(call?.source ?? "", /factory\.target = find\(args\.targetId\)/);
  assert.match(call?.source ?? "", /factory\.tools = args\.toolIds\.map\(find\)/);
  assert.match(call?.source ?? "", /factory\.imprintTool = false/);
});

test("rejects invalid native body imprint references before mutation", async () => {
  let mutations = 0;
  const solid = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: ["f1"], edgeIds: [], faces: [], edges: [] };
  const wire = { ...solid, id: 8, versionId: 18, type: "Wire" };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid, wire] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.imprintBodies(7, [], state.revision), /at least one/i);
  await assert.rejects(operations.imprintBodies(7, [7], state.revision), /cannot also be a tool/i);
  await assert.rejects(operations.imprintBodies(7, [8], state.revision), /current Solid or Sheet/i);
  await assert.rejects(operations.imprintBodies(99, [7], state.revision), /target.*Solid or Sheet/i);
  await assert.rejects(operations.imprintBodies(7, [99], state.revision), /current Solid or Sheet/i);
  await assert.rejects(operations.imprintBodies(7, [8, 8], state.revision), /unique/i);
  await assert.rejects(operations.imprintBodies(7, [8], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("creates native circular pipes along Wire spines", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wire = { id: 8, versionId: 13, type: "Wire", name: "Spine", boundsMm: { min: [0, 0, 0] as [number, number, number], max: [0, 0, 20] as [number, number, number] }, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.createPipes([8], 4, 1, state.revision);

  assert.deepEqual(call?.bindings, ["PipeFactory"]);
  assert.deepEqual(call?.values, [{ spineIds: [8], diameter: 0.004, thickness: 0.001 }]);
  assert.match(call?.source ?? "", /factory\.spines = spines/);
});

test("creates an exact ring torus and its editable circular profile in one history command", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.createTorus([10, 20, 30], 30, 5, [0, 0, 2], [2, 0, 1], "Seal ring", state.revision);

  assert.deepEqual(call?.bindings, ["CenterCircleFactory", "RevolveFactory", "Vector3", "Quaternion"]);
  assert.deepEqual(call?.values, [{
    center: [0.01, 0.02, 0.03], profileCenter: [0.04, 0.02, 0.03], profileNormal: [0, 1, 0],
    axis: [0, 0, 1], minorRadius: 0.005, name: "Seal ring",
  }]);
  assert.match(call?.source ?? "", /new this\.commands\.RevolveCommand\(this\)/u);
  assert.match(call?.source ?? "", /const profile = new CircleFactory\(editor\)\.resource\(this\)/u);
  assert.match(call?.source ?? "", /const revolve = new RevolveFactory\(editor\)\.resource\(this\)/u);
  assert.match(call?.source ?? "", /revolve\.degrees = 360/u);
});

test("creates an exact cone or frustum and its editable meridional profile in one history command", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.createCone([10, 20, 30], 20, 10, 40, [0, 0, 2], [2, 0, 1], "Reducer", state.revision);
  await operations.createCone([10, 20, 30], 20, 0, 40, [0, 0, 2], [2, 0, 1], "Pointed cone", state.revision);

  assert.deepEqual(calls.map((call) => call.bindings), [
    ["CurveFactory", "RevolveFactory", "Vector3", "CurveType"],
    ["CurveFactory", "RevolveFactory", "Vector3", "CurveType"],
  ]);
  assert.deepEqual(calls[0]?.values, [{
    points: [[0.01, 0.02, 0.03], [0.03, 0.02, 0.03], [0.02, 0.02, 0.07], [0.01, 0.02, 0.07]],
    center: [0.01, 0.02, 0.03], axis: [0, 0, 1], name: "Reducer",
  }]);
  assert.deepEqual(calls[1]?.values, [{
    points: [[0.01, 0.02, 0.03], [0.03, 0.02, 0.03], [0.01, 0.02, 0.07]],
    center: [0.01, 0.02, 0.03], axis: [0, 0, 1], name: "Pointed cone",
  }]);
  assert.match(calls[0]?.source ?? "", /new this\.commands\.RevolveCommand\(this\)/u);
  assert.match(calls[0]?.source ?? "", /profile\.type = CurveType\.Polyline/u);
  assert.match(calls[0]?.source ?? "", /profile\.closed = true/u);
  assert.match(calls[0]?.source ?? "", /const revolve = new RevolveFactory\(editor\)\.resource\(this\)/u);
  assert.match(calls[0]?.source ?? "", /existingRegionIds/u);
  assert.match(calls[0]?.source ?? "", /regions\.length !== 1/u);
  assert.match(calls[0]?.source ?? "", /revolve\.regions = regions/u);
  assert.match(calls[0]?.source ?? "", /revolve\.degrees = 360/u);
});

test("rejects invalid cone and frustum dimensions and frames before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.createCone([0, 0, 0], 0, 2, 10, [0, 0, 1], [1, 0, 0], undefined, state.revision), /bottom radius/i);
  await assert.rejects(operations.createCone([0, 0, 0], 5, -1, 10, [0, 0, 1], [1, 0, 0], undefined, state.revision), /top radius/i);
  await assert.rejects(operations.createCone([0, 0, 0], 5, 2, 0, [0, 0, 1], [1, 0, 0], undefined, state.revision), /height/i);
  await assert.rejects(operations.createCone([0, 0, 0], 5, 5, 10, [0, 0, 1], [1, 0, 0], undefined, state.revision), /equal radii.*cylinder/i);
  await assert.rejects(operations.createCone([0, 0, 0], 5, 2, 10, [0, 0, 0], [1, 0, 0], undefined, state.revision), /plane normal/i);
  await assert.rejects(operations.createCone([0, 0, 0], 5, 2, 10, [0, 0, 1], [0, 0, 2], undefined, state.revision), /parallel/i);
  await assert.rejects(operations.createCone([0, 0, 0], 5, 2, 10, [0, 0, 1], [1, 0, 0], undefined, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("rejects invalid ring-torus dimensions and frames before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.createTorus([0, 0, 0], 10, 0, [0, 0, 1], [1, 0, 0], undefined, state.revision), /minor radius/i);
  await assert.rejects(operations.createTorus([0, 0, 0], 5, 5, [0, 0, 1], [1, 0, 0], undefined, state.revision), /major radius.*greater/i);
  await assert.rejects(operations.createTorus([0, 0, 0], 10, 2, [0, 0, 0], [1, 0, 0], undefined, state.revision), /plane normal/i);
  await assert.rejects(operations.createTorus([0, 0, 0], 10, 2, [0, 0, 1], [0, 0, 2], undefined, state.revision), /parallel/i);
  await assert.rejects(operations.createTorus([0, 0, 0], 10, 2, [0, 0, 1], [1, 0, 0], undefined, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("rejects invalid native pipe inputs before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.createPipes([], 4, 0, state.revision), /at least one/i);
  await assert.rejects(operations.createPipes([8], 0, 0, state.revision), /diameter/i);
  await assert.rejects(operations.createPipes([8], 4, -1, state.revision), /thickness/i);
  await assert.rejects(operations.createPipes([8], 4, 0, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { PlasticityOperations } from "../operations.ts";
import type { PlasticityRuntime, RuntimeState } from "../runtime.ts";
import { emptyConstruction } from "./test-support.ts";

test("raises current native B-Surface face degrees in one Plasticity command", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const face = { id: "f1", surfaceType: "BSurf", planar: false, centerMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 0] as [number, number, number], max: [20, 20, 10] as [number, number, number] }, edgeIds: [] };
  const body = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: face.boundsMm, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const faces = [{ bodyId: 7, faceId: "f1" }];

  await new PlasticityOperations(runtime).raiseSurfaceDegree(faces, state.revision);

  assert.deepEqual(call?.bindings, ["RaiseDegreeFaceFactory", "RaiseDegreeFaceCommand"]);
  assert.deepEqual(call?.values, [{ faces }]);
  assert.match(call?.source ?? "", /factory\.faces = selectedFaces/);
  assert.match(call?.source ?? "", /new Command\(editor\)/);
});

test("untrims current native faces to their natural surface bounds", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const face = { id: "f1", surfaceType: "BSurf", planar: false, centerMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 20, 10] as [number, number, number] }, edgeIds: [] };
  const body = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: face.boundsMm, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const faces = [{ bodyId: 7, faceId: "f1" }];

  await new PlasticityOperations(runtime).untrimFaces(faces, state.revision);

  assert.deepEqual(call?.bindings, ["UntrimFactory"]);
  assert.deepEqual(call?.values, [{ faces }]);
  assert.match(call?.source ?? "", /factory\.faces = selectedFaces/);
  assert.match(call?.source ?? "", /factory\.keepEdges = false/);
  assert.match(call?.source ?? "", /new this\.commands\.UntrimCommand/);
});

test("refits one exact native face as a projected-edge B-Surface", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const face = { id: "f1", surfaceType: "Plane", planar: true, centerMm: [10, 5, 5] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 5] as [number, number, number], max: [20, 10, 5] as [number, number, number] }, edgeIds: [] };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;

  await new PlasticityOperations(runtime).rebuildFace({ bodyId: 7, faceId: "f1" }, 0.01, state.revision);

  assert.deepEqual(call?.bindings, ["RebuildFaceFactory", "RebuildFaceCommand", "RebuildFaceMethod", "ChangeEdgeMethod"]);
  assert.deepEqual(call?.values, [{ face: { bodyId: 7, faceId: "f1" }, tolerance: 0.00001 }]);
  assert.match(call?.source ?? "", /factory\.shell = view/u);
  assert.match(call?.source ?? "", /factory\.face = selectedFace/u);
  assert.match(call?.source ?? "", /factory\.method = RebuildFaceMethod\.Refit/u);
  assert.match(call?.source ?? "", /factory\.changeEdgeMethod = ChangeEdgeMethod\.Project/u);
});

test("rejects invalid native face refits before mutation", async () => {
  let mutations = 0;
  const face = { id: "f1", surfaceType: "Plane", planar: true, centerMm: [10, 5, 5] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 5] as [number, number, number], max: [20, 10, 5] as [number, number, number] }, edgeIds: [] };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const wire = { ...body, id: 8, type: "Wire", faceIds: ["wf1"], faces: [{ ...face, id: "wf1" }] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body, wire] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.rebuildFace({ bodyId: 7, faceId: "missing" }, 0.01, state.revision), /unknown current face/i);
  await assert.rejects(operations.rebuildFace({ bodyId: 8, faceId: "wf1" }, 0.01, state.revision), /Solid or Sheet/i);
  await assert.rejects(operations.rebuildFace({ bodyId: 7, faceId: "f1" }, 0, state.revision), /tolerance/i);
  await assert.rejects(operations.rebuildFace({ bodyId: 7, faceId: "f1" }, 10.1, state.revision), /tolerance/i);
  await assert.rejects(operations.rebuildFace({ bodyId: 7, faceId: "f1" }, 0.01, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("matches current native faces to an exact replacement surface", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const plane = { id: "plane", surfaceType: "Plane", planar: true, centerMm: [18, 0, 5] as [number, number, number], normal: [1, 0, 0] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [18, -5, 0] as [number, number, number], max: [18, 5, 10] as [number, number, number] }, edgeIds: [] };
  const cylinder = { ...plane, id: "cylinder", surfaceType: "Cylinder", planar: false, centerMm: [20, 0, 5] as [number, number, number], radiusMm: 20, axisOriginMm: [0, 0, 0] as [number, number, number], axisDirection: [0, 0, 1] as [number, number, number] };
  const source = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [plane.id], edgeIds: [], faces: [plane], edges: [] };
  const target = { id: 8, versionId: 18, type: "Solid", name: null, boundsMm: null, faceIds: [cylinder.id], edgeIds: [], faces: [cylinder], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [source, target] };
  const runtime = { async getState() { return state; }, async mutate(sourceCode: string, bindings: string[], values: unknown[]) { call = { source: sourceCode, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const faces = [{ bodyId: 7, faceId: "plane" }];
  const replacement = { bodyId: 8, faceId: "cylinder" };

  await new PlasticityOperations(runtime).matchFaces(faces, replacement, state.revision);

  assert.deepEqual(call?.bindings, ["MatchFaceFactory", "MatchFaceCommand"]);
  assert.deepEqual(call?.values, [{ faces, replacement }]);
  assert.match(call?.source ?? "", /factory\.shells = sourceShells/u);
  assert.match(call?.source ?? "", /factory\.faces = sourceFaces/u);
  assert.match(call?.source ?? "", /factory\.replacement = replacementFace/u);
});

test("rejects invalid native face matches before mutation", async () => {
  let mutations = 0;
  const face = { id: "f1", surfaceType: "Plane", planar: true, centerMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 0] as [number, number, number] }, edgeIds: [] };
  const replacement = { ...face, id: "f2" };
  const source = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const target = { id: 8, versionId: 18, type: "Sheet", name: null, boundsMm: null, faceIds: [replacement.id], edgeIds: [], faces: [replacement], edges: [] };
  const wire = { id: 9, versionId: 19, type: "Wire", name: null, boundsMm: null, faceIds: ["wf"], edgeIds: [], faces: [{ ...face, id: "wf" }], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [source, target, wire] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const sourceRef = { bodyId: 7, faceId: "f1" };
  const replacementRef = { bodyId: 8, faceId: "f2" };

  await assert.rejects(operations.matchFaces([], replacementRef, state.revision), /source face/i);
  await assert.rejects(operations.matchFaces([sourceRef, sourceRef], replacementRef, state.revision), /unique/i);
  await assert.rejects(operations.matchFaces([sourceRef], sourceRef, state.revision), /unique/i);
  await assert.rejects(operations.matchFaces([{ bodyId: 7, faceId: "missing" }], replacementRef, state.revision), /unknown current face/i);
  await assert.rejects(operations.matchFaces([{ bodyId: 9, faceId: "wf" }], replacementRef, state.revision), /Solid or Sheet/i);
  await assert.rejects(operations.matchFaces([sourceRef], replacementRef, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("rejects invalid native surface degree and untrim inputs before mutation", async () => {
  let mutations = 0;
  const plane = { id: "plane", surfaceType: "Plane", planar: true, centerMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 10, 0] as [number, number, number] }, edgeIds: [] };
  const spline = { ...plane, id: "spline", surfaceType: "BSurf", planar: false };
  const body = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: null, faceIds: [plane.id, spline.id], edgeIds: [], faces: [plane, spline], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const splineRef = { bodyId: 7, faceId: "spline" };

  await assert.rejects(operations.raiseSurfaceDegree([], state.revision), /at least one face/i);
  await assert.rejects(operations.raiseSurfaceDegree([{ bodyId: 7, faceId: "plane" }], state.revision), /B-Surface/i);
  await assert.rejects(operations.raiseSurfaceDegree([splineRef, splineRef], state.revision), /face references must be unique/i);
  await assert.rejects(operations.raiseSurfaceDegree([splineRef], "old-revision"), /stale reference/i);
  await assert.rejects(operations.untrimFaces([], state.revision), /at least one face/i);
  await assert.rejects(operations.untrimFaces([{ bodyId: 7, faceId: "missing" }], state.revision), /unknown current face/i);
  await assert.rejects(operations.untrimFaces([splineRef], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("sweeps explicit native Regions along a Wire spine", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction,
    regions: [{ id: "12r34", entityId: 34, islandVersionId: 12, sketchId: 3, sketchWireIds: [7], measurementSource: "render-mesh", displayBoundsMm: { min: [-2, -2, 0], max: [2, 2, 0] } }],
    bodies: [
      { id: 7, versionId: 11, type: "Wire", name: "Profile", boundsMm: { min: [-2, -2, 0], max: [2, 2, 0] }, faceIds: [], edgeIds: [], faces: [], edges: [] },
      { id: 8, versionId: 13, type: "Wire", name: "Spine", boundsMm: { min: [0, 0, 0], max: [0, 0, 20] }, faceIds: [], edgeIds: [], faces: [], edges: [] },
    ],
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.sweepRegions(["12r34"], 8, {
    alignment: "transport", corner: "round", twistDegrees: 45, scale: 1.5, simplify: true,
  }, state.revision);

  assert.deepEqual(call?.bindings, ["SweepFactory", "SweepAlignmentType", "SweepCornerType"]);
  assert.deepEqual(call?.values, [{
    regionIds: ["12r34"], spineId: 8, alignmentName: "Transport", cornerName: "Round",
    twistDegrees: 45, scale: 1.5, simplify: true,
  }]);
  assert.match(call?.source ?? "", /factory\.regions = regions/);
  assert.match(call?.source ?? "", /factory\.spine = spine/);
});

test("rejects invalid or stale Region sweep inputs before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction,
    regions: [{ id: "12r34", entityId: 34, islandVersionId: 12, sketchId: 3, sketchWireIds: [7], measurementSource: "render-mesh", displayBoundsMm: { min: [-2, -2, 0], max: [2, 2, 0] } }],
    bodies: [
      { id: 7, versionId: 11, type: "Wire", name: "Profile", boundsMm: { min: [-2, -2, 0], max: [2, 2, 0] }, faceIds: [], edgeIds: [], faces: [], edges: [] },
      { id: 8, versionId: 13, type: "Wire", name: "Spine", boundsMm: { min: [0, 0, 0], max: [0, 0, 20] }, faceIds: [], edgeIds: [], faces: [], edges: [] },
    ],
  };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.sweepRegions([], 8, {}, state.revision), /at least one/i);
  await assert.rejects(operations.sweepRegions(["missing"], 8, {}, state.revision), /stale or unknown/i);
  await assert.rejects(operations.sweepRegions(["12r34"], 99, {}, state.revision), /Wire spine/i);
  await assert.rejects(operations.sweepRegions(["12r34"], 7, {}, state.revision), /profile curves/i);
  await assert.rejects(operations.sweepRegions(["12r34"], 8, { scale: 0 }, state.revision), /scale/i);
  await assert.rejects(operations.sweepRegions(["12r34"], 8, {}, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("lofts ordered native Regions into capped geometry", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction,
    bodies: [{ id: 9, versionId: 14, type: "Wire", name: "Guide", boundsMm: { min: [2, 0, 0], max: [12, 0, 20] }, faceIds: [], edgeIds: [], faces: [], edges: [] }],
    regions: [
      { id: "12r34", entityId: 34, islandVersionId: 12, sketchId: 3, sketchWireIds: [7], measurementSource: "render-mesh", displayBoundsMm: { min: [-5, -5, 0], max: [5, 5, 0] } },
      { id: "13r35", entityId: 35, islandVersionId: 13, sketchId: 4, sketchWireIds: [8], measurementSource: "render-mesh", displayBoundsMm: { min: [-2, -2, 20], max: [2, 2, 20] } },
    ],
  };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.loftRegions(["12r34", "13r35"], { simplify: false, guideIds: [9], trimGuides: false }, state.revision);

  assert.deepEqual(call?.bindings, ["RegionLoftFactory"]);
  assert.deepEqual(call?.values, [{ regionIds: ["12r34", "13r35"], guideIds: [9], trimGuides: false, closed: false, simplify: false }]);
  assert.match(call?.source ?? "", /factory\.regions = args\.regionIds\.map/);
  assert.match(call?.source ?? "", /factory\.guides = args\.guideIds\.map/);
});

test("lofts ordered Wire profiles into an independent native surface", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wire = (id: number) => ({ id, versionId: id + 10, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] });
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [wire(7), wire(8), wire(9)],
  };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.loftCurves([7, 8], {
    guideIds: [9], trimGuides: false, trimProfiles: false, closed: false, simplify: false,
    curvature: "clamped", startMagnitude: 1.5, endMagnitude: 0.75,
  }, state.revision);

  assert.deepEqual(call?.bindings, ["CurveLoftFactory", "LoftEdgeCommand", "LoftCurvatureType"]);
  assert.deepEqual(call?.values, [{
    profileIds: [7, 8], guideIds: [9], trimGuides: false, trimProfiles: false,
    closed: false, simplify: false, curvature: "Clamped", startMagnitude: 1.5, endMagnitude: 0.75,
  }]);
  assert.match(call?.source ?? "", /factory\.profiles = args\.profileIds\.map\(find\)/);
  assert.match(call?.source ?? "", /factory\.guides = args\.guideIds\.map\(find\)/);
  assert.match(call?.source ?? "", /factory\.curvature = Curvature\[args\.curvature\]/);
  assert.match(call?.source ?? "", /factory\.join = false/);
});

test("rejects invalid or stale Wire loft inputs before mutation", async () => {
  let mutations = 0;
  const wire = (id: number) => ({ id, versionId: id + 10, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] });
  const solid = { ...wire(10), type: "Solid" };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [wire(7), wire(8), wire(9), solid],
  };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.loftCurves([7], {}, state.revision), /at least two/i);
  await assert.rejects(operations.loftCurves([7, 7], {}, state.revision), /unique/i);
  await assert.rejects(operations.loftCurves([7, 99], {}, state.revision), /current Wire/i);
  await assert.rejects(operations.loftCurves([7, 10], {}, state.revision), /current Wire/i);
  await assert.rejects(operations.loftCurves([7, 8], { closed: true }, state.revision), /at least three/i);
  await assert.rejects(operations.loftCurves([7, 8], { guideIds: [99] }, state.revision), /current Wire/i);
  await assert.rejects(operations.loftCurves([7, 8], { guideIds: [9, 9] }, state.revision), /unique/i);
  await assert.rejects(operations.loftCurves([7, 8], { guideIds: [8] }, state.revision), /profile Wire/i);
  await assert.rejects(operations.loftCurves([7, 8], { startMagnitude: 0 }, state.revision), /magnitudes/i);
  await assert.rejects(operations.loftCurves([7, 8], {}, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("rejects invalid or stale Region loft inputs before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction,
    bodies: [{ id: 7, versionId: 11, type: "Wire", name: "Profile", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] }],
    regions: [
      { id: "12r34", entityId: 34, islandVersionId: 12, sketchId: 3, sketchWireIds: [7], measurementSource: "render-mesh", displayBoundsMm: { min: [-5, -5, 0], max: [5, 5, 0] } },
      { id: "13r35", entityId: 35, islandVersionId: 13, sketchId: 4, sketchWireIds: [8], measurementSource: "render-mesh", displayBoundsMm: { min: [-2, -2, 20], max: [2, 2, 20] } },
      { id: "12r36", entityId: 36, islandVersionId: 12, sketchId: 3, sketchWireIds: [10], measurementSource: "render-mesh", displayBoundsMm: { min: [-1, -1, 0], max: [1, 1, 0] } },
    ],
  };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.loftRegions(["12r34"], {}, state.revision), /at least two/i);
  await assert.rejects(operations.loftRegions(["12r34", "missing"], {}, state.revision), /stale or unknown/i);
  await assert.rejects(operations.loftRegions(["12r34", "12r36"], {}, state.revision), /different sketch/i);
  await assert.rejects(operations.loftRegions(["12r34", "13r35"], { closed: true }, state.revision), /at least three/i);
  await assert.rejects(operations.loftRegions(["12r34", "13r35"], { guideIds: [99] }, state.revision), /current Wire/i);
  await assert.rejects(operations.loftRegions(["12r34", "13r35"], { guideIds: [7, 7] }, state.revision), /unique/i);
  await assert.rejects(operations.loftRegions(["12r34", "13r35"], { guideIds: [7] }, state.revision), /profile Wire/i);
  await assert.rejects(operations.loftRegions(["12r34", "13r35"], {}, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("lofts ordered planar Solid or Sheet faces into independent native geometry", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const profile = (id: string, z: number) => ({ id, surfaceType: "Plane", planar: true, centerMm: [0, 0, z] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [-5, -5, z] as [number, number, number], max: [5, 5, z] as [number, number, number] }, edgeIds: [] });
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [
      { id: 7, versionId: 17, type: "Solid", name: "First", boundsMm: null, faceIds: ["f1"], edgeIds: [], faces: [profile("f1", 0)], edges: [], vertices: [] },
      { id: 8, versionId: 18, type: "Sheet", name: "Second", boundsMm: null, faceIds: ["f2"], edgeIds: [], faces: [profile("f2", 20)], edges: [], vertices: [] },
      { id: 9, versionId: 19, type: "Wire", name: "Guide", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] },
    ],
  };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const faces = [{ bodyId: 7, faceId: "f1" }, { bodyId: 8, faceId: "f2" }];

  await operations.loftFaces(faces, {
    guideIds: [9], trimGuides: false, simplify: false,
    startCondition: "clamped", endCondition: "natural", startMagnitude: 1.5, endMagnitude: 0.75,
  }, state.revision);

  assert.deepEqual(call?.bindings, ["FaceLoftFactory", "LoftSurfaceCommand", "LoftCurvatureType"]);
  assert.deepEqual(call?.values, [{ faces, guideIds: [9], trimGuides: false, simplify: false, startCondition: "Clamped", endCondition: "Natural", startMagnitude: 1.5, endMagnitude: 0.75 }]);
  assert.match(call?.source ?? "", /factory\.faces = args\.faces\.map\(face\)/);
  assert.match(call?.source ?? "", /factory\.guides = args\.guideIds\.map/);
  assert.match(call?.source ?? "", /factory\.startCurvature = Curvature\[args\.startCondition\]/);
  assert.match(call?.source ?? "", /factory\.startMagnitude = args\.startMagnitude/);
  assert.match(call?.source ?? "", /selection\.selected\.removeAll\(\)/);
});

test("rejects invalid face loft profiles and options before native mutation", async () => {
  let mutations = 0;
  const planar = { id: "f1", surfaceType: "Plane", planar: true, centerMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 10, 0] as [number, number, number] }, edgeIds: [] };
  const spline = { ...planar, id: "f2", surfaceType: "BSurface", planar: false };
  const solid = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: ["f1", "f2"], edgeIds: [], faces: [planar, spline], edges: [], vertices: [] };
  const sheet = { ...solid, id: 8, versionId: 18, type: "Sheet", faceIds: ["f1"], faces: [planar] };
  const wire = { ...solid, id: 9, versionId: 19, type: "Wire", faceIds: ["f1"], faces: [planar] };
  const guide = { ...wire, id: 10, versionId: 20, faceIds: [], faces: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "r1", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid, sheet, wire, guide] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const valid = [{ bodyId: 7, faceId: "f1" }, { bodyId: 8, faceId: "f1" }];

  await assert.rejects(operations.loftFaces(valid, {}, "old"), /stale reference/i);
  await assert.rejects(operations.loftFaces([valid[0]!], {}, "r1"), /at least two/i);
  await assert.rejects(operations.loftFaces([valid[0]!, valid[0]!], {}, "r1"), /unique/i);
  await assert.rejects(operations.loftFaces([{ bodyId: 7, faceId: "f1" }, { bodyId: 7, faceId: "f2" }], {}, "r1"), /different source bodies/i);
  await assert.rejects(operations.loftFaces([{ bodyId: 7, faceId: "missing" }, valid[1]!], {}, "r1"), /unknown current face/i);
  await assert.rejects(operations.loftFaces([{ bodyId: 9, faceId: "f1" }, valid[1]!], {}, "r1"), /Solid or Sheet/i);
  await assert.rejects(operations.loftFaces([{ bodyId: 7, faceId: "f2" }, valid[1]!], {}, "r1"), /requires planar/i);
  await assert.rejects(operations.loftFaces(valid, { guideIds: [99] }, "r1"), /current Wire/i);
  await assert.rejects(operations.loftFaces(valid, { guideIds: [10, 10] }, "r1"), /unique/i);
  await assert.rejects(operations.loftFaces(valid, { startMagnitude: 0 }, "r1"), /magnitudes/i);
  assert.equal(mutations, 0);
});

test("patches explicit native Regions into Sheet bodies", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, bodies: [],
    regions: [
      { id: "12r34", entityId: 34, islandVersionId: 12, sketchId: 3, sketchWireIds: [7], measurementSource: "render-mesh", displayBoundsMm: { min: [-5, -5, 0], max: [5, 5, 0] } },
    ],
  };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.patchRegions(["12r34"], state.revision);

  assert.deepEqual(call?.bindings, ["PatchRegionFactory"]);
  assert.deepEqual(call?.values, [{ regionIds: ["12r34"] }]);
  assert.match(call?.source ?? "", /factory\.regions = regions/);
  assert.match(call?.source ?? "", /PatchCommand/);
});

test("bridges two native Sheet faces with a G2 surface", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const sheet = (id: number, versionId: number, faceId: string) => ({
    id,
    versionId,
    type: "Sheet",
    name: null,
    boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 10, 0] as [number, number, number] },
    faceIds: [faceId],
    edgeIds: [],
    faces: [{
      id: faceId,
      surfaceType: "Plane",
      planar: true,
      centerMm: [5, 5, 0] as [number, number, number],
      normal: [0, 0, 1] as [number, number, number],
      radiusMm: null,
      blendRadiusMm: null,
      axisOriginMm: null,
      axisDirection: null,
      boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 10, 0] as [number, number, number] },
      edgeIds: [],
    }],
    edges: [],
  });
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [sheet(12, 20, "20f1"), sheet(13, 21, "21f1")],
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) {
      call = { source, bindings, values };
      return {};
    },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.bridgeSurface(
    { bodyId: 12, faceId: "20f1", pickPointMm: [10, 5, 0] },
    { bodyId: 13, faceId: "21f1", pickPointMm: [20, 5, 5] },
    20,
    1,
    state.revision,
  );

  assert.deepEqual(call?.bindings, ["BridgeSurfaceWithPreviewFactory", "Vector3", "BlendShape", "BlendTrim"]);
  assert.deepEqual(call?.values, [{
    faces: [
      { bodyId: 12, faceId: "20f1" },
      { bodyId: 13, faceId: "21f1" },
    ],
    pickPoints: [[0.01, 0.005, 0], [0.02, 0.005, 0.005]],
    width: 0.02,
    softness: 1,
  }]);
  assert.match(call?.source ?? "", /factory\.shape = BlendShape\.G2/);
  assert.match(call?.source ?? "", /factory\.trimBlend = BlendTrim\.Both/);
  assert.match(call?.source ?? "", /factory\.push\(face\(args\.faces\[0\]\), false/);
});

test("rejects invalid or stale Surface Bridge inputs before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [
      { id: 12, versionId: 20, type: "Sheet", name: null, boundsMm: null, faceIds: ["20f1", "20f2"], edgeIds: [], faces: [], edges: [] },
      { id: 13, versionId: 21, type: "Solid", name: null, boundsMm: null, faceIds: ["21f1"], edgeIds: [], faces: [], edges: [] },
    ],
  };
  const runtime = {
    async getState() { return state; },
    async mutate() { mutations += 1; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const first = { bodyId: 12, faceId: "20f1", pickPointMm: [10, 5, 0] as [number, number, number] };

  await assert.rejects(operations.bridgeSurface(first, { bodyId: 13, faceId: "21f1", pickPointMm: [20, 5, 5] }, 20, 1, state.revision), /Sheet faces/i);
  await assert.rejects(operations.bridgeSurface(first, { bodyId: 12, faceId: "20f2", pickPointMm: [0, 5, 0] }, 20, 1, state.revision), /different Sheet bodies/i);
  await assert.rejects(operations.bridgeSurface(first, { bodyId: 14, faceId: "missing", pickPointMm: [20, 5, 5] }, 20, 1, state.revision), /stale or unknown/i);
  await assert.rejects(operations.bridgeSurface(first, { bodyId: 12, faceId: "20f2", pickPointMm: [0, 5, 0] }, 0, 1, state.revision), /width/i);
  await assert.rejects(operations.bridgeSurface(first, { bodyId: 12, faceId: "20f2", pickPointMm: [0, 5, 0] }, 20, 0, state.revision), /softness/i);
  await assert.rejects(operations.bridgeSurface(first, { bodyId: 12, faceId: "20f2", pickPointMm: [0, 5, 0] }, 20, 1, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("rejects invalid or stale Region patch inputs before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, bodies: [],
    regions: [{ id: "12r34", entityId: 34, islandVersionId: 12, sketchId: 3, sketchWireIds: [7], measurementSource: "render-mesh", displayBoundsMm: { min: [-5, -5, 0], max: [5, 5, 0] } }],
  };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.patchRegions([], state.revision), /at least one/i);
  await assert.rejects(operations.patchRegions(["12r34", "12r34"], state.revision), /unique/i);
  await assert.rejects(operations.patchRegions(["missing"], state.revision), /stale or unknown/i);
  await assert.rejects(operations.patchRegions(["12r34"], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("patches closed spatial Wire bodies into independent native Sheets", async () => {
  let readCall: { source: string; values: unknown[] } | undefined;
  let mutation: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wires = [7, 8].map((id) => ({ id, versionId: id + 10, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] }));
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: wires };
  const runtime = {
    async getState() { return state; },
    async read(source: string, values: unknown[]) { readCall = { source, values }; return [{ id: 7, closed: true }, { id: 8, closed: true }]; },
    async mutate(source: string, bindings: string[], values: unknown[]) { mutation = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.patchClosedWires([7, 8], state.revision);

  assert.deepEqual(readCall?.values, [[7, 8]]);
  assert.match(readCall?.source ?? "", /item\.model\?\.IsClosed/);
  assert.deepEqual(mutation?.bindings, ["PatchHoleInWireFactory", "PatchHoleInCurveCommand"]);
  assert.deepEqual(mutation?.values, [{ ids: [7, 8] }]);
  assert.match(mutation?.source ?? "", /factory\.curves = curves/);
  assert.match(mutation?.source ?? "", /!item\.model\?\.IsClosed/);
});

test("rejects stale, open, duplicate, missing, and non-Wire patch boundaries before mutation", async () => {
  let mutations = 0;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const solid = { ...wire, id: 8, versionId: 18, type: "Solid" };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire, solid] };
  const runtime = {
    async getState() { return state; },
    async read() { return [{ id: 7, closed: false }]; },
    async mutate() { mutations += 1; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.patchClosedWires([], state.revision), /nonempty unique/i);
  await assert.rejects(operations.patchClosedWires([7, 7], state.revision), /nonempty unique/i);
  await assert.rejects(operations.patchClosedWires([99], state.revision), /unknown current/i);
  await assert.rejects(operations.patchClosedWires([8], state.revision), /Wire bodies/i);
  await assert.rejects(operations.patchClosedWires([7], state.revision), /requires closed Wire/i);
  await assert.rejects(operations.patchClosedWires([7], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("joins native Sheet bodies through their coincident edges", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const sheets = [7, 8].map((id) => ({ id, versionId: id + 10, type: "Sheet", name: null, boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 10, 0] as [number, number, number] }, faceIds: [], edgeIds: [], faces: [], edges: [] }));
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: sheets };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.joinSheets([7, 8], state.revision);

  assert.deepEqual(call?.bindings, ["JoinSheetsFactory"]);
  assert.deepEqual(call?.values, [{ ids: [7, 8] }]);
  assert.match(call?.source ?? "", /factory\.sheets = args\.ids\.map/);
  assert.match(call?.source ?? "", /JoinSheetsCommand/);
});

test("rejects invalid Sheet joins before mutation", async () => {
  let mutations = 0;
  const sheet = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const solid = { ...sheet, id: 8, versionId: 18, type: "Solid" };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [sheet, solid] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.joinSheets([7], state.revision), /at least two/i);
  await assert.rejects(operations.joinSheets([7, 7], state.revision), /unique/i);
  await assert.rejects(operations.joinSheets([7, 8], state.revision), /current Sheet/i);
  await assert.rejects(operations.joinSheets([7, 99], state.revision), /current Sheet/i);
  await assert.rejects(operations.joinSheets([7, 8], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("creates a native constrained B-Surface from points and normals", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.createConstrainedSurface(
    [[0, 0, 0], [10, 0, 0], [10, 10, 2], [0, 10, 0]],
    [[0, 0, 2], [0, 0, 2], [0, 0, 2], [0, 0, 2]],
    { toleranceMm: 0.02, angularToleranceDegrees: 3, optimization: "smoothness" },
    state.revision,
  );

  assert.deepEqual(call?.bindings, ["ConstrainedSurfaceFactory", "Vector3", "ConstrainedSurfaceOptimizationType"]);
  assert.deepEqual(call?.values, [{
    points: [[0, 0, 0], [0.01, 0, 0], [0.01, 0.01, 0.002], [0, 0.01, 0]],
    normals: [[0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]],
    tolerance: 0.00002,
    angularToleranceDegrees: 3,
    optimizationName: "Smoothness",
  }]);
  assert.match(call?.source ?? "", /factory\.points = args\.points\.map/);
  assert.match(call?.source ?? "", /factory\.optimize = ConstrainedSurfaceOptimizationType/);
});

test("rejects invalid constrained-surface inputs before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const points: [number, number, number][] = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]];
  const normals: [number, number, number][] = points.map(() => [0, 0, 1]);

  await assert.rejects(operations.createConstrainedSurface(points.slice(0, 3), normals.slice(0, 3), {}, state.revision), /at least four/i);
  await assert.rejects(operations.createConstrainedSurface(points, normals.slice(0, 3), {}, state.revision), /one normal/i);
  await assert.rejects(operations.createConstrainedSurface(points, [[0, 0, 0], ...normals.slice(1)], {}, state.revision), /normal.*nonzero/i);
  await assert.rejects(operations.createConstrainedSurface(points, normals, { toleranceMm: 0 }, state.revision), /tolerance/i);
  await assert.rejects(operations.createConstrainedSurface(points, normals, {}, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("creates preserved native body copies deformed between exact faces", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const plane = (id: string, z: number) => ({
    id, surfaceType: "Plane", planar: true,
    centerMm: [0, 0, z] as [number, number, number], normal: [0, 0, 1] as [number, number, number],
    radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null,
    boundsMm: { min: [-10, -10, z] as [number, number, number], max: [10, 10, z] as [number, number, number] },
    edgeIds: [],
  });
  const cylinder = {
    ...plane("target-face", 15), surfaceType: "Cylinder", planar: false, radiusMm: 10,
    axisOriginMm: [0, 0, 0] as [number, number, number], axisDirection: [0, 0, 1] as [number, number, number],
  };
  const deformFace = plane("deform-face", 0);
  const sourceFace = plane("source-face", 0);
  const body = { id: 7, versionId: 17, type: "Solid", name: "mark", boundsMm: null, faceIds: [deformFace.id], edgeIds: [], faces: [deformFace], edges: [] };
  const source = { id: 8, versionId: 18, type: "Sheet", name: "development", boundsMm: null, faceIds: [sourceFace.id], edgeIds: [], faces: [sourceFace], edges: [] };
  const target = { id: 9, versionId: 19, type: "Solid", name: "cylinder", boundsMm: null, faceIds: [cylinder.id], edgeIds: [], faces: [cylinder], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body, source, target] };
  const runtime = { async getState() { return state; }, async mutate(sourceCode: string, bindings: string[], values: unknown[]) { call = { source: sourceCode, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const options = { scaleU: 1.5, scaleV: 0.75, scaleNormal: 2, flipUV: true, flipNormal: false, mirror: true };

  await operations.deformBodiesBetweenFaces(
    [7],
    { bodyId: 8, faceId: sourceFace.id },
    { bodyId: 9, faceId: cylinder.id },
    options,
    state.revision,
  );

  assert.deepEqual(call?.bindings, ["DeformFaceFactory", "DeformFaceCommand"]);
  assert.deepEqual(call?.values, [{
    ids: [7], sourceFace: { bodyId: 8, faceId: sourceFace.id }, targetFace: { bodyId: 9, faceId: cylinder.id }, options,
  }]);
  assert.match(call?.source ?? "", /factory\.faces = args\.ids\.flatMap/);
  assert.match(call?.source ?? "", /factory\.keepTools = true/);
  assert.match(call?.source ?? "", /factory\.offsetU = 0/);
  assert.match(call?.source ?? "", /factory\.flipNormal = args\.options\.flipNormal/);
});

test("rejects unsafe or stale native face-deformation inputs before mutation", async () => {
  let mutations = 0;
  const face = (id: string) => ({ id, surfaceType: "Plane", planar: true, centerMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 0] as [number, number, number] }, edgeIds: [] });
  const deformFace = face("deform");
  const sourceFace = face("source");
  const targetFace = face("target");
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [deformFace.id], edgeIds: [], faces: [deformFace], edges: [] };
  const source = { id: 8, versionId: 18, type: "Sheet", name: null, boundsMm: null, faceIds: [sourceFace.id], edgeIds: [], faces: [sourceFace], edges: [] };
  const target = { id: 9, versionId: 19, type: "Solid", name: null, boundsMm: null, faceIds: [targetFace.id], edgeIds: [], faces: [targetFace], edges: [] };
  const wire = { id: 10, versionId: 20, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body, source, target, wire] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const sourceRef = { bodyId: 8, faceId: sourceFace.id };
  const targetRef = { bodyId: 9, faceId: targetFace.id };
  const valid = { scaleU: 1, scaleV: 1, scaleNormal: 1, flipUV: false, flipNormal: false, mirror: false };

  await assert.rejects(operations.deformBodiesBetweenFaces([], sourceRef, targetRef, valid, state.revision), /nonempty unique/i);
  await assert.rejects(operations.deformBodiesBetweenFaces([7, 7], sourceRef, targetRef, valid, state.revision), /nonempty unique/i);
  await assert.rejects(operations.deformBodiesBetweenFaces([99], sourceRef, targetRef, valid, state.revision), /unknown current/i);
  await assert.rejects(operations.deformBodiesBetweenFaces([10], sourceRef, targetRef, valid, state.revision), /Solid or Sheet/i);
  await assert.rejects(operations.deformBodiesBetweenFaces([7], { bodyId: 8, faceId: "missing" }, targetRef, valid, state.revision), /unknown current face/i);
  await assert.rejects(operations.deformBodiesBetweenFaces([7], sourceRef, sourceRef, valid, state.revision), /must be different/i);
  await assert.rejects(operations.deformBodiesBetweenFaces([8], sourceRef, targetRef, valid, state.revision), /must be separate/i);
  await assert.rejects(operations.deformBodiesBetweenFaces([7], sourceRef, targetRef, { ...valid, scaleU: 0 }, state.revision), /scaleU must be positive/i);
  await assert.rejects(operations.deformBodiesBetweenFaces([7], sourceRef, targetRef, { ...valid, scaleNormal: 1001 }, state.revision), /scaleNormal must be positive/i);
  await assert.rejects(operations.deformBodiesBetweenFaces([7], sourceRef, targetRef, valid, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("bridges exact Solid or Sheet edge endpoints with native continuity", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const firstEdge = { id: "17e1", curveType: "Line", line: true, circle: false, lengthMm: 10, centerMm: [0, 0, 5] as [number, number, number], tangent: [0, 0, 1] as [number, number, number], boundsMm: { min: [0, 0, 0] as [number, number, number], max: [0, 0, 10] as [number, number, number] }, faceIds: ["17f1", "17f2"], vertexIds: [101, 102] };
  const secondEdge = { ...firstEdge, id: "18e1", centerMm: [20, 10, 25] as [number, number, number], boundsMm: { min: [20, 10, 20] as [number, number, number], max: [20, 10, 30] as [number, number, number] }, faceIds: ["18f1"], vertexIds: [201, 202] };
  const firstBody = { id: 7, versionId: 17, type: "Solid", name: "First", boundsMm: null, faceIds: ["17f1", "17f2"], edgeIds: [firstEdge.id], faces: [], edges: [firstEdge], vertices: [
    { id: 101, positionMm: [0, 0, 0] as [number, number, number], edgeIds: [firstEdge.id], faceIds: firstEdge.faceIds },
    { id: 102, positionMm: [0, 0, 10] as [number, number, number], edgeIds: [firstEdge.id], faceIds: firstEdge.faceIds },
  ] };
  const secondBody = { id: 8, versionId: 18, type: "Sheet", name: "Second", boundsMm: null, faceIds: ["18f1"], edgeIds: [secondEdge.id], faces: [], edges: [secondEdge], vertices: [
    { id: 201, positionMm: [20, 10, 20] as [number, number, number], edgeIds: [secondEdge.id], faceIds: secondEdge.faceIds },
    { id: 202, positionMm: [20, 10, 30] as [number, number, number], edgeIds: [secondEdge.id], faceIds: secondEdge.faceIds },
  ] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "doc-1", revision: "r1", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [firstBody, secondBody] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const first = { bodyId: 7, edgeId: "17e1", vertexId: 102 };
  const second = { bodyId: 8, edgeId: "18e1", vertexId: 201 };

  await operations.bridgeShellEdges(first, second, "G1", "G3", state.revision);

  assert.deepEqual(call?.bindings, ["BridgeEdgeFactory", "BridgeEdgeCommand", "ContinuityType"]);
  assert.deepEqual(call?.values, [{ first, second, firstPosition: [0, 0, 0.01], secondPosition: [0.02, 0.01, 0.02], startContinuity: "G1", endContinuity: "G3" }]);
  assert.match(call?.source ?? "", /factory\.edge1 = edge\(args\.first\)/);
  assert.match(call?.source ?? "", /factory\.pickClosestVertices\(\)/);
  assert.match(call?.source ?? "", /matches\(factory\.startPosition, args\.firstPosition\)/);
  assert.match(call?.source ?? "", /factory\.side1 = !factory\.side1/);
  assert.match(call?.source ?? "", /factory\.startCurvature = Continuity\[args\.startContinuity\]/);
  assert.match(call?.source ?? "", /factory\.lockDistances = true/);
  assert.match(call?.source ?? "", /selection\.selected\.removeAll\(\)/);
});

test("rejects invalid Shell Edge Bridge endpoints before native mutation", async () => {
  let mutations = 0;
  const edge = { id: "17e1", curveType: "Line", line: true, circle: false, lengthMm: 10, centerMm: [0, 0, 5] as [number, number, number], tangent: [0, 0, 1] as [number, number, number], boundsMm: { min: [0, 0, 0] as [number, number, number], max: [0, 0, 10] as [number, number, number] }, faceIds: ["17f1"], vertexIds: [101, 102] };
  const solid = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: ["17f1"], edgeIds: [edge.id], faces: [], edges: [edge], vertices: [
    { id: 101, positionMm: [0, 0, 0] as [number, number, number], edgeIds: [edge.id], faceIds: edge.faceIds },
    { id: 102, positionMm: [0, 0, 10] as [number, number, number], edgeIds: [edge.id], faceIds: edge.faceIds },
  ] };
  const secondEdge = { ...edge, id: "18e1", vertexIds: [201, 202] };
  const second = { ...solid, id: 8, versionId: 18, edgeIds: [secondEdge.id], edges: [secondEdge], vertices: [
    { id: 201, positionMm: [20, 0, 0] as [number, number, number], edgeIds: [secondEdge.id], faceIds: secondEdge.faceIds },
    { id: 202, positionMm: [20, 0, 10] as [number, number, number], edgeIds: [secondEdge.id], faceIds: secondEdge.faceIds },
  ] };
  const wire = { ...second, id: 9, versionId: 19, type: "Wire" };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "doc-1", revision: "r1", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid, second, wire] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const first = { bodyId: 7, edgeId: "17e1", vertexId: 101 };
  const validSecond = { bodyId: 8, edgeId: "18e1", vertexId: 201 };

  await assert.rejects(operations.bridgeShellEdges(first, validSecond, "G2", "G2", "old"), /stale reference/i);
  await assert.rejects(operations.bridgeShellEdges(first, { bodyId: 8, edgeId: "missing", vertexId: 201 }, "G2", "G2", "r1"), /unknown current edge/i);
  await assert.rejects(operations.bridgeShellEdges(first, first, "G2", "G2", "r1"), /different source edges/i);
  await assert.rejects(operations.bridgeShellEdges(first, { ...validSecond, vertexId: 999 }, "G2", "G2", "r1"), /not an endpoint/i);
  await assert.rejects(operations.bridgeShellEdges(first, { bodyId: 9, edgeId: "18e1", vertexId: 201 }, "G2", "G2", "r1"), /Solid or Sheet/i);
  const coincident = state.bodies[1]!.vertices![0]!;
  coincident.positionMm = [0, 0, 0];
  await assert.rejects(operations.bridgeShellEdges(first, validSecond, "G2", "G2", "r1"), /endpoints must be distinct/i);
  assert.equal(mutations, 0);
});

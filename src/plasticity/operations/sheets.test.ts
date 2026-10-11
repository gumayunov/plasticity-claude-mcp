import assert from "node:assert/strict";
import { test } from "node:test";
import { PlasticityOperations } from "../operations.ts";
import type { PlasticityRuntime, RuntimeState } from "../runtime.ts";
import { emptyConstruction } from "./test-support.ts";

test("converts both sheet-thickening distances to meters", async () => {
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

  await operations.thickenSheets([12, 13], 1.5, 0.5, state.revision);

  assert.deepEqual(values, [{ ids: [12, 13], front: 0.0015, back: 0.0005 }]);
});

test("reverses native Sheet normals in one history step", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const sheet = { id: 8, versionId: 18, type: "Sheet", name: null, boundsMm: null, faceIds: ["f1"], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [sheet] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.reverseSheets([8], state.revision);

  assert.deepEqual(call?.bindings, ["ReverseSheetCommand", "ReverseSheetFactory"]);
  assert.deepEqual(call?.values, [{ ids: [8] }]);
  assert.match(call?.source ?? "", /factory\.sheets = args\.ids\.map\(find\)/);
});

test("unwraps one exact analytic developable face into a planar native Sheet", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const face = { id: "cylindrical", surfaceType: "Cylinder", planar: false, centerMm: [0, 0, 15] as [number, number, number], normal: [1, 0, 0] as [number, number, number], radiusMm: 10, blendRadiusMm: null, axisOriginMm: [0, 0, 0] as [number, number, number], axisDirection: [0, 0, 1] as [number, number, number], boundsMm: { min: [-10, -10, 0] as [number, number, number], max: [10, 10, 30] as [number, number, number] }, edgeIds: ["e1", "e2"] };
  const body = { id: 7, versionId: 17, type: "Solid", name: "Cylinder", boundsMm: face.boundsMm, faceIds: [face.id], edgeIds: face.edgeIds, faces: [face], edges: [], vertices: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.unwrapFace({ bodyId: 7, faceId: face.id }, state.revision);

  assert.deepEqual(call?.bindings, ["UnwrapFactory"]);
  assert.deepEqual(call?.values, [{ face: { bodyId: 7, faceId: face.id } }]);
  assert.match(call?.source ?? "", /new this\.commands\.GroupSelectedCommand/);
  assert.match(call?.source ?? "", /factory\.faces = selectedFaces/);
});

test("derives a conical annular-sector profile from exact full B-Rep circles", async () => {
  const face = {
    id: "cone-face", surfaceType: "Cone", planar: false,
    centerMm: [49, 0, 9] as [number, number, number], normal: [0.9486832980505138, 0, 0.31622776601683794] as [number, number, number],
    radiusMm: null, blendRadiusMm: null, axisOriginMm: [40, 0, 0] as [number, number, number], axisDirection: [0, 0, -1] as [number, number, number],
    coneBasisRadiusMm: 12, coneSemiAngleRad: Math.atan(1 / 3),
    boundsMm: { min: [28, -12, 0] as [number, number, number], max: [52, 12, 18] as [number, number, number] }, edgeIds: ["bottom", "top", "seam"],
  };
  const body: RuntimeState["bodies"][number] = {
    id: 8, versionId: 16, type: "Solid", name: "Frustum", boundsMm: face.boundsMm, faceIds: [face.id], edgeIds: face.edgeIds, faces: [face],
    edges: [
      { id: "bottom", curveType: "Circle", line: false, circle: true, lengthMm: 75.39822368615503, centerMm: [52, 0, 0], tangent: [0, 1, 0], boundsMm: { min: [28, -12, 0], max: [52, 12, 0] }, faceIds: [face.id], vertexIds: [11] },
      { id: "top", curveType: "Circle", line: false, circle: true, lengthMm: 37.69911184307752, centerMm: [46, 0, 18], tangent: [0, 1, 0], boundsMm: { min: [34, -6, 18], max: [46, 6, 18] }, faceIds: [face.id], vertexIds: [12] },
      { id: "seam", curveType: "Line", line: true, circle: false, lengthMm: 18.973665961010276, centerMm: [46, 0, 9], tangent: [0, 0, 1], boundsMm: { min: [46, 0, 0], max: [52, 0, 18] }, faceIds: [face.id], vertexIds: [11, 12] },
    ], vertices: [],
  };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; } } as unknown as PlasticityRuntime;

  const result = await new PlasticityOperations(runtime).analyzeConeDevelopment({ bodyId: body.id, faceId: face.id }, state.revision);

  assert.equal(result.measurementSource, "native-brep");
  assert.deepEqual(result.boundaryRadiusMm, [6, 12]);
  assert.equal(result.development.axialHeightMm, 18);
  assert.ok(Math.abs(result.development.innerRadiusMm - 18.973665961010276) < 1e-9);
  assert.ok(Math.abs(result.development.outerRadiusMm - 37.94733192202055) < 1e-9);
  assert.ok(Math.abs(result.development.includedAngleRad - 1.98691765315922) < 1e-9);
});

test("rejects stale, missing, and nondevelopable face unwraps before mutation", async () => {
  let mutations = 0;
  const plane = { id: "plane", surfaceType: "Plane", planar: true, centerMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 0] as [number, number, number] }, edgeIds: [] };
  const spline = { ...plane, id: "spline", surfaceType: "BSurf", planar: false };
  const cone = { ...plane, id: "cone", surfaceType: "Cone", planar: false };
  const body = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: null, faceIds: [plane.id, spline.id, cone.id], edgeIds: [], faces: [plane, spline, cone], edges: [], vertices: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.unwrapFace({ bodyId: 7, faceId: "missing" }, state.revision), /unknown current face/i);
  await assert.rejects(operations.unwrapFace({ bodyId: 7, faceId: plane.id }, state.revision), /Cylinder face/i);
  await assert.rejects(operations.unwrapFace({ bodyId: 7, faceId: spline.id }, state.revision), /Cylinder face/i);
  await assert.rejects(operations.unwrapFace({ bodyId: 7, faceId: cone.id }, state.revision), /Cylinder face/i);
  await assert.rejects(operations.unwrapFace({ bodyId: 7, faceId: plane.id }, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("unjoins complete native Solid and Sheet shells into independent faces", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const solid = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: ["f1", "f2"], edgeIds: [], faces: [], edges: [] };
  const sheet = { id: 8, versionId: 18, type: "Sheet", name: null, boundsMm: null, faceIds: ["f3", "f4"], edgeIds: [], faces: [], edges: [] };
  const wire = { id: 9, versionId: 19, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid, sheet, wire] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.unjoinShells([7, 8], state.revision);

  assert.deepEqual(call?.bindings, ["UnjoinShellsFactory"]);
  assert.deepEqual(call?.values, [{ ids: [7, 8] }]);
  assert.match(call?.source ?? "", /UnjoinShellsCommand/);
  assert.match(call?.source ?? "", /factory\.shells = args\.ids\.map\(find\)/);
});

test("rejects stale, duplicate, missing, and Wire shell-unjoin inputs before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [
      { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
      { id: 8, versionId: 18, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
      { id: 9, versionId: 19, type: "Sheet", name: null, boundsMm: null, faceIds: ["f1"], edgeIds: [], faces: [], edges: [] },
    ],
  };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.unjoinShells([], state.revision), /nonempty unique list/i);
  await assert.rejects(operations.unjoinShells([7, 7], state.revision), /nonempty unique list/i);
  await assert.rejects(operations.unjoinShells([99], state.revision), /unknown current body/i);
  await assert.rejects(operations.unjoinShells([8], state.revision), /Solid or Sheet/i);
  await assert.rejects(operations.unjoinShells([9], state.revision), /at least two faces/i);
  await assert.rejects(operations.unjoinShells([7], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("creates a native Solid from a closed Sheet shell", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const sheet = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: null, faceIds: ["f1", "f2"], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [sheet] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.createSolidFromSheet(7, state.revision);

  assert.deepEqual(call?.bindings, ["CreateSolidFromFacesFactory"]);
  assert.deepEqual(call?.values, [{ id: 7 }]);
  assert.match(call?.source ?? "", /factory\.shell = view/);
  assert.match(call?.source ?? "", /factory\.faces = Array\.from/);
});

test("rejects non-Sheet solidification inputs before mutation", async () => {
  let mutations = 0;
  const solid = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.createSolidFromSheet(7, state.revision), /current Sheet/i);
  await assert.rejects(operations.createSolidFromSheet(99, state.revision), /current Sheet/i);
  await assert.rejects(operations.createSolidFromSheet(7, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("inserts one native fill Sheet into target boundary edges", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const boundaryEdges = ["e1", "e2", "e3", "e4"].map((id) => ({
    id, curveType: "Line", line: true, circle: false, lengthMm: 10,
    centerMm: [0, 0, 5] as [number, number, number], tangent: [1, 0, 0] as [number, number, number],
    boundsMm: { min: [0, 0, 5] as [number, number, number], max: [10, 0, 5] as [number, number, number] },
    faceIds: ["f1"], vertexIds: [],
  }));
  const target = { id: 7, versionId: 17, type: "Sheet", name: "open shell", boundsMm: null, faceIds: ["f1"], edgeIds: boundaryEdges.map((edge) => edge.id), faces: [], edges: boundaryEdges };
  const fill = { id: 8, versionId: 18, type: "Sheet", name: "fill", boundsMm: null, faceIds: ["f2"], edgeIds: ["e5", "e6", "e7", "e8"], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [target, fill] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.insertSheet(7, boundaryEdges.map((edge) => edge.id), 8, state.revision);

  assert.deepEqual(call?.bindings, ["InsertSheetFactory", "InsertSheetCommand"]);
  assert.deepEqual(call?.values, [{ targetSheetId: 7, edgeIds: ["e1", "e2", "e3", "e4"], fillSheetId: 8 }]);
  assert.match(call?.source ?? "", /factory\.sheet = target/);
  assert.match(call?.source ?? "", /factory\.edges = args\.edgeIds\.map/);
  assert.match(call?.source ?? "", /factory\.fillSheet = fill/);
});

test("rejects invalid native Sheet insertion inputs before mutation", async () => {
  let mutations = 0;
  const boundary = { id: "e1", curveType: "Line", line: true, circle: false, lengthMm: 10, centerMm: [0, 0, 0] as [number, number, number], tangent: [1, 0, 0] as [number, number, number], boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 0, 0] as [number, number, number] }, faceIds: ["f1"], vertexIds: [] };
  const internal = { ...boundary, id: "e2", faceIds: ["f1", "f2"] };
  const target = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: null, faceIds: ["f1", "f2"], edgeIds: ["e1", "e2"], faces: [], edges: [boundary, internal] };
  const fill = { ...target, id: 8, versionId: 18, edgeIds: [], edges: [] };
  const solid = { ...target, id: 9, versionId: 19, type: "Solid" };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [target, fill, solid] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.insertSheet(7, ["e1"], 7, state.revision), /two different/i);
  await assert.rejects(operations.insertSheet(9, ["e1"], 8, state.revision), /target Sheet/i);
  await assert.rejects(operations.insertSheet(7, ["e1"], 9, state.revision), /fill Sheet/i);
  await assert.rejects(operations.insertSheet(7, [], 8, state.revision), /at least one/i);
  await assert.rejects(operations.insertSheet(7, ["e1", "e1"], 8, state.revision), /unique/i);
  await assert.rejects(operations.insertSheet(7, ["missing"], 8, state.revision), /stale or unknown/i);
  await assert.rejects(operations.insertSheet(7, ["e2"], 8, state.revision), /boundary/i);
  await assert.rejects(operations.insertSheet(7, ["e1"], 8, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("patches a native Sheet boundary loop", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const edges = ["e1", "e2", "e3", "e4"].map((id) => ({ id, curveType: "Line", line: true, circle: false, lengthMm: 10, centerMm: [0, 0, 0] as [number, number, number], tangent: [1, 0, 0] as [number, number, number], boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 0, 0] as [number, number, number] }, faceIds: ["f1"], vertexIds: [] }));
  const sheet = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: null, faceIds: ["f1"], edgeIds: edges.map((edge) => edge.id), faces: [], edges };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [sheet] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.patchSheetHole(7, edges.map((edge) => edge.id), state.revision);

  assert.deepEqual(call?.bindings, ["PatchHoleInSheetFactory"]);
  assert.deepEqual(call?.values, [{ id: 7, edgeIds: ["e1", "e2", "e3", "e4"] }]);
  assert.match(call?.source ?? "", /factory\.sheet = view/);
  assert.match(call?.source ?? "", /factory\.edges = args\.edgeIds\.map/);
});

test("caps every open boundary of current native Sheets", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const sheet = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: null, faceIds: ["f1"], edgeIds: ["e1"], faces: [], edges: [] };
  const other = { ...sheet, id: 8, versionId: 18 };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [sheet, other] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.capSheetHoles([7, 8], state.revision);

  assert.deepEqual(call?.bindings, ["PatchHolesInSheetCommand", "CapHolesInSheetFactory"]);
  assert.deepEqual(call?.values, [{ ids: [7, 8] }]);
  assert.match(call?.source ?? "", /new Command\(this\)/);
  assert.match(call?.source ?? "", /factory\.sheets = args\.ids\.map\(find\)/);
});

test("rejects invalid Sheet cap references before mutation", async () => {
  let mutations = 0;
  const sheet = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: null, faceIds: ["f1"], edgeIds: ["e1"], faces: [], edges: [] };
  const solid = { ...sheet, id: 8, versionId: 18, type: "Solid" };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [sheet, solid] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.capSheetHoles([], state.revision), /at least one/i);
  await assert.rejects(operations.capSheetHoles([7, 7], state.revision), /unique/i);
  await assert.rejects(operations.capSheetHoles([8], state.revision), /current Sheet/i);
  await assert.rejects(operations.capSheetHoles([99], state.revision), /current Sheet/i);
  await assert.rejects(operations.capSheetHoles([7], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("rejects invalid Sheet-hole patch inputs before mutation", async () => {
  let mutations = 0;
  const edges = ["e1", "e2", "e3"].map((id, index) => ({ id, curveType: "Line", line: true, circle: false, lengthMm: 10, centerMm: [0, 0, 0] as [number, number, number], tangent: [1, 0, 0] as [number, number, number], boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 0, 0] as [number, number, number] }, faceIds: index === 2 ? ["f1", "f2"] : ["f1"], vertexIds: [] }));
  const sheet = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: null, faceIds: ["f1", "f2"], edgeIds: edges.map((edge) => edge.id), faces: [], edges };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [sheet] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.patchSheetHole(7, ["e1", "e2"], state.revision), /at least three/i);
  await assert.rejects(operations.patchSheetHole(7, ["e1", "e1", "e2"], state.revision), /unique/i);
  await assert.rejects(operations.patchSheetHole(7, ["e1", "e2", "missing"], state.revision), /stale or unknown/i);
  await assert.rejects(operations.patchSheetHole(7, ["e1", "e2", "e3"], state.revision), /boundary/i);
  await assert.rejects(operations.patchSheetHole(7, ["e1", "e2", "e3"], "old-revision"), /stale reference/i);
  await assert.rejects(operations.patchSheetHole(99, ["e1", "e2", "e3"], state.revision), /current Sheet/i);
  assert.equal(mutations, 0);
});

test("extends exact boundary edges of a native Sheet", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const edges = ["e1", "e2"].map((id) => ({ id, curveType: "Line", line: true, circle: false, lengthMm: 10, centerMm: [10, 5, 0] as [number, number, number], tangent: [0, 1, 0] as [number, number, number], boundsMm: { min: [10, 0, 0] as [number, number, number], max: [10, 10, 0] as [number, number, number] }, faceIds: ["f1"], vertexIds: [] }));
  const sheet = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: null, faceIds: ["f1"], edgeIds: edges.map((edge) => edge.id), faces: [], edges };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [sheet] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.extendSheetEdges(7, ["e1", "e2"], 5, state.revision);

  assert.deepEqual(call?.bindings, ["ExtendSheetFactory", "ExtensionShape", "BodyExtensionType", "ExtensionLimit"]);
  assert.deepEqual(call?.values, [{ id: 7, edgeIds: ["e1", "e2"], distance: 0.005 }]);
  assert.match(call?.source ?? "", /factory\.shape = ExtensionShape\.Linear/);
  assert.match(call?.source ?? "", /factory\.type = BodyExtensionType\.Distance/);
  assert.match(call?.source ?? "", /factory\.limit = ExtensionLimit\.Minimal/);
});

test("rejects invalid Sheet edge extensions before mutation", async () => {
  let mutations = 0;
  const boundary = { id: "e1", curveType: "Line", line: true, circle: false, lengthMm: 10, centerMm: [10, 5, 0] as [number, number, number], tangent: [0, 1, 0] as [number, number, number], boundsMm: { min: [10, 0, 0] as [number, number, number], max: [10, 10, 0] as [number, number, number] }, faceIds: ["f1"], vertexIds: [] };
  const joined = { ...boundary, id: "e2", faceIds: ["f1", "f2"] };
  const sheet = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: null, faceIds: ["f1", "f2"], edgeIds: ["e1", "e2"], faces: [], edges: [boundary, joined] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [sheet] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.extendSheetEdges(7, [], 5, state.revision), /at least one/i);
  await assert.rejects(operations.extendSheetEdges(7, ["e1", "e1"], 5, state.revision), /unique/i);
  await assert.rejects(operations.extendSheetEdges(7, ["missing"], 5, state.revision), /stale or unknown/i);
  await assert.rejects(operations.extendSheetEdges(7, ["e2"], 5, state.revision), /boundary/i);
  await assert.rejects(operations.extendSheetEdges(7, ["e1"], 0, state.revision), /positive/i);
  await assert.rejects(operations.extendSheetEdges(7, ["e1"], 5, "old-revision"), /stale reference/i);
  await assert.rejects(operations.extendSheetEdges(99, ["e1"], 5, state.revision), /current Sheet/i);
  assert.equal(mutations, 0);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { PlasticityOperations } from "../operations.ts";
import type { PlasticityRuntime, RuntimeState } from "../runtime.ts";
import { emptyConstruction } from "./test-support.ts";

test("moves, rotates, and scales exact native faces in one history command each", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const face = {
    id: "17f1", surfaceType: "Cylinder", planar: false,
    centerMm: [0, 0, 5] as [number, number, number], normal: [1, 0, 0] as [number, number, number],
    radiusMm: 5, blendRadiusMm: null, axisOriginMm: [0, 0, 0] as [number, number, number],
    axisDirection: [0, 0, 1] as [number, number, number],
    boundsMm: { min: [-5, -5, 0] as [number, number, number], max: [5, 5, 10] as [number, number, number] }, edgeIds: [],
  };
  const body = { id: 7, versionId: 17, type: "Solid", name: "Cylinder", boundsMm: null, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body],
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const faces = [{ bodyId: 7, faceId: "17f1" }];

  await operations.moveFaces(faces, [0, 0, 5], state.revision);
  await operations.rotateFaces(faces, [10, 20, 30], [0, 2, 0], -10, state.revision);
  await operations.scaleFaces(faces, [0, 0, 0], [2, 2, 1], state.revision);

  assert.deepEqual(calls.map((call) => call.bindings), [
    ["MultiMoveFaceFactory"],
    ["MultiRotateFaceFactory", "Vector3", "Quaternion"],
    ["MultiPlanarizingBasicScaleFaceFactory"],
  ]);
  assert.deepEqual(calls.map((call) => call.values), [
    [{ faces, delta: [0, 0, 0.005] }],
    [{ faces, pivot: [0.01, 0.02, 0.03], axis: [0, 1, 0], radians: -Math.PI / 18 }],
    [{ faces, pivot: [0, 0, 0], factors: [2, 2, 1] }],
  ]);
  assert.match(calls[0]?.source ?? "", /new this\.commands\.MoveFaceCommand/);
  assert.match(calls[1]?.source ?? "", /new this\.commands\.RotateFaceCommand/);
  assert.match(calls[1]?.source ?? "", /setFromAxisAngle/);
  assert.match(calls[2]?.source ?? "", /new this\.commands\.ScaleFaceCommand/);
  assert.match(calls[2]?.source ?? "", /factory\.scale\.fromArray/);
  assert(calls.every((call) => call.source.includes("view.high.faces.versionIds.indexOf")));
});

test("rejects stale and invalid native face transforms before mutation", async () => {
  let mutations = 0;
  const face = {
    id: "17f1", surfaceType: "Plane", planar: true,
    centerMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number],
    radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null,
    boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 10, 0] as [number, number, number] }, edgeIds: [],
  };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const faceRef = { bodyId: 7, faceId: "17f1" };

  await assert.rejects(operations.moveFaces([], [0, 0, 1], state.revision), /at least one face/i);
  await assert.rejects(operations.moveFaces([faceRef, faceRef], [0, 0, 1], state.revision), /face references must be unique/i);
  await assert.rejects(operations.moveFaces([{ bodyId: 7, faceId: "missing" }], [0, 0, 1], state.revision), /unknown current face/i);
  await assert.rejects(operations.moveFaces([faceRef], [0, 0, 0], state.revision), /finite nonzero/i);
  await assert.rejects(operations.rotateFaces([faceRef], [0, 0, Number.NaN], [0, 0, 1], 10, state.revision), /pivot must be finite/i);
  await assert.rejects(operations.rotateFaces([faceRef], [0, 0, 0], [0, 0, 0], 10, state.revision), /axis.*zero/i);
  await assert.rejects(operations.rotateFaces([faceRef], [0, 0, 0], [0, 0, 1], 0, state.revision), /angle must be finite and nonzero/i);
  await assert.rejects(operations.scaleFaces([faceRef], [0, 0, 0], [1, 0, 1], state.revision), /factors must be finite and positive/i);
  await assert.rejects(operations.scaleFaces([faceRef], [0, 0, 0], [1, 1, 1], state.revision), /must change at least one factor/i);
  await assert.rejects(operations.scaleFaces([faceRef], [0, 0, 0], [2, 2, 1], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("thickens faces, offsets face loops, and patches Solid edge loops natively", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const face = { id: "17f1", surfaceType: "Plane", planar: true, centerMm: [10, 5, 5] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 5] as [number, number, number], max: [20, 10, 5] as [number, number, number] }, edgeIds: ["17e1"] };
  const edge = { id: "17e1", curveType: "Circle", line: false, circle: true, lengthMm: 18.8495559215, centerMm: [7, 5, 5] as [number, number, number], tangent: [0, -1, 0] as [number, number, number], boundsMm: { min: [7, 2, 5] as [number, number, number], max: [13, 8, 5] as [number, number, number] }, faceIds: [face.id], vertexIds: [] };
  const body = { id: 7, versionId: 17, type: "Solid", name: "Block", boundsMm: null, faceIds: [face.id], edgeIds: [edge.id], faces: [face], edges: [edge] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const faces = [{ bodyId: 7, faceId: face.id }];
  const edges = [{ bodyId: 7, edgeId: edge.id }];

  await operations.thickenFaces(faces, 2, 1, state.revision);
  await operations.offsetFaceLoops(faces, -2, false, state.revision);
  await operations.patchSolidEdgeLoops(edges, state.revision);

  assert.deepEqual(calls.map((call) => call.bindings), [
    ["ThickenFaceFactory", "ThickenFaceCommand"],
    ["OffsetFaceLoopFactory", "OffsetFaceLoopCommand"],
    ["PatchHoleInSolidFactory", "PatchHoleInSolidCommand"],
  ]);
  assert.deepEqual(calls.map((call) => call.values), [
    [{ faces, front: 0.002, back: 0.001 }],
    [{ faces, distance: -0.002, individual: false }],
    [{ edges }],
  ]);
  assert.match(calls[0]?.source ?? "", /factory\.faces = selectedFaces/);
  assert.match(calls[0]?.source ?? "", /factory\.front = args\.front/);
  assert.match(calls[1]?.source ?? "", /factory\.isIndividual = args\.individual/);
  assert.match(calls[2]?.source ?? "", /factory\.edges = selectedEdges/);
  assert(calls.every((call) => call.source.includes("new Command(editor)")));
});

test("rejects invalid face thickening, face-loop offsets, and Solid loop patches before mutation", async () => {
  let mutations = 0;
  const face = { id: "17f1", surfaceType: "Plane", planar: true, centerMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 0] as [number, number, number] }, edgeIds: ["17e1"] };
  const edge = { id: "17e1", curveType: "Line", line: true, circle: false, lengthMm: 1, centerMm: [0.5, 0, 0] as [number, number, number], tangent: [1, 0, 0] as [number, number, number], boundsMm: { min: [0, 0, 0] as [number, number, number], max: [1, 0, 0] as [number, number, number] }, faceIds: [face.id], vertexIds: [1, 2] };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [face.id], edgeIds: [edge.id], faces: [face], edges: [edge] };
  const other = { ...body, id: 8, versionId: 18, faceIds: ["18f1"], edgeIds: ["18e1"], faces: [{ ...face, id: "18f1" }], edges: [{ ...edge, id: "18e1" }] };
  const wire = { ...body, id: 9, versionId: 19, type: "Wire", faceIds: ["19f1"], edgeIds: ["19e1"], faces: [{ ...face, id: "19f1" }], edges: [{ ...edge, id: "19e1" }] };
  const sheet = { ...body, id: 10, versionId: 20, type: "Sheet", faceIds: ["20f1"], edgeIds: ["20e1"], faces: [{ ...face, id: "20f1" }], edges: [{ ...edge, id: "20e1" }] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body, other, wire, sheet] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const faces = [{ bodyId: 7, faceId: "17f1" }];
  const edges = [{ bodyId: 7, edgeId: "17e1" }];

  await assert.rejects(operations.thickenFaces([], 2, 1, state.revision), /at least one face/i);
  await assert.rejects(operations.thickenFaces([faces[0]!, faces[0]!], 2, 1, state.revision), /references must be unique/i);
  await assert.rejects(operations.thickenFaces([faces[0]!, { bodyId: 8, faceId: "18f1" }], 2, 1, state.revision), /one body/i);
  await assert.rejects(operations.thickenFaces([{ bodyId: 9, faceId: "19f1" }], 2, 1, state.revision), /Solid or Sheet/i);
  await assert.rejects(operations.thickenFaces(faces, -1, 1, state.revision), /nonnegative/i);
  await assert.rejects(operations.thickenFaces(faces, 0, 0, state.revision), /positive front or back/i);
  await assert.rejects(operations.offsetFaceLoops(faces, 0, true, state.revision), /nonzero/i);
  await assert.rejects(operations.offsetFaceLoops([{ bodyId: 9, faceId: "19f1" }], 2, true, state.revision), /Solid or Sheet/i);
  await assert.rejects(operations.patchSolidEdgeLoops([], state.revision), /at least one edge/i);
  await assert.rejects(operations.patchSolidEdgeLoops([edges[0]!, edges[0]!], state.revision), /references must be unique/i);
  await assert.rejects(operations.patchSolidEdgeLoops([{ bodyId: 10, edgeId: "20e1" }], state.revision), /requires a Solid/i);
  await assert.rejects(operations.patchSolidEdgeLoops(edges, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("moves and offsets exact native edges from one body", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const edge = {
    id: "17e1", curveType: "Line", line: true, circle: false, lengthMm: 20,
    centerMm: [10, 0, 10] as [number, number, number], tangent: [1, 0, 0] as [number, number, number],
    boundsMm: { min: [0, 0, 10] as [number, number, number], max: [20, 0, 10] as [number, number, number] },
    faceIds: ["17f1", "17f2"], vertexIds: [101, 102],
  };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: edge.faceIds, edgeIds: [edge.id], faces: [], edges: [edge] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const edges = [{ bodyId: 7, edgeId: "17e1" }];

  await operations.moveEdges(edges, [0, 0, 5], state.revision);
  await operations.offsetEdges(edges, -2, state.revision);

  assert.deepEqual(calls.map((call) => call.bindings), [
    ["MoveEdgeFactory", "MoveEdgeCommand"],
    ["OffsetEdgeFactory", "OffsetEdgeCommand"],
  ]);
  assert.deepEqual(calls.map((call) => call.values), [
    [{ edges, delta: [0, 0, 0.005] }],
    [{ edges, distance: -0.002 }],
  ]);
  assert(calls.every((call) => call.source.includes("factory.shell = view")));
  assert(calls.every((call) => call.source.includes("factory.edges = selectedEdges")));
  assert.match(calls[0]?.source ?? "", /factory\.move\.fromArray/);
  assert.match(calls[1]?.source ?? "", /factory\.distance = args\.distance/);
});

test("deletes exact native edges from one body", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const edge = { id: "17e1", curveType: "BCurve", line: false, circle: false, lengthMm: 20, centerMm: [10, 0, 8] as [number, number, number], tangent: [1, 0, 0] as [number, number, number], boundsMm: { min: [0, 0, 8] as [number, number, number], max: [20, 0, 8] as [number, number, number] }, faceIds: ["17f1", "17f2"], vertexIds: [101, 102] };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: edge.faceIds, edgeIds: [edge.id], faces: [], edges: [edge] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const edges = [{ bodyId: 7, edgeId: "17e1" }];

  await operations.deleteEdges(edges, state.revision);

  assert.deepEqual(call?.bindings, ["DeleteEdgeFactory", "DeleteEdgeCommand"]);
  assert.deepEqual(call?.values, [{ edges }]);
  assert.match(call?.source ?? "", /factory\.shell = view/);
  assert.match(call?.source ?? "", /factory\.edges = selectedEdges/);
  assert.match(call?.source ?? "", /new Command\(editor\)/);
});

test("rejects invalid and cross-body native edge edits before mutation", async () => {
  let mutations = 0;
  const edge = { id: "17e1", curveType: "Line", line: true, circle: false, lengthMm: 20, centerMm: [10, 0, 10] as [number, number, number], tangent: [1, 0, 0] as [number, number, number], boundsMm: { min: [0, 0, 10] as [number, number, number], max: [20, 0, 10] as [number, number, number] }, faceIds: [], vertexIds: [] };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [edge.id], faces: [], edges: [edge] };
  const other = { ...body, id: 8, versionId: 18, edgeIds: ["18e1"], edges: [{ ...edge, id: "18e1" }] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body, other] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const edgeRef = { bodyId: 7, edgeId: "17e1" };

  await assert.rejects(operations.moveEdges([], [0, 0, 1], state.revision), /at least one edge/i);
  await assert.rejects(operations.moveEdges([edgeRef, edgeRef], [0, 0, 1], state.revision), /edge references must be unique/i);
  await assert.rejects(operations.moveEdges([edgeRef, { bodyId: 8, edgeId: "18e1" }], [0, 0, 1], state.revision), /one body/i);
  await assert.rejects(operations.moveEdges([{ bodyId: 7, edgeId: "missing" }], [0, 0, 1], state.revision), /unknown current edge/i);
  await assert.rejects(operations.moveEdges([edgeRef], [0, 0, 0], state.revision), /finite nonzero/i);
  await assert.rejects(operations.offsetEdges([edgeRef], 0, state.revision), /finite and nonzero/i);
  await assert.rejects(operations.offsetEdges([edgeRef], 2, "old-revision"), /stale reference/i);
  await assert.rejects(operations.deleteEdges([], state.revision), /at least one edge/i);
  await assert.rejects(operations.deleteEdges([edgeRef, edgeRef], state.revision), /edge references must be unique/i);
  await assert.rejects(operations.deleteEdges([edgeRef, { bodyId: 8, edgeId: "18e1" }], state.revision), /one body/i);
  await assert.rejects(operations.deleteEdges([{ bodyId: 7, edgeId: "missing" }], state.revision), /unknown current edge/i);
  await assert.rejects(operations.deleteEdges([edgeRef], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("inserts exact native split vertices along incident shell edges", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const vertices = [
    { id: 101, positionMm: [20, 10, 10] as [number, number, number], edgeIds: [], faceIds: ["17f1", "17f2", "17f3"] },
    { id: 102, positionMm: [0, 0, 0] as [number, number, number], edgeIds: [], faceIds: ["17f4", "17f5", "17f6"] },
  ];
  const body = { id: 7, versionId: 17, type: "Solid", name: "Block", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const references = [{ bodyId: 7, vertexId: 101 }, { bodyId: 7, vertexId: 102 }];

  await operations.offsetVertices(references, 5, state.revision);

  assert.deepEqual(call?.bindings, ["OffsetVertexFactory", "OffsetVertexCommand"]);
  assert.deepEqual(call?.values, [{ vertices: references, distance: 0.005 }]);
  assert.match(call?.source ?? "", /Snaps_ShellVertexSnap/);
  assert.match(call?.source ?? "", /factory\.vertices = selectedSnaps\.map\(snap => snap\.model\)/);
  assert.match(call?.source ?? "", /factory\._vertices\.views = selectedSnaps\.map/);
  assert.match(call?.source ?? "", /parentItem: snap\.item/);
  assert.match(call?.source ?? "", /new Command\(editor\)/);
});

test("rejects invalid native shell-vertex offsets before mutation", async () => {
  let mutations = 0;
  const vertex = { id: 101, positionMm: [20, 10, 10] as [number, number, number], edgeIds: [], faceIds: [] };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [vertex] };
  const sheet = { ...body, id: 8, versionId: 18, type: "Sheet", vertices: [{ ...vertex, id: 201 }] };
  const wire = { ...body, id: 9, versionId: 19, type: "Wire", vertices: [{ ...vertex, id: 301 }] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body, sheet, wire] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const reference = { bodyId: 7, vertexId: 101 };

  await assert.rejects(operations.offsetVertices([], 5, state.revision), /at least one shell vertex/i);
  await assert.rejects(operations.offsetVertices([reference, reference], 5, state.revision), /references must be unique/i);
  await assert.rejects(operations.offsetVertices([reference, { bodyId: 8, vertexId: 201 }], 5, state.revision), /one body/i);
  await assert.rejects(operations.offsetVertices([{ bodyId: 7, vertexId: 999 }], 5, state.revision), /current native B-Rep vertex/i);
  await assert.rejects(operations.offsetVertices([{ bodyId: 9, vertexId: 301 }], 5, state.revision), /Solid or Sheet/i);
  await assert.rejects(operations.offsetVertices([reference], 0, state.revision), /positive/i);
  await assert.rejects(operations.offsetVertices([reference], Number.NaN, state.revision), /positive/i);
  await assert.rejects(operations.offsetVertices([reference], 5, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("patterns exact native feature faces in rectangular and radial arrays", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const face = {
    id: "17f1", surfaceType: "Cylinder", planar: false,
    centerMm: [7, 15, 7.5] as [number, number, number], normal: [-1, 0, 0] as [number, number, number],
    radiusMm: 3, blendRadiusMm: null, axisOriginMm: [10, 15, 5] as [number, number, number], axisDirection: [0, 0, 1] as [number, number, number],
    boundsMm: { min: [7, 12, 5] as [number, number, number], max: [13, 18, 10] as [number, number, number] }, edgeIds: [],
  };
  const body = { id: 7, versionId: 17, type: "Solid", name: "Boss plate", boundsMm: null, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const faces = [{ bodyId: 7, faceId: "17f1" }];

  await operations.rectangularFacePattern(faces, [2, 0, 0], 3, 15, [0, 4, 0], 2, 10, state.revision);
  await operations.radialFacePattern(faces, [30, 30, 0], [0, 0, 2], 4, 360, state.revision);

  assert.deepEqual(calls.map((call) => call.bindings), [
    ["RectangularArrayFacesFactory", "RectangularArrayFacesCommand", "Vector3"],
    ["RadialArrayFacesFactory", "RadialArrayFacesCommand", "Vector3"],
  ]);
  assert.deepEqual(calls.map((call) => call.values), [
    [{ faces, direction1: [1, 0, 0], count1: 3, spacing1: 0.015, direction2: [0, 1, 0], count2: 2, spacing2: 0.01 }],
    [{ faces, center: [0.03, 0.03, 0], axis: [0, 0, 1], count: 4, radians: Math.PI * 2 }],
  ]);
  assert.match(calls[0]?.source ?? "", /factory\.shell = view/);
  assert.match(calls[0]?.source ?? "", /factory\.faces = selectedFaces/);
  assert.match(calls[0]?.source ?? "", /factory\.mode = 'spacing'/);
  assert.match(calls[1]?.source ?? "", /factory\.center = new Vector/);
  assert.match(calls[1]?.source ?? "", /factory\.mode = 'total'/);
  assert(calls.every((call) => call.source.includes("new Command(editor)")));
});

test("rejects invalid native face patterns before mutation", async () => {
  let mutations = 0;
  const face = { id: "17f1", surfaceType: "Plane", planar: true, centerMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 0] as [number, number, number] }, edgeIds: [] };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const other = { ...body, id: 8, versionId: 18, faceIds: ["18f1"], faces: [{ ...face, id: "18f1" }] };
  const wire = { ...body, id: 9, versionId: 19, type: "Wire", faceIds: ["19f1"], faces: [{ ...face, id: "19f1" }] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body, other, wire] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const faces = [{ bodyId: 7, faceId: "17f1" }];

  await assert.rejects(operations.rectangularFacePattern([], [1, 0, 0], 3, 10, [0, 1, 0], 1, 0, state.revision), /at least one face/i);
  await assert.rejects(operations.rectangularFacePattern([faces[0]!, faces[0]!], [1, 0, 0], 3, 10, [0, 1, 0], 1, 0, state.revision), /references must be unique/i);
  await assert.rejects(operations.rectangularFacePattern([faces[0]!, { bodyId: 8, faceId: "18f1" }], [1, 0, 0], 3, 10, [0, 1, 0], 1, 0, state.revision), /one body/i);
  await assert.rejects(operations.rectangularFacePattern([{ bodyId: 9, faceId: "19f1" }], [1, 0, 0], 3, 10, [0, 1, 0], 1, 0, state.revision), /Solid or Sheet/i);
  await assert.rejects(operations.rectangularFacePattern(faces, [0, 0, 0], 3, 10, [0, 1, 0], 1, 0, state.revision), /direction.*zero/i);
  await assert.rejects(operations.rectangularFacePattern(faces, [1, 0, 0], 1, 10, [0, 1, 0], 1, 0, state.revision), /count1/i);
  await assert.rejects(operations.rectangularFacePattern(faces, [1, 0, 0], 3, 0, [0, 1, 0], 1, 0, state.revision), /spacing1/i);
  await assert.rejects(operations.rectangularFacePattern(faces, [1, 0, 0], 3, 10, [2, 0, 0], 2, 10, state.revision), /must not be parallel/i);
  await assert.rejects(operations.rectangularFacePattern(faces, [1, 0, 0], 3, 10, [0, 1, 0], 2, 0, state.revision), /spacing2/i);
  await assert.rejects(operations.radialFacePattern(faces, [0, Number.NaN, 0], [0, 0, 1], 4, 360, state.revision), /center must be finite/i);
  await assert.rejects(operations.radialFacePattern(faces, [0, 0, 0], [0, 0, 0], 4, 360, state.revision), /axis.*zero/i);
  await assert.rejects(operations.radialFacePattern(faces, [0, 0, 0], [0, 0, 1], 1, 360, state.revision), /count/i);
  await assert.rejects(operations.radialFacePattern(faces, [0, 0, 0], [0, 0, 1], 4, 0, state.revision), /sweep/i);
  await assert.rejects(operations.radialFacePattern(faces, [0, 0, 0], [0, 0, 1], 4, 361, state.revision), /sweep/i);
  await assert.rejects(operations.radialFacePattern(faces, [0, 0, 0], [0, 0, 1], 4, 360, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("inserts exact native isoparametric edges into one current surface face", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const face = { id: "f1", surfaceType: "Cylinder", planar: false, centerMm: [0, 0, 5] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: 5, blendRadiusMm: null, axisOriginMm: [0, 0, 0] as [number, number, number], axisDirection: [0, 0, 1] as [number, number, number], boundsMm: { min: [-5, -5, 0] as [number, number, number], max: [5, 5, 10] as [number, number, number] }, edgeIds: [] };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: face.boundsMm, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.insertIsoparamEdges({ bodyId: 7, faceId: "f1" }, "v", 3, state.revision);

  assert.deepEqual(call?.bindings, ["IsoparamFactory"]);
  assert.deepEqual(call?.values, [{ faces: [{ bodyId: 7, faceId: "f1" }], count: 3, uOrV: false }]);
  assert.match(call?.source ?? "", /new this\.commands\.IsoparamCommand/);
  assert.match(call?.source ?? "", /factory\.toggleUV\(\)/);
});

test("rejects stale or invalid isoparametric face inputs before mutation", async () => {
  let mutations = 0;
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: ["f1"], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.insertIsoparamEdges({ bodyId: 7, faceId: "missing" }, "u", 1, state.revision), /current Solid or Sheet face/i);
  await assert.rejects(operations.insertIsoparamEdges({ bodyId: 7, faceId: "f1" }, "u", 0, state.revision), /between 1 and 1000/i);
  await assert.rejects(operations.insertIsoparamEdges({ bodyId: 7, faceId: "f1" }, "v", 2, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("extracts exact faces into separate native Sheet bodies", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const face = { id: "17f23", surfaceType: "Plane", planar: true, centerMm: [5, 5, 5] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 5] as [number, number, number], max: [10, 10, 5] as [number, number, number] }, edgeIds: [] };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.extractFaces([{ bodyId: 7, faceId: face.id }], state.revision);

  assert.deepEqual(call?.bindings, ["CreateSheetFromFacesFactory"]);
  assert.deepEqual(call?.values, [{ faces: [{ bodyId: 7, faceId: face.id }] }]);
  assert.match(call?.source ?? "", /factory\.faces = args\.faces\.map/);
  assert.match(call?.source ?? "", /CreateSolidFromFacesCommand/);
});

test("rejects stale and duplicate face extraction references before mutation", async () => {
  let mutations = 0;
  const face = { id: "17f23", surfaceType: "Plane", planar: true, centerMm: [5, 5, 5] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 5] as [number, number, number], max: [10, 10, 5] as [number, number, number] }, edgeIds: [] };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const ref = { bodyId: 7, faceId: face.id };

  await assert.rejects(operations.extractFaces([], state.revision), /at least one/i);
  await assert.rejects(operations.extractFaces([ref, ref], state.revision), /unique/i);
  await assert.rejects(operations.extractFaces([{ bodyId: 7, faceId: "missing" }], state.revision), /stale or unknown/i);
  await assert.rejects(operations.extractFaces([ref], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("extracts exact native body edges into Wire curves", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const edges = ["e1", "e2"].map((id) => ({ id, curveType: "Line", line: true, circle: false, lengthMm: 10, centerMm: [0, 0, 0] as [number, number, number], tangent: [1, 0, 0] as [number, number, number], boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 0, 0] as [number, number, number] }, faceIds: ["f1"], vertexIds: [] }));
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: ["f1"], edgeIds: edges.map((edge) => edge.id), faces: [], edges };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.extractEdges([{ bodyId: 7, edgeId: "e1" }, { bodyId: 7, edgeId: "e2" }], state.revision);

  assert.deepEqual(call?.bindings, ["CreateCurveFromEdgesFactory"]);
  assert.deepEqual(call?.values, [{ edges: [{ bodyId: 7, edgeId: "e1" }, { bodyId: 7, edgeId: "e2" }] }]);
  assert.match(call?.source ?? "", /DuplicateEdgeAndProjectCommand/);
  assert.match(call?.source ?? "", /factory\.edges = args\.edges\.map/);
});

test("rejects stale, duplicate, and missing edge extraction references before mutation", async () => {
  let mutations = 0;
  const edge = { id: "e1", curveType: "Line", line: true, circle: false, lengthMm: 10, centerMm: [0, 0, 0] as [number, number, number], tangent: [1, 0, 0] as [number, number, number], boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 0, 0] as [number, number, number] }, faceIds: ["f1"], vertexIds: [] };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: ["f1"], edgeIds: [edge.id], faces: [], edges: [edge] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const reference = { bodyId: 7, edgeId: edge.id };

  await assert.rejects(operations.extractEdges([], state.revision), /at least one/i);
  await assert.rejects(operations.extractEdges([reference, reference], state.revision), /unique/i);
  await assert.rejects(operations.extractEdges([{ bodyId: 7, edgeId: "missing" }], state.revision), /stale or unknown/i);
  await assert.rejects(operations.extractEdges([reference], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("unjoins exact faces from native Sheet shells", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const face = { id: "f1", surfaceType: "Plane", planar: true, centerMm: [5, 5, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 10, 0] as [number, number, number] }, edgeIds: [] };
  const sheet = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: null, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [sheet] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.unjoinFaces([{ bodyId: 7, faceId: "f1" }], state.revision);

  assert.deepEqual(call?.bindings, ["UnjoinFacesFactory"]);
  assert.deepEqual(call?.values, [{ faces: [{ bodyId: 7, faceId: "f1" }] }]);
  assert.match(call?.source ?? "", /UnjoinFacesCommand/);
  assert.match(call?.source ?? "", /factory\.faces = args\.faces\.map/);
});

test("rejects stale and duplicate face unjoin references before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const ref = { bodyId: 7, faceId: "f1" };

  await assert.rejects(operations.unjoinFaces([], state.revision), /at least one/i);
  await assert.rejects(operations.unjoinFaces([ref, ref], state.revision), /unique/i);
  await assert.rejects(operations.unjoinFaces([ref], state.revision), /stale or unknown/i);
  await assert.rejects(operations.unjoinFaces([ref], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("deletes exact faces through Plasticity's native face command", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const face = { id: "17f23", surfaceType: "Plane", planar: true, centerMm: [5, 5, 5] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 5] as [number, number, number], max: [10, 10, 5] as [number, number, number] }, edgeIds: [] };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.deleteFaces([{ bodyId: 7, faceId: face.id }], state.revision);

  assert.deepEqual(call?.bindings, ["DeleteFaceCommand", "DeleteFaceFactory"]);
  assert.deepEqual(call?.values, [{ faces: [{ bodyId: 7, faceId: face.id }] }]);
  assert.match(call?.source ?? "", /new Command\(this\)/);
  assert.match(call?.source ?? "", /factory\.faces = args\.faces\.map/);
});

test("rejects stale and duplicate face deletion references before mutation", async () => {
  let mutations = 0;
  const face = { id: "17f23", surfaceType: "Plane", planar: true, centerMm: [5, 5, 5] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 5] as [number, number, number], max: [10, 10, 5] as [number, number, number] }, edgeIds: [] };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const ref = { bodyId: 7, faceId: face.id };

  await assert.rejects(operations.deleteFaces([], state.revision), /at least one/i);
  await assert.rejects(operations.deleteFaces([ref, ref], state.revision), /unique/i);
  await assert.rejects(operations.deleteFaces([{ bodyId: 7, faceId: "missing" }], state.revision), /stale or unknown/i);
  await assert.rejects(operations.deleteFaces([ref], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("dissolves exact faces into adjacent native surfaces", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const face = { id: "f1", surfaceType: "Plane", planar: true, centerMm: [0, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 10, 0] as [number, number, number] }, edgeIds: [] };
  const solid = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.dissolveFaces([{ bodyId: 7, faceId: "f1" }], state.revision);

  assert.deepEqual(call?.bindings, ["DissolveFaceCommand", "DissolveFaceFactory"]);
  assert.deepEqual(call?.values, [{ faces: [{ bodyId: 7, faceId: "f1" }] }]);
  assert.match(call?.source ?? "", /new Command\(this\)/);
  assert.match(call?.source ?? "", /factory\.faces = args\.faces\.map/);
});

test("rejects stale and duplicate face dissolve references before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const ref = { bodyId: 7, faceId: "f1" };

  await assert.rejects(operations.dissolveFaces([], state.revision), /at least one/i);
  await assert.rejects(operations.dissolveFaces([ref, ref], state.revision), /unique/i);
  await assert.rejects(operations.dissolveFaces([ref], state.revision), /stale or unknown/i);
  await assert.rejects(operations.dissolveFaces([ref], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("passes a signed draft angle and separate neutral face reference", async () => {
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

  await operations.draftFaces(21, ["side-1", "side-2"], { bodyId: 21, faceId: "bottom" }, -3, state.revision);

  assert.deepEqual(values, [{
    id: 21,
    faceIds: ["side-1", "side-2"],
    referenceFace: { bodyId: 21, faceId: "bottom" },
    angleDegrees: -3,
  }]);
});

test("rejects drafting the neutral reference face before mutation", async () => {
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
    operations.draftFaces(21, ["bottom"], { bodyId: 21, faceId: "bottom" }, 3, state.revision),
    /neutral reference face/i,
  );
  assert.equal(mutated, false);
});

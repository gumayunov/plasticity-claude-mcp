import assert from "node:assert/strict";
import { test } from "node:test";
import { PlasticityOperations } from "./index.ts";
import type { PlasticityRuntime, RuntimeState } from "../runtime.ts";
import { emptyConstruction } from "./test-support.ts";

test("converts exact interior Wire vertices into native control vertices", async () => {
  let mutation: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [wire],
  };
  const listed = [
    { id: "7:42", bodyId: 7, bodyVersionId: 17, vertexId: 42, viewVersionId: "17v42", measurementSource: "native-brep" as const, positionMm: [10, 0, 0] as [number, number, number], endpoint: false, adjacentEdgeEntityIds: [98, 99] },
    { id: "7:43", bodyId: 7, bodyVersionId: 17, vertexId: 43, viewVersionId: "17v43", measurementSource: "native-brep" as const, positionMm: [10, 10, 0] as [number, number, number], endpoint: false, adjacentEdgeEntityIds: [99, 100] },
  ];
  const runtime = {
    async getState() { return state; },
    async readNative() { return listed; },
    async mutate(source: string, bindings: string[], values: unknown[]) { mutation = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const vertices = [{ bodyId: 7, vertexId: 42 }, { bodyId: 7, vertexId: 43 }];

  await operations.convertCurveVerticesToControlPoints(vertices, state.revision);

  assert.deepEqual(mutation?.bindings, ["ConvertVertexFactory", "ConvertCommand"]);
  assert.deepEqual(mutation?.values, [{ vertices }]);
  assert.match(mutation?.source ?? "", /factory\.vertices = selected/);
  assert.match(mutation?.source ?? "", /vertex\.IsSpur\(\)/);
});

test("rejects invalid curve vertices before native control-vertex conversion", async () => {
  let mutations = 0;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const solid = { id: 8, versionId: 18, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [wire, solid],
  };
  let listed = [{ id: "7:42", bodyId: 7, bodyVersionId: 17, vertexId: 42, viewVersionId: "17v42", measurementSource: "native-brep" as const, positionMm: [0, 0, 0] as [number, number, number], endpoint: true, adjacentEdgeEntityIds: [98] }];
  const runtime = { async getState() { return state; }, async readNative() { return listed; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const reference = { bodyId: 7, vertexId: 42 };

  await assert.rejects(operations.convertCurveVerticesToControlPoints([], state.revision), /at least one/i);
  await assert.rejects(operations.convertCurveVerticesToControlPoints([reference, reference], state.revision), /unique/i);
  await assert.rejects(operations.convertCurveVerticesToControlPoints([{ bodyId: 8, vertexId: 42 }], state.revision), /Wire bodies/i);
  await assert.rejects(operations.convertCurveVerticesToControlPoints([{ bodyId: 7, vertexId: 99 }], state.revision), /stale or unknown/i);
  await assert.rejects(operations.convertCurveVerticesToControlPoints([reference], state.revision), /interior or closed/i);
  listed = [{ ...listed[0]!, endpoint: false, adjacentEdgeEntityIds: [98] }];
  await assert.rejects(operations.convertCurveVerticesToControlPoints([reference], state.revision), /exactly two adjacent/i);
  await assert.rejects(operations.convertCurveVerticesToControlPoints([reference], "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("moves mixed native curve boundary vertices and interior control points in one history step", async () => {
  let mutation: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const inventory = [{
    id: 7,
    versionId: 17,
    positionSource: "native-control-handle" as const,
    boundaryVertices: [{ reference: { bodyId: 7, kind: "vertex" as const, pointId: 101 }, versionId: "17v101", positionMm: [0, 0, 0] as [number, number, number] }],
    interiorControlPoints: [{ reference: { bodyId: 7, kind: "control-point" as const, pointId: 2 }, versionId: "17c2", positionMm: [10, 20, 0] as [number, number, number] }],
  }];
  const runtime = {
    async getState() { return state; },
    async readNative() { return inventory; },
    async mutate(source: string, bindings: string[], values: unknown[]) { mutation = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const points = [
    { bodyId: 7, kind: "vertex" as const, pointId: 101 },
    { bodyId: 7, kind: "control-point" as const, pointId: 2 },
  ];

  await operations.moveCurveControlPoints(points, [0, 10, 5], state.revision);

  assert.deepEqual(mutation?.bindings, ["MultiMoveControlPointFactory", "MoveControlPointCommand"]);
  assert.deepEqual(mutation?.values, [{ points, delta: [0, 0.01, 0.005] }]);
  assert.match(mutation?.source ?? "", /factory\.vertices = vertices/);
  assert.match(mutation?.source ?? "", /factory\.cvs = cvs/);
  assert.match(mutation?.source ?? "", /factory\.move\.fromArray/);
});

test("slides native curve control points along their local positive or negative U direction", async () => {
  const mutations: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const inventory = [{ id: 7, versionId: 17, positionSource: "native-control-handle" as const, boundaryVertices: [], interiorControlPoints: [{ reference: { bodyId: 7, kind: "control-point" as const, pointId: 2 }, versionId: "17c2", positionMm: [10, 20, 0] as [number, number, number], slideDirections: { positiveU: [1, 0, 0] as [number, number, number], negativeU: [-1, 0, 0] as [number, number, number] } }] }];
  const runtime = {
    async getState() { return state; },
    async readNative() { return inventory; },
    async mutate(source: string, bindings: string[], values: unknown[]) { mutations.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const points = [{ bodyId: 7, kind: "control-point" as const, pointId: 2 }];

  await operations.slideCurveControlPoints(points, "positive-u", 5, state.revision);
  await operations.slideCurveControlPoints(points, "negative-u", 2.5, state.revision);

  assert.deepEqual(mutations.map((mutation) => mutation.bindings), [
    ["MultiSlideControlPointFactory", "MoveControlPointCommand"],
    ["MultiSlideControlPointFactory", "MoveControlPointCommand"],
  ]);
  assert.deepEqual(mutations.map((mutation) => mutation.values), [
    [{ points, direction: "posU", distance: 0.005 }],
    [{ points, direction: "negU", distance: 0.0025 }],
  ]);
  assert.match(mutations[0]?.source ?? "", /factory\.direction = args\.direction/);
  assert.match(mutations[0]?.source ?? "", /factory\.distance = args\.distance/);
});

test("rotates and scales native curve control points around explicit world pivots", async () => {
  const mutations: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const inventory = [{ id: 7, versionId: 17, positionSource: "native-control-handle" as const, boundaryVertices: [], interiorControlPoints: [{ reference: { bodyId: 7, kind: "control-point" as const, pointId: 2 }, versionId: "17c2", positionMm: [10, 20, 0] as [number, number, number] }] }];
  const runtime = {
    async getState() { return state; },
    async readNative() { return inventory; },
    async mutate(source: string, bindings: string[], values: unknown[]) { mutations.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const points = [{ bodyId: 7, kind: "control-point" as const, pointId: 2 }];

  await operations.rotateCurveControlPoints(points, [10, 20, 0], [0, 0, 2], 90, state.revision);
  await operations.scaleCurveControlPoints(points, [10, 20, 0], [2, 0.5, 1], state.revision);

  assert.deepEqual(mutations[0]?.bindings, ["MultiRotateControlPointFactory", "RotateControlPointCommand", "Vector3", "Quaternion"]);
  assert.deepEqual(mutations[0]?.values, [{ points, pivot: [0.01, 0.02, 0], axis: [0, 0, 1], radians: Math.PI / 2 }]);
  assert.match(mutations[0]?.source ?? "", /factory\.rotation\.copy/);
  assert.deepEqual(mutations[1]?.bindings, ["MultiScaleControlPointFactory", "ScaleControlPointCommand"]);
  assert.deepEqual(mutations[1]?.values, [{ points, pivot: [0.01, 0.02, 0], factors: [2, 0.5, 1] }]);
  assert.match(mutations[1]?.source ?? "", /factory\.scale\.fromArray/);
});

test("deletes current interior B-Spline control points from one Wire", async () => {
  let mutation: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const inventory = [{ id: 7, versionId: 17, positionSource: "native-control-handle" as const, boundaryVertices: [], interiorControlPoints: [{ reference: { bodyId: 7, kind: "control-point" as const, pointId: 2 }, versionId: "17c2", positionMm: [10, 20, 0] as [number, number, number] }] }];
  const runtime = { async getState() { return state; }, async readNative() { return inventory; }, async mutate(source: string, bindings: string[], values: unknown[]) { mutation = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const points = [{ bodyId: 7, kind: "control-point" as const, pointId: 2 }];

  await operations.deleteCurveControlPoints(points, state.revision);

  assert.deepEqual(mutation?.bindings, ["DeleteControlPointFactory", "DeleteControlPointCommand"]);
  assert.deepEqual(mutation?.values, [{ points }]);
  assert.match(mutation?.source ?? "", /factory\.curve = view/);
  assert.match(mutation?.source ?? "", /factory\.cvs = cvs/);
});

test("rejects stale, duplicate, missing, and zero-delta curve control-point moves before mutation", async () => {
  let mutations = 0;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const inventory = [{ id: 7, versionId: 17, positionSource: "native-control-handle" as const, boundaryVertices: [], interiorControlPoints: [{ reference: { bodyId: 7, kind: "control-point" as const, pointId: 2 }, versionId: "17c2", positionMm: [10, 20, 0] as [number, number, number] }] }];
  const runtime = { async getState() { return state; }, async readNative() { return inventory; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const point = { bodyId: 7, kind: "control-point" as const, pointId: 2 };

  await assert.rejects(operations.moveCurveControlPoints([], [1, 0, 0], state.revision), /at least one/i);
  await assert.rejects(operations.moveCurveControlPoints([point, point], [1, 0, 0], state.revision), /unique/i);
  await assert.rejects(operations.moveCurveControlPoints([point], [0, 0, 0], state.revision), /nonzero/i);
  await assert.rejects(operations.moveCurveControlPoints([point], [1, 0, 0], "old-revision"), /stale reference/i);
  await assert.rejects(operations.moveCurveControlPoints([{ ...point, pointId: 99 }], [1, 0, 0], state.revision), /unknown current/i);
  await assert.rejects(operations.slideCurveControlPoints([point], "positive-u", 0, state.revision), /positive/i);
  await assert.rejects(operations.slideCurveControlPoints([point], "sideways" as "positive-u", 1, state.revision), /unsupported/i);
  await assert.rejects(operations.slideCurveControlPoints([point], "positive-u", 1, state.revision), /directions are unavailable/i);
  await assert.rejects(operations.rotateCurveControlPoints([point], [0, 0, 0], [0, 0, 0], 90, state.revision), /zero|normalize/i);
  await assert.rejects(operations.rotateCurveControlPoints([point], [0, 0, 0], [0, 0, 1], 0, state.revision), /nonzero/i);
  await assert.rejects(operations.scaleCurveControlPoints([point], [0, 0, 0], [1, 0, 1], state.revision), /positive/i);
  await assert.rejects(operations.scaleCurveControlPoints([point], [0, 0, 0], [1, 1, 1], state.revision), /change/i);
  await assert.rejects(operations.deleteCurveControlPoints([{ bodyId: 7, kind: "vertex", pointId: 3 }], state.revision), /unknown current|only interior/i);
  assert.equal(mutations, 0);
});

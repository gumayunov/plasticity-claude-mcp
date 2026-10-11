import assert from "node:assert/strict";
import { test } from "node:test";
import { PlasticityOperations } from "./index.ts";
import type { PlasticityRuntime, RuntimeState } from "../runtime.ts";
import { emptyConstruction } from "./test-support.ts";

test("lists revision-bound native regions without mutation", async () => {
  let mutated = false;
  const state: RuntimeState = {
    targetId: "window-1",
    title: "Untitled - Plasticity",
    documentToken: "document-1",
    revision: "current-revision",
    dbVersion: 1,
    undoDepth: 0,
    redoDepth: 0,
    regions: [{
      id: "5r42",
      entityId: 42,
      islandVersionId: 5,
      sketchId: 3,
      sketchWireIds: [7],
      measurementSource: "render-mesh",
      displayBoundsMm: { min: [0, 0, 0], max: [20, 10, 0] },
    }],
    construction: emptyConstruction,
    bodies: [],
  };
  const runtime = {
    async getState() { return state; },
    async mutate() { mutated = true; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  assert.deepEqual(await operations.listRegions(), {
    documentToken: state.documentToken,
    revision: state.revision,
    regions: state.regions,
  });
  assert.equal(mutated, false);
});

test("lists revision-bound native curve fragments without mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [],
  };
  const fragments = [{
    id: "12s34", bodyId: 7, ancestorVersionId: 10, fragmentViewId: 12, entityId: 34,
    measurementSource: "native-brep" as const,
    startMm: [-10, 0, 0] as [number, number, number],
    midpointMm: [-5, 0, 0] as [number, number, number],
    endMm: [0, 0, 0] as [number, number, number],
    lengthMm: 10,
  }];
  const runtime = {
    async getState() { return state; },
    async read() { return fragments; },
    async mutate() { mutations += 1; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  assert.deepEqual(await operations.listCurveFragments(), {
    documentToken: state.documentToken,
    revision: state.revision,
    fragments,
  });
  assert.equal(mutations, 0);
});

test("lists revision-bound native curve endpoints without mutation", async () => {
  let mutations = 0;
  let readSource = "";
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [],
  };
  const endpoints = [{
    id: "10v42", bodyId: 7, bodyVersionId: 10, entityId: 42,
    measurementSource: "native-brep" as const,
    positionMm: [10, 0, 0] as [number, number, number],
  }];
  const runtime = {
    async getState() { return state; }, async read(source: string) { readSource = source; return endpoints; },
    async mutate() { mutations += 1; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  assert.deepEqual(await operations.listCurveEndpoints(), {
    documentToken: state.documentToken,
    revision: state.revision,
    endpoints,
  });
  assert.match(readSource, /model\.IsSpur\(\)/);
  assert.equal(mutations, 0);
});

test("lists every exact native Wire vertex with adjacent segment identities", async () => {
  let readCall: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [],
  };
  const vertices = [{
    id: "7:42", bodyId: 7, bodyVersionId: 17, vertexId: 42, viewVersionId: "17v42",
    measurementSource: "native-brep" as const, positionMm: [10, 20, 0] as [number, number, number],
    endpoint: false, adjacentEdgeEntityIds: [98, 99],
  }];
  const runtime = {
    async getState() { return state; },
    async readNative(source: string, bindings: string[], values: unknown[]) { readCall = { source, bindings, values }; return vertices; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  assert.deepEqual(await operations.listCurveVertices(), {
    documentToken: state.documentToken,
    revision: state.revision,
    vertices,
  });
  assert.deepEqual(readCall?.bindings, []);
  assert.match(readCall?.source ?? "", /item\.model\?\.GetEdges/);
  assert.match(readCall?.source ?? "", /edge\.GetVertices/);
  assert.match(readCall?.source ?? "", /vertex\.GetPoint/);
});

test("lists exact native Wire segment directions without mutation", async () => {
  let readCall: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const expected = [{ id: 7, versionId: 17, measurementSource: "native-brep", closed: false, segments: [{ entityId: 99, startMm: [0, 0, 0], endMm: [10, 0, 0], startTangent: [1, 0, 0], endTangent: [1, 0, 0], lengthMm: 10 }] }];
  const runtime = { async getState() { return state; }, async readNative(source: string, bindings: string[], values: unknown[]) { readCall = { source, bindings, values }; return expected; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  const result = await operations.listCurveDirections();

  assert.deepEqual(readCall?.bindings, []);
  assert.deepEqual(readCall?.values, []);
  assert.match(readCall?.source ?? "", /GetPointAndTangent\(0\)/);
  assert.match(readCall?.source ?? "", /GetPointAndTangent\(1\)/);
  assert.deepEqual(result, { documentToken: state.documentToken, revision: state.revision, curves: expected });
});

test("lists exact circle basis and trim samples for native circular Wire segments", async () => {
  let readSource = "";
  const circleGeometry = {
    centerMm: [1, 2, 3] as [number, number, number],
    radiusMm: 5,
    normal: [0, 0, 1] as [number, number, number],
    reference: [1, 0, 0] as [number, number, number],
    startMm: [6, 2, 3] as [number, number, number],
    midpointMm: [1, 7, 3] as [number, number, number],
    endMm: [-4, 2, 3] as [number, number, number],
  };
  const curves = [{
    id: 7, versionId: 17, measurementSource: "native-brep" as const, closed: false,
    segments: [{ entityId: 99, curveType: "Circle", startMm: circleGeometry.startMm, endMm: circleGeometry.endMm, startTangent: [0, 1, 0], endTangent: [0, -1, 0], lengthMm: 5 * Math.PI, circleGeometry }],
  }];
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = { async getState() { return state; }, async readNative(source: string) { readSource = source; return curves; } } as unknown as PlasticityRuntime;
  const result = await new PlasticityOperations(runtime).listCurveDirections();

  assert.match(readSource, /edge\.IsCircle\(\)/);
  assert.match(readSource, /basis\.Ref/);
  assert.deepEqual(result.curves[0]?.segments[0]?.circleGeometry, circleGeometry);
});

test("evaluates exact points and tangents at normalized Wire segment parameters", async () => {
  let readCall: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const samples = [{ reference: { bodyId: 7, segmentEntityId: 99, normalizedParameter: 0.5 }, bodyVersionId: 17, curveType: "BCurve", measurementSource: "native-brep" as const, positionMm: [12, 8, 0], tangent: [1, 0, 0] }];
  const runtime = { async getState() { return state; }, async readNative(source: string, bindings: string[], values: unknown[]) { readCall = { source, bindings, values }; return samples; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  const result = await operations.evaluateCurveSegments([{ bodyId: 7, segmentEntityId: 99, normalizedParameter: 0.5 }], state.revision);

  assert.deepEqual(result, { documentToken: state.documentToken, revision: state.revision, samples });
  assert.deepEqual(readCall?.bindings, []);
  assert.deepEqual(readCall?.values, [{ samples: [{ bodyId: 7, segmentEntityId: 99, normalizedParameter: 0.5 }] }]);
  assert.match(readCall?.source ?? "", /GetPointAndTangent\(reference\.normalizedParameter\)/);
  assert.match(readCall?.source ?? "", /measurementSource: 'native-brep'/);
});

test("rejects invalid curve segment samples before native reads", async () => {
  let reads = 0;
  const solid = { id: 8, versionId: 18, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid] };
  const runtime = { async getState() { return state; }, async readNative() { reads += 1; return []; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.evaluateCurveSegments([], state.revision), /at least one/i);
  await assert.rejects(operations.evaluateCurveSegments([{ bodyId: 8, segmentEntityId: 99, normalizedParameter: 0.5 }], state.revision), /current Wire/i);
  const wireState = { ...state, bodies: [{ ...solid, id: 7, type: "Wire" }] };
  const wireRuntime = { async getState() { return wireState; }, async readNative() { reads += 1; return []; } } as unknown as PlasticityRuntime;
  const wireOperations = new PlasticityOperations(wireRuntime);
  await assert.rejects(wireOperations.evaluateCurveSegments([{ bodyId: 7, segmentEntityId: 0, normalizedParameter: 0.5 }], wireState.revision), /positive integer/i);
  await assert.rejects(wireOperations.evaluateCurveSegments([{ bodyId: 7, segmentEntityId: 99, normalizedParameter: 1.1 }], wireState.revision), /0 to 1/i);
  await assert.rejects(wireOperations.evaluateCurveSegments([
    { bodyId: 7, segmentEntityId: 99, normalizedParameter: 0.5 },
    { bodyId: 7, segmentEntityId: 99, normalizedParameter: 0.5 },
  ], wireState.revision), /unique/i);
  assert.equal(reads, 0);
});

test("inspects compact exact native curve degree, spans, and control-point counts", async () => {
  let readCall: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const curves = [{
    id: 7,
    versionId: 17,
    measurementSource: "native-brep" as const,
    segments: [
      { entityId: 99, curveType: "BCurve", lengthMm: 42, degree: 5, controlPointCount: 8, spanCount: 3, activeSpanCount: 3, distinctKnotCount: 4, knots: [
        { normalizedParameter: 0, multiplicity: 6, withinSegment: true },
        { normalizedParameter: 0.3, multiplicity: 1, withinSegment: true },
        { normalizedParameter: 0.65, multiplicity: 1, withinSegment: true },
        { normalizedParameter: 1, multiplicity: 6, withinSegment: true },
      ], rational: false, periodic: false, circle: null },
      { entityId: 100, curveType: "Circle", lengthMm: 31.4159265359, degree: null, controlPointCount: null, spanCount: null, activeSpanCount: null, distinctKnotCount: null, knots: null, rational: null, periodic: null, circle: { centerMm: [100, 100, 0], radiusMm: 5, normal: [0, 0, 1] } },
    ],
  }];
  const runtime = {
    async getState() { return state; },
    async readNative(source: string, bindings: string[], values: unknown[]) { readCall = { source, bindings, values }; return curves; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  const result = await operations.inspectCurveStructure([7], state.revision);

  assert.deepEqual(result, { documentToken: state.documentToken, revision: state.revision, curves });
  assert.deepEqual(readCall?.bindings, []);
  assert.deepEqual(readCall?.values, [{ ids: [7] }]);
  assert.match(readCall?.source ?? "", /GetCurve\(\)/);
  assert.match(readCall?.source ?? "", /GetInfo/);
  assert.match(readCall?.source ?? "", /edge\.Normalize\(nativeParameter\)/);
  assert.match(readCall?.source ?? "", /numSpans/);
  assert.match(readCall?.source ?? "", /activeSpanCount/);
  assert.match(readCall?.source ?? "", /info\.basis\.Location/);
  assert.match(readCall?.source ?? "", /mm\(info\.radius\)/);
});

test("rejects stale, duplicate, and non-Wire curve structure references before native reads", async () => {
  let reads = 0;
  const solid = { id: 8, versionId: 18, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid] };
  const runtime = { async getState() { return state; }, async readNative() { reads += 1; return []; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.inspectCurveStructure([], state.revision), /at least one/i);
  await assert.rejects(operations.inspectCurveStructure([7, 7], state.revision), /unique/i);
  await assert.rejects(operations.inspectCurveStructure([7], state.revision), /current Wire/i);
  await assert.rejects(operations.inspectCurveStructure([8], state.revision), /current Wire/i);
  await assert.rejects(operations.inspectCurveStructure([8], "old-revision"), /stale reference/i);
  await assert.rejects(operations.inspectCurvePlanarity([], state.revision), /at least one/i);
  await assert.rejects(operations.inspectCurvePlanarity([8, 8], state.revision), /unique/i);
  await assert.rejects(operations.inspectCurvePlanarity([8], state.revision), /current Wire/i);
  await assert.rejects(operations.inspectCurvePlanarity([8], "old-revision"), /stale reference/i);
  assert.equal(reads, 0);
});

test("asks the native kernel for exact Wire planarity", async () => {
  let readCall: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const curves = [{ id: 7, versionId: 17, measurementSource: "native-brep" as const, planar: true, plane: { originMm: [0, 0, 5], normal: [0, 0, 1] } }];
  const runtime = { async getState() { return state; }, async readNative(source: string, bindings: string[], values: unknown[]) { readCall = { source, bindings, values }; return curves; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  assert.deepEqual(await operations.inspectCurvePlanarity([7], state.revision), { documentToken: state.documentToken, revision: state.revision, curves });
  assert.deepEqual(readCall?.bindings, []);
  assert.deepEqual(readCall?.values, [{ ids: [7] }]);
  assert.match(readCall?.source ?? "", /FindPlanarBasis/);
  assert.match(readCall?.source ?? "", /basis\.Location/);
});

test("lists native Wire boundary vertices and interior control points without mutation", async () => {
  let readCall: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  const curves = [{
    id: 7,
    versionId: 17,
    positionSource: "native-control-handle" as const,
    boundaryVertices: [{ reference: { bodyId: 7, kind: "vertex" as const, pointId: 101 }, versionId: "17v101", positionMm: [0, 0, 0] as [number, number, number], slideDirections: { positiveU: [1, 0, 0] as [number, number, number], negativeU: [-1, 0, 0] as [number, number, number] } }],
    interiorControlPoints: [{ reference: { bodyId: 7, kind: "control-point" as const, pointId: 1 }, versionId: "17c1", positionMm: [10, 20, 0] as [number, number, number], slideDirections: { positiveU: [0, 1, 0] as [number, number, number], negativeU: [0, -1, 0] as [number, number, number] } }],
  }];
  const runtime = {
    async getState() { return state; },
    async readNative(source: string, bindings: string[], values: unknown[]) { readCall = { source, bindings, values }; return curves; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  assert.deepEqual(await operations.listCurveControlPoints([7], state.revision), {
    documentToken: state.documentToken,
    revision: state.revision,
    curves,
  });
  assert.deepEqual(readCall?.bindings, ["MultiSlideControlPointFactory"]);
  assert.deepEqual(readCall?.values, [{ ids: [7] }]);
  assert.match(readCall?.source ?? "", /item\.view\.vertices/);
  assert.match(readCall?.source ?? "", /item\.view\.cvs/);
  assert.match(readCall?.source ?? "", /factory\.orientation\.posU/);
  assert.match(readCall?.source ?? "", /native-control-handle/);
});

test("lists exact revision-bound intersections between user Wire bodies", async () => {
  let mutations = 0;
  let readSource = "";
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [],
  };
  const intersections = [{
    id: "10:42@0.01|11:43@0.02",
    bodyIds: [7, 8] as [number, number],
    bodyVersionIds: [10, 11] as [number, number],
    edgeEntityIds: [42, 43] as [number, number],
    measurementSource: "native-brep" as const,
    positionMm: [5, 6, 0] as [number, number, number],
  }];
  const runtime = {
    async getState() { return state; }, async read(source: string) { readSource = source; return intersections; },
    async mutate() { mutations += 1; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  assert.deepEqual(await operations.listCurveIntersections(), {
    documentToken: state.documentToken,
    revision: state.revision,
    intersections,
  });
  assert.match(readSource, /this\.crosses\.crosses/);
  assert.match(readSource, /lookupStableId/);
  assert.equal(mutations, 0);
});

test("reads compact exact native surface structure for current faces", async () => {
  const face = { id: "f1", surfaceType: "BSurf", planar: false, centerMm: [10, 10, 5] as [number, number, number], normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null, boundsMm: { min: [0, 0, 0] as [number, number, number], max: [20, 20, 10] as [number, number, number] }, edgeIds: [] };
  const body = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: face.boundsMm, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const expected = [{
    bodyId: 7, faceId: "f1", bodyVersionId: 17, measurementSource: "native-brep" as const,
    surfaceType: "BSurf", trimmed: true,
    faceParameterBounds: { uMin: -0.01, uMax: 0.01, vMin: -0.005, vMax: 0 },
    naturalParameterBounds: { uMin: -0.01, uMax: 0.01, vMin: -0.005, vMax: 0.012 },
    bSpline: { uDegree: 3, vDegree: 3, uSpanCount: 3, vSpanCount: 2, uControlPointCount: 6, vControlPointCount: 5, rational: false },
  }];
  let readCall: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const runtime = {
    async getState() { return state; },
    async readNative(source: string, bindings: string[], values: unknown[]) { readCall = { source, bindings, values }; return expected; },
  } as unknown as PlasticityRuntime;

  const result = await new PlasticityOperations(runtime).inspectSurfaceStructure([{ bodyId: 7, faceId: "f1" }], state.revision);

  assert.deepEqual(result, { documentToken: state.documentToken, revision: state.revision, surfaces: expected });
  assert.deepEqual(readCall?.bindings, []);
  assert.deepEqual(readCall?.values, [{ faces: [{ bodyId: 7, faceId: "f1" }] }]);
  assert.match(readCall?.source ?? "", /surface\.GetUVBox/);
  assert.match(readCall?.source ?? "", /surface\.GetInfo/);
  assert.match(readCall?.source ?? "", /face\.IsUntrimmed/);
});

test("rejects stale, duplicate, and non-surface references before native surface inspection", async () => {
  let reads = 0;
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const sheet = { ...wire, id: 8, versionId: 18, type: "Sheet", faceIds: ["f1"], faces: [{ id: "f1", surfaceType: "BSurf" }] };
  const state = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire, sheet] } as unknown as RuntimeState;
  const runtime = { async getState() { return state; }, async readNative() { reads += 1; return []; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const face = { bodyId: 8, faceId: "f1" };

  await assert.rejects(operations.inspectSurfaceStructure([], state.revision), /at least one face/i);
  await assert.rejects(operations.inspectSurfaceStructure([face, face], state.revision), /face references must be unique/i);
  await assert.rejects(operations.inspectSurfaceStructure([{ bodyId: 7, faceId: "f1" }], state.revision), /unknown current face/i);
  await assert.rejects(operations.inspectSurfaceStructure([{ bodyId: 8, faceId: "missing" }], state.revision), /unknown current face/i);
  await assert.rejects(operations.inspectSurfaceStructure([face], "old-revision"), /stale reference/i);
  assert.equal(reads, 0);
});

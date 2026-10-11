import assert from "node:assert/strict";
import { test } from "node:test";
import { PlasticityOperations } from "../operations.ts";
import type { PlasticityRuntime, RuntimeState } from "../runtime.ts";
import { emptyConstruction } from "./test-support.ts";

test("creates and removes a native viewport section through Plasticity shading state", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const initial = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [], sectionAnalyses: [] } as unknown as RuntimeState;
  const created = { ...initial, sectionAnalyses: [{ id: 3, name: "Mid section", originMm: [0, 0, 5], normal: [0, 0, 1], visible: true, registeredViewportCount: 1 }] } as unknown as RuntimeState;
  let state = initial;
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); state = calls.length === 1 ? created : initial; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  const afterCreate = await operations.createSectionAnalysis([0, 0, 5], [0, 0, 2], undefined, "Mid section", initial.revision);
  const afterDelete = await operations.deleteSectionAnalysis(3, created.revision);

  assert.deepEqual(afterCreate.sectionAnalyses, created.sectionAnalyses);
  assert.deepEqual(afterDelete.sectionAnalyses, []);
  assert.deepEqual(calls[0]?.bindings, ["SectionAnalysisFactory", "Vector3", "Matrix4"]);
  assert.deepEqual(calls[0]?.values, [{ point: [0, 0, 0.005], normal: [0, 0, 1], xDirection: [1, 0, 0], name: "Mid section" }]);
  assert.match(calls[0]?.source ?? "", /section\.plane\.setFromNormalAndCoplanarPoint\(normal, point\)/);
  assert.match(calls[0]?.source ?? "", /this\.shading\.section = section/);
  assert.doesNotMatch(calls[0]?.source ?? "", /clippingPass|SectionDatabase/);
  assert.match(calls[0]?.source ?? "", /viewport\.setNeedsRender/);
  assert.deepEqual(calls[1]?.bindings, []);
  assert.deepEqual(calls[1]?.values, [{ id: 3 }]);
  assert.match(calls[1]?.source ?? "", /this\.shading\.section = null/);
  assert.doesNotMatch(calls[1]?.source ?? "", /clippingPass|SectionDatabase/);
});

test("rejects creating a second active section analysis", async () => {
  let mutations = 0;
  const state = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [], sectionAnalyses: [{ id: 3, name: null, originMm: [0, 0, 5], normal: [0, 0, 1], visible: true, registeredViewportCount: 1 }] } as unknown as RuntimeState;
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.createSectionAnalysis([0, 0, 0], [0, 0, 1], undefined, undefined, state.revision), /already has an active section/i);
  assert.equal(mutations, 0);
});

test("rejects stale, degenerate, and unknown section analysis operations before mutation", async () => {
  let mutations = 0;
  const state = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [], sectionAnalyses: [{ id: 3, name: null, originMm: [0, 0, 5], normal: [0, 0, 1], visible: true, registeredViewportCount: 1 }] } as unknown as RuntimeState;
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.createSectionAnalysis([0, 0, 0], [0, 0, 1], undefined, undefined, "old"), /stale reference/i);
  await assert.rejects(operations.createSectionAnalysis([0, 0, 0], [0, 0, 0], undefined, undefined, state.revision), /normal/i);
  await assert.rejects(operations.createSectionAnalysis([0, 0, 0], [0, 0, 1], [0, 0, 2], undefined, state.revision), /x direction/i);
  await assert.rejects(operations.deleteSectionAnalysis(99, state.revision), /unknown current section analysis/i);
  assert.equal(mutations, 0);
});

test("creates a native persistent distance measurement between exact vertices", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const body = {
    id: 7, versionId: 17, type: "Solid", name: "Measured", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [],
    vertices: [
      { id: 101, positionMm: [0, 0, 0] as [number, number, number], edgeIds: [], faceIds: [] },
      { id: 102, positionMm: [20, 0, 0] as [number, number, number], edgeIds: [], faceIds: [] },
    ],
  };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body], measurements: [] };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.createVertexDistanceMeasurement(
    { bodyId: 7, vertexId: 101 },
    { bodyId: 7, vertexId: 102 },
    "Overall width",
    state.revision,
  );

  assert.deepEqual(call?.bindings, ["PointToPointMeasurementFactory"]);
  assert.deepEqual(call?.values, [{ vertices: [{ bodyId: 7, vertexId: 101 }, { bodyId: 7, vertexId: 102 }], name: "Overall width" }]);
  assert.match(call?.source ?? "", /Snaps_ShellVertexSnap/);
  assert.match(call?.source ?? "", /new this\.commands\.MeasureDistanceCommand\(this\)/);
  assert.match(call?.source ?? "", /measurements\.update\(\[measurement\], \[\], \[\]\)/);
  assert.match(call?.source ?? "", /viewport\.setNeedsRender\(\)/);
});

test("creates a native persistent distance measurement between topology points", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const body = {
    id: 7, versionId: 17, type: "Solid", name: "Measured", boundsMm: null,
    faceIds: ["17f1"], edgeIds: ["17e1"],
    faces: [{ id: "17f1", centerMm: [10, 5, 5], normal: [0, 0, 1], planar: true }],
    edges: [{ id: "17e1", centerMm: [10, 0, 5], tangent: [1, 0, 0], line: true }],
    vertices: [],
  };
  const state = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body], measurements: [] } as unknown as RuntimeState;
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;

  await new PlasticityOperations(runtime).createTopologyDistanceMeasurement(
    { type: "face-center", bodyId: 7, faceId: "17f1" },
    { type: "edge-midpoint", bodyId: 7, edgeId: "17e1" },
    "Face to edge",
    state.revision,
  );

  assert.deepEqual(call?.bindings, ["PointToPointMeasurementFactory"]);
  assert.deepEqual(call?.values, [{
    points: [
      { type: "face-center", bodyId: 7, faceId: "17f1" },
      { type: "edge-midpoint", bodyId: 7, edgeId: "17e1" },
    ],
    name: "Face to edge",
  }]);
  assert.match(call?.source ?? "", /Snaps_FaceCenterPointSnap/);
  assert.match(call?.source ?? "", /candidate\.faceSnap\?\.model\?\.Id/);
  assert.match(call?.source ?? "", /EdgePointSnap/);
  assert.match(call?.source ?? "", /factory\.p1\(snaps\[0\]\.position, snaps\[0\]\)/);
  assert.match(call?.source ?? "", /factory\.p2\(snaps\[1\]\.position, snaps\[1\]\)/);
  assert.match(call?.source ?? "", /viewport\.setNeedsRender\(\)/);
});

test("rejects stale and missing persistent topology-distance references before mutation", async () => {
  let mutations = 0;
  const body = {
    id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null,
    faceIds: ["17f1"], edgeIds: ["17e1"],
    faces: [{ id: "17f1", centerMm: [0, 0, 0], normal: [0, 0, 1], planar: true }],
    edges: [{ id: "17e1", centerMm: [1, 0, 0], tangent: [1, 0, 0], line: true }],
    vertices: [{ id: 101, positionMm: [0, 1, 0], edgeIds: [], faceIds: [] }],
  };
  const wire = {
    id: 8, versionId: 18, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [],
    vertices: [{ id: 201, positionMm: [0, 0, 0], edgeIds: [], faceIds: [] }],
  };
  const state = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body, wire], measurements: [] } as unknown as RuntimeState;
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.createTopologyDistanceMeasurement(
    { type: "face-center", bodyId: 7, faceId: "17f1" },
    { type: "edge-midpoint", bodyId: 7, edgeId: "17e1" },
    undefined,
    "old-revision",
  ), /stale reference/i);
  await assert.rejects(operations.createTopologyDistanceMeasurement(
    { type: "face-center", bodyId: 7, faceId: "missing" },
    { type: "vertex", bodyId: 7, vertexId: 101 },
    undefined,
    state.revision,
  ), /unknown current face/i);
  await assert.rejects(operations.createTopologyDistanceMeasurement(
    { type: "edge-midpoint", bodyId: 7, edgeId: "missing" },
    { type: "vertex", bodyId: 7, vertexId: 101 },
    undefined,
    state.revision,
  ), /unknown current edge/i);
  await assert.rejects(operations.createTopologyDistanceMeasurement(
    { type: "vertex", bodyId: 8, vertexId: 201 },
    { type: "vertex", bodyId: 7, vertexId: 101 },
    undefined,
    state.revision,
  ), /Solid or Sheet/i);
  assert.equal(mutations, 0);
});

test("creates a native persistent radius measurement on an exact circular edge", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const circularEdge = { id: "17e1", curveType: "Circle", circle: true, line: false, faceIds: ["17f1"] };
  const body = {
    id: 7, versionId: 17, type: "Solid", name: "Measured", boundsMm: null, faceIds: ["17f1"], edgeIds: [circularEdge.id],
    faces: [], edges: [circularEdge], vertices: [],
  };
  const state = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body], measurements: [] } as unknown as RuntimeState;
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;

  await new PlasticityOperations(runtime).createRadiusMeasurement({ bodyId: 7, edgeId: circularEdge.id }, "Outer radius", state.revision);

  assert.deepEqual(call?.bindings, ["RadialMeasurementFactory"]);
  assert.deepEqual(call?.values, [{ edge: { bodyId: 7, edgeId: circularEdge.id }, name: "Outer radius" }]);
  assert.match(call?.source ?? "", /EdgePointSnap/);
  assert.match(call?.source ?? "", /new this\.commands\.MeasureRadiusCommand\(this\)/);
  assert.match(call?.source ?? "", /factory\.snap = snap/);
  assert.match(call?.source ?? "", /measurements\.update\(\[measurement\], \[\], \[\]\)/);
  assert.match(call?.source ?? "", /viewport\.setNeedsRender\(\)/);
});

test("rejects stale, missing, and noncircular persistent radius references before mutation", async () => {
  let mutations = 0;
  const lineEdge = { id: "17e1", curveType: "Line", circle: false, line: true, faceIds: ["17f1"] };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: ["17f1"], edgeIds: [lineEdge.id], faces: [], edges: [lineEdge], vertices: [] };
  const wire = { id: 8, versionId: 18, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] };
  const state = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body, wire], measurements: [] } as unknown as RuntimeState;
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.createRadiusMeasurement({ bodyId: 7, edgeId: lineEdge.id }, undefined, state.revision), /circular edge/i);
  await assert.rejects(operations.createRadiusMeasurement({ bodyId: 7, edgeId: "missing" }, undefined, state.revision), /unknown current edge/i);
  await assert.rejects(operations.createRadiusMeasurement({ bodyId: 8, edgeId: "missing" }, undefined, state.revision), /segmentEntityId/i);
  await assert.rejects(operations.createRadiusMeasurement({ bodyId: 8, segmentEntityId: 801 }, undefined, "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("lists and removes current native measurements through Plasticity history", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const measurement = {
    id: 3, versionId: 13, type: "DistanceMeasurement", name: "Width", measurementSource: "native-brep" as const,
    first: { bodyId: 7, topologyId: 101, landmark: 0, positionMm: [0, 0, 0] as [number, number, number] },
    second: { bodyId: 7, topologyId: 102, landmark: 0, positionMm: [20, 0, 0] as [number, number, number] },
    distanceMm: 20, direction: [1, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], offsetMm: [-20, 0],
  };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [], measurements: [measurement] };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  assert.deepEqual(await operations.listMeasurements(), { documentToken: state.documentToken, revision: state.revision, measurements: [measurement] });
  await operations.deleteMeasurement(3, state.revision);

  assert.deepEqual(call?.bindings, ["RemoveMeasurementCommand"]);
  assert.deepEqual(call?.values, [{ id: 3 }]);
  assert.match(call?.source ?? "", /lookupByStableId\(args\.id\)/);
  assert.match(call?.source ?? "", /selected\.addMeasurement\(measurement\)/);
  assert.match(call?.source ?? "", /command\.execute\.bind\(command\)/);
  assert.match(call?.source ?? "", /viewport\.setNeedsRender\(\)/);
});

test("classifies sampled native face draft relative to a normalized pull direction", async () => {
  let readCall: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const face = { id: "17f1", centerMm: [10, 5, 5], normal: [0, 0, 1], planar: true };
  const body = {
    id: 7, versionId: 17, type: "Solid", name: "Drafted", boundsMm: null,
    faceIds: [face.id], edgeIds: [], faces: [face], edges: [], vertices: [],
  };
  const state = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body],
  } as unknown as RuntimeState;
  const runtime = {
    async getState() { return state; },
    async readNative(source: string, bindings: string[], values: unknown[]) {
      readCall = { source, bindings, values };
      return [{
        face: { bodyId: 7, faceId: "17f1" }, bodyVersionId: 17, surfaceType: "BSurf",
        samples: [
          { positionMm: [0, 0, 0], normal: [0, 0, -2] },
          { positionMm: [10, 0, 5], normal: [4, 0, 0] },
          { positionMm: [20, 10, 10], normal: [0, 0, 3] },
        ],
      }];
    },
  } as unknown as PlasticityRuntime;

  const result = await new PlasticityOperations(runtime).analyzeFaceDraft(
    [{ bodyId: 7, faceId: "17f1" }],
    [0, 0, 2],
    2,
    8,
    state.revision,
  );

  assert.deepEqual(result.pullDirection, [0, 0, 1]);
  assert.equal(result.minimumDraftDeg, 2);
  assert.equal(result.samplesPerDirection, 8);
  assert.equal(result.analyses[0]?.classification, "mixed");
  assert.deepEqual(result.analyses[0]?.sampleCounts, { positive: 1, negative: 1, neutral: 1 });
  assert.equal(result.analyses[0]?.minimumSignedDraft.valueDeg, -90);
  assert.equal(result.analyses[0]?.maximumSignedDraft.valueDeg, 90);
  assert.equal(result.analyses[0]?.minimumAbsoluteDraftDeg, 0);
  assert.equal(result.analyses[0]?.maximumAbsoluteDraftDeg, 90);
  assert.deepEqual(readCall?.bindings, []);
  assert.deepEqual(readCall?.values, [{ faces: [{ bodyId: 7, faceId: "17f1" }], samplesPerDirection: 8 }]);
  assert.match(readCall?.source ?? "", /face\.EvalGrid\(args\.samplesPerDirection, args\.samplesPerDirection\)/u);
  assert.match(readCall?.source ?? "", /face\.FindPointNear\(requested\)/u);
  assert.match(readCall?.source ?? "", /face\.EvalNormal\(uv\.u, uv\.v\)/u);
  assert.match(result.limitation, /finite grid/iu);
});

test("rejects invalid face draft requests before native sampling", async () => {
  let reads = 0;
  const solid = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: ["17f1"], edgeIds: [], faces: [], edges: [], vertices: [] };
  const wire = { id: 8, versionId: 18, type: "Wire", name: null, boundsMm: null, faceIds: ["18f1"], edgeIds: [], faces: [], edges: [], vertices: [] };
  const state = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid, wire] } as unknown as RuntimeState;
  const runtime = { async getState() { return state; }, async readNative() { reads += 1; return []; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const face = [{ bodyId: 7, faceId: "17f1" }];

  await assert.rejects(operations.analyzeFaceDraft(face, [0, 0, 1], 2, 8, "old"), /stale reference/i);
  await assert.rejects(operations.analyzeFaceDraft([{ bodyId: 7, faceId: "missing" }], [0, 0, 1], 2, 8, state.revision), /unknown current face/i);
  await assert.rejects(operations.analyzeFaceDraft([{ bodyId: 8, faceId: "18f1" }], [0, 0, 1], 2, 8, state.revision), /Solid or Sheet/i);
  await assert.rejects(operations.analyzeFaceDraft(face, [0, 0, 0], 2, 8, state.revision), /pull direction/i);
  await assert.rejects(operations.analyzeFaceDraft(face, [0, 0, 1], 0, 8, state.revision), /minimum draft angle/i);
  await assert.rejects(operations.analyzeFaceDraft(face, [0, 0, 1], 90, 8, state.revision), /minimum draft angle/i);
  await assert.rejects(operations.analyzeFaceDraft(face, [0, 0, 1], 2, 2, state.revision), /samples per direction/i);
  await assert.rejects(operations.analyzeFaceDraft(face, [0, 0, 1], 2, 33, state.revision), /samples per direction/i);
  assert.equal(reads, 0);
});

test("analyzes sampled native surface continuity across current shell edges", async () => {
  let readCall: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const edge = {
    id: "17e1", curveType: "Line", line: true, circle: false, lengthMm: 20,
    centerMm: [10, 0, 0] as [number, number, number], tangent: [1, 0, 0] as [number, number, number],
    boundsMm: { min: [0, 0, 0] as [number, number, number], max: [20, 0, 0] as [number, number, number] },
    faceIds: ["17f1", "17f2"], vertexIds: [101, 102],
  };
  const body = {
    id: 7, versionId: 17, type: "Solid", name: "Corner", boundsMm: edge.boundsMm,
    faceIds: edge.faceIds, edgeIds: [edge.id], faces: [], edges: [edge], vertices: [],
  };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body],
  };
  const analyses = [{
    edge: { bodyId: 7, edgeId: "17e1" },
    adjacentFaces: [{ bodyId: 7, faceId: "17f1" }, { bodyId: 7, faceId: "17f2" }],
    bodyVersionId: 17,
    measurementSource: "native-brep-100-samples" as const,
    sampleCount: 100,
    maximumPositionDeviationMm: 0,
    maximumPositionDeviationAtMm: [20, 0, 0],
    maximumNormalAngleDeviationDeg: 90,
    maximumNormalAngleDeviationAtMm: [20, 0, 0],
    maximumRelativeCurvatureDeviation: 0,
    maximumRelativeCurvatureDeviationAtMm: [20, 0, 0],
    tolerances: { positionMm: 0.01, normalAngleDeg: 0.1, relativeCurvature: 0.05 },
    passes: { G0: true, G1: false, G2: false },
    achievedContinuity: "G0" as const,
  }];
  const runtime = {
    async getState() { return state; },
    async readNative(source: string, bindings: string[], values: unknown[]) { readCall = { source, bindings, values }; return analyses; },
  } as unknown as PlasticityRuntime;

  const result = await new PlasticityOperations(runtime).analyzeSurfaceContinuity(
    [{ bodyId: 7, edgeId: "17e1" }],
    state.revision,
    0.01,
    0.1,
    0.05,
  );

  assert.deepEqual(result, { documentToken: state.documentToken, revision: state.revision, analyses });
  assert.deepEqual(readCall?.bindings, ["MeasureContinuityFactory", "ContinuityType", "evalSurfaceContinuityMeasurements", "EvalSurfaceContinuityMeasurements_refresh"]);
  assert.deepEqual(readCall?.values, [{
    edges: [{ bodyId: 7, edgeId: "17e1" }],
    tolerances: { positionMm: 0.01, normalAngleDeg: 0.1, relativeCurvature: 0.05 },
    bodyVersions: [{ bodyId: 7, versionId: 17 }],
  }]);
  assert.match(readCall?.source ?? "", /factory\.g1ToleranceDegrees = args\.tolerances\.normalAngleDeg/);
  assert.match(readCall?.source ?? "", /evalSurfaceContinuityMeasurements/);
  assert.match(readCall?.source ?? "", /maximumNormalAngleDeviationDeg/);
  assert.match(readCall?.source ?? "", /achievedContinuity/);
});

test("analyzes sampled native curvature across current B-Rep edges", async () => {
  let readCall: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const edge = {
    id: "18e1", curveType: "Circle", line: false, circle: true, lengthMm: 62.8318530718,
    centerMm: [0, 0, 0] as [number, number, number], tangent: [0, 1, 0] as [number, number, number],
    boundsMm: { min: [-10, -10, 0] as [number, number, number], max: [10, 10, 0] as [number, number, number] },
    faceIds: [], vertexIds: [],
  };
  const body = {
    id: 8, versionId: 18, type: "Wire", name: "R10", boundsMm: edge.boundsMm,
    faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [],
  };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body],
  };
  const analyses = [{
    edge: { bodyId: 8, segmentEntityId: 801 }, bodyVersionId: 18,
    measurementSource: "native-brep-100-samples" as const, sampleCount: 100,
    minimumCurvaturePerMm: 0.1, maximumCurvaturePerMm: 0.1, meanCurvaturePerMm: 0.1,
    minimumCurvatureAtMm: [10, 0, 0], maximumCurvatureAtMm: [10, 0, 0],
    maximumCurvatureVectorPerMm: [0.1, 0, 0],
    minimumRadiusOfCurvatureMm: 10, maximumFiniteRadiusOfCurvatureMm: 10,
    containsZeroCurvature: false,
  }];
  const runtime = {
    async getState() { return state; },
    async readNative(source: string, bindings: string[], values: unknown[]) { readCall = { source, bindings, values }; return analyses; },
  } as unknown as PlasticityRuntime;

  const result = await new PlasticityOperations(runtime).analyzeEdgeCurvature([{ bodyId: 8, segmentEntityId: 801 }], state.revision);

  assert.deepEqual(result, { documentToken: state.documentToken, revision: state.revision, analyses });
  assert.deepEqual(readCall?.bindings, ["evalCurvatureMeasurements", "CurvatureMeasurement", "Target", "TopologyLandmark"]);
  assert.deepEqual(readCall?.values, [{
    edges: [{ bodyId: 8, segmentEntityId: 801 }],
    bodyVersions: [{ bodyId: 8, versionId: 18 }],
  }]);
  assert.match(readCall?.source ?? "", /evalCurvatureMeasurements/);
  assert.match(readCall?.source ?? "", /analysis\.spikes/);
  assert.match(readCall?.source ?? "", /minimumRadiusOfCurvatureMm/);
  assert.match(readCall?.source ?? "", /maximumCurvatureVectorPerMm/);
});

test("rejects stale, duplicate, and missing edges before curvature analysis", async () => {
  let reads = 0;
  const edge = { id: "18e1", faceIds: [] };
  const wire = { id: 8, versionId: 18, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] };
  const solid = { id: 9, versionId: 19, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [edge.id], faces: [], edges: [edge], vertices: [] };
  const state = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire, solid] } as unknown as RuntimeState;
  const runtime = { async getState() { return state; }, async readNative() { reads += 1; return []; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.analyzeEdgeCurvature([], state.revision), /at least one edge/i);
  await assert.rejects(operations.analyzeEdgeCurvature([{ bodyId: 8, segmentEntityId: 801 }, { bodyId: 8, segmentEntityId: 801 }], state.revision), /edge references must be unique/i);
  await assert.rejects(operations.analyzeEdgeCurvature([{ bodyId: 9, edgeId: "missing" }], state.revision), /unknown current edge/i);
  await assert.rejects(operations.analyzeEdgeCurvature([{ bodyId: 8, segmentEntityId: 801 }], "old-revision"), /stale reference/i);
  assert.equal(reads, 0);
});

test("rejects stale, duplicate, boundary, and missing edges before continuity analysis", async () => {
  let reads = 0;
  const shared = { id: "17e1", faceIds: ["17f1", "17f2"] };
  const boundary = { id: "17e2", faceIds: ["17f1"] };
  const body = { id: 7, versionId: 17, type: "Sheet", name: null, boundsMm: null, faceIds: ["17f1", "17f2"], edgeIds: [shared.id, boundary.id], faces: [], edges: [shared, boundary], vertices: [] };
  const state = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] } as unknown as RuntimeState;
  const runtime = { async getState() { return state; }, async readNative() { reads += 1; return []; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const edge = { bodyId: 7, edgeId: shared.id };

  await assert.rejects(operations.analyzeSurfaceContinuity([], state.revision), /at least one edge/i);
  await assert.rejects(operations.analyzeSurfaceContinuity([edge, edge], state.revision), /edge references must be unique/i);
  await assert.rejects(operations.analyzeSurfaceContinuity([{ bodyId: 7, edgeId: "missing" }], state.revision), /unknown current edge/i);
  await assert.rejects(operations.analyzeSurfaceContinuity([{ bodyId: 7, edgeId: boundary.id }], state.revision), /exactly two adjacent faces/i);
  await assert.rejects(operations.analyzeSurfaceContinuity([edge], "old-revision"), /stale reference/i);
  await assert.rejects(operations.analyzeSurfaceContinuity([edge], state.revision, 0, 0.1, 0.05), /position tolerance/i);
  await assert.rejects(operations.analyzeSurfaceContinuity([edge], state.revision, 0.01, Number.NaN, 0.05), /normal angle tolerance/i);
  await assert.rejects(operations.analyzeSurfaceContinuity([edge], state.revision, 0.01, 0.1, -1), /curvature tolerance/i);
  assert.equal(reads, 0);
});

test("rejects stale, missing, and coincident persistent measurement references", async () => {
  let mutations = 0;
  const body = {
    id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [],
    vertices: [{ id: 101, positionMm: [0, 0, 0] as [number, number, number], edgeIds: [], faceIds: [] }],
  };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body], measurements: [] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.createVertexDistanceMeasurement({ bodyId: 7, vertexId: 101 }, { bodyId: 7, vertexId: 999 }, undefined, state.revision), /second.*current native/i);
  await assert.rejects(operations.createVertexDistanceMeasurement({ bodyId: 7, vertexId: 101 }, { bodyId: 7, vertexId: 101 }, undefined, state.revision), /must be different/i);
  await assert.rejects(operations.createVertexDistanceMeasurement({ bodyId: 7, vertexId: 101 }, { bodyId: 7, vertexId: 101 }, undefined, "old-revision"), /stale reference/i);
  await assert.rejects(operations.deleteMeasurement(99, state.revision), /unknown current measurement/i);
  assert.equal(mutations, 0);
});

test("measures a circular Wire segment using its exact current native segment identity", async () => {
  const body = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const circleGeometry = {
    centerMm: [0, 0, 0] as [number, number, number], radiusMm: 2,
    normal: [0, 0, 1] as [number, number, number], reference: [1, 0, 0] as [number, number, number],
    startMm: [2, 0, 0] as [number, number, number], midpointMm: [-2, 0, 0] as [number, number, number], endMm: [2, 0, 0] as [number, number, number],
  };
  const curves = [{ id: 7, versionId: 17, measurementSource: "native-brep" as const, closed: true, segments: [{ entityId: 99, curveType: "Circle", startMm: [2, 0, 0], endMm: [2, 0, 0], startTangent: [0, 1, 0], endTangent: [0, 1, 0], lengthMm: 4 * Math.PI, circleGeometry }] }];
  const runtime = { async getState() { return state; }, async readNative() { return curves; } } as unknown as PlasticityRuntime;
  const result = await new PlasticityOperations(runtime).measurePointToCircularEdge(
    { type: "coordinates", pointMm: [4, 0, 3] }, { bodyId: 7, segmentEntityId: 99 }, state.revision,
  );

  assert.deepEqual(result.edge, { bodyId: 7, segmentEntityId: 99, centerMm: [0, 0, 0], radiusMm: 2, normal: [0, 0, 1], reference: [1, 0, 0], startAngleRadians: 0, sweepRadians: 2 * Math.PI, lengthMm: 4 * Math.PI, fullCircle: true });
  assert.ok(Math.abs(result.finiteArcDistanceMm - Math.sqrt(13)) < 1e-12);
});

test("samples arbitrary curved B-Rep edges natively and reports only an approximate distance", async () => {
  const spline = {
    id: "spline-edge", curveType: "BSpline", line: false, circle: false, lengthMm: 10,
    centerMm: [5, 1.8, 0] as [number, number, number], tangent: [1, 0, 0] as [number, number, number],
    boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 3, 0] as [number, number, number] }, faceIds: [], vertexIds: [],
  };
  const body = { id: 7, versionId: 17, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [spline.id], faces: [], edges: [spline] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  let readSource = "";
  let readValues: unknown;
  const samples = [
    { normalizedParameter: 0, positionMm: [0, 0, 0] as [number, number, number] },
    { normalizedParameter: 0.5, positionMm: [5, 3, 0] as [number, number, number] },
    { normalizedParameter: 1, positionMm: [10, 0, 0] as [number, number, number] },
  ];
  const runtime = {
    async getState() { return state; },
    async readNative(source: string, _bindings: string[], values: unknown[]) {
      readSource = source;
      readValues = values[0];
      return { curveType: "BSpline", lengthMm: 10, isLine: false, isCircle: false, samples, maxObservedChordDeviationMm: 0.005 };
    },
  } as unknown as PlasticityRuntime;

  const result = await new PlasticityOperations(runtime).measurePointToSampledCurveEdge(
    { type: "coordinates", pointMm: [5, 4, 0] }, { bodyId: 7, edgeId: spline.id }, state.revision, 0.01, 128,
  );

  assert.equal(result.exact, false);
  assert.equal(result.estimatedDistanceMm, 1);
  assert.equal(result.toleranceObserved, true);
  assert.equal(result.sampleCount, 3);
  assert.match(readSource, /GetPointAndTangent\(index \/ segmentCount\)/);
  assert.match(readSource, /GetPointAndTangent\(\(index \+ 0\.5\) \/ segmentCount\)/);
  assert.match(readSource, /maxObservedChordDeviationMm <= args\.requestedToleranceMm/);
  assert.deepEqual(readValues, { reference: { kind: "brep-edge", bodyId: 7, edgeId: spline.id }, requestedToleranceMm: 0.01, maxSegments: 128 });
});

test("samples a current non-circular Wire spline by its native segment entity ID", async () => {
  const wire = { id: 9, versionId: 19, type: "Wire", name: "Spline guide", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire] };
  let readSource = "";
  let readValues: unknown;
  const samples = [
    { normalizedParameter: 0, positionMm: [0, 0, 0] as [number, number, number] },
    { normalizedParameter: 0.5, positionMm: [5, 3, 0] as [number, number, number] },
    { normalizedParameter: 1, positionMm: [10, 0, 0] as [number, number, number] },
  ];
  const runtime = {
    async getState() { return state; },
    async readNative(source: string, _bindings: string[], values: unknown[]) {
      readSource = source;
      readValues = values[0];
      return { curveType: "BCurve", lengthMm: 11.2, isLine: false, isCircle: false, samples, maxObservedChordDeviationMm: 0.005 };
    },
  } as unknown as PlasticityRuntime;
  const result = await new PlasticityOperations(runtime).measurePointToSampledCurveEdge(
    { type: "coordinates", pointMm: [5, 4, 0] }, { bodyId: 9, segmentEntityId: 501 }, state.revision, 0.01, 128,
  );

  assert.equal(result.exact, false);
  assert.equal(result.estimatedDistanceMm, 1);
  assert.deepEqual(result.edge, { bodyId: 9, segmentEntityId: 501, curveType: "BCurve", lengthMm: 11.2 });
  assert.match(readSource, /item\.view\.segments/);
  assert.match(readSource, /segmentEntityId/);
  assert.deepEqual(readValues, { reference: { kind: "wire-segment", bodyId: 9, segmentEntityId: 501 }, requestedToleranceMm: 0.01, maxSegments: 128 });
});

test("validates current bodies with native Check codes and exact topology", async () => {
  let readCall: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const boundaryEdge = { id: "e1", curveType: "Line", line: true, circle: false, lengthMm: 10, centerMm: [0, 0, 0] as [number, number, number], tangent: [1, 0, 0] as [number, number, number], boundsMm: { min: [0, 0, 0] as [number, number, number], max: [10, 0, 0] as [number, number, number] }, faceIds: ["f1"], vertexIds: [] };
  const solid = { id: 7, versionId: 17, type: "Solid", name: "Good", boundsMm: null, faceIds: ["f1"], edgeIds: ["e1"], faces: [], edges: [{ ...boundaryEdge, faceIds: ["f1"] }] };
  const sheet = { id: 8, versionId: 18, type: "Sheet", name: "Open", boundsMm: null, faceIds: ["f1"], edgeIds: ["e1"], faces: [], edges: [boundaryEdge] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [solid, sheet] };
  const runtime = {
    async getState() { return state; },
    async readNative(source: string, bindings: string[], values: unknown[]) {
      readCall = { source, bindings, values };
      return [{ id: 7, nativeCheckCodes: [] }, { id: 8, nativeCheckCodes: [42] }];
    },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  const result = await operations.validateBodies([7, 8], state.revision);

  assert.deepEqual(readCall?.bindings, []);
  assert.deepEqual(readCall?.values, [{ ids: [7, 8] }]);
  assert.match(readCall?.source ?? "", /model\.Check\(\)/);
  assert.deepEqual(result.bodies.map((body) => ({ id: body.id, nativeValid: body.nativeValid, closed: body.closed, printableSolid: body.printableSolid, boundaryEdgeIds: body.boundaryEdgeIds })), [
    { id: 7, nativeValid: true, closed: true, printableSolid: true, boundaryEdgeIds: [] },
    { id: 8, nativeValid: false, closed: false, printableSolid: false, boundaryEdgeIds: ["e1"] },
  ]);
});

test("rejects stale, duplicate, and missing body validation references", async () => {
  let reads = 0;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = { async getState() { return state; }, async readNative() { reads += 1; return []; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.validateBodies([], state.revision), /at least one/i);
  await assert.rejects(operations.validateBodies([7, 7], state.revision), /unique/i);
  await assert.rejects(operations.validateBodies([7], state.revision), /unknown body/i);
  await assert.rejects(operations.validateBodies([7], "old-revision"), /stale reference/i);
  assert.equal(reads, 0);
});

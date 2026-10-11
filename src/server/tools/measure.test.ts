import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type SessionLike } from "../index.ts";
import { PlasticityOperations } from "../../plasticity/operations/index.ts";
import type { RuntimeState } from "../../plasticity/runtime.ts";
import { createServer, emptyState, parseToolJson, unavailableConstruction } from "../test-support.ts";

test("MCP forwards exact topology measurement requests", async () => {
  const calls: Array<{ name: string; arguments: unknown[] }> = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async measurePointDistance(...arguments_: unknown[]) {
      calls.push({ name: "points", arguments: arguments_ });
      return { distanceMm: 13, deltaMm: [3, 4, 12], measurementSource: "native-brep" };
    },
    async measurePointToLinearEdge(...arguments_: unknown[]) {
      calls.push({ name: "point-edge", arguments: arguments_ });
      return { finiteSegmentDistanceMm: 2, closestPointMm: [5, 0, 0], measurementSource: "native-brep-and-explicit-coordinates" };
    },
    async measurePointToSampledCurveEdge(...arguments_: unknown[]) {
      calls.push({ name: "point-curved-edge", arguments: arguments_ });
      return { exact: false, estimatedDistanceMm: 1, measurementSource: "native-brep-sampled-polyline" };
    },
    async measurePointToCircularEdge(...arguments_: unknown[]) {
      calls.push({ name: "point-circle", arguments: arguments_ });
      return { finiteArcDistanceMm: 4, closestPointMm: [0, 5, 0], measurementSource: "native-brep-and-explicit-coordinates" };
    },
    async measurePointToPlanarFace(...arguments_: unknown[]) {
      calls.push({ name: "point-face", arguments: arguments_ });
      return { minimumDistanceMm: 3, closestPointMm: [1, 1, 0], measurementSource: "native-brep-and-explicit-coordinates" };
    },
    async measurePlanarFaces(...arguments_: unknown[]) {
      calls.push({ name: "faces", arguments: arguments_ });
      return { separationMm: 8, planeAngleDeg: 0, measurementSource: "native-brep" };
    },
    async measureParallelPlanarFaceClearance(...arguments_: unknown[]) {
      calls.push({ name: "trimmed-face-clearance", arguments: arguments_ });
      return { minimumDistanceMm: 5, inPlaneClearanceMm: 3, exact: true, measurementSource: "native-brep" };
    },
    async measureNonparallelPlanarPolygonFaceClearance(...arguments_: unknown[]) {
      calls.push({ name: "nonparallel-face-clearance", arguments: arguments_ });
      return { minimumDistanceMm: 2, method: "nonparallel-planar-polygon-regions", exact: true, measurementSource: "native-brep" };
    },
    async measureLinearEdges(...arguments_: unknown[]) {
      calls.push({ name: "edges", arguments: arguments_ });
      return { supportingLineDistanceMm: 3, lineAngleDeg: 0, measurementSource: "native-brep" };
    },
    async measureFastenerGripStack(...arguments_: unknown[]) {
      calls.push({ name: "grip", arguments: arguments_ });
      return { totalGripMm: 8, gripItems: [{ id: "plate", thicknessMm: 8 }], measurementSource: "native-brep-planar-faces" };
    },
    async analyzeSurfaceContinuity(...arguments_: unknown[]) {
      calls.push({ name: "continuity", arguments: arguments_ });
      return { documentToken: "doc-1", revision: "r1", analyses: [] };
    },
    async analyzeEdgeCurvature(...arguments_: unknown[]) {
      calls.push({ name: "curvature", arguments: arguments_ });
      return { documentToken: "doc-1", revision: "r1", analyses: [] };
    },
    async analyzeFaceDraft(...arguments_: unknown[]) {
      calls.push({ name: "draft", arguments: arguments_ });
      return { documentToken: "doc-1", revision: "r1", analyses: [] };
    },
    async listMeasurements(...arguments_: unknown[]) {
      calls.push({ name: "list", arguments: arguments_ });
      return { documentToken: "doc-1", revision: "r1", measurements: [] };
    },
    async createVertexDistanceMeasurement(...arguments_: unknown[]) {
      calls.push({ name: "create-persistent", arguments: arguments_ });
      return state;
    },
    async createTopologyDistanceMeasurement(...arguments_: unknown[]) {
      calls.push({ name: "create-topology-distance", arguments: arguments_ });
      return state;
    },
    async createRadiusMeasurement(...arguments_: unknown[]) {
      calls.push({ name: "create-radius", arguments: arguments_ });
      return state;
    },
    async deleteMeasurement(...arguments_: unknown[]) {
      calls.push({ name: "delete-persistent", arguments: arguments_ });
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "measurement-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const points = await client.callTool({ name: "plasticity_measure_point_distance", arguments: {
    first: { type: "vertex", bodyId: 7, vertexId: 101 },
    second: { type: "coordinates", pointMm: [3, 4, 12] },
    revision: "r1",
  } });
  const pointEdge = await client.callTool({ name: "plasticity_measure_point_to_linear_edge", arguments: {
    point: { type: "coordinates", pointMm: [5, 2, 0] },
    edge: { bodyId: 7, edgeId: "left" }, revision: "r1",
  } });
  const pointCurvedEdge = await client.callTool({ name: "plasticity_measure_point_to_curved_edge", arguments: {
    point: { type: "coordinates", pointMm: [5, 4, 0] },
    edge: { bodyId: 7, edgeId: "spline" }, requestedToleranceMm: 0.005, maxSegments: 1024, revision: "r1",
  } });
  const pointCurvedWire = await client.callTool({ name: "plasticity_measure_point_to_curved_edge", arguments: {
    point: { type: "coordinates", pointMm: [5, 4, 0] },
    edge: { bodyId: 8, segmentEntityId: 801 }, requestedToleranceMm: 0.02, maxSegments: 512, revision: "r1",
  } });
  const pointCircle = await client.callTool({ name: "plasticity_measure_point_to_circular_edge", arguments: {
    point: { type: "coordinates", pointMm: [0, 10, 0] },
    edge: { bodyId: 7, edgeId: "circle-edge" }, revision: "r1",
  } });
  const pointWireCircle = await client.callTool({ name: "plasticity_measure_point_to_circular_edge", arguments: {
    point: { type: "coordinates", pointMm: [0, 10, 0] },
    edge: { bodyId: 8, segmentEntityId: 801 }, revision: "r1",
  } });
  const pointFace = await client.callTool({ name: "plasticity_measure_point_to_planar_face", arguments: {
    point: { type: "coordinates", pointMm: [1, 1, 3] },
    face: { bodyId: 7, faceId: "top" }, revision: "r1",
  } });
  const faces = await client.callTool({ name: "plasticity_measure_planar_faces", arguments: {
    first: { bodyId: 7, faceId: "bottom" }, second: { bodyId: 7, faceId: "top" }, revision: "r1",
  } });
  const faceClearance = await client.callTool({ name: "plasticity_measure_parallel_planar_face_clearance", arguments: {
    first: { bodyId: 7, faceId: "bottom" }, second: { bodyId: 8, faceId: "side" }, revision: "r1",
  } });
  const nonparallelFaceClearance = await client.callTool({ name: "plasticity_measure_nonparallel_planar_polygon_clearance", arguments: {
    first: { bodyId: 7, faceId: "bottom" }, second: { bodyId: 8, faceId: "side" }, revision: "r1",
  } });
  const edges = await client.callTool({ name: "plasticity_measure_linear_edges", arguments: {
    first: { bodyId: 7, edgeId: "left" }, second: { bodyId: 7, edgeId: "right" }, angularToleranceDeg: 0.1, revision: "r1",
  } });
  const grip = await client.callTool({ name: "plasticity_measure_fastener_grip_stack", arguments: {
    layers: [{ id: "plate", first: { bodyId: 7, faceId: "bottom" }, second: { bodyId: 7, faceId: "top" } }],
    axis: [0, 0, 1], revision: "r1",
  } });
  const continuity = await client.callTool({ name: "plasticity_analyze_surface_continuity", arguments: {
    edges: [{ bodyId: 7, edgeId: "shared" }], positionToleranceMm: 0.02,
    normalAngleToleranceDeg: 0.2, relativeCurvatureTolerance: 0.1, revision: "r1",
  } });
  const curvature = await client.callTool({ name: "plasticity_analyze_edge_curvature", arguments: {
    edges: [{ bodyId: 8, edgeId: "circle" }], revision: "r1",
  } });
  const draft = await client.callTool({ name: "plasticity_analyze_face_draft", arguments: {
    faces: [{ bodyId: 7, faceId: "top" }], pullDirection: [0, 0, 2],
    minimumDraftDeg: 3, samplesPerDirection: 6, revision: "r1",
  } });
  const listed = await client.callTool({ name: "plasticity_list_measurements", arguments: {} });
  const created = await client.callTool({ name: "plasticity_create_vertex_distance_measurement", arguments: {
    first: { bodyId: 7, vertexId: 101 }, second: { bodyId: 7, vertexId: 102 }, name: "Overall width", revision: "r1",
  } });
  const createdTopologyDistance = await client.callTool({ name: "plasticity_create_topology_distance_measurement", arguments: {
    first: { type: "face-center", bodyId: 7, faceId: "bottom" },
    second: { type: "edge-midpoint", bodyId: 7, edgeId: "right" },
    name: "Face to edge", revision: "r1",
  } });
  const createdRadius = await client.callTool({ name: "plasticity_create_radius_measurement", arguments: {
    edge: { bodyId: 8, segmentEntityId: 801 }, name: "Guide radius", revision: "r1",
  } });
  const deleted = await client.callTool({ name: "plasticity_delete_measurement", arguments: { id: 3, revision: "r1" } });

  assert.equal(points.isError, undefined);
  assert.equal(pointEdge.isError, undefined);
  assert.equal(pointCurvedEdge.isError, undefined);
  assert.equal(pointCurvedWire.isError, undefined);
  assert.equal(pointCircle.isError, undefined);
  assert.equal(pointWireCircle.isError, undefined);
  assert.equal(pointFace.isError, undefined);
  assert.equal(faces.isError, undefined);
  assert.equal(faceClearance.isError, undefined);
  assert.equal(nonparallelFaceClearance.isError, undefined);
  assert.equal(edges.isError, undefined);
  assert.equal(grip.isError, undefined);
  assert.equal(continuity.isError, undefined);
  assert.equal(curvature.isError, undefined);
  assert.equal(draft.isError, undefined);
  assert.equal(listed.isError, undefined);
  assert.equal(created.isError, undefined);
  assert.equal(createdTopologyDistance.isError, undefined);
  assert.equal(createdRadius.isError, undefined);
  assert.equal(deleted.isError, undefined);
  assert.deepEqual(calls, [
    { name: "points", arguments: [{ type: "vertex", bodyId: 7, vertexId: 101 }, { type: "coordinates", pointMm: [3, 4, 12] }, "r1"] },
    { name: "point-edge", arguments: [{ type: "coordinates", pointMm: [5, 2, 0] }, { bodyId: 7, edgeId: "left" }, "r1"] },
    { name: "point-curved-edge", arguments: [{ type: "coordinates", pointMm: [5, 4, 0] }, { bodyId: 7, edgeId: "spline" }, "r1", 0.005, 1024] },
    { name: "point-curved-edge", arguments: [{ type: "coordinates", pointMm: [5, 4, 0] }, { bodyId: 8, segmentEntityId: 801 }, "r1", 0.02, 512] },
    { name: "point-circle", arguments: [{ type: "coordinates", pointMm: [0, 10, 0] }, { bodyId: 7, edgeId: "circle-edge" }, "r1"] },
    { name: "point-circle", arguments: [{ type: "coordinates", pointMm: [0, 10, 0] }, { bodyId: 8, segmentEntityId: 801 }, "r1"] },
    { name: "point-face", arguments: [{ type: "coordinates", pointMm: [1, 1, 3] }, { bodyId: 7, faceId: "top" }, "r1"] },
    { name: "faces", arguments: [{ bodyId: 7, faceId: "bottom" }, { bodyId: 7, faceId: "top" }, "r1", 0.01] },
    { name: "trimmed-face-clearance", arguments: [{ bodyId: 7, faceId: "bottom" }, { bodyId: 8, faceId: "side" }, "r1"] },
    { name: "nonparallel-face-clearance", arguments: [{ bodyId: 7, faceId: "bottom" }, { bodyId: 8, faceId: "side" }, "r1"] },
    { name: "edges", arguments: [{ bodyId: 7, edgeId: "left" }, { bodyId: 7, edgeId: "right" }, "r1", 0.1] },
    { name: "grip", arguments: [[{ id: "plate", first: { bodyId: 7, faceId: "bottom" }, second: { bodyId: 7, faceId: "top" } }], [0, 0, 1], "r1", 0.01] },
    { name: "continuity", arguments: [[{ bodyId: 7, edgeId: "shared" }], "r1", 0.02, 0.2, 0.1] },
    { name: "curvature", arguments: [[{ bodyId: 8, edgeId: "circle" }], "r1"] },
    { name: "draft", arguments: [[{ bodyId: 7, faceId: "top" }], [0, 0, 2], 3, 6, "r1"] },
    { name: "list", arguments: [] },
    { name: "create-persistent", arguments: [{ bodyId: 7, vertexId: 101 }, { bodyId: 7, vertexId: 102 }, "Overall width", "r1"] },
    { name: "create-topology-distance", arguments: [{ type: "face-center", bodyId: 7, faceId: "bottom" }, { type: "edge-midpoint", bodyId: 7, edgeId: "right" }, "Face to edge", "r1"] },
    { name: "create-radius", arguments: [{ bodyId: 8, segmentEntityId: 801 }, "Guide radius", "r1"] },
    { name: "delete-persistent", arguments: [3, "r1"] },
  ]);

  const invalid = await client.callTool({ name: "plasticity_measure_point_distance", arguments: {
    first: { type: "vertex", bodyId: 7, vertexId: -1 },
    second: { type: "coordinates", pointMm: [0, 0, 0] },
    revision: "r1",
  } });
  assert.equal(invalid.isError, true);
  await client.close(); await server.close();
});

test("MCP forwards native section-analysis requests", async () => {
  const calls: Array<{ name: string; arguments: unknown[] }> = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async listSectionAnalyses(...arguments_: unknown[]) { calls.push({ name: "list-sections", arguments: arguments_ }); return { documentToken: "doc-1", revision: "r1", sectionAnalyses: [] }; },
    async createSectionAnalysis(...arguments_: unknown[]) { calls.push({ name: "create-section", arguments: arguments_ }); return state; },
    async deleteSectionAnalysis(...arguments_: unknown[]) { calls.push({ name: "delete-section", arguments: arguments_ }); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "section-analysis-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const listed = await client.callTool({ name: "plasticity_list_section_analyses", arguments: {} });
  const created = await client.callTool({ name: "plasticity_create_section_analysis", arguments: {
    originMm: [0, 0, 5], normal: [0, 0, 1], name: "Mid section", revision: "r1",
  } });
  const deleted = await client.callTool({ name: "plasticity_delete_section_analysis", arguments: { id: 3, revision: "r1" } });

  assert.equal(listed.isError, undefined);
  assert.equal(created.isError, undefined);
  assert.equal(deleted.isError, undefined);
  assert.deepEqual(calls, [
    { name: "list-sections", arguments: [] },
    { name: "create-section", arguments: [[0, 0, 5], [0, 0, 1], undefined, "Mid section", "r1"] },
    { name: "delete-section", arguments: [3, "r1"] },
  ]);
  await client.close(); await server.close();
});

test("body info pages faces, edges, and vertices of one body and rejects pages from another revision", async () => {
  const boundsMm = { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] };
  const faces = Array.from({ length: 7 }, (_, index) => ({
    id: `f${index}`, surfaceType: "plane", planar: true, centerMm: [0, 0, 0] as [number, number, number],
    normal: [0, 0, 1] as [number, number, number], radiusMm: null, blendRadiusMm: null,
    axisOriginMm: null, axisDirection: null, boundsMm, edgeIds: [],
  }));
  const edges = Array.from({ length: 12 }, (_, index) => ({
    id: `e${index}`, curveType: "line", line: true, circle: false, lengthMm: 1,
    centerMm: [0, 0, 0] as [number, number, number], tangent: [1, 0, 0] as [number, number, number],
    boundsMm, faceIds: [], vertexIds: [],
  }));
  let state: RuntimeState = { ...emptyState(), bodies: [{
    id: 5, versionId: 9, type: "Solid", name: "Shaft", boundsMm,
    faceIds: faces.map((face) => face.id), edgeIds: edges.map((edge) => edge.id), faces, edges,
    vertices: [{ id: 1, positionMm: [0, 0, 0], edgeIds: [], faceIds: [] }],
  }] };
  const operations = { async state() { return state; } } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "body-info-pages-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const first = parseToolJson(await client.callTool({ name: "plasticity_body_info", arguments: { id: 5, include: ["edges"], limit: 5 } }));
  assert.deepEqual(first.body.edges.map((edge: { id: string }) => edge.id), ["e0", "e1", "e2", "e3", "e4"]);
  assert.equal("faces" in first.body, false, "collections outside include are not returned");
  assert.equal("faceIds" in first.body, false, "id lists duplicate the paged collections");
  assert.deepEqual([first.body.faceCount, first.body.edgeCount, first.body.vertexCount], [7, 12, 1]);
  assert.deepEqual(first.pagination, { edges: { offset: 0, limit: 5, total: 12, nextOffset: 5 } });

  const last = parseToolJson(await client.callTool({ name: "plasticity_body_info", arguments: { id: 5, offset: 10, limit: 5, expectedRevision: first.revision } }));
  assert.deepEqual(last.body.edges.map((edge: { id: string }) => edge.id), ["e10", "e11"]);
  assert.equal(last.pagination.edges.nextOffset, null);
  assert.deepEqual(last.body.faces, [], "an offset past a shorter collection returns an empty page");

  state = { ...state, revision: "r2" };
  const stale = await client.callTool({ name: "plasticity_body_info", arguments: { id: 5, offset: 5, expectedRevision: first.revision } });
  assert.equal(stale.isError, true);
  await client.close(); await server.close();
});

test("MCP exposes read-only exact body interference checks and rejects ambiguous pairs", async () => {
  const calls: unknown[][] = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async checkInterference(...arguments_: unknown[]) {
      calls.push(arguments_);
      return { sessionId: "session-1", documentToken: "doc-1", revision: "r1", source: "native-brep-temporary-intersection", pairs: [] };
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "interference-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const listed = await client.listTools();
  const descriptor = listed.tools.find((tool) => tool.name === "plasticity_check_interference");
  assert.equal(descriptor?.annotations?.readOnlyHint, true);
  assert.equal(descriptor?.annotations?.destructiveHint, false);
  assert.match(descriptor?.description ?? "", /does not distinguish touching from separation/i);
  const response = await client.callTool({ name: "plasticity_check_interference", arguments: {
    pairs: [{ firstBodyId: 7, secondBodyId: 8 }], revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.deepEqual(calls, [[[ { firstBodyId: 7, secondBodyId: 8 } ], "r1"]]);

  const duplicate = await client.callTool({ name: "plasticity_check_interference", arguments: {
    pairs: [{ firstBodyId: 7, secondBodyId: 8 }, { firstBodyId: 8, secondBodyId: 7 }], revision: "r1",
  } });
  const self = await client.callTool({ name: "plasticity_check_interference", arguments: {
    pairs: [{ firstBodyId: 7, secondBodyId: 7 }], revision: "r1",
  } });
  assert.equal(duplicate.isError, true);
  assert.equal(self.isError, true);
  assert.equal(calls.length, 1);
  await client.close(); await server.close();
});

test("MCP exposes read-only exact solid properties with unique current body IDs", async () => {
  const calls: unknown[][] = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async measureSolidProperties(...arguments_: unknown[]) {
      calls.push(arguments_);
      return {
        sessionId: "session-1", documentToken: "doc-1", revision: "r1",
        source: "native-brep-mass-properties", bodies: [],
        totals: { volumeMm3: 0, surfaceAreaMm2: 0, volumeWeightedCentroidMm: [0, 0, 0] },
      };
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "solid-properties-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const listed = await client.listTools();
  const descriptor = listed.tools.find((tool) => tool.name === "plasticity_measure_solid_properties");
  assert.equal(descriptor?.annotations?.readOnlyHint, true);
  assert.equal(descriptor?.annotations?.destructiveHint, false);
  assert.match(descriptor?.description ?? "", /native B-Rep/i);
  const response = await client.callTool({ name: "plasticity_measure_solid_properties", arguments: {
    ids: [8, 7], revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.deepEqual(calls, [[[8, 7], "r1"]]);

  const duplicate = await client.callTool({ name: "plasticity_measure_solid_properties", arguments: {
    ids: [7, 7], revision: "r1",
  } });
  assert.equal(duplicate.isError, true);
  assert.equal(calls.length, 1);
  await client.close(); await server.close();
});

test("MCP exposes read-only exact face properties with unique current topology references", async () => {
  const calls: unknown[][] = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async measureFaceProperties(...arguments_: unknown[]) {
      calls.push(arguments_);
      return {
        sessionId: "session-1", documentToken: "doc-1", revision: "r1",
        source: "native-brep-face-mass-properties", faces: [],
        totals: { areaMm2: 0, summedBoundaryLengthMm: 0, areaWeightedCentroidMm: [0, 0, 0] },
      };
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "face-properties-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const listed = await client.listTools();
  const descriptor = listed.tools.find((tool) => tool.name === "plasticity_measure_face_properties");
  assert.equal(descriptor?.annotations?.readOnlyHint, true);
  assert.equal(descriptor?.annotations?.destructiveHint, false);
  assert.match(descriptor?.description ?? "", /native B-Rep/i);
  const response = await client.callTool({ name: "plasticity_measure_face_properties", arguments: {
    faces: [{ bodyId: 8, faceId: "18f2" }, { bodyId: 7, faceId: "17f1" }], revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.deepEqual(calls, [[[{ bodyId: 8, faceId: "18f2" }, { bodyId: 7, faceId: "17f1" }], "r1"]]);

  const duplicate = await client.callTool({ name: "plasticity_measure_face_properties", arguments: {
    faces: [{ bodyId: 7, faceId: "17f1" }, { bodyId: 7, faceId: "17f1" }], revision: "r1",
  } });
  assert.equal(duplicate.isError, true);
  assert.equal(calls.length, 1);
  await client.close(); await server.close();
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type SessionLike } from "../../server.ts";
import { PlasticityOperations } from "../../plasticity/operations.ts";
import type { PlasticityRuntime } from "../../plasticity/runtime.ts";
import { createServer, emptyState, unavailableConstruction } from "../test-support.ts";

test("serializes compact curve inspection and all native rebuild modes", async () => {
  const nativeCalls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const state = emptyState();
  state.bodies = [{ id: 7, versionId: 17, type: "Wire", name: "Guide", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] }];
  state.regions = [{ id: "20r1", entityId: 41, islandVersionId: 20, sketchId: 3, sketchWireIds: [7], measurementSource: "render-mesh", displayBoundsMm: { min: [0, 0, 0], max: [20, 10, 0] } }];
  const structure = [{
    id: 7, versionId: 17, measurementSource: "native-brep" as const,
    segments: [{ entityId: 99, curveType: "BCurve", lengthMm: 42, degree: 3, controlPointCount: 7, spanCount: 4, distinctKnotCount: 5, knots: [{ normalizedParameter: 0, multiplicity: 4, withinSegment: true }, { normalizedParameter: 1, multiplicity: 4, withinSegment: true }], rational: false, periodic: false }],
  }];
  const controlPoints = [{
    id: 7, versionId: 17, positionSource: "native-control-handle" as const,
    boundaryVertices: [{ reference: { bodyId: 7, kind: "vertex" as const, pointId: 101 }, versionId: "17v101", positionMm: [0, 0, 0] as [number, number, number], slideDirections: { positiveU: [1, 0, 0] as [number, number, number], negativeU: [-1, 0, 0] as [number, number, number] } }],
    interiorControlPoints: [{ reference: { bodyId: 7, kind: "control-point" as const, pointId: 2 }, versionId: "17c2", positionMm: [10, 20, 0] as [number, number, number], slideDirections: { positiveU: [0, 1, 0] as [number, number, number], negativeU: [0, -1, 0] as [number, number, number] } }],
  }];
  const evaluatedSamples = [{
    reference: { bodyId: 7, segmentEntityId: 99, normalizedParameter: 0.5 }, bodyVersionId: 17,
    curveType: "BCurve", measurementSource: "native-brep" as const,
    positionMm: [12, 8, 0] as [number, number, number], tangent: [1, 0, 0] as [number, number, number],
  }];
  const runtime = {
    getCapabilities() { return []; },
    async getState() { return state; },
    async readNative(source: string, bindings: string[], values: unknown[]) {
      nativeCalls.push({ source, bindings, values });
      return source.includes("FindPlanarBasis")
        ? [{ id: 7, versionId: 17, measurementSource: "native-brep", planar: false, plane: null }]
        : source.includes("reference.normalizedParameter")
          ? evaluatedSamples
        : source.includes("native-control-handle")
          ? controlPoints
        : structure;
    },
    async mutate(source: string, bindings: string[], values: unknown[]) { nativeCalls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime, "session-1");
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const inspected = await client.callTool({ name: "plasticity_inspect_curve_structure", arguments: { ids: [7], revision: state.revision } });
  assert.equal(inspected.isError, undefined);
  const inspectedText = (inspected.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  assert.match(inspectedText ?? "", /"controlPointCount":7/);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{ ids: [7] }]);
  const evaluated = await client.callTool({ name: "plasticity_evaluate_curve_segments", arguments: {
    samples: [{ bodyId: 7, segmentEntityId: 99, normalizedParameter: 0.5 }], revision: state.revision,
  } });
  assert.equal(evaluated.isError, undefined);
  const evaluatedText = (evaluated.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  assert.match(evaluatedText ?? "", /"positionMm":\[/);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{ samples: [{ bodyId: 7, segmentEntityId: 99, normalizedParameter: 0.5 }] }]);
  const planarity = await client.callTool({ name: "plasticity_inspect_curve_planarity", arguments: { ids: [7], revision: state.revision } });
  assert.equal(planarity.isError, undefined);
  const planarityText = (planarity.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  assert.match(planarityText ?? "", /"planar":false/);
  const listedControlPoints = await client.callTool({ name: "plasticity_list_curve_control_points", arguments: { ids: [7], revision: state.revision } });
  assert.equal(listedControlPoints.isError, undefined);
  const listedControlPointsText = (listedControlPoints.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  assert.match(listedControlPointsText ?? "", /"native-control-handle"/);
  const duplicated = await client.callTool({ name: "plasticity_duplicate_curves", arguments: { ids: [7], revision: state.revision } });
  assert.equal(duplicated.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.bindings, ["CurveDuplicateFactory"]);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{ ids: [7] }]);
  const regionCurves = await client.callTool({ name: "plasticity_create_curves_from_regions", arguments: { regionIds: ["20r1"], revision: state.revision } });
  assert.equal(regionCurves.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.bindings, ["CreateCurvesFromRegionsFactory"]);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{ regionIds: ["20r1"] }]);
  const duplicateRegions = await client.callTool({ name: "plasticity_create_curves_from_regions", arguments: { regionIds: ["20r1", "20r1"], revision: state.revision } });
  assert.equal(duplicateRegions.isError, true);
  const movedControlPoint = await client.callTool({ name: "plasticity_move_curve_control_points", arguments: {
    points: [{ bodyId: 7, kind: "control-point", pointId: 2 }], deltaMm: [0, 10, 5], revision: state.revision,
  } });
  assert.equal(movedControlPoint.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.bindings, ["MultiMoveControlPointFactory", "MoveControlPointCommand"]);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{ points: [{ bodyId: 7, kind: "control-point", pointId: 2 }], delta: [0, 0.01, 0.005] }]);
  const slidControlPoint = await client.callTool({ name: "plasticity_slide_curve_control_points", arguments: {
    points: [{ bodyId: 7, kind: "control-point", pointId: 2 }], direction: "positive-u", distanceMm: 5, revision: state.revision,
  } });
  assert.equal(slidControlPoint.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.bindings, ["MultiSlideControlPointFactory", "MoveControlPointCommand"]);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{ points: [{ bodyId: 7, kind: "control-point", pointId: 2 }], direction: "posU", distance: 0.005 }]);
  const rotatedControlPoint = await client.callTool({ name: "plasticity_rotate_curve_control_points", arguments: {
    points: [{ bodyId: 7, kind: "control-point", pointId: 2 }], pivotMm: [10, 20, 0], axis: [0, 0, 2], degrees: 90, revision: state.revision,
  } });
  assert.equal(rotatedControlPoint.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.bindings, ["MultiRotateControlPointFactory", "RotateControlPointCommand", "Vector3", "Quaternion"]);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{ points: [{ bodyId: 7, kind: "control-point", pointId: 2 }], pivot: [0.01, 0.02, 0], axis: [0, 0, 1], radians: Math.PI / 2 }]);
  const scaledControlPoint = await client.callTool({ name: "plasticity_scale_curve_control_points", arguments: {
    points: [{ bodyId: 7, kind: "control-point", pointId: 2 }], pivotMm: [10, 20, 0], factors: [2, 0.5, 1], revision: state.revision,
  } });
  assert.equal(scaledControlPoint.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.bindings, ["MultiScaleControlPointFactory", "ScaleControlPointCommand"]);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{ points: [{ bodyId: 7, kind: "control-point", pointId: 2 }], pivot: [0.01, 0.02, 0], factors: [2, 0.5, 1] }]);
  const deletedControlPoint = await client.callTool({ name: "plasticity_delete_curve_control_points", arguments: {
    points: [{ bodyId: 7, kind: "control-point", pointId: 2 }], revision: state.revision,
  } });
  assert.equal(deletedControlPoint.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.bindings, ["DeleteControlPointFactory", "DeleteControlPointCommand"]);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{ points: [{ bodyId: 7, kind: "control-point", pointId: 2 }] }]);

  for (const arguments_ of [
    { ids: [7], method: "tolerance", toleranceMm: 0.1, revision: state.revision },
    { ids: [7], method: "control-points", pointCount: 9, preserveChain: false, revision: state.revision },
    { ids: [7], method: "degree-spans", degree: 5, spans: 3, keepCorners: false, revision: state.revision },
  ]) {
    const rebuilt = await client.callTool({ name: "plasticity_rebuild_curves", arguments: arguments_ });
    assert.equal(rebuilt.isError, undefined);
  }
  assert.deepEqual(nativeCalls.slice(-3).map((call) => call.values[0]), [
    { ids: [7], method: 0, parameters: { tolerance: 0.0001 }, preserveParameterization: false, preserveChain: true, keepCorners: true },
    { ids: [7], method: 1, parameters: { pointCount: 9 }, preserveParameterization: false, preserveChain: false, keepCorners: true },
    { ids: [7], method: 2, parameters: { degree: 5, spans: 3 }, preserveParameterization: false, preserveChain: true, keepCorners: false },
  ]);
  const raised = await client.callTool({ name: "plasticity_raise_curve_degree", arguments: { ids: [7], revision: state.revision } });
  const subdivided = await client.callTool({ name: "plasticity_subdivide_curves", arguments: { ids: [7], revision: state.revision } });
  assert.equal(raised.isError, undefined);
  assert.equal(subdivided.isError, undefined);
  assert.deepEqual(nativeCalls.slice(-2).map((call) => call.bindings), [
    ["RaiseDegreeCurveFactory", "RaiseDegreeCurveCommand"],
    ["SubdivideCurveFactory", "SubdivideCurveCommand"],
  ]);
  assert.deepEqual(nativeCalls.slice(-2).map((call) => call.values), [[{ ids: [7] }], [{ ids: [7] }]]);
  const insertedKnot = await client.callTool({ name: "plasticity_insert_curve_knot", arguments: {
    segment: { bodyId: 7, segmentEntityId: 99 }, normalizedParameter: 0.5, revision: state.revision,
  } });
  assert.equal(insertedKnot.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.bindings, ["InsertKnotFactory", "InsertKnotCommand"]);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{ reference: { bodyId: 7, segmentEntityId: 99 }, normalizedParameter: 0.5 }]);
  const invalidKnot = await client.callTool({ name: "plasticity_insert_curve_knot", arguments: {
    segment: { bodyId: 7, segmentEntityId: 99 }, normalizedParameter: 1, revision: state.revision,
  } });
  assert.equal(invalidKnot.isError, true);
  const splitSegment = await client.callTool({ name: "plasticity_split_curve_segment", arguments: {
    segment: { bodyId: 7, segmentEntityId: 99 }, normalizedParameter: 0.5, revision: state.revision,
  } });
  assert.equal(splitSegment.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.bindings, ["SplitSegmentFactory", "SplitSegmentCommand"]);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{ reference: { bodyId: 7, segmentEntityId: 99 }, normalizedParameter: 0.5 }]);
  const planarized = await client.callTool({ name: "plasticity_planarize_curves", arguments: {
    ids: [7], originMm: [0, 0, 5], normal: [0, 0, 2], revision: state.revision,
  } });
  assert.equal(planarized.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.bindings, ["PlanarizeCurveFactory", "DeformCurveCommand", "Vector3"]);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{ ids: [7], origin: [0, 0, 0.005], normal: [0, 0, 1] }]);
  const excessive = await client.callTool({ name: "plasticity_rebuild_curves", arguments: {
    ids: [7], method: "degree-spans", degree: 15, spans: 1000, revision: state.revision,
  } });
  assert.equal(excessive.isError, true);

  await client.close(); await server.close();
});

test("serializes exact surface inspection, degree elevation, face matching, and untrim through MCP", async () => {
  const nativeCalls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const state = emptyState();
  const face = {
    id: "f1", surfaceType: "BSurf", planar: false,
    centerMm: [10, 10, 5] as [number, number, number], normal: [0, 0, 1] as [number, number, number],
    radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null,
    boundsMm: { min: [0, 0, 0] as [number, number, number], max: [20, 20, 10] as [number, number, number] }, edgeIds: [],
  };
  const replacementFace = {
    ...face, id: "f2", surfaceType: "Cylinder", radiusMm: 20,
    axisOriginMm: [0, 0, 0] as [number, number, number], axisDirection: [0, 0, 1] as [number, number, number],
  };
  state.bodies = [
    { id: 7, versionId: 17, type: "Sheet", name: "Surface", boundsMm: face.boundsMm, faceIds: [face.id], edgeIds: [], faces: [face], edges: [] },
    { id: 8, versionId: 18, type: "Solid", name: "Reference", boundsMm: face.boundsMm, faceIds: [replacementFace.id], edgeIds: [], faces: [replacementFace], edges: [] },
  ];
  const structure = [{
    bodyId: 7, faceId: "f1", bodyVersionId: 17, measurementSource: "native-brep" as const,
    surfaceType: "BSurf", trimmed: true,
    faceParameterBounds: { uMin: -0.01, uMax: 0.01, vMin: -0.005, vMax: 0 },
    naturalParameterBounds: { uMin: -0.01, uMax: 0.01, vMin: -0.005, vMax: 0.012 },
    bSpline: { uDegree: 3, vDegree: 3, uSpanCount: 3, vSpanCount: 2, uControlPointCount: 6, vControlPointCount: 5, rational: false },
  }];
  const runtime = {
    getCapabilities() { return []; },
    async getState() { return state; },
    async readNative(source: string, bindings: string[], values: unknown[]) { nativeCalls.push({ source, bindings, values }); return structure; },
    async mutate(source: string, bindings: string[], values: unknown[]) { nativeCalls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime, "session-1");
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "surface-refinement-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  const faces = [{ bodyId: 7, faceId: "f1" }];

  const inspected = await client.callTool({ name: "plasticity_inspect_surface_structure", arguments: { faces, revision: state.revision } });
  assert.equal(inspected.isError, undefined);
  const inspectedText = (inspected.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  assert.match(inspectedText ?? "", /"uControlPointCount":6/);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{ faces }]);

  const raised = await client.callTool({ name: "plasticity_raise_surface_degree", arguments: { faces, revision: state.revision } });
  assert.equal(raised.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.bindings, ["RaiseDegreeFaceFactory", "RaiseDegreeFaceCommand"]);

  const replacement = { bodyId: 8, faceId: "f2" };
  const matched = await client.callTool({ name: "plasticity_match_faces", arguments: { faces, replacement, revision: state.revision } });
  assert.equal(matched.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.bindings, ["MatchFaceFactory", "MatchFaceCommand"]);
  assert.deepEqual(nativeCalls.at(-1)?.values, [{ faces, replacement }]);

  const untrimmed = await client.callTool({ name: "plasticity_untrim_faces", arguments: { faces, revision: state.revision } });
  assert.equal(untrimmed.isError, undefined);
  assert.deepEqual(nativeCalls.at(-1)?.bindings, ["UntrimFactory"]);

  const invalidInspect = await client.callTool({ name: "plasticity_inspect_surface_structure", arguments: { faces: [], revision: state.revision } });
  const invalidRaise = await client.callTool({ name: "plasticity_raise_surface_degree", arguments: { faces: [faces[0], faces[0]], revision: state.revision } });
  const invalidMatch = await client.callTool({ name: "plasticity_match_faces", arguments: { faces, replacement: faces[0], revision: state.revision } });
  assert.equal(invalidInspect.isError, true);
  assert.equal(invalidRaise.isError, true);
  assert.equal(invalidMatch.isError, true);

  await client.close(); await server.close();
});

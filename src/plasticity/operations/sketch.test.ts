import assert from "node:assert/strict";
import { test } from "node:test";
import { PlasticityOperations } from "../operations.ts";
import type { PlasticityRuntime, RuntimeState } from "../runtime.ts";
import { emptyConstruction, planeLocalOperations } from "./test-support.ts";

test("creates native constant-width slot profiles around current Wire spines", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [
      { id: 7, versionId: 17, type: "Wire", name: "Spine A", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] },
      { id: 8, versionId: 18, type: "Wire", name: "Spine B", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] },
    ],
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  assert.equal(await operations.createSlotProfiles([7, 8], 6, state.revision), state);

  assert.deepEqual(call?.bindings, ["SlotFactory", "SlotCommand"]);
  assert.deepEqual(call?.values, [{ ids: [7, 8], width: 0.006 }]);
  assert.match(call?.source ?? "", /factory\.curves = wires/u);
  assert.match(call?.source ?? "", /factory\.width = args\.width/u);
  assert.match(call?.source ?? "", /new Command\(this\)/u);
});

test("rejects invalid slot-profile sources before native mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [
      { id: 7, versionId: 17, type: "Wire", name: "Spine", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] },
      { id: 8, versionId: 18, type: "Solid", name: "Block", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] },
    ],
  };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.createSlotProfiles([], 6, state.revision), /at least one Wire/i);
  await assert.rejects(operations.createSlotProfiles([7, 7], 6, state.revision), /unique/i);
  await assert.rejects(operations.createSlotProfiles([8], 6, state.revision), /current Wire/i);
  await assert.rejects(operations.createSlotProfiles([99], 6, state.revision), /current Wire/i);
  await assert.rejects(operations.createSlotProfiles([7], 0, state.revision), /width must be positive/i);
  await assert.rejects(operations.createSlotProfiles([7], 6, "stale"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("creates an interpolating native NURBS curve from millimeter points", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.createNurbsCurve([[0, 0, 0], [10, 10, 0], [20, -10, 0], [30, 0, 0]], false, state.revision);

  assert.deepEqual(call?.bindings, ["CurveFactory", "Vector3", "CurveType"]);
  assert.deepEqual(call?.values, [{ points: [[0, 0, 0], [0.01, 0.01, 0], [0.02, -0.01, 0], [0.03, 0, 0]], closed: false }]);
  assert.match(call?.source ?? "", /factory\.type = CurveType\.NURBS/);
});

test("creates a constant-radius native helix from a millimeter axis", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = { async getState() { return state; }, async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.createHelix([0, 0, 0], [0, 0, 20], 5, 4, [1, 0, 0], "right", state.revision);

  assert.deepEqual(call?.bindings, ["SpiralFactory", "Vector3"]);
  assert.deepEqual(call?.values, [{ axisStart: [0, 0, 0], axisEnd: [0, 0, 0.02], radiusPoint: [0.005, 0, 0.02], radius: 0.005, turns: 4, handedness: true }]);
  assert.match(call?.source ?? "", /SpiralCommand/);
  assert.match(call?.source ?? "", /factory\.spiralPitch = 0/);
});

test("rejects invalid native helix geometry before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.createHelix([0, 0, 0], [0, 0, 0], 5, 4, [1, 0, 0], "right", state.revision), /axis/i);
  await assert.rejects(operations.createHelix([0, 0, 0], [0, 0, 20], 0, 4, [1, 0, 0], "right", state.revision), /radius/i);
  await assert.rejects(operations.createHelix([0, 0, 0], [0, 0, 20], 5, 0, [1, 0, 0], "right", state.revision), /turns/i);
  await assert.rejects(operations.createHelix([0, 0, 0], [0, 0, 20], 5, 4, [0, 0, 1], "right", state.revision), /radial direction/i);
  await assert.rejects(operations.createHelix([0, 0, 0], [0, 0, 20], 5, 4, [1, 0, 0], "right", "old-revision"), /stale reference/i);
  assert.equal(mutations, 0);
});

test("creates exact native two-point diameter circles in world and construction-plane coordinates", async () => {
  const world = planeLocalOperations();
  await world.operations.createTwoPointCircle([0, 0, 0], [20, 0, 0], "r1", [0, 0, 2]);
  assert.deepEqual(world.argumentsSeen(), [{ diameterStart: [0, 0, 0], diameterEnd: [0.02, 0, 0], normal: [0, 0, 1] }]);
  assert.match(world.sourceSeen() ?? "", /TwoPointCircleCommand/);
  assert.match(world.sourceSeen() ?? "", /factory\.p1\.fromArray\(args\.diameterStart\)/);
  assert.match(world.sourceSeen() ?? "", /factory\.p2\.fromArray\(args\.diameterEnd\)/);

  const local = planeLocalOperations();
  const plane = (await local.operations.listConstructionGeometry()).planes.find((candidate) => candidate.id === "plane:7")!;
  await local.operations.createTwoPointCircle([0, 0], [0, 8], "r1", undefined, plane.identity);
  assert.deepEqual(local.argumentsSeen(), [{
    diameterStart: [0.01, 0.02, 0.03],
    diameterEnd: [0.01, 0.02, 0.038],
    normal: [1, 0, 0],
  }]);
});

test("creates exact native three-point circles in world and construction-plane coordinates", async () => {
  const world = planeLocalOperations();
  await world.operations.createThreePointCircle([10, 0, 0], [0, 10, 0], [-10, 0, 0], "r1");
  assert.deepEqual(world.argumentsSeen(), [{ first: [0.01, 0, 0], second: [0, 0.01, 0], third: [-0.01, 0, 0] }]);
  assert.match(world.sourceSeen() ?? "", /ThreePointCircleCommand/);
  assert.match(world.sourceSeen() ?? "", /factory\.p3\.fromArray\(args\.third\)/);

  const local = planeLocalOperations();
  const plane = (await local.operations.listConstructionGeometry()).planes.find((candidate) => candidate.id === "plane:7")!;
  await local.operations.createThreePointCircle([4, 0], [0, 4], [-4, 0], "r1", plane.identity);
  assert.deepEqual(local.argumentsSeen(), [{
    first: [0.01, 0.024, 0.03],
    second: [0.01, 0.02, 0.034],
    third: [0.01, 0.016, 0.03],
  }]);
});

test("rejects invalid point-defined circles before mutation", async () => {
  const invalid = planeLocalOperations();
  await assert.rejects(invalid.operations.createTwoPointCircle([0, 0, 0], [0, 0, 0], "r1"), /distinct/i);
  await assert.rejects(invalid.operations.createTwoPointCircle([0, 0, 0], [20, 0, 0], "r1", [1, 0, 0]), /normal.*perpendicular/i);
  await assert.rejects(invalid.operations.createThreePointCircle([0, 0, 0], [1, 0, 0], [2, 0, 0], "r1"), /collinear/i);
  assert.equal(invalid.argumentsSeen(), undefined);
});

test("creates exact native arcs, ellipses, and regular polygons in planar frames", async () => {
  const arc = planeLocalOperations();
  await arc.operations.createCenterArc([10, 20, 30], 10, 0, 90, "r1");
  assert.deepEqual(arc.argumentsSeen(), [{
    center: [0.01, 0.02, 0.03],
    start: [0.02, 0.02, 0.03],
    end: [0.01, 0.03, 0.03],
    normal: [0, 0, 1],
  }]);
  assert.match(arc.sourceSeen() ?? "", /CenterPointArcCommand/);
  assert.match(arc.sourceSeen() ?? "", /factory\.lastSense = true/);

  const clockwiseArc = planeLocalOperations();
  await clockwiseArc.operations.createCenterArc([10, 20, 30], 10, 0, -90, "r1");
  assert.deepEqual(clockwiseArc.argumentsSeen(), [{
    center: [0.01, 0.02, 0.03],
    start: [0.02, 0.02, 0.03],
    end: [0.01, 0.01, 0.03],
    normal: [0, 0, -1],
  }]);

  const ellipse = planeLocalOperations();
  const plane = (await ellipse.operations.listConstructionGeometry()).planes.find((candidate) => candidate.id === "plane:7")!;
  await ellipse.operations.createEllipse([5, 7], 4, 2, "r1", undefined, undefined, plane.identity);
  assert.deepEqual(ellipse.argumentsSeen(), [{
    center: [0.01, 0.025, 0.037],
    majorPoint: [0.01, 0.029, 0.037],
    minorPoint: [0.01, 0.025, 0.039],
    normal: [1, 0, 0],
  }]);
  assert.match(ellipse.sourceSeen() ?? "", /EllipseCommand/);

  const polygon = planeLocalOperations();
  const polygonPlane = (await polygon.operations.listConstructionGeometry()).planes.find((candidate) => candidate.id === "plane:7")!;
  await polygon.operations.createRegularPolygon([5, 7], 4, "inradius", 6, "r1", undefined, undefined, polygonPlane.identity);
  assert.deepEqual(polygon.argumentsSeen(), [{
    center: [0.01, 0.025, 0.037],
    point: [0.01, 0.029, 0.037],
    normal: [1, 0, 0],
    radiusMode: "inradius",
    vertexCount: 6,
  }]);
  assert.match(polygon.sourceSeen() ?? "", /PolygonCommand/);
  assert.match(polygon.sourceSeen() ?? "", /'circumscribed'/);
});

test("creates exact native three-point arcs and preserves the ordered major arc", async () => {
  const world = planeLocalOperations();
  await world.operations.createThreePointArc([10, 0, 0], [0, -10, 0], [0, 10, 0], "r1");
  assert.deepEqual(world.argumentsSeen(), [{
    center: [0, 0, 0],
    start: [0.01, 0, 0],
    end: [0, 0.01, 0],
    normal: [0, 0, -1],
  }]);
  assert.match(world.sourceSeen() ?? "", /ThreePointArcCommand/);
  assert.match(world.sourceSeen() ?? "", /factory\.lastSense = true/);

  const local = planeLocalOperations();
  const plane = (await local.operations.listConstructionGeometry()).planes.find((candidate) => candidate.id === "plane:7")!;
  await local.operations.createThreePointArc([4, 0], [0, 4], [-4, 0], "r1", plane.identity);
  assert.deepEqual(local.argumentsSeen(), [{
    center: [0.01, 0.02, 0.03],
    start: [0.01, 0.024, 0.03],
    end: [0.01, 0.016, 0.03],
    normal: [1, 0, 0],
  }]);
});

test("rejects invalid native arc, ellipse, and polygon parameters before mutation", async () => {
  const invalid = planeLocalOperations();
  await assert.rejects(invalid.operations.createCenterArc([0, 0, 0], 0, 0, 90, "r1"), /arc radius/i);
  await assert.rejects(invalid.operations.createCenterArc([0, 0, 0], 10, 0, 0, "r1"), /sweep angle/i);
  await assert.rejects(invalid.operations.createCenterArc([0, 0, 0], 10, 0, 360, "r1"), /less than 360/i);
  await assert.rejects(invalid.operations.createEllipse([0, 0, 0], 5, 6, "r1"), /minor radius.*exceed/i);
  await assert.rejects(invalid.operations.createRegularPolygon([0, 0, 0], 5, "circumradius", 2, "r1"), /vertex count/i);
  await assert.rejects(invalid.operations.createRegularPolygon([0, 0, 0], 5, "circumradius", 6, "r1", [0, 0, 1], [0, 0, 2]), /parallel/i);
  assert.equal(invalid.argumentsSeen(), undefined);
});

test("rejects duplicate and collinear three-point arcs before mutation", async () => {
  const duplicate = planeLocalOperations();
  await assert.rejects(duplicate.operations.createThreePointArc([0, 0, 0], [0, 0, 0], [1, 0, 0], "r1"), /distinct/i);
  assert.equal(duplicate.argumentsSeen(), undefined);

  const collinear = planeLocalOperations();
  await assert.rejects(collinear.operations.createThreePointArc([0, 0, 0], [1, 0, 0], [2, 0, 0], "r1"), /collinear/i);
  assert.equal(collinear.argumentsSeen(), undefined);
});

test("creates native minor and major tangent arcs from exact Wire segments", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const wire = { id: 7, versionId: 17, type: "Wire", name: "Guide", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "doc-1", revision: "r1",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire],
  };
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime, "session-1");

  await operations.createTangentArc(7, 99, "end", [30, 10, 0], false, "r1");
  await operations.createTangentArc(7, 99, "end", [30, 10, 0], true, "r1");

  assert.deepEqual(calls.map((call) => call.values), [
    [{ bodyId: 7, segmentEntityId: 99, startAt: "end", end: [0.03, 0.01, 0], flipTangent: false }],
    [{ bodyId: 7, segmentEntityId: 99, startAt: "end", end: [0.03, 0.01, 0], flipTangent: true }],
  ]);
  assert.deepEqual(calls[0]?.bindings, ["TangentArcFactory", "Vector3"]);
  assert.match(calls[0]?.source ?? "", /TangentArcCommand/);
  assert.match(calls[0]?.source ?? "", /factory\.segment = segment/);
  assert.match(calls[0]?.source ?? "", /GetPointAndTangent\(parameter\)/);
  assert.match(calls[0]?.source ?? "", /source tangent line/);
});

test("rejects invalid tangent-circle geometry before native mutation", async () => {
  const wires = [
    { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
    { id: 8, versionId: 18, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
    { id: 9, versionId: 19, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
  ];
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "doc-1", revision: "r1",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: wires,
  };
  const directions = [
    { id: 7, versionId: 17, measurementSource: "native-brep" as const, closed: false, segments: [{ entityId: 91, startMm: [0, 0, 0], endMm: [10, 0, 0], startTangent: [1, 0, 0], endTangent: [1, 0, 0], lengthMm: 10 }] },
    { id: 8, versionId: 18, measurementSource: "native-brep" as const, closed: false, segments: [{ entityId: 92, startMm: [0, 0, 0], endMm: [0, 10, 0], startTangent: [0, 1, 0], endTangent: [0, 1, 0], lengthMm: 10 }] },
  ];
  let mutated = false;
  const runtime = { async getState() { return state; }, async readNative() { return directions; }, async mutate() { mutated = true; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime, "session-1");
  const first = { bodyId: 7, segmentEntityId: 91 };
  const second = { bodyId: 8, segmentEntityId: 92 };

  await assert.rejects(operations.createTangentCircle(first, first, [5, 5, 0], 5, "r1"), /must be different/i);
  await assert.rejects(operations.createTangentCircle(first, { bodyId: 9, segmentEntityId: 92 }, [5, 5, 0], 5, "r1"), /current Wire/i);
  await assert.rejects(operations.createTangentCircle(first, { bodyId: 8, segmentEntityId: 999 }, [5, 5, 0], 5, "r1"), /stale or unknown/i);
  await assert.rejects(operations.createTangentCircle(first, second, [5, 5, 0], 0, "r1"), /radius must be positive/i);
  await assert.rejects(operations.createTangentCircle(first, second, [5, 5] as [number, number], 5, "r1"), /world-space.*three coordinates/i);
  await assert.rejects(operations.createTangentCircle(first, second, [5, 5, 0], 5, "old"), /stale reference/i);
  assert.equal(mutated, false);
});

test("bridges exact Wire endpoints with independent native continuity modes", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const wires = [
    { id: 7, versionId: 17, type: "Wire", name: "First", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
    { id: 8, versionId: 18, type: "Wire", name: "Second", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
  ];
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "doc-1", revision: "r1",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: wires,
  };
  const directions = [
    { id: 7, versionId: 17, measurementSource: "native-brep" as const, closed: false, segments: [{ entityId: 91, startMm: [0, 0, 0], endMm: [10, 0, 0], startTangent: [1, 0, 0], endTangent: [1, 0, 0], lengthMm: 10 }] },
    { id: 8, versionId: 18, measurementSource: "native-brep" as const, closed: false, segments: [{ entityId: 92, startMm: [20, 10, 0], endMm: [30, 10, 0], startTangent: [1, 0, 0], endTangent: [1, 0, 0], lengthMm: 10 }] },
  ];
  const runtime = {
    async getState() { return state; },
    async readNative() { return directions; },
    async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime, "session-1");
  const first = { bodyId: 7, segmentEntityId: 91, at: "end" as const };
  const second = { bodyId: 8, segmentEntityId: 92, at: "start" as const };

  await operations.bridgeCurves(first, second, "G1", "G3", "r1");

  assert.deepEqual(calls[0]?.bindings, ["BridgeCurveFactory", "ContinuityType"]);
  assert.deepEqual(calls[0]?.values, [{ first, second, startContinuity: "G1", endContinuity: "G3" }]);
  assert.match(calls[0]?.source ?? "", /BridgeCurveCommand/);
  assert.match(calls[0]?.source ?? "", /factory\.t1 = args\.first\.at === 'start' \? 0 : 1/);
  assert.match(calls[0]?.source ?? "", /factory\.trim = false/);
  assert.match(calls[0]?.source ?? "", /factory\.pickClosestSenses\(\)/);
});

test("rejects stale, missing, coincident, and non-Wire Curve Bridge references before mutation", async () => {
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const solid = { id: 8, versionId: 18, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "doc-1", revision: "r1", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire, solid] };
  let mutated = false;
  let directions = [{ id: 7, versionId: 17, measurementSource: "native-brep" as const, closed: false, segments: [{ entityId: 91, startMm: [0, 0, 0], endMm: [10, 0, 0], startTangent: [1, 0, 0], endTangent: [1, 0, 0], lengthMm: 10 }] }];
  const runtime = { async getState() { return state; }, async readNative() { return directions; }, async mutate() { mutated = true; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime, "session-1");
  const start = { bodyId: 7, segmentEntityId: 91, at: "start" as const };
  const end = { bodyId: 7, segmentEntityId: 91, at: "end" as const };

  await assert.rejects(operations.bridgeCurves(start, { bodyId: 8, segmentEntityId: 92, at: "start" }, "G1", "G1", "r1"), /current Wire/i);
  await assert.rejects(operations.bridgeCurves(start, { bodyId: 7, segmentEntityId: 999, at: "end" }, "G1", "G1", "r1"), /stale or unknown/i);
  await assert.rejects(operations.bridgeCurves(start, start, "G1", "G1", "r1"), /must be different/i);
  directions = [{ ...directions[0]!, segments: [{ ...directions[0]!.segments[0]!, endMm: [0, 0, 0] }] }];
  await assert.rejects(operations.bridgeCurves(start, end, "G1", "G1", "r1"), /must be distinct/i);
  await assert.rejects(operations.bridgeCurves(start, end, "G1", "G1", "old"), /stale reference/i);
  assert.equal(mutated, false);
});

test("bridges exact open Wire vertices with native continuity", async () => {
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const bodies = [
    { id: 7, versionId: 17, type: "Wire", name: "First", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] },
    { id: 8, versionId: 18, type: "Wire", name: "Second", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] },
  ];
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "doc-1", revision: "r1", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies };
  const vertices = [
    { id: "7:101", bodyId: 7, bodyVersionId: 17, vertexId: 101, viewVersionId: "17v101", measurementSource: "native-brep", positionMm: [10, 0, 0] as [number, number, number], endpoint: true, adjacentEdgeEntityIds: [1001] },
    { id: "8:201", bodyId: 8, bodyVersionId: 18, vertexId: 201, viewVersionId: "18v201", measurementSource: "native-brep", positionMm: [20, 10, 0] as [number, number, number], endpoint: true, adjacentEdgeEntityIds: [2001] },
  ];
  const runtime = {
    async getState() { return state; },
    async readNative() { return vertices; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const first = { bodyId: 7, vertexId: 101 };
  const second = { bodyId: 8, vertexId: 201 };

  await operations.bridgeCurveVertices(first, second, "G1", "G3", state.revision);

  assert.deepEqual(call?.bindings, ["BridgeVertexFactory", "BridgeVertexCommand", "ContinuityType"]);
  assert.deepEqual(call?.values, [{ first, second, firstPosition: [0.01, 0, 0], secondPosition: [0.02, 0.01, 0], startContinuity: "G1", endContinuity: "G3" }]);
  assert.match(call?.source ?? "", /factory\.vertex1 = vertex\(args\.first\)/);
  assert.match(call?.source ?? "", /matches\(factory\.startPosition, args\.firstPosition\)/);
  assert.match(call?.source ?? "", /factory\.startCurvature = Continuity\[args\.startContinuity\]/);
  assert.match(call?.source ?? "", /factory\.lockDistances = true/);
  assert.match(call?.source ?? "", /selection\.selected\.removeAll\(\)/);
});

test("rejects invalid Curve Vertex Bridge endpoints before native mutation", async () => {
  let mutations = 0;
  let vertices = [
    { id: "7:101", bodyId: 7, bodyVersionId: 17, vertexId: 101, viewVersionId: "17v101", measurementSource: "native-brep", positionMm: [0, 0, 0] as [number, number, number], endpoint: true, adjacentEdgeEntityIds: [1001] },
    { id: "8:201", bodyId: 8, bodyVersionId: 18, vertexId: 201, viewVersionId: "18v201", measurementSource: "native-brep", positionMm: [20, 0, 0] as [number, number, number], endpoint: true, adjacentEdgeEntityIds: [2001] },
  ];
  const wire = { id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] };
  const second = { ...wire, id: 8, versionId: 18 };
  const solid = { ...wire, id: 9, versionId: 19, type: "Solid" };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "doc-1", revision: "r1", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [wire, second, solid] };
  const runtime = { async getState() { return state; }, async readNative() { return vertices; }, async mutate() { mutations += 1; return {}; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  const first = { bodyId: 7, vertexId: 101 };
  const validSecond = { bodyId: 8, vertexId: 201 };

  await assert.rejects(operations.bridgeCurveVertices(first, validSecond, "G2", "G2", "old"), /stale reference/i);
  await assert.rejects(operations.bridgeCurveVertices(first, first, "G2", "G2", "r1"), /references must be different/i);
  await assert.rejects(operations.bridgeCurveVertices(first, { bodyId: 10, vertexId: 201 }, "G2", "G2", "r1"), /unknown current/i);
  await assert.rejects(operations.bridgeCurveVertices(first, { bodyId: 9, vertexId: 201 }, "G2", "G2", "r1"), /current Wire/i);
  await assert.rejects(operations.bridgeCurveVertices(first, { ...validSecond, vertexId: 999 }, "G2", "G2", "r1"), /unknown Curve Vertex Bridge vertex/i);
  vertices = [{ ...vertices[0]!, endpoint: false }, vertices[1]!];
  await assert.rejects(operations.bridgeCurveVertices(first, validSecond, "G2", "G2", "r1"), /open Wire endpoint/i);
  vertices = [{ ...vertices[0]!, endpoint: true }, { ...vertices[1]!, positionMm: [0, 0, 0] }];
  await assert.rejects(operations.bridgeCurveVertices(first, validSecond, "G2", "G2", "r1"), /endpoints must be distinct/i);
  assert.equal(mutations, 0);
});

test("creates exact three-point rectangles in world and plane-local coordinates", async () => {
  const world = planeLocalOperations();
  await world.operations.createRectangle(
    [10, 20, 30],
    40,
    20,
    "r1",
    [0, 0, 1],
    [1, 0, 0],
    undefined,
    90,
  );
  const worldArguments = world.argumentsSeen() as Array<{ p1: number[]; p2: number[]; p3: number[] }>;
  assert.deepEqual(worldArguments.map(({ p1, p2, p3 }) => ({
    p1: p1.map((value) => Math.abs(value) < 1e-12 ? 0 : value),
    p2: p2.map((value) => Math.abs(value) < 1e-12 ? 0 : value),
    p3: p3.map((value) => Math.abs(value) < 1e-12 ? 0 : value),
  })), [{
    p1: [0.02, 0, 0.03],
    p2: [0.02, 0.04, 0.03],
    p3: [0, 0.04, 0.03],
  }]);
  assert.match(world.sourceSeen() ?? "", /ThreePointRectangleCommand/);

  const local = planeLocalOperations();
  const plane = (await local.operations.listConstructionGeometry()).planes.find((candidate) => candidate.id === "plane:7")!;
  await local.operations.createRectangle([5, 7], 4, 2, "r1", undefined, undefined, plane.identity);
  assert.deepEqual(local.argumentsSeen(), [{
    p1: [0.01, 0.023, 0.036],
    p2: [0.01, 0.027, 0.036],
    p3: [0.01, 0.027, 0.038],
  }]);
});

test("rejects invalid rectangle dimensions and parallel world axes before mutation", async () => {
  const invalidSize = planeLocalOperations();
  await assert.rejects(
    invalidSize.operations.createRectangle([0, 0, 0], 0, 10, "r1"),
    /width.*positive/i,
  );
  assert.equal(invalidSize.argumentsSeen(), undefined);

  const parallel = planeLocalOperations();
  await assert.rejects(
    parallel.operations.createRectangle([0, 0, 0], 10, 10, "r1", [0, 0, 1], [0, 0, 2]),
    /parallel/i,
  );
  assert.equal(parallel.argumentsSeen(), undefined);
});

test("creates native text outlines with one unit conversion and an explicit planar frame", async () => {
  const world = planeLocalOperations();
  await world.operations.createText({
    text: "M5",
    fontSizeMm: 10,
    originMm: [20, 30, 40],
    font: "inter",
    name: "Fastener label",
    revision: "r1",
    normal: [1, 0, 0],
    xDirection: [0, 1, 0],
  });
  assert.deepEqual(world.argumentsSeen(), [{
    text: "M5",
    font: "inter",
    size: 0.01,
    origin: [0.02, 0.03, 0.04],
    x: [0, 1, 0],
    y: [0, 0, 1],
    z: [1, 0, 0],
    rotate: true,
    move: true,
    name: "Fastener label",
  }]);
  assert.match(world.sourceSeen() ?? "", /new TextFactory\(editor\)/);
  assert.match(world.sourceSeen() ?? "", /new RotateFactory\(editor\)/);
  assert.match(world.sourceSeen() ?? "", /new MoveFactory\(editor\)/);

  const local = planeLocalOperations();
  const plane = (await local.operations.listConstructionGeometry()).planes.find((candidate) => candidate.id === "plane:7")!;
  await local.operations.createText({ text: "A", fontSizeMm: 5, originMm: [5, 7], revision: "r1", plane: plane.identity });
  assert.deepEqual(local.argumentsSeen(), [{
    text: "A",
    font: "inter",
    size: 0.005,
    origin: [0.01, 0.025, 0.037],
    x: [0, 1, 0],
    y: [0, 0, 1],
    z: [1, 0, 0],
    rotate: true,
    move: true,
    name: null,
  }]);
});

test("rejects empty text, invalid font size, and parallel text axes before mutation", async () => {
  const empty = planeLocalOperations();
  await assert.rejects(empty.operations.createText({ text: " ", fontSizeMm: 5, originMm: [0, 0, 0], revision: "r1" }), /text.*nonempty/i);
  assert.equal(empty.argumentsSeen(), undefined);

  const invalidSize = planeLocalOperations();
  await assert.rejects(invalidSize.operations.createText({ text: "A", fontSizeMm: 0, originMm: [0, 0, 0], revision: "r1" }), /font size.*positive/i);
  assert.equal(invalidSize.argumentsSeen(), undefined);

  const parallel = planeLocalOperations();
  await assert.rejects(parallel.operations.createText({
    text: "A", fontSizeMm: 5, originMm: [0, 0, 0], revision: "r1", normal: [0, 0, 1], xDirection: [0, 0, 1],
  }), /parallel/i);
  assert.equal(parallel.argumentsSeen(), undefined);
});

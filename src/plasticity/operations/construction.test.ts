import assert from "node:assert/strict";
import { test } from "node:test";
import { PlasticityOperations } from "./index.ts";
import { frameFromOriginNormalX } from "../construction.ts";
import type { PlasticityRuntime, RuntimeState } from "../runtime.ts";
import { constructionOperations, emptyConstruction, planeLocalOperations } from "./test-support.ts";

test("defines exact coordinate datums without entering a native mutation", async () => {
  const { operations, wasMutated } = constructionOperations();
  const point = await operations.defineDatumPoint({ type: "coordinates", pointMm: [1, 2, 3] }, "r1");
  const axis = await operations.defineDatumAxis({ type: "origin-direction", originMm: [1, 2, 3], direction: [0, 0, 5] }, "r1");
  assert.deepEqual(point.pointMm, [1, 2, 3]);
  assert.deepEqual(axis.direction, [0, 0, 1]);
  assert.equal(wasMutated(), false);
});

test("rejects coincident and collinear datum definitions before CDP mutation", async () => {
  const { operations, wasMutated } = constructionOperations();
  const a = await operations.defineDatumPoint({ type: "coordinates", pointMm: [0, 0, 0] }, "r1");
  const b = await operations.defineDatumPoint({ type: "coordinates", pointMm: [1, 0, 0] }, "r1");
  const c = await operations.defineDatumPoint({ type: "coordinates", pointMm: [2, 0, 0] }, "r1");
  await assert.rejects(operations.defineDatumAxis({ type: "two-points", firstId: a.id, secondId: a.id }, "r1"), /zero|short/i);
  await assert.rejects(operations.createConstructionPlane({ type: "three-points", firstId: a.id, secondId: b.id, thirdId: c.id }, "Bad", "r1"), /collinear/i);
  assert.equal(wasMutated(), false);
});

test("rejects stale identities, standard-plane removal, and off-plane rotation before mutation", async () => {
  const { operations, wasMutated } = constructionOperations();
  const listed = await operations.listConstructionGeometry();
  const top = listed.planes.find((plane) => plane.id === "standard:top")!;
  const axis = await operations.defineDatumAxis({ type: "origin-direction", originMm: [0, 0, 1], direction: [1, 0, 0] }, "r1");

  await assert.rejects(operations.setConstructionWorkplane({ ...top.identity, sessionId: "other" }), /session/i);
  await assert.rejects(operations.removeConstructionPlane(top.identity), /standard/i);
  await assert.rejects(operations.createConstructionPlane({ type: "rotated", planeId: top.id, axisId: axis.id, angleDegrees: 30 }, "Bad", "r1"), /coplanar/i);
  assert.equal(wasMutated(), false);
});

test("transforms plane-local polyline points before the single native unit conversion", async () => {
  const { operations, argumentsSeen } = planeLocalOperations();
  const listed = await operations.listConstructionGeometry();
  const plane = listed.planes.find((candidate) => candidate.id === "plane:7")!;
  assert.equal(listed.activePlaneId, "plane:7");
  assert.equal(listed.activePlane?.nativeId, "7");
  await operations.createPolyline([[5, 7], [6, 8]], false, "r1", plane.identity);
  assert.deepEqual(argumentsSeen(), [{ points: [[0.01, 0.025, 0.037], [0.01, 0.026, 0.038]], closed: false }]);
});

test("refreshes a two-point axis by re-resolving its point definitions", async () => {
  let state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "doc-1", revision: "r1",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [], construction: emptyConstruction, bodies: [],
  };
  const runtime = { getCapabilities() { return []; }, async getState() { return state; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime, "session-1");
  const first = await operations.defineDatumPoint({ type: "coordinates", pointMm: [0, 0, 0] }, "r1");
  const second = await operations.defineDatumPoint({ type: "coordinates", pointMm: [0, 5, 0] }, "r1");
  const axis = await operations.defineDatumAxis({ type: "two-points", firstId: first.id, secondId: second.id }, "r1");
  state = { ...state, revision: "r2", dbVersion: 2 };

  await assert.rejects(
    operations.defineDatumAxis({ type: "two-points", firstId: first.id, secondId: second.id }, "r2"),
    /stale/i,
  );
  const refreshed = await operations.refreshDatum(axis.identity);
  assert.equal(refreshed.kind, "datum-axis");
  if (refreshed.kind !== "datum-axis") throw new Error("Expected refreshed datum axis");
  assert.equal(refreshed.refreshedFromId, axis.id);
  assert.deepEqual(refreshed.direction, [0, 1, 0]);
  assert.equal(refreshed.revision, "r2");
});

test("keeps existing world-space curve arguments unchanged and orients local circles from the plane", async () => {
  const local = planeLocalOperations();
  const plane = (await local.operations.listConstructionGeometry()).planes.find((candidate) => candidate.id === "plane:7")!;
  await local.operations.createCircle([5, 7], 2, "r1", undefined, plane.identity);
  assert.deepEqual(local.argumentsSeen(), [{ center: [0.01, 0.025, 0.037], radius: 0.002, normal: [1, 0, 0] }]);
  assert.match(local.sourceSeen() ?? "", /factory\.point\.copy\(factory\.center\)/);

  const world = planeLocalOperations();
  await world.operations.createPolyline([[10, 25, 37], [10, 26, 38]], false, "r1");
  assert.deepEqual(world.argumentsSeen(), [{ points: [[0.01, 0.025, 0.037], [0.01, 0.026, 0.038]], closed: false }]);
});

test("transforms plane-local tangent-arc endpoints and rejects non-Wire sources", async () => {
  const local = planeLocalOperations([{ id: 7, versionId: 17, type: "Wire", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] }]);
  const plane = (await local.operations.listConstructionGeometry()).planes.find((candidate) => candidate.id === "plane:7")!;
  await local.operations.createTangentArc(7, 99, "start", [5, 7], false, "r1", plane.identity);
  assert.deepEqual(local.argumentsSeen(), [{ bodyId: 7, segmentEntityId: 99, startAt: "start", end: [0.01, 0.025, 0.037], flipTangent: false }]);

  const invalid = planeLocalOperations([{ id: 8, versionId: 18, type: "Solid", name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] }]);
  await assert.rejects(invalid.operations.createTangentArc(8, 99, "end", [30, 10, 0], false, "r1"), /current Wire/i);
  assert.equal(invalid.argumentsSeen(), undefined);
});

test("creates a native fixed-radius circle tangent to two exact Wire segments", async () => {
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  const wires = [
    { id: 7, versionId: 17, type: "Wire", name: "Horizontal", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
    { id: 8, versionId: 18, type: "Wire", name: "Vertical", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
  ];
  const plane = {
    id: "plane:7", nativeId: "7", name: "Local", source: "saved" as const,
    ...frameFromOriginNormalX([10, 20, 30], [1, 0, 0], [0, 1, 0]),
  };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "doc-1", revision: "r1",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [],
    construction: { planes: [plane], activePlaneId: plane.id, planeStateToken: "p1", viewStateToken: "v1" }, bodies: wires,
  };
  const directions = [
    { id: 7, versionId: 17, measurementSource: "native-brep" as const, closed: false, segments: [{ entityId: 91, startMm: [-20, 0, 0], endMm: [20, 0, 0], startTangent: [1, 0, 0], endTangent: [1, 0, 0], lengthMm: 40 }] },
    { id: 8, versionId: 18, measurementSource: "native-brep" as const, closed: false, segments: [{ entityId: 92, startMm: [0, -20, 0], endMm: [0, 20, 0], startTangent: [0, 1, 0], endTangent: [0, 1, 0], lengthMm: 40 }] },
  ];
  const runtime = {
    async getState() { return state; },
    async readNative() { return directions; },
    async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime, "session-1");
  const first = { bodyId: 7, segmentEntityId: 91 };
  const second = { bodyId: 8, segmentEntityId: 92 };
  const planeRef = (await operations.listConstructionGeometry()).planes.find((candidate) => candidate.id === plane.id)!.identity;

  await operations.createTangentCircle(first, second, [5, 5, 0], 5, "r1", [0, 0, 1]);
  await operations.createTangentCircle(first, second, [5, 7], 2, "r1", undefined, planeRef);

  assert.deepEqual(calls.map((call) => call.bindings), [
    ["TangentCircleFactory", "TangentCircleCommand", "Vector3"],
    ["TangentCircleFactory", "TangentCircleCommand", "Vector3"],
  ]);
  assert.deepEqual(calls.map((call) => call.values), [[{
    first, second, solutionPoint: [0.005, 0.005, 0], normal: [0, 0, 1], radius: 0.005,
  }], [{
    first, second, solutionPoint: [0.01, 0.025, 0.037], normal: [1, 0, 0], radius: 0.002,
  }]]);
  assert.match(calls[0]?.source ?? "", /factory\.segment1 = segment\(args\.first\)/);
  assert.match(calls[0]?.source ?? "", /factory\.segment2 = segment\(args\.second\)/);
  assert.match(calls[0]?.source ?? "", /factory\.radius = args\.radius/);
  assert.match(calls[0]?.source ?? "", /selection\.selected\.removeAll\(\)/);
});

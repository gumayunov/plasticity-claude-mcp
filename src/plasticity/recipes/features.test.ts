import assert from "node:assert/strict";
import { test } from "node:test";
import { PlasticityRecipes } from "./index.ts";
import { type RecipeOperations, body, counterboreOperations, scene } from "./test-support.ts";

test("rib creates a closed profile, extrudes its region, and joins the Solid to its support", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const target = body(7, "Solid");
  let state = scene("r1", [target]);
  const operations: RecipeOperations = {
    async state() { return state; },
    async createPolyline(pointsMm, closed, revision) {
      calls.push({ operation: "createPolyline", pointsMm, closed, revision });
      state = { ...scene("r2", [target, body(8, "Wire")]), regions: [{
        id: "region-8", entityId: 80, islandVersionId: 81, sketchId: 82, sketchWireIds: [8],
        measurementSource: "render-mesh", displayBoundsMm: { min: [10, 18, 3.5], max: [30, 18, 14] },
      }] };
      return state;
    },
    async extrudeRegions(regionIds, distanceMm, revision) {
      calls.push({ operation: "extrudeRegions", regionIds, distanceMm, revision });
      state = { ...state, revision: "r3", bodies: [...state.bodies, body(9, "Solid")] };
      return state;
    },
    async boolean(targetIds, toolIds, kind, keepTools, revision) {
      calls.push({ operation: "boolean", targetIds, toolIds, kind, keepTools, revision });
      state = { ...state, revision: "r4", bodies: state.bodies.filter((candidate) => !toolIds.includes(candidate.id)) };
      return state;
    },
    async createCylinder() { throw new Error("unexpected cylinder"); },
    async rectangularPattern() { throw new Error("unexpected pattern"); },
    async createPipes() { throw new Error("unexpected pipe"); },
    async fillet() { throw new Error("unexpected fillet"); },
    async createBox() { throw new Error("unexpected box"); },
  };
  const recipes = new PlasticityRecipes(operations);
  const points: Array<[number, number, number]> = [[10, 18, 3.5], [30, 18, 3.5], [10, 18, 14]];

  const result = await recipes.createRib({ targetId: 7, profilePointsMm: points, thicknessMm: 4, revision: "r1" });

  assert.deepEqual(calls, [
    { operation: "createPolyline", pointsMm: points, closed: true, revision: "r1" },
    { operation: "extrudeRegions", regionIds: ["region-8"], distanceMm: 4, revision: "r2" },
    { operation: "boolean", targetIds: [7], toolIds: [9], kind: "union", keepTools: false, revision: "r3" },
  ]);
  assert.equal(result.recipe, "rib");
  assert.equal(result.profileBodyId, 8);
  assert.deepEqual(result.resultBodyIds, [7]);
  assert.deepEqual(result.consumedToolIds, [9]);
  assert.equal(result.undoSteps, 3);
});

test("rib rejects non-coplanar profile points before mutation", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const operations = {
    async state() { calls.push({ operation: "state" }); return scene("r1", [body(7, "Solid")]); },
    async createPolyline() { calls.push({ operation: "createPolyline" }); return scene("r2", []); },
    async extrudeRegions() { throw new Error("unexpected extrude"); },
    async boolean() { throw new Error("unexpected boolean"); },
    async createCylinder() { throw new Error("unexpected cylinder"); },
    async rectangularPattern() { throw new Error("unexpected pattern"); },
    async createPipes() { throw new Error("unexpected pipe"); },
    async fillet() { throw new Error("unexpected fillet"); },
    async createBox() { throw new Error("unexpected box"); },
  } as RecipeOperations;
  const recipes = new PlasticityRecipes(operations);

  await assert.rejects(recipes.createRib({
    targetId: 7,
    profilePointsMm: [[0, 0, 0], [10, 0, 0], [0, 10, 0], [5, 5, 1]],
    thicknessMm: 2,
    revision: "r1",
  }), /coplanar/i);
  assert.deepEqual(calls, []);
});

test("round vent array patterns one cutter before a single boolean", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const target = body(7, "Solid");
  let state = scene("r1", [target]);
  const operations: RecipeOperations = {
    async state() { return state; },
    async createCylinder(centerMm, radiusMm, heightMm, _name, revision, axis) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, axis, revision });
      state = scene("r2", [target, body(8, "Solid")]);
      return state;
    },
    async rectangularPattern(ids, direction1, count1, spacing1Mm, direction2, count2, spacing2Mm, revision) {
      calls.push({ operation: "rectangularPattern", ids, direction1, count1, spacing1Mm, direction2, count2, spacing2Mm, revision });
      state = scene("r3", [target, ...[8, 9, 10, 11, 12, 13].map((id) => body(id, "Solid"))]);
      return state;
    },
    async boolean(targetIds, toolIds, kind, keepTools, revision) {
      calls.push({ operation: "boolean", targetIds, toolIds, kind, keepTools, revision });
      state = scene("r4", [target]);
      return state;
    },
    async createPolyline() { throw new Error("unexpected polyline"); },
    async extrudeRegions() { throw new Error("unexpected extrusion"); },
    async createPipes() { throw new Error("unexpected pipe"); },
    async fillet() { throw new Error("unexpected fillet"); },
    async createBox() { throw new Error("unexpected box"); },
  };
  const recipes = new PlasticityRecipes(operations);

  const result = await recipes.createRoundVentArray({
    targetId: 7,
    firstCenterMm: [10, 10, 4],
    axis: [0, 0, -1],
    holeDiameterMm: 3,
    throughDepthMm: 4,
    direction1: [1, 0, 0],
    count1: 3,
    spacing1Mm: 6,
    direction2: [0, 1, 0],
    count2: 2,
    spacing2Mm: 7,
    overshootMm: 0.5,
    revision: "r1",
  });

  assert.deepEqual(calls, [
    { operation: "createCylinder", centerMm: [10, 10, 4.5], radiusMm: 1.5, heightMm: 5, axis: [0, 0, -1], revision: "r1" },
    { operation: "rectangularPattern", ids: [8], direction1: [1, 0, 0], count1: 3, spacing1Mm: 6, direction2: [0, 1, 0], count2: 2, spacing2Mm: 7, revision: "r2" },
    { operation: "boolean", targetIds: [7], toolIds: [8, 9, 10, 11, 12, 13], kind: "difference", keepTools: false, revision: "r3" },
  ]);
  assert.equal(result.recipe, "round-vent-array");
  assert.equal(result.holeCount, 6);
  assert.equal(result.undoSteps, 3);
  assert.deepEqual(result.consumedToolIds, [8, 9, 10, 11, 12, 13]);
});

test("round vent array rejects parallel active directions before mutation", async () => {
  const fake = counterboreOperations();
  const recipes = new PlasticityRecipes(fake.operations);
  await assert.rejects(recipes.createRoundVentArray({
    targetId: 7,
    firstCenterMm: [10, 10, 4], axis: [0, 0, -1],
    holeDiameterMm: 3, throughDepthMm: 4,
    direction1: [1, 0, 0], count1: 3, spacing1Mm: 6,
    direction2: [2, 0, 0], count2: 2, spacing2Mm: 7,
    overshootMm: 0.5, revision: "r1",
  }), /parallel/i);
  assert.deepEqual(fake.calls, []);
});

test("cable channel creates solid pipe cutters and subtracts them from the target", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const target = body(7, "Solid");
  const spine = body(8, "Wire");
  let state = scene("r1", [target, spine]);
  const operations: RecipeOperations = {
    async state() { return state; },
    async createPipes(spineIds, diameterMm, wallThicknessMm, revision) {
      calls.push({ operation: "createPipes", spineIds, diameterMm, wallThicknessMm, revision });
      state = scene("r2", [target, spine, body(9, "Solid")]);
      return state;
    },
    async boolean(targetIds, toolIds, kind, keepTools, revision) {
      calls.push({ operation: "boolean", targetIds, toolIds, kind, keepTools, revision });
      state = scene("r3", [target, spine]);
      return state;
    },
    async createCylinder() { throw new Error("unexpected cylinder"); },
    async createPolyline() { throw new Error("unexpected polyline"); },
    async extrudeRegions() { throw new Error("unexpected extrusion"); },
    async rectangularPattern() { throw new Error("unexpected pattern"); },
    async fillet() { throw new Error("unexpected fillet"); },
    async createBox() { throw new Error("unexpected box"); },
  };
  const recipes = new PlasticityRecipes(operations);

  const result = await recipes.cutCableChannel({ targetId: 7, spineIds: [8], channelDiameterMm: 6, revision: "r1" });

  assert.deepEqual(calls, [
    { operation: "createPipes", spineIds: [8], diameterMm: 6, wallThicknessMm: 0, revision: "r1" },
    { operation: "boolean", targetIds: [7], toolIds: [9], kind: "difference", keepTools: false, revision: "r2" },
  ]);
  assert.equal(result.recipe, "cable-channel");
  assert.equal(result.undoSteps, 2);
  assert.deepEqual(result.spineIds, [8]);
  assert.deepEqual(result.consumedToolIds, [9]);
  assert.deepEqual(result.steps.map((step) => step.operation), ["create-cable-channel-cutters", "boolean-difference"]);
});

test("cable channel rejects a target reused as its path before mutation", async () => {
  const fake = counterboreOperations();
  const recipes = new PlasticityRecipes(fake.operations);
  await assert.rejects(
    recipes.cutCableChannel({ targetId: 7, spineIds: [7], channelDiameterMm: 6, revision: "r1" }),
    /must not also be a spine/i,
  );
  assert.deepEqual(fake.calls, []);
});

test("connector opening extrudes a rounded rectangular cutter and subtracts it", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const target = body(7, "Solid");
  let state = scene("r1", [target]);
  const longitudinalEdges = ["e1", "e2", "e3", "e4"].map((id) => ({
    id, curveType: "Line", line: true, circle: false, lengthMm: 11,
    centerMm: [0, 0, 0] as [number, number, number], tangent: [0, 0, -1] as [number, number, number],
    boundsMm: { min: [0, 0, -0.5] as [number, number, number], max: [0, 0, 10.5] as [number, number, number] },
    faceIds: [], vertexIds: [],
  }));
  const operations: RecipeOperations = {
    async state() { return state; },
    async createPolyline(pointsMm, closed, revision) {
      calls.push({ operation: "createPolyline", pointsMm, closed, revision });
      state = { ...scene("r2", [target, body(8, "Wire")]), regions: [{
        id: "region-8", entityId: 80, islandVersionId: 81, sketchId: 82, sketchWireIds: [8],
        measurementSource: "render-mesh", displayBoundsMm: { min: [4, 6, 10.5], max: [16, 14, 10.5] },
      }] };
      return state;
    },
    async extrudeRegions(regionIds, distanceMm, revision) {
      calls.push({ operation: "extrudeRegions", regionIds, distanceMm, revision });
      state = { ...state, revision: "r3", bodies: [...state.bodies, { ...body(9, "Solid"), edgeIds: longitudinalEdges.map((edge) => edge.id), edges: longitudinalEdges }] };
      return state;
    },
    async fillet(id, edgeIds, radiusMm, revision) {
      calls.push({ operation: "fillet", id, edgeIds, radiusMm, revision });
      state = { ...state, revision: "r4" };
      return state;
    },
    async boolean(targetIds, toolIds, kind, keepTools, revision) {
      calls.push({ operation: "boolean", targetIds, toolIds, kind, keepTools, revision });
      state = { ...state, revision: "r5", bodies: state.bodies.filter((candidate) => !toolIds.includes(candidate.id)) };
      return state;
    },
    async createCylinder() { throw new Error("unexpected cylinder"); },
    async rectangularPattern() { throw new Error("unexpected pattern"); },
    async createPipes() { throw new Error("unexpected pipe"); },
    async createBox() { throw new Error("unexpected box"); },
  };
  const recipes = new PlasticityRecipes(operations);

  const result = await recipes.createConnectorOpening({
    targetId: 7, entryCenterMm: [10, 10, 10], axis: [0, 0, -1], widthDirection: [1, 0, 0],
    widthMm: 12, heightMm: 8, cornerRadiusMm: 2, throughDepthMm: 10, overshootMm: 0.5, revision: "r1",
  });

  assert.deepEqual(calls, [
    { operation: "createPolyline", pointsMm: [[4, 14, 10.5], [16, 14, 10.5], [16, 6, 10.5], [4, 6, 10.5]], closed: true, revision: "r1" },
    { operation: "extrudeRegions", regionIds: ["region-8"], distanceMm: 11, revision: "r2" },
    { operation: "fillet", id: 9, edgeIds: ["e1", "e2", "e3", "e4"], radiusMm: 2, revision: "r3" },
    { operation: "boolean", targetIds: [7], toolIds: [9], kind: "difference", keepTools: false, revision: "r4" },
  ]);
  assert.equal(result.recipe, "connector-opening");
  assert.equal(result.profileBodyId, 8);
  assert.deepEqual(result.resultBodyIds, [7]);
  assert.deepEqual(result.consumedToolIds, [9]);
  assert.equal(result.undoSteps, 4);
  assert.deepEqual(result.steps.map((entry) => entry.operation), ["create-connector-profile", "extrude-connector-cutter", "round-connector-cutter", "boolean-difference"]);
});

test("connector opening rejects a width direction parallel to its cutting axis before mutation", async () => {
  const fake = counterboreOperations();
  const recipes = new PlasticityRecipes(fake.operations);
  await assert.rejects(recipes.createConnectorOpening({
    targetId: 7, entryCenterMm: [10, 10, 10], axis: [0, 0, -1], widthDirection: [0, 0, 1],
    widthMm: 12, heightMm: 8, cornerRadiusMm: 2, throughDepthMm: 10, overshootMm: 0.5, revision: "r1",
  }), /perpendicular/i);
  assert.deepEqual(fake.calls, []);
});

test("connector opening skips the fillet step when corner radius is zero", async () => {
  const target = body(7, "Solid");
  let state = scene("r1", [target]);
  const operations: RecipeOperations = {
    async state() { return state; },
    async createPolyline() {
      state = { ...scene("r2", [target, body(8, "Wire")]), regions: [{
        id: "region-8", entityId: 80, islandVersionId: 81, sketchId: 82, sketchWireIds: [8],
        measurementSource: "render-mesh", displayBoundsMm: { min: [4, 6, 10.5], max: [16, 14, 10.5] },
      }] };
      return state;
    },
    async extrudeRegions() {
      state = { ...state, revision: "r3", bodies: [...state.bodies, body(9, "Solid")] };
      return state;
    },
    async boolean(_targetIds, toolIds) {
      state = { ...state, revision: "r4", bodies: state.bodies.filter((candidate) => !toolIds.includes(candidate.id)) };
      return state;
    },
    async fillet() { throw new Error("unexpected fillet"); },
    async createBox() { throw new Error("unexpected box"); },
    async createCylinder() { throw new Error("unexpected cylinder"); },
    async rectangularPattern() { throw new Error("unexpected pattern"); },
    async createPipes() { throw new Error("unexpected pipe"); },
  };

  const result = await new PlasticityRecipes(operations).createConnectorOpening({
    targetId: 7, entryCenterMm: [10, 10, 10], axis: [0, 0, -1], widthDirection: [1, 0, 0],
    widthMm: 12, heightMm: 8, cornerRadiusMm: 0, throughDepthMm: 10, overshootMm: 0.5, revision: "r1",
  });

  assert.equal(result.undoSteps, 3);
  assert.deepEqual(result.steps.map((entry) => entry.operation), ["create-connector-profile", "extrude-connector-cutter", "boolean-difference"]);
});

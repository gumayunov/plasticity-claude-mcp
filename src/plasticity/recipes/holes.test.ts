import assert from "node:assert/strict";
import { test } from "node:test";
import { BlindHolePatternRecipeError, BlindHoleRecipeError, CounterborePatternRecipeError, CounterboreRecipeError, CountersinkPatternRecipeError, HexNutPocketPatternRecipeError, PlasticityRecipes, SlottedHolePatternRecipeError, SlottedHoleRecipeError, ThroughHolePatternRecipeError, ThroughHoleRecipeError } from "./index.ts";
import { type RecipeOperations, body, counterboreOperations, scene, slottedHolePatternOperations } from "./test-support.ts";

test("countersink combines an exact through cutter with a revolved annular cutter", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const target = body(7, "Solid");
  let state = scene("r1", [target]);
  const operations = {
    async state() { return state; },
    async createCylinder(centerMm: [number, number, number], radiusMm: number, heightMm: number, _name: string | undefined, revision: string, axis: [number, number, number]) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, axis, revision });
      state = scene("r2", [target, body(8, "Solid")]);
      return state;
    },
    async createPolyline(pointsMm: Array<[number, number, number]>, closed: boolean, revision: string) {
      calls.push({ operation: "createPolyline", pointsMm, closed, revision });
      state = scene("r3", [target, body(8, "Solid"), body(9, "Wire")]);
      return state;
    },
    async revolveProfile(id: number, axisOriginMm: [number, number, number], axis: [number, number, number], angleDegrees: number, revision: string) {
      calls.push({ operation: "revolveProfile", id, axisOriginMm, axis, angleDegrees, revision });
      state = scene("r4", [target, body(8, "Solid"), body(9, "Wire"), body(10, "Solid")]);
      return state;
    },
    async boolean(targetIds: number[], toolIds: number[], kind: string, keepTools: boolean, revision: string) {
      calls.push({ operation: "boolean", targetIds, toolIds, kind, keepTools, revision });
      state = scene("r5", [target, body(9, "Wire")]);
      return state;
    },
  } as unknown as RecipeOperations;

  const result = await new PlasticityRecipes(operations).createCountersink({
    targetId: 7, entryCenterMm: [10, 12, 8], axis: [0, 0, -2], radialDirection: [1, 0, 0],
    throughDiameterMm: 4, countersinkMajorDiameterMm: 8, includedAngleDeg: 90,
    throughDepthMm: 8, overshootMm: 0.5, revision: "r1",
  });

  assert.deepEqual(calls, [
    { operation: "createCylinder", centerMm: [10, 12, 8.5], radiusMm: 2, heightMm: 9, axis: [0, 0, -1], revision: "r1" },
    { operation: "createPolyline", pointsMm: [
      [12, 12, 8.5], [14, 12, 8.5], [14, 12, 8], [12, 12, 6],
    ], closed: true, revision: "r2" },
    { operation: "revolveProfile", id: 9, axisOriginMm: [10, 12, 8], axis: [0, 0, -1], angleDegrees: 360, revision: "r3" },
    { operation: "boolean", targetIds: [7], toolIds: [8, 10], kind: "difference", keepTools: false, revision: "r4" },
  ]);
  assert.equal(result.recipe, "countersink");
  assert.ok(Math.abs(result.countersinkDepthMm - 2) < 1e-12);
  assert.equal(result.profileBodyId, 9);
  assert.deepEqual(result.consumedToolIds, [8, 10]);
  assert.equal(result.undoSteps, 4);
});

test("countersink rejects a depth that reaches through the target before mutation", async () => {
  const fake = counterboreOperations();
  await assert.rejects(new PlasticityRecipes(fake.operations).createCountersink({
    targetId: 7, entryCenterMm: [10, 12, 8], axis: [0, 0, -1], radialDirection: [1, 0, 0],
    throughDiameterMm: 4, countersinkMajorDiameterMm: 20, includedAngleDeg: 60,
    throughDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), /countersink depth/i);
  assert.deepEqual(fake.calls, []);
});

test("countersink pattern creates one editable revolved cutter per explicit center", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const target = body(7, "Solid");
  let state = scene("r1", [target]);
  let nextId = 8;
  let revision = 1;
  const advance = (added: ReturnType<typeof body>[], removedIds: number[] = []) => {
    revision += 1;
    state = scene(`r${revision}`, [...state.bodies.filter((candidate) => !removedIds.includes(candidate.id)), ...added]);
    return state;
  };
  const operations = {
    async state() { return state; },
    async createCylinder(centerMm: [number, number, number], radiusMm: number, heightMm: number, _name: string | undefined, currentRevision: string, axis: [number, number, number]) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, axis, revision: currentRevision });
      return advance([body(nextId++, "Solid")]);
    },
    async createPolyline(pointsMm: Array<[number, number, number]>, closed: boolean, currentRevision: string) {
      calls.push({ operation: "createPolyline", pointsMm, closed, revision: currentRevision });
      return advance([body(nextId++, "Wire")]);
    },
    async revolveProfile(id: number, axisOriginMm: [number, number, number], axis: [number, number, number], angleDegrees: number, currentRevision: string) {
      calls.push({ operation: "revolveProfile", id, axisOriginMm, axis, angleDegrees, revision: currentRevision });
      return advance([body(nextId++, "Solid")]);
    },
    async boolean(targetIds: number[], toolIds: number[], kind: string, keepTools: boolean, currentRevision: string) {
      calls.push({ operation: "boolean", targetIds, toolIds, kind, keepTools, revision: currentRevision });
      return advance([], toolIds);
    },
  } as unknown as RecipeOperations;

  const result = await new PlasticityRecipes(operations).createCountersinkPattern({
    targetId: 7, entryCentersMm: [[10, 12, 8], [30, 12, 8]], axis: [0, 0, -1], radialDirection: [1, 0, 0],
    throughDiameterMm: 4, countersinkMajorDiameterMm: 8, includedAngleDeg: 90,
    throughDepthMm: 8, overshootMm: 0.5, revision: "r1",
  });

  assert.equal(result.recipe, "countersink-pattern");
  assert.equal(result.holeCount, 2);
  assert.ok(Math.abs(result.countersinkDepthMm - 2) < 1e-12);
  assert.deepEqual(result.profileBodyIds, [9, 12]);
  assert.deepEqual(result.consumedToolIds, [8, 10, 11, 13]);
  assert.equal(result.undoSteps, 7);
  assert.deepEqual(result.steps.map((item) => item.operation), [
    "create-through-cutter", "create-countersink-profile", "revolve-countersink-cutter",
    "create-through-cutter", "create-countersink-profile", "revolve-countersink-cutter",
    "boolean-difference",
  ]);
  assert.deepEqual(calls.at(-1), {
    operation: "boolean", targetIds: [7], toolIds: [8, 10, 11, 13], kind: "difference", keepTools: false, revision: "r7",
  });
});

test("countersink pattern rejects duplicate centers and reports confirmed partial work", async () => {
  const invalid = counterboreOperations();
  await assert.rejects(new PlasticityRecipes(invalid.operations).createCountersinkPattern({
    targetId: 7, entryCentersMm: [[10, 12, 8], [10, 12, 8]], axis: [0, 0, -1], radialDirection: [1, 0, 0],
    throughDiameterMm: 4, countersinkMajorDiameterMm: 8, includedAngleDeg: 90,
    throughDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), /centers must be distinct/i);
  assert.deepEqual(invalid.calls, []);

  const target = body(7, "Solid");
  let state = scene("r1", [target]);
  let mutation = 0;
  const failing = {
    async state() { return state; },
    async createCylinder() {
      mutation += 1;
      if (mutation === 5) throw new Error("second profile unavailable");
      state = scene(`r${mutation + 1}`, [...state.bodies, body(7 + mutation, "Solid")]);
      return state;
    },
    async createPolyline() {
      mutation += 1;
      if (mutation === 5) throw new Error("second profile unavailable");
      state = scene(`r${mutation + 1}`, [...state.bodies, body(7 + mutation, "Wire")]);
      return state;
    },
    async revolveProfile() {
      mutation += 1;
      state = scene(`r${mutation + 1}`, [...state.bodies, body(7 + mutation, "Solid")]);
      return state;
    },
    async boolean() { throw new Error("unexpected Boolean"); },
  } as unknown as RecipeOperations;
  await assert.rejects(new PlasticityRecipes(failing).createCountersinkPattern({
    targetId: 7, entryCentersMm: [[10, 12, 8], [30, 12, 8]], axis: [0, 0, -1], radialDirection: [1, 0, 0],
    throughDiameterMm: 4, countersinkMajorDiameterMm: 8, includedAngleDeg: 90,
    throughDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), (error: unknown) => {
    assert(error instanceof CountersinkPatternRecipeError);
    assert.equal(error.completedSteps.length, 4);
    assert.match(error.message, /4\/7 confirmed steps/);
    assert.equal(error.uncertain, false);
    return true;
  });
});

test("hex nut pocket extrudes an oriented regular hexagon and consumes the cutter", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const target = body(7, "Solid");
  const existingProfile = body(6, "Wire");
  const existingRegion = {
    id: "region-6", entityId: 60, islandVersionId: 61, sketchId: 62, sketchWireIds: [6],
    measurementSource: "render-mesh" as const, displayBoundsMm: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 0] as [number, number, number] },
  };
  let state = { ...scene("r1", [target, existingProfile]), regions: [existingRegion] };
  const operations = {
    async state() { return state; },
    async createPolyline(pointsMm: Array<[number, number, number]>, closed: boolean, revision: string) {
      calls.push({ operation: "createPolyline", pointsMm, closed, revision });
      state = { ...scene("r2", [target, existingProfile, body(8, "Wire")]), regions: [{ ...existingRegion, sketchWireIds: [6, 8] }, {
        id: "region-8", entityId: 80, islandVersionId: 81, sketchId: 82, sketchWireIds: [8],
        measurementSource: "render-mesh" as const, displayBoundsMm: { min: [7, 8.5, 8.5], max: [13, 15.5, 8.5] },
      }] };
      return state;
    },
    async extrudeRegions(regionIds: string[], distanceMm: number, revision: string) {
      calls.push({ operation: "extrudeRegions", regionIds, distanceMm, revision });
      state = { ...state, revision: "r3", bodies: [...state.bodies, body(9, "Solid")] };
      return state;
    },
    async boolean(targetIds: number[], toolIds: number[], kind: string, keepTools: boolean, revision: string) {
      calls.push({ operation: "boolean", targetIds, toolIds, kind, keepTools, revision });
      state = scene("r4", [target, existingProfile, body(8, "Wire")]);
      return state;
    },
  } as unknown as RecipeOperations;
  const radius = 6 / Math.sqrt(3);

  const result = await new PlasticityRecipes(operations).createHexNutPocket({
    targetId: 7, entryCenterMm: [10, 12, 8], axis: [0, 0, -1], flatNormalDirection: [1, 0, 0],
    acrossFlatsMm: 6, pocketDepthMm: 3, materialDepthMm: 8, overshootMm: 0.5, revision: "r1",
  });

  assert.deepEqual(calls, [
    { operation: "createPolyline", pointsMm: [
      [13, 12 - radius / 2, 8.5], [10, 12 - radius, 8.5], [7, 12 - radius / 2, 8.5],
      [7, 12 + radius / 2, 8.5], [10, 12 + radius, 8.5], [13, 12 + radius / 2, 8.5],
    ], closed: true, revision: "r1" },
    { operation: "extrudeRegions", regionIds: ["region-8"], distanceMm: 3.5, revision: "r2" },
    { operation: "boolean", targetIds: [7], toolIds: [9], kind: "difference", keepTools: false, revision: "r3" },
  ]);
  assert.equal(result.recipe, "hex-nut-pocket");
  assert.equal(result.profileBodyId, 8);
  assert.deepEqual(result.consumedToolIds, [9]);
  assert.equal(result.undoSteps, 3);
});

test("hex nut pocket rejects a flat normal parallel to its axis before mutation", async () => {
  const fake = counterboreOperations();
  await assert.rejects(new PlasticityRecipes(fake.operations).createHexNutPocket({
    targetId: 7, entryCenterMm: [10, 12, 8], axis: [0, 0, -1], flatNormalDirection: [0, 0, 2],
    acrossFlatsMm: 8, pocketDepthMm: 4, materialDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), /perpendicular/i);
  assert.deepEqual(fake.calls, []);
});

test("hex nut pocket rejects a through-depth pocket before mutation", async () => {
  const fake = counterboreOperations();
  await assert.rejects(new PlasticityRecipes(fake.operations).createHexNutPocket({
    targetId: 7, entryCenterMm: [10, 12, 8], axis: [0, 0, -1], flatNormalDirection: [1, 0, 0],
    acrossFlatsMm: 8, pocketDepthMm: 8, materialDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), /less than material depth/i);
  assert.deepEqual(fake.calls, []);
});

test("hex nut pocket pattern creates one editable profile and cutter per center", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const target = body(7, "Solid");
  let state = scene("r1", [target]);
  let nextId = 8;
  let revision = 1;
  const operations = {
    async state() { return state; },
    async createPolyline(pointsMm: Array<[number, number, number]>, closed: boolean, currentRevision: string) {
      calls.push({ operation: "createPolyline", pointsMm, closed, revision: currentRevision });
      const id = nextId++;
      const sketchWireIds = [...state.bodies.filter((candidate) => candidate.type === "Wire").map((candidate) => candidate.id), id];
      revision += 1;
      state = {
        ...scene(`r${revision}`, [...state.bodies, body(id, "Wire")]),
        regions: [...state.regions.map((region) => ({ ...region, sketchWireIds })), {
          id: `region-${id}`, entityId: id * 10, islandVersionId: id * 10 + 1, sketchId: id * 10 + 2,
          sketchWireIds, measurementSource: "render-mesh" as const,
          displayBoundsMm: { min: [0, 0, 0], max: [1, 1, 1] },
        }],
      };
      return state;
    },
    async extrudeRegions(regionIds: string[], distanceMm: number, currentRevision: string) {
      calls.push({ operation: "extrudeRegions", regionIds, distanceMm, revision: currentRevision });
      const id = nextId++;
      revision += 1;
      state = { ...state, revision: `r${revision}`, bodies: [...state.bodies, body(id, "Solid")] };
      return state;
    },
    async boolean(targetIds: number[], toolIds: number[], kind: string, keepTools: boolean, currentRevision: string) {
      calls.push({ operation: "boolean", targetIds, toolIds, kind, keepTools, revision: currentRevision });
      revision += 1;
      state = { ...state, revision: `r${revision}`, bodies: state.bodies.filter((candidate) => !toolIds.includes(candidate.id)) };
      return state;
    },
  } as unknown as RecipeOperations;

  const result = await new PlasticityRecipes(operations).createHexNutPocketPattern({
    targetId: 7, entryCentersMm: [[10, 12, 8], [30, 12, 8]], axis: [0, 0, -1], flatNormalDirection: [1, 0, 0],
    acrossFlatsMm: 8, pocketDepthMm: 4, materialDepthMm: 8, overshootMm: 0.5, revision: "r1",
  });

  assert.equal(result.recipe, "hex-nut-pocket-pattern");
  assert.equal(result.pocketCount, 2);
  assert.deepEqual(result.profileBodyIds, [8, 10]);
  assert.deepEqual(result.consumedToolIds, [9, 11]);
  assert.equal(result.undoSteps, 5);
  assert.deepEqual(result.steps.map((item) => item.operation), [
    "create-hex-pocket-profile", "extrude-hex-pocket-cutter",
    "create-hex-pocket-profile", "extrude-hex-pocket-cutter", "boolean-difference",
  ]);
  assert.deepEqual(calls.at(-1), {
    operation: "boolean", targetIds: [7], toolIds: [9, 11], kind: "difference", keepTools: false, revision: "r5",
  });
});

test("hex nut pocket pattern rejects duplicate centers and reports confirmed partial work", async () => {
  const invalid = counterboreOperations();
  await assert.rejects(new PlasticityRecipes(invalid.operations).createHexNutPocketPattern({
    targetId: 7, entryCentersMm: [[10, 12, 8], [10, 12, 8]], axis: [0, 0, -1], flatNormalDirection: [1, 0, 0],
    acrossFlatsMm: 8, pocketDepthMm: 4, materialDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), /centers must be distinct/i);
  assert.deepEqual(invalid.calls, []);

  const target = body(7, "Solid");
  let state = scene("r1", [target]);
  let mutation = 0;
  const failing = {
    async state() { return state; },
    async createPolyline() {
      mutation += 1;
      const id = 7 + mutation;
      state = {
        ...scene(`r${mutation + 1}`, [...state.bodies, body(id, "Wire")]),
        regions: [...state.regions, {
          id: `region-${id}`, entityId: id * 10, islandVersionId: id * 10 + 1, sketchId: id * 10 + 2,
          sketchWireIds: [id], measurementSource: "render-mesh" as const,
          displayBoundsMm: { min: [0, 0, 0], max: [1, 1, 1] },
        }],
      };
      return state;
    },
    async extrudeRegions() {
      mutation += 1;
      if (mutation === 4) throw new Error("second pocket extrusion unavailable");
      state = scene(`r${mutation + 1}`, [...state.bodies, body(7 + mutation, "Solid")]);
      return state;
    },
    async boolean() { throw new Error("unexpected Boolean"); },
  } as unknown as RecipeOperations;
  await assert.rejects(new PlasticityRecipes(failing).createHexNutPocketPattern({
    targetId: 7, entryCentersMm: [[10, 12, 8], [30, 12, 8]], axis: [0, 0, -1], flatNormalDirection: [1, 0, 0],
    acrossFlatsMm: 8, pocketDepthMm: 4, materialDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), (error: unknown) => {
    assert(error instanceof HexNutPocketPatternRecipeError);
    assert.equal(error.completedSteps.length, 3);
    assert.match(error.message, /3\/5 confirmed steps/);
    assert.equal(error.uncertain, false);
    return true;
  });
});

test("slotted hole combines an editable center profile with two exact round ends", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const target = body(7, "Solid");
  let state = scene("r1", [target]);
  let nextId = 8;
  const operations = {
    async state() { return state; },
    async createPolyline(pointsMm: Array<[number, number, number]>, closed: boolean, revision: string) {
      calls.push({ operation: "createPolyline", pointsMm, closed, revision });
      const id = nextId++;
      state = { ...scene("r2", [target, body(id, "Wire")]), regions: [
        {
          id: "region-from-another-wire-on-the-same-sketch", entityId: 70, islandVersionId: 71, sketchId: 72,
          sketchWireIds: [6, id], measurementSource: "render-mesh" as const,
          displayBoundsMm: { min: [1, 1, 8.5], max: [5, 5, 8.5] },
        },
        {
          id: `region-${id}`, entityId: id * 10, islandVersionId: id * 10 + 1, sketchId: id * 10 + 2,
          sketchWireIds: [6, id], measurementSource: "render-mesh" as const,
          displayBoundsMm: { min: [13.0001, 12.0001, 8.5001], max: [27.0001, 18.0001, 8.5001] },
        },
      ] };
      return state;
    },
    async extrudeRegions(regionIds: string[], distanceMm: number, revision: string) {
      calls.push({ operation: "extrudeRegions", regionIds, distanceMm, revision });
      const id = nextId++;
      state = { ...state, revision: "r3", bodies: [...state.bodies, body(id, "Solid")] };
      return state;
    },
    async createCylinder(centerMm: [number, number, number], radiusMm: number, heightMm: number, _name: string | undefined, revision: string, axis: [number, number, number]) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, axis, revision });
      const id = nextId++;
      state = { ...state, revision: state.revision === "r3" ? "r4" : "r5", bodies: [...state.bodies, body(id, "Solid")] };
      return state;
    },
    async boolean(targetIds: number[], toolIds: number[], kind: string, keepTools: boolean, revision: string) {
      calls.push({ operation: "boolean", targetIds, toolIds, kind, keepTools, revision });
      state = scene("r6", [target, body(8, "Wire")]);
      return state;
    },
  } as unknown as RecipeOperations;

  const result = await new PlasticityRecipes(operations).createSlottedHole({
    targetId: 7, entryCenterMm: [20, 15, 8], axis: [0, 0, -1], slotDirection: [2, 0, 0],
    overallLengthMm: 20, widthMm: 6, throughDepthMm: 8, overshootMm: 0.5, revision: "r1",
  });

  assert.deepEqual(calls, [
    { operation: "createPolyline", pointsMm: [[13, 18, 8.5], [27, 18, 8.5], [27, 12, 8.5], [13, 12, 8.5]], closed: true, revision: "r1" },
    { operation: "extrudeRegions", regionIds: ["region-8"], distanceMm: 9, revision: "r2" },
    { operation: "createCylinder", centerMm: [13, 15, 8.5], radiusMm: 3, heightMm: 9, axis: [0, 0, -1], revision: "r3" },
    { operation: "createCylinder", centerMm: [27, 15, 8.5], radiusMm: 3, heightMm: 9, axis: [0, 0, -1], revision: "r4" },
    { operation: "boolean", targetIds: [7], toolIds: [9, 10, 11], kind: "difference", keepTools: false, revision: "r5" },
  ]);
  assert.equal(result.recipe, "slotted-hole");
  assert.equal(result.centerDistanceMm, 14);
  assert.equal(result.profileBodyId, 8);
  assert.deepEqual(result.consumedToolIds, [9, 10, 11]);
  assert.equal(result.undoSteps, 5);
});

test("slotted hole rejects a circular or out-of-plane definition before mutation", async () => {
  const fake = counterboreOperations();
  await assert.rejects(new PlasticityRecipes(fake.operations).createSlottedHole({
    targetId: 7, entryCenterMm: [20, 15, 8], axis: [0, 0, -1], slotDirection: [0, 0, 1],
    overallLengthMm: 6, widthMm: 6, throughDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), /overall length/i);
  assert.deepEqual(fake.calls, []);
});

test("slotted hole reports its confirmed profile when Plasticity returns no matching Region", async () => {
  const target = body(7, "Solid");
  let state = scene("r1", [target]);
  const operations = {
    async state() { return state; },
    async createPolyline() {
      state = { ...scene("r2", [target, body(8, "Wire")]), regions: [{
        id: "unrelated-region", entityId: 80, islandVersionId: 81, sketchId: 82,
        sketchWireIds: [8], measurementSource: "render-mesh" as const,
        displayBoundsMm: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 0] as [number, number, number] },
      }] };
      return state;
    },
  } as unknown as RecipeOperations;

  await assert.rejects(new PlasticityRecipes(operations).createSlottedHole({
    targetId: 7, entryCenterMm: [20, 15, 8], axis: [0, 0, -1], slotDirection: [1, 0, 0],
    overallLengthMm: 20, widthMm: 6, throughDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), (error: unknown) => {
    assert.ok(error instanceof SlottedHoleRecipeError);
    assert.equal(error.completedSteps.length, 1);
    assert.equal(error.completedSteps[0]?.operation, "create-slot-profile");
    assert.match(error.message, /1\/5 confirmed steps/u);
    return true;
  });
});

test("slotted hole pattern creates one editable profile and three cutters per center", async () => {
  const fake = slottedHolePatternOperations();
  const result = await new PlasticityRecipes(fake.operations).createSlottedHolePattern({
    targetId: 7,
    entryCentersMm: [[20, 10, 8], [20, 30, 8]],
    axis: [0, 0, -2],
    slotDirection: [2, 0, 0],
    overallLengthMm: 20,
    widthMm: 6,
    throughDepthMm: 8,
    overshootMm: 0.5,
    revision: "r1",
  });

  assert.equal(result.recipe, "slotted-hole-pattern");
  assert.equal(result.slotCount, 2);
  assert.equal(result.centerDistanceMm, 14);
  assert.deepEqual(result.profileBodyIds, [8, 12]);
  assert.deepEqual(result.consumedToolIds, [9, 10, 11, 13, 14, 15]);
  assert.equal(result.undoSteps, 9);
  assert.deepEqual(result.steps.map((item) => item.operation), [
    "create-slot-profile", "extrude-slot-center-cutter", "create-slot-end-cutter", "create-slot-end-cutter",
    "create-slot-profile", "extrude-slot-center-cutter", "create-slot-end-cutter", "create-slot-end-cutter",
    "boolean-difference",
  ]);
  assert.deepEqual(fake.calls.at(-1), {
    operation: "boolean", targetIds: [7], toolIds: [9, 10, 11, 13, 14, 15], kind: "difference", keepTools: false, revision: "r9",
  });
});

test("slotted hole pattern validates centers and reports confirmed partial work", async () => {
  const invalid = slottedHolePatternOperations();
  await assert.rejects(new PlasticityRecipes(invalid.operations).createSlottedHolePattern({
    targetId: 7, entryCentersMm: [[20, 10, 8], [20, 10, 8]], axis: [0, 0, -1], slotDirection: [1, 0, 0],
    overallLengthMm: 20, widthMm: 6, throughDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), /centers must be distinct/i);
  assert.deepEqual(invalid.calls, []);

  const failed = slottedHolePatternOperations(6);
  await assert.rejects(new PlasticityRecipes(failed.operations).createSlottedHolePattern({
    targetId: 7, entryCentersMm: [[20, 10, 8], [20, 30, 8]], axis: [0, 0, -1], slotDirection: [1, 0, 0],
    overallLengthMm: 20, widthMm: 6, throughDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), (error: unknown) => {
    assert(error instanceof SlottedHolePatternRecipeError);
    assert.equal(error.completedSteps.length, 5);
    assert.equal(error.lastConfirmedRevision, "r6");
    assert.match(error.message, /5\/9 confirmed steps/i);
    return true;
  });
});

test("counterbore creates two exact cutters and consumes them in one boolean", async () => {
  const fake = counterboreOperations();
  const recipes = new PlasticityRecipes(fake.operations);

  const result = await recipes.createCounterbore({
    targetId: 7,
    entryCenterMm: [10, 12, 8],
    axis: [0, 0, -2],
    throughDiameterMm: 4,
    counterboreDiameterMm: 8,
    counterboreDepthMm: 3,
    throughDepthMm: 8,
    overshootMm: 0.5,
    revision: "r1",
  });

  assert.deepEqual(fake.calls, [
    { operation: "createCylinder", centerMm: [10, 12, 8.5], radiusMm: 2, heightMm: 9, axis: [0, 0, -1], revision: "r1" },
    { operation: "createCylinder", centerMm: [10, 12, 8.5], radiusMm: 4, heightMm: 3.5, axis: [0, 0, -1], revision: "r2" },
    { operation: "boolean", targetIds: [7], toolIds: [8, 9], kind: "difference", keepTools: false, revision: "r3" },
  ]);
  assert.equal(result.recipe, "counterbore");
  assert.equal(result.status, "completed");
  assert.equal(result.beforeRevision, "r1");
  assert.equal(result.afterRevision, "r4");
  assert.equal(result.undoSteps, 3);
  assert.deepEqual(result.resultBodyIds, [7]);
  assert.deepEqual(result.consumedToolIds, [8, 9]);
  assert.deepEqual(result.steps.map((step) => [step.operation, step.beforeRevision, step.afterRevision]), [
    ["create-through-cutter", "r1", "r2"],
    ["create-counterbore-cutter", "r2", "r3"],
    ["boolean-difference", "r3", "r4"],
  ]);
});

test("counterbore pattern creates paired cutters per center and one final Boolean", async () => {
  const fake = counterboreOperations();
  const result = await new PlasticityRecipes(fake.operations).createCounterborePattern({
    targetId: 7,
    entryCentersMm: [[10, 10, 8], [30, 10, 8]],
    axis: [0, 0, -1],
    throughDiameterMm: 4,
    counterboreDiameterMm: 8,
    counterboreDepthMm: 3,
    throughDepthMm: 8,
    overshootMm: 0.5,
    revision: "r1",
  });

  assert.deepEqual(fake.calls, [
    { operation: "createCylinder", centerMm: [10, 10, 8.5], radiusMm: 2, heightMm: 9, axis: [0, 0, -1], revision: "r1" },
    { operation: "createCylinder", centerMm: [10, 10, 8.5], radiusMm: 4, heightMm: 3.5, axis: [0, 0, -1], revision: "r2" },
    { operation: "createCylinder", centerMm: [30, 10, 8.5], radiusMm: 2, heightMm: 9, axis: [0, 0, -1], revision: "r3" },
    { operation: "createCylinder", centerMm: [30, 10, 8.5], radiusMm: 4, heightMm: 3.5, axis: [0, 0, -1], revision: "r4" },
    { operation: "boolean", targetIds: [7], toolIds: [8, 9, 10, 11], kind: "difference", keepTools: false, revision: "r5" },
  ]);
  assert.equal(result.recipe, "counterbore-pattern");
  assert.equal(result.holeCount, 2);
  assert.equal(result.undoSteps, 5);
  assert.deepEqual(result.consumedToolIds, [8, 9, 10, 11]);
});

test("counterbore pattern validates centers and reports confirmed partial work", async () => {
  const invalid = counterboreOperations();
  await assert.rejects(new PlasticityRecipes(invalid.operations).createCounterborePattern({
    targetId: 7, entryCentersMm: [[10, 10, 8], [10, 10, 8]], axis: [0, 0, -1],
    throughDiameterMm: 4, counterboreDiameterMm: 8, counterboreDepthMm: 3,
    throughDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), /centers must be distinct/i);
  assert.deepEqual(invalid.calls, []);

  const failed = counterboreOperations(4);
  await assert.rejects(new PlasticityRecipes(failed.operations).createCounterborePattern({
    targetId: 7, entryCentersMm: [[10, 10, 8], [30, 10, 8]], axis: [0, 0, -1],
    throughDiameterMm: 4, counterboreDiameterMm: 8, counterboreDepthMm: 3,
    throughDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), (error: unknown) => {
    assert(error instanceof CounterborePatternRecipeError);
    assert.equal(error.completedSteps.length, 3);
    assert.equal(error.lastConfirmedRevision, "r4");
    assert.match(error.message, /3\/5 confirmed steps/i);
    return true;
  });
});

test("through-hole creates one exact overshooting cutter and consumes it", async () => {
  const fake = counterboreOperations();
  const recipes = new PlasticityRecipes(fake.operations);

  const result = await recipes.createThroughHole({
    targetId: 7,
    entryCenterMm: [10, 12, 8],
    axis: [0, 0, -2],
    holeDiameterMm: 5.5,
    throughDepthMm: 8,
    overshootMm: 0.5,
    revision: "r1",
  });

  assert.deepEqual(fake.calls, [
    { operation: "createCylinder", centerMm: [10, 12, 8.5], radiusMm: 2.75, heightMm: 9, axis: [0, 0, -1], revision: "r1" },
    { operation: "boolean", targetIds: [7], toolIds: [8], kind: "difference", keepTools: false, revision: "r2" },
  ]);
  assert.equal(result.recipe, "through-hole");
  assert.equal(result.status, "completed");
  assert.equal(result.beforeRevision, "r1");
  assert.equal(result.afterRevision, "r3");
  assert.equal(result.undoSteps, 2);
  assert.deepEqual(result.resultBodyIds, [7]);
  assert.deepEqual(result.consumedToolIds, [8]);
});

test("through-hole validates geometry and reports confirmed partial work", async () => {
  const invalid = counterboreOperations();
  await assert.rejects(new PlasticityRecipes(invalid.operations).createThroughHole({
    targetId: 7, entryCenterMm: [10, 12, 8], axis: [0, 0, 0], holeDiameterMm: 5.5,
    throughDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), /nonzero|normalize/i);
  assert.deepEqual(invalid.calls, []);

  const failed = counterboreOperations(2);
  await assert.rejects(new PlasticityRecipes(failed.operations).createThroughHole({
    targetId: 7, entryCenterMm: [10, 12, 8], axis: [0, 0, -1], holeDiameterMm: 5.5,
    throughDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), (error: unknown) => {
    assert(error instanceof ThroughHoleRecipeError);
    assert.equal(error.completedSteps.length, 1);
    assert.equal(error.lastConfirmedRevision, "r2");
    assert.match(error.message, /partial geometry remains/i);
    return true;
  });
});

test("through-hole pattern creates one cutter per explicit center and one final Boolean", async () => {
  const fake = counterboreOperations();
  const result = await new PlasticityRecipes(fake.operations).createThroughHolePattern({
    targetId: 7,
    entryCentersMm: [[10, 10, 8], [30, 10, 8], [10, 30, 8], [30, 30, 8]],
    axis: [0, 0, -1],
    holeDiameterMm: 5.5,
    throughDepthMm: 8,
    overshootMm: 0.5,
    revision: "r1",
  });

  assert.deepEqual(fake.calls, [
    { operation: "createCylinder", centerMm: [10, 10, 8.5], radiusMm: 2.75, heightMm: 9, axis: [0, 0, -1], revision: "r1" },
    { operation: "createCylinder", centerMm: [30, 10, 8.5], radiusMm: 2.75, heightMm: 9, axis: [0, 0, -1], revision: "r2" },
    { operation: "createCylinder", centerMm: [10, 30, 8.5], radiusMm: 2.75, heightMm: 9, axis: [0, 0, -1], revision: "r3" },
    { operation: "createCylinder", centerMm: [30, 30, 8.5], radiusMm: 2.75, heightMm: 9, axis: [0, 0, -1], revision: "r4" },
    { operation: "boolean", targetIds: [7], toolIds: [8, 9, 10, 11], kind: "difference", keepTools: false, revision: "r5" },
  ]);
  assert.equal(result.recipe, "through-hole-pattern");
  assert.equal(result.holeCount, 4);
  assert.equal(result.undoSteps, 5);
  assert.deepEqual(result.consumedToolIds, [8, 9, 10, 11]);
  assert.deepEqual(result.steps.map((step) => step.operation), [
    "create-through-cutter", "create-through-cutter", "create-through-cutter", "create-through-cutter", "boolean-difference",
  ]);
});

test("through-hole pattern rejects duplicate centers and reports confirmed partial work", async () => {
  const invalid = counterboreOperations();
  await assert.rejects(new PlasticityRecipes(invalid.operations).createThroughHolePattern({
    targetId: 7, entryCentersMm: [[10, 10, 8], [10, 10, 8]], axis: [0, 0, -1],
    holeDiameterMm: 5.5, throughDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), /centers must be distinct/i);
  assert.deepEqual(invalid.calls, []);

  const failed = counterboreOperations(3);
  await assert.rejects(new PlasticityRecipes(failed.operations).createThroughHolePattern({
    targetId: 7, entryCentersMm: [[10, 10, 8], [30, 10, 8], [20, 30, 8]], axis: [0, 0, -1],
    holeDiameterMm: 5.5, throughDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), (error: unknown) => {
    assert(error instanceof ThroughHolePatternRecipeError);
    assert.equal(error.completedSteps.length, 2);
    assert.equal(error.lastConfirmedRevision, "r3");
    assert.match(error.message, /2\/4 confirmed steps/i);
    return true;
  });
});

test("blind hole creates one exact flat-bottom cutter without crossing the material", async () => {
  const fake = counterboreOperations();
  const result = await new PlasticityRecipes(fake.operations).createBlindHole({
    targetId: 7,
    entryCenterMm: [10, 12, 8],
    axis: [0, 0, -2],
    holeDiameterMm: 4.2,
    holeDepthMm: 5,
    materialDepthMm: 8,
    overshootMm: 0.5,
    revision: "r1",
  });

  assert.deepEqual(fake.calls, [
    { operation: "createCylinder", centerMm: [10, 12, 8.5], radiusMm: 2.1, heightMm: 5.5, axis: [0, 0, -1], revision: "r1" },
    { operation: "boolean", targetIds: [7], toolIds: [8], kind: "difference", keepTools: false, revision: "r2" },
  ]);
  assert.equal(result.recipe, "blind-hole");
  assert.equal(result.status, "completed");
  assert.equal(result.beforeRevision, "r1");
  assert.equal(result.afterRevision, "r3");
  assert.equal(result.undoSteps, 2);
  assert.deepEqual(result.consumedToolIds, [8]);
  assert.deepEqual(result.steps.map((step) => step.operation), ["create-blind-cutter", "boolean-difference"]);
});

test("blind-hole pattern creates one flat-bottom cutter per center and one final Boolean", async () => {
  const fake = counterboreOperations();
  const result = await new PlasticityRecipes(fake.operations).createBlindHolePattern({
    targetId: 7,
    entryCentersMm: [[10, 10, 8], [30, 10, 8], [20, 30, 8]],
    axis: [0, 0, -1],
    holeDiameterMm: 4.2,
    holeDepthMm: 5,
    materialDepthMm: 8,
    overshootMm: 0.5,
    revision: "r1",
  });

  assert.deepEqual(fake.calls, [
    { operation: "createCylinder", centerMm: [10, 10, 8.5], radiusMm: 2.1, heightMm: 5.5, axis: [0, 0, -1], revision: "r1" },
    { operation: "createCylinder", centerMm: [30, 10, 8.5], radiusMm: 2.1, heightMm: 5.5, axis: [0, 0, -1], revision: "r2" },
    { operation: "createCylinder", centerMm: [20, 30, 8.5], radiusMm: 2.1, heightMm: 5.5, axis: [0, 0, -1], revision: "r3" },
    { operation: "boolean", targetIds: [7], toolIds: [8, 9, 10], kind: "difference", keepTools: false, revision: "r4" },
  ]);
  assert.equal(result.recipe, "blind-hole-pattern");
  assert.equal(result.holeCount, 3);
  assert.equal(result.undoSteps, 4);
  assert.deepEqual(result.consumedToolIds, [8, 9, 10]);
  assert.deepEqual(result.steps.map((step) => step.operation), [
    "create-blind-cutter", "create-blind-cutter", "create-blind-cutter", "boolean-difference",
  ]);
});

test("blind-hole pattern rejects invalid centers and reports confirmed partial work", async () => {
  const invalid = counterboreOperations();
  await assert.rejects(new PlasticityRecipes(invalid.operations).createBlindHolePattern({
    targetId: 7, entryCentersMm: [[10, 10, 8], [10, 10, 8]], axis: [0, 0, -1],
    holeDiameterMm: 4.2, holeDepthMm: 5, materialDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), /centers must be distinct/i);
  await assert.rejects(new PlasticityRecipes(invalid.operations).createBlindHolePattern({
    targetId: 7, entryCentersMm: [[10, 10, 8], [30, 10, 8]], axis: [0, 0, -1],
    holeDiameterMm: 4.2, holeDepthMm: 8, materialDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), /depth must be less than material depth/i);
  assert.deepEqual(invalid.calls, []);

  const failed = counterboreOperations(3);
  await assert.rejects(new PlasticityRecipes(failed.operations).createBlindHolePattern({
    targetId: 7, entryCentersMm: [[10, 10, 8], [30, 10, 8], [20, 30, 8]], axis: [0, 0, -1],
    holeDiameterMm: 4.2, holeDepthMm: 5, materialDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), (error: unknown) => {
    assert(error instanceof BlindHolePatternRecipeError);
    assert.equal(error.completedSteps.length, 2);
    assert.equal(error.lastConfirmedRevision, "r3");
    assert.match(error.message, /2\/4 confirmed steps/i);
    return true;
  });
});

test("blind hole rejects breakthrough and reports confirmed partial work", async () => {
  const invalid = counterboreOperations();
  await assert.rejects(new PlasticityRecipes(invalid.operations).createBlindHole({
    targetId: 7, entryCenterMm: [10, 12, 8], axis: [0, 0, -1], holeDiameterMm: 4.2,
    holeDepthMm: 8, materialDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), /less than material depth/i);
  assert.deepEqual(invalid.calls, []);

  const failed = counterboreOperations(2);
  await assert.rejects(new PlasticityRecipes(failed.operations).createBlindHole({
    targetId: 7, entryCenterMm: [10, 12, 8], axis: [0, 0, -1], holeDiameterMm: 4.2,
    holeDepthMm: 5, materialDepthMm: 8, overshootMm: 0.5, revision: "r1",
  }), (error: unknown) => {
    assert(error instanceof BlindHoleRecipeError);
    assert.equal(error.completedSteps.length, 1);
    assert.equal(error.lastConfirmedRevision, "r2");
    assert.match(error.message, /partial geometry remains/i);
    return true;
  });
});

test("counterbore rejects invalid geometry before the first mutation", async () => {
  const fake = counterboreOperations();
  const recipes = new PlasticityRecipes(fake.operations);

  await assert.rejects(recipes.createCounterbore({
    targetId: 7,
    entryCenterMm: [10, 12, 8],
    axis: [0, 0, -1],
    throughDiameterMm: 8,
    counterboreDiameterMm: 8,
    counterboreDepthMm: 3,
    throughDepthMm: 8,
    overshootMm: 0.5,
    revision: "r1",
  }), /counterbore diameter/i);
  assert.deepEqual(fake.calls, []);
});

test("counterbore stops after a failed step and reports confirmed partial work", async () => {
  const fake = counterboreOperations(2);
  const recipes = new PlasticityRecipes(fake.operations);

  await assert.rejects(recipes.createCounterbore({
    targetId: 7,
    entryCenterMm: [10, 12, 8],
    axis: [0, 0, -1],
    throughDiameterMm: 4,
    counterboreDiameterMm: 8,
    counterboreDepthMm: 3,
    throughDepthMm: 8,
    overshootMm: 0.5,
    revision: "r1",
  }), (error: unknown) => {
    assert(error instanceof CounterboreRecipeError);
    assert.equal(error.completedSteps.length, 1);
    assert.equal(error.lastConfirmedRevision, "r2");
    assert.match(error.message, /partial geometry remains/i);
    return true;
  });
  assert.equal(fake.calls.length, 2);
});

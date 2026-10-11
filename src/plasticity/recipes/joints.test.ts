import assert from "node:assert/strict";
import { test } from "node:test";
import { PlasticityRecipes } from "../recipes.ts";
import { type RecipeOperations, body, counterboreOperations, scene } from "./test-support.ts";

test("cantilever snap fit derives a hook profile and joins it through the rib pipeline", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const target = body(7, "Solid");
  let state = scene("r1", [target]);
  const operations: RecipeOperations = {
    async state() { return state; },
    async createPolyline(pointsMm, closed, revision) {
      calls.push({ operation: "createPolyline", pointsMm, closed, revision });
      state = { ...scene("r2", [target, body(8, "Wire")]), regions: [{
        id: "region-snap", entityId: 80, islandVersionId: 81, sketchId: 82, sketchWireIds: [8],
        measurementSource: "render-mesh", displayBoundsMm: { min: [3.5, 13, 1], max: [24, 13, 7] },
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

  const result = await recipes.createCantileverSnapFit({
    targetId: 7,
    baseCenterMm: [4, 10, 1],
    beamDirection: [1, 0, 0],
    thicknessDirection: [0, 0, 1],
    lengthMm: 20,
    widthMm: 6,
    thicknessMm: 2,
    hookLengthMm: 3,
    hookHeightMm: 4,
    baseOverlapMm: 0.5,
    revision: "r1",
  });

  assert.deepEqual(calls, [
    { operation: "createPolyline", pointsMm: [[3.5, 13, 1], [24, 13, 1], [24, 13, 7], [21, 13, 7], [21, 13, 3], [3.5, 13, 3]], closed: true, revision: "r1" },
    { operation: "extrudeRegions", regionIds: ["region-snap"], distanceMm: 6, revision: "r2" },
    { operation: "boolean", targetIds: [7], toolIds: [9], kind: "union", keepTools: false, revision: "r3" },
  ]);
  assert.equal(result.recipe, "cantilever-snap-fit");
  assert.equal(result.profileBodyId, 8);
  assert.equal(result.undoSteps, 3);
  assert.deepEqual(result.steps.map((step) => step.operation), ["create-snap-profile", "extrude-snap-body", "union-snap-to-target"]);
});

test("cantilever snap fit rejects parallel beam and thickness directions before mutation", async () => {
  const fake = counterboreOperations();
  const recipes = new PlasticityRecipes(fake.operations);
  await assert.rejects(recipes.createCantileverSnapFit({
    targetId: 7, baseCenterMm: [4, 10, 1],
    beamDirection: [1, 0, 0], thicknessDirection: [2, 0, 0],
    lengthMm: 20, widthMm: 6, thicknessMm: 2,
    hookLengthMm: 3, hookHeightMm: 4, baseOverlapMm: 0.5,
    revision: "r1",
  }), /perpendicular/i);
  assert.deepEqual(fake.calls, []);
});

test("hinge barrel hollows one native cylinder and joins it to the support", async () => {
  const fake = counterboreOperations();
  const recipes = new PlasticityRecipes(fake.operations);

  const result = await recipes.createHingeBarrel({
    targetId: 7,
    axisStartMm: [20, 0, 10],
    axis: [0, 2, 0],
    lengthMm: 4,
    outerDiameterMm: 8,
    pinBoreDiameterMm: 3,
    cutterOvershootMm: 0.5,
    revision: "r1",
  });

  assert.deepEqual(fake.calls, [
    { operation: "createCylinder", centerMm: [20, 0, 10], radiusMm: 4, heightMm: 4, axis: [0, 1, 0], revision: "r1" },
    { operation: "createCylinder", centerMm: [20, -0.5, 10], radiusMm: 1.5, heightMm: 5, axis: [0, 1, 0], revision: "r2" },
    { operation: "boolean", targetIds: [8], toolIds: [9], kind: "difference", keepTools: false, revision: "r3" },
    { operation: "boolean", targetIds: [7], toolIds: [8], kind: "union", keepTools: false, revision: "r4" },
  ]);
  assert.equal(result.recipe, "hinge-barrel");
  assert.equal(result.undoSteps, 4);
  assert.deepEqual(result.resultBodyIds, [7]);
  assert.deepEqual(result.consumedToolIds, [9, 8]);
  assert.deepEqual(result.steps.map((step) => step.operation), [
    "create-hinge-barrel",
    "create-hinge-bore-cutter",
    "hollow-hinge-barrel",
    "union-hinge-to-target",
  ]);
});

test("hinge barrel rejects an oversized pin bore before mutation", async () => {
  const fake = counterboreOperations();
  const recipes = new PlasticityRecipes(fake.operations);
  await assert.rejects(recipes.createHingeBarrel({
    targetId: 7, axisStartMm: [20, 0, 10], axis: [0, 1, 0],
    lengthMm: 4, outerDiameterMm: 8, pinBoreDiameterMm: 8,
    cutterOvershootMm: 0.5, revision: "r1",
  }), /pin bore diameter/i);
  assert.deepEqual(fake.calls, []);
});

test("mating enclosure joint creates a male lip and clearance groove on two existing halves", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const male = body(7, "Solid");
  const female = body(8, "Solid");
  let state = scene("r1", [male, female]);
  let nextBodyId = 9;
  const operations = {
    async state() { return state; },
    async createBox(originMm: [number, number, number], sizeMm: [number, number, number], _name: string | undefined, revision: string) {
      calls.push({ operation: "createBox", originMm, sizeMm, revision });
      const created = body(nextBodyId++, "Solid");
      state = { ...state, revision: `r${Number(state.revision.slice(1)) + 1}`, bodies: [...state.bodies, created] };
      return state;
    },
    async boolean(targetIds: number[], toolIds: number[], kind: string, keepTools: boolean, revision: string) {
      calls.push({ operation: "boolean", targetIds, toolIds, kind, keepTools, revision });
      state = { ...state, revision: `r${Number(state.revision.slice(1)) + 1}`, bodies: state.bodies.filter((candidate) => !toolIds.includes(candidate.id)) };
      return state;
    },
    async createCylinder() { throw new Error("unexpected cylinder"); },
    async createPolyline() { throw new Error("unexpected polyline"); },
    async extrudeRegions() { throw new Error("unexpected extrusion"); },
    async rectangularPattern() { throw new Error("unexpected pattern"); },
    async createPipes() { throw new Error("unexpected pipe"); },
    async fillet() { throw new Error("unexpected fillet"); },
  } satisfies RecipeOperations;

  const result = await new PlasticityRecipes(operations).createMatingEnclosureJoint({
    maleTargetId: 7, femaleTargetId: 8, seamOriginMm: [0, 0, 10], outerWidthMm: 40, outerDepthMm: 30,
    wallThicknessMm: 2, lipThicknessMm: 1, lipHeightMm: 2, clearanceMm: 0.25,
    overlapMm: 0.25, cutterOvershootMm: 0.25, revision: "r1",
  });

  assert.deepEqual(calls, [
    { operation: "createBox", originMm: [1.75, 1.75, 9.75], sizeMm: [36.5, 26.5, 2.25], revision: "r1" },
    { operation: "createBox", originMm: [3, 3, 9.5], sizeMm: [34, 24, 2.75], revision: "r2" },
    { operation: "boolean", targetIds: [9], toolIds: [10], kind: "difference", keepTools: false, revision: "r3" },
    { operation: "boolean", targetIds: [7], toolIds: [9], kind: "union", keepTools: false, revision: "r4" },
    { operation: "createBox", originMm: [1.5, 1.5, 9.75], sizeMm: [37, 27, 2.5], revision: "r5" },
    { operation: "createBox", originMm: [3.25, 3.25, 9.5], sizeMm: [33.5, 23.5, 3], revision: "r6" },
    { operation: "boolean", targetIds: [11], toolIds: [12], kind: "difference", keepTools: false, revision: "r7" },
    { operation: "boolean", targetIds: [8], toolIds: [11], kind: "difference", keepTools: false, revision: "r8" },
  ]);
  assert.equal(result.recipe, "mating-enclosure-joint");
  assert.deepEqual(result.resultBodyIds, [7, 8]);
  assert.deepEqual(result.consumedToolIds, [9, 10, 11, 12]);
  assert.equal(result.undoSteps, 8);
});

test("mating enclosure joint rejects overlap and clearance that consume the wall before mutation", async () => {
  const fake = counterboreOperations();
  const recipes = new PlasticityRecipes(fake.operations);
  await assert.rejects(recipes.createMatingEnclosureJoint({
    maleTargetId: 7, femaleTargetId: 8, seamOriginMm: [0, 0, 10], outerWidthMm: 40, outerDepthMm: 30,
    wallThicknessMm: 2, lipThicknessMm: 1, lipHeightMm: 2, clearanceMm: 1,
    overlapMm: 1, cutterOvershootMm: 0.25, revision: "r1",
  }), /wall thickness/i);
  assert.deepEqual(fake.calls, []);
});

test("locating pin pair joins an exact pin and cuts its clearance socket", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const male = body(7, "Solid");
  const female = body(8, "Solid");
  let state = scene("r1", [male, female]);
  let nextBodyId = 9;
  const operations: RecipeOperations = {
    async state() { return state; },
    async createCylinder(centerMm, radiusMm, heightMm, _name, revision, axis) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, axis, revision });
      const created = body(nextBodyId++, "Solid");
      state = { ...state, revision: `r${Number(state.revision.slice(1)) + 1}`, bodies: [...state.bodies, created] };
      return state;
    },
    async boolean(targetIds, toolIds, kind, keepTools, revision) {
      calls.push({ operation: "boolean", targetIds, toolIds, kind, keepTools, revision });
      state = { ...state, revision: `r${Number(state.revision.slice(1)) + 1}`, bodies: state.bodies.filter((candidate) => !toolIds.includes(candidate.id)) };
      return state;
    },
    async createBox() { throw new Error("unexpected box"); },
    async createPolyline() { throw new Error("unexpected polyline"); },
    async extrudeRegions() { throw new Error("unexpected extrusion"); },
    async rectangularPattern() { throw new Error("unexpected pattern"); },
    async createPipes() { throw new Error("unexpected pipe"); },
    async fillet() { throw new Error("unexpected fillet"); },
  };

  const result = await new PlasticityRecipes(operations).createLocatingPinPair({
    maleTargetId: 7, femaleTargetId: 8, baseCenterMm: [10, 10, 10], axis: [0, 0, 2],
    pinDiameterMm: 5, pinHeightMm: 6, radialClearanceMm: 0.25, axialClearanceMm: 0.75,
    baseOverlapMm: 0.5, cutterOvershootMm: 0.5, revision: "r1",
  });

  assert.deepEqual(calls, [
    { operation: "createCylinder", centerMm: [10, 10, 9.5], radiusMm: 2.5, heightMm: 6.5, axis: [0, 0, 1], revision: "r1" },
    { operation: "boolean", targetIds: [7], toolIds: [9], kind: "union", keepTools: false, revision: "r2" },
    { operation: "createCylinder", centerMm: [10, 10, 9.5], radiusMm: 2.75, heightMm: 7.25, axis: [0, 0, 1], revision: "r3" },
    { operation: "boolean", targetIds: [8], toolIds: [10], kind: "difference", keepTools: false, revision: "r4" },
  ]);
  assert.equal(result.recipe, "locating-pin-pair");
  assert.deepEqual(result.resultBodyIds, [7, 8]);
  assert.deepEqual(result.consumedToolIds, [9, 10]);
  assert.equal(result.undoSteps, 4);
});

test("locating pin pair rejects the same body on both sides before mutation", async () => {
  const fake = counterboreOperations();
  const recipes = new PlasticityRecipes(fake.operations);
  await assert.rejects(recipes.createLocatingPinPair({
    maleTargetId: 7, femaleTargetId: 7, baseCenterMm: [10, 10, 10], axis: [0, 0, 1],
    pinDiameterMm: 5, pinHeightMm: 6, radialClearanceMm: 0.25, axialClearanceMm: 0.75,
    baseOverlapMm: 0.5, cutterOvershootMm: 0.5, revision: "r1",
  }), /different Solid bodies/i);
  assert.deepEqual(fake.calls, []);
});

test("locating pin pattern creates all male pins and female sockets as one paired native recipe", async () => {
  const calls: Array<Record<string, unknown>> = [];
  let state = scene("r1", [body(7, "Solid"), body(8, "Solid")]);
  let nextId = 9;
  const operations = {
    async state() { return state; },
    async createCylinder(centerMm: [number, number, number], radiusMm: number, heightMm: number, _name: string | undefined, revision: string, axis: [number, number, number]) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, revision, axis });
      const id = nextId++;
      state = { ...state, revision: `r${Number(state.revision.slice(1)) + 1}`, bodies: [...state.bodies, body(id, "Solid")] };
      return state;
    },
    async boolean(targetIds: number[], toolIds: number[], kind: string, keepTools: boolean, revision: string) {
      calls.push({ operation: "boolean", targetIds, toolIds, kind, keepTools, revision });
      state = { ...state, revision: `r${Number(state.revision.slice(1)) + 1}`, bodies: state.bodies.filter((candidate) => !toolIds.includes(candidate.id)) };
      return state;
    },
  } as unknown as RecipeOperations;

  const result = await new PlasticityRecipes(operations).createLocatingPinPairPattern({
    maleTargetId: 7, femaleTargetId: 8, baseCentersMm: [[10, 10, 10], [30, 10, 10]], axis: [0, 0, 2],
    pinDiameterMm: 5, pinHeightMm: 6, radialClearanceMm: 0.25, axialClearanceMm: 0.75,
    baseOverlapMm: 0.5, cutterOvershootMm: 0.5, revision: "r1",
  });

  assert.deepEqual(calls, [
    { operation: "createCylinder", centerMm: [10, 10, 9.5], radiusMm: 2.5, heightMm: 6.5, revision: "r1", axis: [0, 0, 1] },
    { operation: "createCylinder", centerMm: [30, 10, 9.5], radiusMm: 2.5, heightMm: 6.5, revision: "r2", axis: [0, 0, 1] },
    { operation: "boolean", targetIds: [7], toolIds: [9, 10], kind: "union", keepTools: false, revision: "r3" },
    { operation: "createCylinder", centerMm: [10, 10, 9.5], radiusMm: 2.75, heightMm: 7.25, revision: "r4", axis: [0, 0, 1] },
    { operation: "createCylinder", centerMm: [30, 10, 9.5], radiusMm: 2.75, heightMm: 7.25, revision: "r5", axis: [0, 0, 1] },
    { operation: "boolean", targetIds: [8], toolIds: [11, 12], kind: "difference", keepTools: false, revision: "r6" },
  ]);
  assert.equal(result.pinCount, 2);
  assert.deepEqual(result.resultBodyIds, [7, 8]);
  assert.deepEqual(result.consumedToolIds, [9, 10, 11, 12]);
  assert.equal(result.undoSteps, 6);
});

test("locating pin pattern rejects duplicate centers before native mutation", async () => {
  const fake = counterboreOperations();
  await assert.rejects(new PlasticityRecipes(fake.operations).createLocatingPinPairPattern({
    maleTargetId: 7, femaleTargetId: 8, baseCentersMm: [[10, 10, 10], [10, 10, 10]], axis: [0, 0, 1],
    pinDiameterMm: 5, pinHeightMm: 6, radialClearanceMm: 0.25, axialClearanceMm: 0.75,
    baseOverlapMm: 0.5, cutterOvershootMm: 0.5, revision: "r1",
  }), /centers must be distinct/i);
  assert.deepEqual(fake.calls, []);
});

test("tongue and groove joint creates editable profiles with radial and axial clearance", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const first = body(7, "Solid");
  const second = body(8, "Solid");
  let state = scene("r1", [first, second]);
  let nextBodyId = 9;
  const operations: RecipeOperations = {
    async state() { return state; },
    async createPolyline(pointsMm, closed, revision) {
      calls.push({ operation: "createPolyline", pointsMm, closed, revision });
      const id = nextBodyId++;
      const nextRevision = `r${Number(state.revision.slice(1)) + 1}`;
      const createdRegion = {
        id: `region-${id}`, entityId: id * 10, islandVersionId: id * 10 + 1, sketchId: id * 10 + 2,
        sketchWireIds: [id], measurementSource: "render-mesh" as const, displayBoundsMm: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 0] as [number, number, number] },
      };
      state = {
        ...state, revision: nextRevision, bodies: [...state.bodies, body(id, "Wire")],
        regions: id === 11
          ? [{ ...state.regions[0]!, sketchWireIds: [9, 11] }, { ...createdRegion, sketchWireIds: [9, 11] }]
          : [...state.regions, createdRegion],
      };
      return state;
    },
    async extrudeRegions(regionIds, distanceMm, revision) {
      calls.push({ operation: "extrudeRegions", regionIds, distanceMm, revision });
      const id = nextBodyId++;
      state = { ...state, revision: `r${Number(state.revision.slice(1)) + 1}`, bodies: [...state.bodies, body(id, "Solid")] };
      return state;
    },
    async boolean(targetIds, toolIds, kind, keepTools, revision) {
      calls.push({ operation: "boolean", targetIds, toolIds, kind, keepTools, revision });
      state = { ...state, revision: `r${Number(state.revision.slice(1)) + 1}`, bodies: state.bodies.filter((candidate) => !toolIds.includes(candidate.id)) };
      return state;
    },
    async createBox() { throw new Error("unexpected box"); },
    async createCylinder() { throw new Error("unexpected cylinder"); },
    async rectangularPattern() { throw new Error("unexpected pattern"); },
    async createPipes() { throw new Error("unexpected pipe"); },
    async fillet() { throw new Error("unexpected fillet"); },
  };

  const result = await new PlasticityRecipes(operations).createTongueGrooveJoint({
    tongueTargetId: 7, grooveTargetId: 8, baseCenterMm: [20, 15, 10], axis: [0, 0, 1], widthDirection: [1, 0, 0],
    tongueWidthMm: 12, tongueThicknessMm: 4, tongueHeightMm: 5,
    radialClearanceMm: 0.25, axialClearanceMm: 0.75,
    baseOverlapMm: 0.5, cutterOvershootMm: 0.5, revision: "r1",
  });

  assert.deepEqual(calls, [
    { operation: "createPolyline", pointsMm: [[14, 13, 9.5], [26, 13, 9.5], [26, 17, 9.5], [14, 17, 9.5]], closed: true, revision: "r1" },
    { operation: "extrudeRegions", regionIds: ["region-9"], distanceMm: 5.5, revision: "r2" },
    { operation: "boolean", targetIds: [7], toolIds: [10], kind: "union", keepTools: false, revision: "r3" },
    { operation: "createPolyline", pointsMm: [[13.75, 12.75, 9.5], [26.25, 12.75, 9.5], [26.25, 17.25, 9.5], [13.75, 17.25, 9.5]], closed: true, revision: "r4" },
    { operation: "extrudeRegions", regionIds: ["region-9", "region-11"], distanceMm: 6.25, revision: "r5" },
    { operation: "boolean", targetIds: [8], toolIds: [12], kind: "difference", keepTools: false, revision: "r6" },
  ]);
  assert.equal(result.recipe, "tongue-groove-joint");
  assert.deepEqual(result.profileBodyIds, [9, 11]);
  assert.deepEqual(result.resultBodyIds, [7, 8]);
  assert.deepEqual(result.consumedToolIds, [10, 12]);
  assert.equal(result.undoSteps, 6);
});

test("tongue and groove joint rejects a width direction parallel to the mating axis before mutation", async () => {
  const fake = counterboreOperations();
  const recipes = new PlasticityRecipes(fake.operations);
  await assert.rejects(recipes.createTongueGrooveJoint({
    tongueTargetId: 7, grooveTargetId: 8, baseCenterMm: [20, 15, 10], axis: [0, 0, 1], widthDirection: [0, 0, 1],
    tongueWidthMm: 12, tongueThicknessMm: 4, tongueHeightMm: 5,
    radialClearanceMm: 0.25, axialClearanceMm: 0.75,
    baseOverlapMm: 0.5, cutterOvershootMm: 0.5, revision: "r1",
  }), /perpendicular/i);
  assert.deepEqual(fake.calls, []);
});

test("dovetail joint creates a flared male profile and clearance-expanded female cutter", async () => {
  const calls: Array<Record<string, unknown>> = [];
  let state = scene("r1", [body(7, "Solid"), body(8, "Solid")]);
  let nextBodyId = 9;
  const operations: RecipeOperations = {
    async state() { return state; },
    async createPolyline(pointsMm, closed, revision) {
      calls.push({ operation: "createPolyline", pointsMm, closed, revision });
      const id = nextBodyId++;
      const min = [0, 1, 2].map((axis) => Math.min(...pointsMm.map((point) => point[axis]!))) as [number, number, number];
      const max = [0, 1, 2].map((axis) => Math.max(...pointsMm.map((point) => point[axis]!))) as [number, number, number];
      const createdRegion = {
        id: `region-${id}`, entityId: id * 10, islandVersionId: id * 10 + 1, sketchId: id * 10 + 2,
        sketchWireIds: [id], measurementSource: "render-mesh" as const, displayBoundsMm: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 0] as [number, number, number] },
      };
      createdRegion.displayBoundsMm = { min, max };
      state = { ...state, revision: `r${Number(state.revision.slice(1)) + 1}`, bodies: [...state.bodies, body(id, "Wire")], regions: [...state.regions, createdRegion] };
      return state;
    },
    async extrudeRegions(regionIds, distanceMm, revision) {
      calls.push({ operation: "extrudeRegions", regionIds, distanceMm, revision });
      const id = nextBodyId++;
      state = { ...state, revision: `r${Number(state.revision.slice(1)) + 1}`, bodies: [...state.bodies, body(id, "Solid")] };
      return state;
    },
    async boolean(targetIds, toolIds, kind, keepTools, revision) {
      calls.push({ operation: "boolean", targetIds, toolIds, kind, keepTools, revision });
      state = { ...state, revision: `r${Number(state.revision.slice(1)) + 1}`, bodies: state.bodies.filter((candidate) => !toolIds.includes(candidate.id)) };
      return state;
    },
    async createBox() { throw new Error("unexpected box"); },
    async createCylinder() { throw new Error("unexpected cylinder"); },
    async rectangularPattern() { throw new Error("unexpected pattern"); },
    async createPipes() { throw new Error("unexpected pipe"); },
    async fillet() { throw new Error("unexpected fillet"); },
  };

  const result = await new PlasticityRecipes(operations).createDovetailJoint({
    maleTargetId: 7, femaleTargetId: 8, baseCenterMm: [20, 15, 10], axis: [0, 0, 1], widthDirection: [1, 0, 0],
    rootWidthMm: 8, flareMm: 2, tongueThicknessMm: 4, tongueHeightMm: 5,
    radialClearanceMm: 0.2, axialClearanceMm: 0.5, baseOverlapMm: 0.5, cutterOvershootMm: 0.5, revision: "r1",
  });

  assert.deepEqual(calls, [
    { operation: "createPolyline", pointsMm: [[16, 13, 9.5], [24, 13, 9.5], [26, 17, 9.5], [14, 17, 9.5]], closed: true, revision: "r1" },
    { operation: "extrudeRegions", regionIds: ["region-9"], distanceMm: 5.5, revision: "r2" },
    { operation: "boolean", targetIds: [7], toolIds: [10], kind: "union", keepTools: false, revision: "r3" },
    { operation: "createPolyline", pointsMm: [[15.8, 12.8, 9.5], [24.2, 12.8, 9.5], [26.2, 17.2, 9.5], [13.8, 17.2, 9.5]], closed: true, revision: "r4" },
    { operation: "extrudeRegions", regionIds: ["region-11"], distanceMm: 6, revision: "r5" },
    { operation: "boolean", targetIds: [8], toolIds: [12], kind: "difference", keepTools: false, revision: "r6" },
  ]);
  assert.equal(result.recipe, "dovetail-joint");
  assert.deepEqual(result.profileBodyIds, [9, 11]);
  assert.deepEqual(result.resultBodyIds, [7, 8]);
  assert.deepEqual(result.consumedToolIds, [10, 12]);
  assert.equal(result.undoSteps, 6);
});

test("dovetail joint rejects a negative flare before mutation", async () => {
  const fake = counterboreOperations();
  await assert.rejects(new PlasticityRecipes(fake.operations).createDovetailJoint({
    maleTargetId: 7, femaleTargetId: 8, baseCenterMm: [20, 15, 10], axis: [0, 0, 1], widthDirection: [1, 0, 0],
    rootWidthMm: 8, flareMm: -1, tongueThicknessMm: 4, tongueHeightMm: 5,
    radialClearanceMm: 0.2, axialClearanceMm: 0.5, baseOverlapMm: 0.5, cutterOvershootMm: 0.5, revision: "r1",
  }), /flare must be positive/i);
  assert.deepEqual(fake.calls, []);
});

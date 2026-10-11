import assert from "node:assert/strict";
import { test } from "node:test";
import { HeatSetInsertPocketPatternRecipeError, PlasticityRecipes, ScrewBossPatternRecipeError } from "./index.ts";
import { type RecipeOperations, body, counterboreOperations, scene } from "./test-support.ts";

test("heat-set insert pocket creates three concentric cutters and one boolean", async () => {
  const fake = counterboreOperations();
  const recipes = new PlasticityRecipes(fake.operations);

  const result = await recipes.createHeatSetInsertPocket({
    targetId: 7,
    entryCenterMm: [10, 12, 12],
    axis: [0, 0, -1],
    pilotDiameterMm: 3,
    pilotDepthMm: 8,
    insertDiameterMm: 4.6,
    insertDepthMm: 6,
    leadInDiameterMm: 5.4,
    leadInDepthMm: 1,
    materialDepthMm: 12,
    overshootMm: 0.5,
    revision: "r1",
  });

  assert.deepEqual(fake.calls, [
    { operation: "createCylinder", centerMm: [10, 12, 12.5], radiusMm: 1.5, heightMm: 8.5, axis: [0, 0, -1], revision: "r1" },
    { operation: "createCylinder", centerMm: [10, 12, 12.5], radiusMm: 2.3, heightMm: 6.5, axis: [0, 0, -1], revision: "r2" },
    { operation: "createCylinder", centerMm: [10, 12, 12.5], radiusMm: 2.7, heightMm: 1.5, axis: [0, 0, -1], revision: "r3" },
    { operation: "boolean", targetIds: [7], toolIds: [8, 9, 10], kind: "difference", keepTools: false, revision: "r4" },
  ]);
  assert.equal(result.recipe, "heat-set-insert-pocket");
  assert.equal(result.undoSteps, 4);
  assert.equal(result.afterRevision, "r5");
  assert.deepEqual(result.resultBodyIds, [7]);
  assert.deepEqual(result.consumedToolIds, [8, 9, 10]);
  assert.deepEqual(result.steps.map((step) => step.operation), [
    "create-pilot-cutter",
    "create-insert-cutter",
    "create-lead-in-cutter",
    "boolean-difference",
  ]);
});

test("heat-set insert pocket rejects unordered diameters and depths before mutation", async () => {
  const fake = counterboreOperations();
  const recipes = new PlasticityRecipes(fake.operations);

  await assert.rejects(recipes.createHeatSetInsertPocket({
    targetId: 7,
    entryCenterMm: [10, 12, 12],
    axis: [0, 0, -1],
    pilotDiameterMm: 4.6,
    pilotDepthMm: 6,
    insertDiameterMm: 4.6,
    insertDepthMm: 6,
    leadInDiameterMm: 5.4,
    leadInDepthMm: 1,
    materialDepthMm: 12,
    overshootMm: 0.5,
    revision: "r1",
  }), /pilot diameter/i);
  await assert.rejects(recipes.createHeatSetInsertPocket({
    targetId: 7, entryCenterMm: [10, 12, 12], axis: [0, 0, -1],
    pilotDiameterMm: 3, pilotDepthMm: 12, insertDiameterMm: 4.6, insertDepthMm: 6,
    leadInDiameterMm: 5.4, leadInDepthMm: 1, materialDepthMm: 12, overshootMm: 0.5, revision: "r1",
  }), /pilot depth must be less than material depth/i);
  assert.deepEqual(fake.calls, []);
});

test("heat-set insert pocket pattern creates three cutters per center and one final Boolean", async () => {
  const fake = counterboreOperations();
  const result = await new PlasticityRecipes(fake.operations).createHeatSetInsertPocketPattern({
    targetId: 7,
    entryCentersMm: [[10, 10, 12], [30, 10, 12]],
    axis: [0, 0, -1],
    pilotDiameterMm: 3,
    pilotDepthMm: 8,
    insertDiameterMm: 4.6,
    insertDepthMm: 6,
    leadInDiameterMm: 5.4,
    leadInDepthMm: 1,
    materialDepthMm: 12,
    overshootMm: 0.5,
    revision: "r1",
  });

  assert.deepEqual(fake.calls, [
    { operation: "createCylinder", centerMm: [10, 10, 12.5], radiusMm: 1.5, heightMm: 8.5, axis: [0, 0, -1], revision: "r1" },
    { operation: "createCylinder", centerMm: [10, 10, 12.5], radiusMm: 2.3, heightMm: 6.5, axis: [0, 0, -1], revision: "r2" },
    { operation: "createCylinder", centerMm: [10, 10, 12.5], radiusMm: 2.7, heightMm: 1.5, axis: [0, 0, -1], revision: "r3" },
    { operation: "createCylinder", centerMm: [30, 10, 12.5], radiusMm: 1.5, heightMm: 8.5, axis: [0, 0, -1], revision: "r4" },
    { operation: "createCylinder", centerMm: [30, 10, 12.5], radiusMm: 2.3, heightMm: 6.5, axis: [0, 0, -1], revision: "r5" },
    { operation: "createCylinder", centerMm: [30, 10, 12.5], radiusMm: 2.7, heightMm: 1.5, axis: [0, 0, -1], revision: "r6" },
    { operation: "boolean", targetIds: [7], toolIds: [8, 9, 10, 11, 12, 13], kind: "difference", keepTools: false, revision: "r7" },
  ]);
  assert.equal(result.recipe, "heat-set-insert-pocket-pattern");
  assert.equal(result.pocketCount, 2);
  assert.equal(result.undoSteps, 7);
  assert.deepEqual(result.consumedToolIds, [8, 9, 10, 11, 12, 13]);
});

test("heat-set insert pocket pattern validates all centers and reports partial work", async () => {
  const invalid = counterboreOperations();
  await assert.rejects(new PlasticityRecipes(invalid.operations).createHeatSetInsertPocketPattern({
    targetId: 7, entryCentersMm: [[10, 10, 12], [10, 10, 12]], axis: [0, 0, -1],
    pilotDiameterMm: 3, pilotDepthMm: 8, insertDiameterMm: 4.6, insertDepthMm: 6,
    leadInDiameterMm: 5.4, leadInDepthMm: 1, materialDepthMm: 12, overshootMm: 0.5, revision: "r1",
  }), /centers must be distinct/i);
  assert.deepEqual(invalid.calls, []);

  const failed = counterboreOperations(4);
  await assert.rejects(new PlasticityRecipes(failed.operations).createHeatSetInsertPocketPattern({
    targetId: 7, entryCentersMm: [[10, 10, 12], [30, 10, 12]], axis: [0, 0, -1],
    pilotDiameterMm: 3, pilotDepthMm: 8, insertDiameterMm: 4.6, insertDepthMm: 6,
    leadInDiameterMm: 5.4, leadInDepthMm: 1, materialDepthMm: 12, overshootMm: 0.5, revision: "r1",
  }), (error: unknown) => {
    assert(error instanceof HeatSetInsertPocketPatternRecipeError);
    assert.equal(error.completedSteps.length, 3);
    assert.equal(error.lastConfirmedRevision, "r4");
    assert.match(error.message, /3\/7 confirmed steps/i);
    return true;
  });
});

test("screw boss overlaps and unions the support before cutting its pilot hole", async () => {
  const fake = counterboreOperations();
  const recipes = new PlasticityRecipes(fake.operations);

  const result = await recipes.createScrewBoss({
    targetId: 7,
    baseCenterMm: [10, 12, 4],
    axis: [0, 0, 2],
    outerDiameterMm: 10,
    heightMm: 10,
    holeDiameterMm: 3,
    holeDepthMm: 8,
    baseOverlapMm: 0.5,
    cutterOvershootMm: 0.5,
    revision: "r1",
  });

  assert.deepEqual(fake.calls, [
    { operation: "createCylinder", centerMm: [10, 12, 3.5], radiusMm: 5, heightMm: 10.5, axis: [0, 0, 1], revision: "r1" },
    { operation: "boolean", targetIds: [7], toolIds: [8], kind: "union", keepTools: false, revision: "r2" },
    { operation: "createCylinder", centerMm: [10, 12, 14.5], radiusMm: 1.5, heightMm: 8.5, axis: [0, 0, -1], revision: "r3" },
    { operation: "boolean", targetIds: [7], toolIds: [9], kind: "difference", keepTools: false, revision: "r4" },
  ]);
  assert.equal(result.recipe, "screw-boss");
  assert.equal(result.undoSteps, 4);
  assert.equal(result.afterRevision, "r5");
  assert.deepEqual(result.resultBodyIds, [7]);
  assert.deepEqual(result.consumedToolIds, [8, 9]);
  assert.deepEqual(result.steps.map((step) => step.operation), [
    "create-boss-body",
    "union-boss-to-target",
    "create-boss-hole-cutter",
    "boolean-difference",
  ]);
});

test("screw boss rejects a hole deeper than the boss before mutation", async () => {
  const fake = counterboreOperations();
  const recipes = new PlasticityRecipes(fake.operations);

  await assert.rejects(recipes.createScrewBoss({
    targetId: 7,
    baseCenterMm: [10, 12, 4],
    axis: [0, 0, 1],
    outerDiameterMm: 10,
    heightMm: 10,
    holeDiameterMm: 3,
    holeDepthMm: 11,
    baseOverlapMm: 0.5,
    cutterOvershootMm: 0.5,
    revision: "r1",
  }), /hole depth/i);
  assert.deepEqual(fake.calls, []);
});

test("screw boss pattern joins every boss before cutting every pilot", async () => {
  const fake = counterboreOperations();
  const result = await new PlasticityRecipes(fake.operations).createScrewBossPattern({
    targetId: 7,
    baseCentersMm: [[10, 12, 4], [30, 12, 4]],
    axis: [0, 0, 2],
    outerDiameterMm: 10,
    heightMm: 10,
    holeDiameterMm: 3,
    holeDepthMm: 8,
    baseOverlapMm: 0.5,
    cutterOvershootMm: 0.5,
    revision: "r1",
  });

  assert.deepEqual(fake.calls, [
    { operation: "createCylinder", centerMm: [10, 12, 3.5], radiusMm: 5, heightMm: 10.5, axis: [0, 0, 1], revision: "r1" },
    { operation: "createCylinder", centerMm: [30, 12, 3.5], radiusMm: 5, heightMm: 10.5, axis: [0, 0, 1], revision: "r2" },
    { operation: "boolean", targetIds: [7], toolIds: [8, 9], kind: "union", keepTools: false, revision: "r3" },
    { operation: "createCylinder", centerMm: [10, 12, 14.5], radiusMm: 1.5, heightMm: 8.5, axis: [0, 0, -1], revision: "r4" },
    { operation: "createCylinder", centerMm: [30, 12, 14.5], radiusMm: 1.5, heightMm: 8.5, axis: [0, 0, -1], revision: "r5" },
    { operation: "boolean", targetIds: [7], toolIds: [10, 11], kind: "difference", keepTools: false, revision: "r6" },
  ]);
  assert.equal(result.recipe, "screw-boss-pattern");
  assert.equal(result.bossCount, 2);
  assert.equal(result.undoSteps, 6);
  assert.equal(result.afterRevision, "r7");
  assert.deepEqual(result.resultBodyIds, [7]);
  assert.deepEqual(result.consumedToolIds, [8, 9, 10, 11]);
  assert.deepEqual(result.steps.map((item) => item.operation), [
    "create-boss-body", "create-boss-body", "union-boss-to-target",
    "create-boss-hole-cutter", "create-boss-hole-cutter", "boolean-difference",
  ]);
});

test("screw boss pattern validates centers and reports confirmed partial work", async () => {
  const invalid = counterboreOperations();
  await assert.rejects(new PlasticityRecipes(invalid.operations).createScrewBossPattern({
    targetId: 7, baseCentersMm: [[10, 12, 4], [10, 12, 4]], axis: [0, 0, 1],
    outerDiameterMm: 10, heightMm: 10, holeDiameterMm: 3, holeDepthMm: 8,
    baseOverlapMm: 0.5, cutterOvershootMm: 0.5, revision: "r1",
  }), /centers must be distinct/i);
  assert.deepEqual(invalid.calls, []);

  const failed = counterboreOperations(4);
  await assert.rejects(new PlasticityRecipes(failed.operations).createScrewBossPattern({
    targetId: 7, baseCentersMm: [[10, 12, 4], [30, 12, 4]], axis: [0, 0, 1],
    outerDiameterMm: 10, heightMm: 10, holeDiameterMm: 3, holeDepthMm: 8,
    baseOverlapMm: 0.5, cutterOvershootMm: 0.5, revision: "r1",
  }), (error: unknown) => {
    assert(error instanceof ScrewBossPatternRecipeError);
    assert.equal(error.completedSteps.length, 3);
    assert.equal(error.lastConfirmedRevision, "r4");
    assert.match(error.message, /3\/6 confirmed steps/i);
    return true;
  });
});

test("split screw-and-insert recipe cuts aligned clearance holes and matching insert pockets", async () => {
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

  const result = await new PlasticityRecipes(operations).createSplitScrewInsertJoint({
    maleTargetId: 7, femaleTargetId: 8,
    screwEntryCentersMm: [[10, 10, 0]], insertEntryCentersMm: [[10, 10, 8]], axis: [0, 0, 1],
    fastenerDesignation: "M5x12", screwLengthMm: 12, minimumEngagementMm: 3, maximumEngagementMm: 5,
    insertPartNumber: "Qualified-M5-heat-set-insert", insertThreadNominalDiameterMm: 5, insertThreadPitchMm: 0.8,
    insertSourceUrl: "https://manufacturer.example/qualified-test-insert",
    holeDiameterMm: 5.3, maleThroughDepthMm: 8, holeOvershootMm: 0.5,
    pilotDiameterMm: 3, pilotDepthMm: 8, insertDiameterMm: 4.6, insertDepthMm: 6,
    leadInDiameterMm: 5.4, leadInDepthMm: 1, femaleMaterialDepthMm: 10, insertOvershootMm: 0.5, revision: "r1",
  });

  assert.deepEqual(calls, [
    { operation: "createCylinder", centerMm: [10, 10, -0.5], radiusMm: 2.65, heightMm: 9, revision: "r1", axis: [0, 0, 1] },
    { operation: "boolean", targetIds: [7], toolIds: [9], kind: "difference", keepTools: false, revision: "r2" },
    { operation: "createCylinder", centerMm: [10, 10, 7.5], radiusMm: 1.5, heightMm: 8.5, revision: "r3", axis: [0, 0, 1] },
    { operation: "createCylinder", centerMm: [10, 10, 7.5], radiusMm: 2.3, heightMm: 6.5, revision: "r4", axis: [0, 0, 1] },
    { operation: "createCylinder", centerMm: [10, 10, 7.5], radiusMm: 2.7, heightMm: 1.5, revision: "r5", axis: [0, 0, 1] },
    { operation: "boolean", targetIds: [8], toolIds: [10, 11, 12], kind: "difference", keepTools: false, revision: "r6" },
  ]);
  assert.equal(result.fastenerCount, 1);
  assert.equal(result.insertPartNumber, "Qualified-M5-heat-set-insert");
  assert.equal(result.insertThreadNominalDiameterMm, 5);
  assert.equal(result.insertThreadPitchMm, 0.8);
  assert.equal(result.insertSourceUrl, "https://manufacturer.example/qualified-test-insert");
  assert.deepEqual(result.resultBodyIds, [7, 8]);
  assert.equal(result.undoSteps, 6);
});

test("split screw-and-insert recipe rejects off-axis stations before native mutation", async () => {
  const fake = counterboreOperations();
  await assert.rejects(new PlasticityRecipes(fake.operations).createSplitScrewInsertJoint({
    maleTargetId: 7, femaleTargetId: 8,
    screwEntryCentersMm: [[10, 10, 0]], insertEntryCentersMm: [[10.1, 10, 8]], axis: [0, 0, 1],
    fastenerDesignation: "M5x12", screwLengthMm: 12, minimumEngagementMm: 3, maximumEngagementMm: 5,
    insertPartNumber: "Qualified-M5-heat-set-insert", insertThreadNominalDiameterMm: 5, insertThreadPitchMm: 0.8,
    insertSourceUrl: "https://manufacturer.example/qualified-test-insert",
    holeDiameterMm: 5.3, maleThroughDepthMm: 8, holeOvershootMm: 0.5,
    pilotDiameterMm: 3, pilotDepthMm: 8, insertDiameterMm: 4.6, insertDepthMm: 6,
    leadInDiameterMm: 5.4, leadInDepthMm: 1, femaleMaterialDepthMm: 10, insertOvershootMm: 0.5, revision: "r1",
  }), /centers must be coaxial/i);
  assert.deepEqual(fake.calls, []);
});

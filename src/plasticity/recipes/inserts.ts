import { type RecipeStep, type HeatSetInsertPocketRecipeInput, type HeatSetInsertPocketRecipeResult, type HeatSetInsertPocketPatternRecipeInput, type HeatSetInsertPocketPatternRecipeResult, type ScrewBossRecipeInput, type ScrewBossRecipeResult, type ScrewBossPatternRecipeInput, type ScrewBossPatternRecipeResult, type SplitScrewInsertJointRecipeInput, type SplitScrewInsertJointRecipeResult } from "./types.ts";
import { HeatSetInsertPocketRecipeError, HeatSetInsertPocketPatternRecipeError, ScrewBossRecipeError, ScrewBossPatternRecipeError, SplitScrewInsertJointRecipeError } from "./errors.ts";
import { validateHeatSetInsertPocket, validateHeatSetInsertPocketPattern, validateScrewBoss, validateScrewBossPattern, validateSplitScrewInsertJoint, requireCurrentSolid, requireSingleAddedBody, requireRecipeResult, requirePairedSolidResult, step, normalize, scale, subtract, add } from "./helpers.ts";
import { RecipesBase } from "./base.ts";
import type { HolesRecipes } from "./holes.ts";

export abstract class InsertsRecipes extends RecipesBase {
  declare createThroughHole: HolesRecipes["createThroughHole"];
  declare createThroughHolePattern: HolesRecipes["createThroughHolePattern"];
  async createHeatSetInsertPocket(input: HeatSetInsertPocketRecipeInput): Promise<HeatSetInsertPocketRecipeResult> {
    validateHeatSetInsertPocket(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Heat-set insert pocket");

    const axis = normalize(input.axis);
    const cutterStart = subtract(input.entryCenterMm, scale(axis, input.overshootMm));
    const completedSteps: RecipeStep[] = [];
    const cutterIds: number[] = [];
    let current = initial;
    try {
      const cutters: Array<{ operation: RecipeStep["operation"]; diameterMm: number; depthMm: number; label: string }> = [
        { operation: "create-pilot-cutter", diameterMm: input.pilotDiameterMm, depthMm: input.pilotDepthMm, label: "pilot cutter" },
        { operation: "create-insert-cutter", diameterMm: input.insertDiameterMm, depthMm: input.insertDepthMm, label: "insert cutter" },
        { operation: "create-lead-in-cutter", diameterMm: input.leadInDiameterMm, depthMm: input.leadInDepthMm, label: "lead-in cutter" },
      ];
      for (const cutter of cutters) {
        const after = await this.operations.createCylinder(
          cutterStart,
          cutter.diameterMm / 2,
          cutter.depthMm + input.overshootMm,
          undefined,
          current.revision,
          axis,
        );
        const cutterId = requireSingleAddedBody(current, after, cutter.label);
        cutterIds.push(cutterId);
        completedSteps.push(step(cutter.operation, current, after, [cutterId]));
        current = after;
      }

      const result = await this.operations.boolean(
        [input.targetId],
        cutterIds,
        "difference",
        false,
        current.revision,
      );
      const resultBodyIds = requireRecipeResult(initial, result, input.targetId, cutterIds);
      completedSteps.push(step("boolean-difference", current, result, resultBodyIds));
      current = result;

      return {
        recipe: "heat-set-insert-pocket",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        resultBodyIds,
        consumedToolIds: cutterIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof HeatSetInsertPocketRecipeError) throw error;
      throw new HeatSetInsertPocketRecipeError(error, completedSteps, current.revision);
    }
  }

  async createHeatSetInsertPocketPattern(input: HeatSetInsertPocketPatternRecipeInput): Promise<HeatSetInsertPocketPatternRecipeResult> {
    validateHeatSetInsertPocketPattern(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Heat-set insert pocket pattern");

    const axis = normalize(input.axis);
    const completedSteps: RecipeStep[] = [];
    const cutterIds: number[] = [];
    const totalSteps = input.entryCentersMm.length * 3 + 1;
    let current = initial;
    try {
      const cutterDefinitions: Array<{ operation: RecipeStep["operation"]; diameterMm: number; depthMm: number; label: string }> = [
        { operation: "create-pilot-cutter", diameterMm: input.pilotDiameterMm, depthMm: input.pilotDepthMm, label: "pattern pilot cutter" },
        { operation: "create-insert-cutter", diameterMm: input.insertDiameterMm, depthMm: input.insertDepthMm, label: "pattern insert cutter" },
        { operation: "create-lead-in-cutter", diameterMm: input.leadInDiameterMm, depthMm: input.leadInDepthMm, label: "pattern lead-in cutter" },
      ];
      for (const center of input.entryCentersMm) {
        const cutterStart = subtract(center, scale(axis, input.overshootMm));
        for (const definition of cutterDefinitions) {
          const after = await this.operations.createCylinder(
            cutterStart,
            definition.diameterMm / 2,
            definition.depthMm + input.overshootMm,
            undefined,
            current.revision,
            axis,
          );
          const cutterId = requireSingleAddedBody(current, after, definition.label);
          cutterIds.push(cutterId);
          completedSteps.push(step(definition.operation, current, after, [cutterId]));
          current = after;
        }
      }

      const result = await this.operations.boolean(
        [input.targetId],
        cutterIds,
        "difference",
        false,
        current.revision,
      );
      const resultBodyIds = requireRecipeResult(initial, result, input.targetId, cutterIds);
      completedSteps.push(step("boolean-difference", current, result, resultBodyIds));
      current = result;

      return {
        recipe: "heat-set-insert-pocket-pattern",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        pocketCount: input.entryCentersMm.length,
        resultBodyIds,
        consumedToolIds: cutterIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof HeatSetInsertPocketPatternRecipeError) throw error;
      throw new HeatSetInsertPocketPatternRecipeError(error, completedSteps, current.revision, totalSteps);
    }
  }

  async createScrewBoss(input: ScrewBossRecipeInput): Promise<ScrewBossRecipeResult> {
    validateScrewBoss(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Screw boss");

    const axis = normalize(input.axis);
    const completedSteps: RecipeStep[] = [];
    const consumedToolIds: number[] = [];
    let current = initial;
    try {
      const boss = await this.operations.createCylinder(
        subtract(input.baseCenterMm, scale(axis, input.baseOverlapMm)),
        input.outerDiameterMm / 2,
        input.heightMm + input.baseOverlapMm,
        undefined,
        current.revision,
        axis,
      );
      const bossId = requireSingleAddedBody(current, boss, "screw boss body");
      consumedToolIds.push(bossId);
      completedSteps.push(step("create-boss-body", current, boss, [bossId]));
      current = boss;

      const united = await this.operations.boolean(
        [input.targetId],
        [bossId],
        "union",
        false,
        current.revision,
      );
      const unitedBodyIds = requireRecipeResult(initial, united, input.targetId, [bossId]);
      completedSteps.push(step("union-boss-to-target", current, united, unitedBodyIds));
      current = united;

      const top = add(input.baseCenterMm, scale(axis, input.heightMm + input.cutterOvershootMm));
      const inwardAxis = scale(axis, -1);
      const cutter = await this.operations.createCylinder(
        top,
        input.holeDiameterMm / 2,
        input.holeDepthMm + input.cutterOvershootMm,
        undefined,
        current.revision,
        inwardAxis,
      );
      const cutterId = requireSingleAddedBody(current, cutter, "screw boss hole cutter");
      consumedToolIds.push(cutterId);
      completedSteps.push(step("create-boss-hole-cutter", current, cutter, [cutterId]));
      current = cutter;

      const result = await this.operations.boolean(
        [input.targetId],
        [cutterId],
        "difference",
        false,
        current.revision,
      );
      const resultBodyIds = requireRecipeResult(initial, result, input.targetId, [cutterId]);
      completedSteps.push(step("boolean-difference", current, result, resultBodyIds));
      current = result;

      return {
        recipe: "screw-boss",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        resultBodyIds,
        consumedToolIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof ScrewBossRecipeError) throw error;
      throw new ScrewBossRecipeError(error, completedSteps, current.revision);
    }
  }

  async createScrewBossPattern(input: ScrewBossPatternRecipeInput): Promise<ScrewBossPatternRecipeResult> {
    validateScrewBossPattern(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Screw boss pattern");

    const axis = normalize(input.axis);
    const inwardAxis = scale(axis, -1);
    const completedSteps: RecipeStep[] = [];
    const bossIds: number[] = [];
    const cutterIds: number[] = [];
    const totalSteps = input.baseCentersMm.length * 2 + 2;
    let current = initial;
    try {
      for (const center of input.baseCentersMm) {
        const boss = await this.operations.createCylinder(
          subtract(center, scale(axis, input.baseOverlapMm)),
          input.outerDiameterMm / 2,
          input.heightMm + input.baseOverlapMm,
          undefined,
          current.revision,
          axis,
        );
        const bossId = requireSingleAddedBody(current, boss, "screw boss pattern body");
        bossIds.push(bossId);
        completedSteps.push(step("create-boss-body", current, boss, [bossId]));
        current = boss;
      }

      const united = await this.operations.boolean(
        [input.targetId],
        bossIds,
        "union",
        false,
        current.revision,
      );
      const unitedBodyIds = requireRecipeResult(initial, united, input.targetId, bossIds);
      completedSteps.push(step("union-boss-to-target", current, united, unitedBodyIds));
      current = united;

      for (const center of input.baseCentersMm) {
        const top = add(center, scale(axis, input.heightMm + input.cutterOvershootMm));
        const cutter = await this.operations.createCylinder(
          top,
          input.holeDiameterMm / 2,
          input.holeDepthMm + input.cutterOvershootMm,
          undefined,
          current.revision,
          inwardAxis,
        );
        const cutterId = requireSingleAddedBody(current, cutter, "screw boss pattern hole cutter");
        cutterIds.push(cutterId);
        completedSteps.push(step("create-boss-hole-cutter", current, cutter, [cutterId]));
        current = cutter;
      }

      const result = await this.operations.boolean(
        [input.targetId],
        cutterIds,
        "difference",
        false,
        current.revision,
      );
      const resultBodyIds = requireRecipeResult(initial, result, input.targetId, cutterIds);
      completedSteps.push(step("boolean-difference", current, result, resultBodyIds));
      current = result;

      return {
        recipe: "screw-boss-pattern",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        bossCount: input.baseCentersMm.length,
        resultBodyIds,
        consumedToolIds: [...bossIds, ...cutterIds],
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof ScrewBossPatternRecipeError) throw error;
      throw new ScrewBossPatternRecipeError(error, completedSteps, current.revision, totalSteps);
    }
  }

  async createSplitScrewInsertJoint(input: SplitScrewInsertJointRecipeInput): Promise<SplitScrewInsertJointRecipeResult> {
    validateSplitScrewInsertJoint(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.maleTargetId, input.revision, "Split screw male half");
    requireCurrentSolid(initial, input.femaleTargetId, input.revision, "Split screw female half");

    const count = input.screwEntryCentersMm.length;
    const totalSteps = (count === 1 ? 2 : count + 1) + (count === 1 ? 4 : count * 3 + 1);
    const completedSteps: RecipeStep[] = [];
    const consumedToolIds: number[] = [];
    let currentRevision = initial.revision;
    let current = initial;
    try {
      const holes = count === 1
        ? await this.createThroughHole({
          targetId: input.maleTargetId,
          entryCenterMm: input.screwEntryCentersMm[0]!,
          axis: input.axis,
          holeDiameterMm: input.holeDiameterMm,
          throughDepthMm: input.maleThroughDepthMm,
          overshootMm: input.holeOvershootMm,
          revision: currentRevision,
        })
        : await this.createThroughHolePattern({
          targetId: input.maleTargetId,
          entryCentersMm: input.screwEntryCentersMm,
          axis: input.axis,
          holeDiameterMm: input.holeDiameterMm,
          throughDepthMm: input.maleThroughDepthMm,
          overshootMm: input.holeOvershootMm,
          revision: currentRevision,
        });
      completedSteps.push(...holes.steps);
      consumedToolIds.push(...holes.consumedToolIds);
      currentRevision = holes.afterRevision;
      current = await this.operations.state();
      if (current.revision !== currentRevision) throw new Error(`Plasticity changed after male clearance holes: expected ${currentRevision}, found ${current.revision}`);

      const pockets = count === 1
        ? await this.createHeatSetInsertPocket({
          targetId: input.femaleTargetId,
          entryCenterMm: input.insertEntryCentersMm[0]!,
          axis: input.axis,
          pilotDiameterMm: input.pilotDiameterMm,
          pilotDepthMm: input.pilotDepthMm,
          insertDiameterMm: input.insertDiameterMm,
          insertDepthMm: input.insertDepthMm,
          leadInDiameterMm: input.leadInDiameterMm,
          leadInDepthMm: input.leadInDepthMm,
          materialDepthMm: input.femaleMaterialDepthMm,
          overshootMm: input.insertOvershootMm,
          revision: currentRevision,
        })
        : await this.createHeatSetInsertPocketPattern({
          targetId: input.femaleTargetId,
          entryCentersMm: input.insertEntryCentersMm,
          axis: input.axis,
          pilotDiameterMm: input.pilotDiameterMm,
          pilotDepthMm: input.pilotDepthMm,
          insertDiameterMm: input.insertDiameterMm,
          insertDepthMm: input.insertDepthMm,
          leadInDiameterMm: input.leadInDiameterMm,
          leadInDepthMm: input.leadInDepthMm,
          materialDepthMm: input.femaleMaterialDepthMm,
          overshootMm: input.insertOvershootMm,
          revision: currentRevision,
        });
      completedSteps.push(...pockets.steps);
      consumedToolIds.push(...pockets.consumedToolIds);
      currentRevision = pockets.afterRevision;
      current = await this.operations.state();
      if (current.revision !== currentRevision) throw new Error(`Plasticity changed after insert pockets: expected ${currentRevision}, found ${current.revision}`);

      const resultBodyIds = requirePairedSolidResult(initial, current, input.maleTargetId, input.femaleTargetId, consumedToolIds, "Split screw-and-insert joint");
      return {
        recipe: "split-screw-insert-joint",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        maleTargetId: input.maleTargetId,
        femaleTargetId: input.femaleTargetId,
        fastenerDesignation: input.fastenerDesignation,
        insertPartNumber: input.insertPartNumber,
        insertThreadNominalDiameterMm: input.insertThreadNominalDiameterMm,
        insertThreadPitchMm: input.insertThreadPitchMm,
        insertSourceUrl: input.insertSourceUrl,
        fastenerCount: count,
        screwEngagementMm: input.screwLengthMm - input.maleThroughDepthMm,
        resultBodyIds,
        consumedToolIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof SplitScrewInsertJointRecipeError) throw error;
      if (typeof error === "object" && error !== null) {
        const partial = error as { completedSteps?: unknown; lastConfirmedRevision?: unknown };
        if (Array.isArray(partial.completedSteps)) completedSteps.push(...partial.completedSteps as RecipeStep[]);
        if (typeof partial.lastConfirmedRevision === "string") currentRevision = partial.lastConfirmedRevision;
      }
      throw new SplitScrewInsertJointRecipeError(error, completedSteps, currentRevision, totalSteps);
    }
  }
}

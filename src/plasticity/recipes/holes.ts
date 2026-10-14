import { type Vector3, type CountersinkRecipeInput, type CountersinkRecipeResult, type CountersinkPatternRecipeInput, type CountersinkPatternRecipeResult, type HexNutPocketRecipeInput, type HexNutPocketRecipeResult, type HexNutPocketPatternRecipeInput, type HexNutPocketPatternRecipeResult, type SlottedHoleRecipeInput, type SlottedHoleRecipeResult, type SlottedHolePatternRecipeInput, type SlottedHolePatternRecipeResult, type CounterboreRecipeInput, type CounterborePatternRecipeInput, type ThroughHoleRecipeInput, type ThroughHoleRecipeResult, type ThroughHolePatternRecipeInput, type ThroughHolePatternRecipeResult, type BlindHoleRecipeInput, type BlindHoleRecipeResult, type BlindHolePatternRecipeInput, type BlindHolePatternRecipeResult, type RecipeStep, type CounterboreRecipeResult, type CounterborePatternRecipeResult } from "./types.ts";
import { CountersinkRecipeError, CountersinkPatternRecipeError, HexNutPocketRecipeError, HexNutPocketPatternRecipeError, SlottedHoleRecipeError, SlottedHolePatternRecipeError, CounterboreRecipeError, CounterborePatternRecipeError, ThroughHoleRecipeError, ThroughHolePatternRecipeError, BlindHoleRecipeError, BlindHolePatternRecipeError } from "./errors.ts";
import { validateCountersink, validateCountersinkPattern, validateHexNutPocket, validateHexNutPocketPattern, validateSlottedHole, validateSlottedHolePattern, validateCounterbore, validateCounterborePattern, validateThroughHole, validateThroughHolePattern, validateBlindHole, validateBlindHolePattern, requireCurrentSolid, requireSingleAddedBody, requireRecipeResult, step, rectanglePoints, selectProfileRegion, normalize, scale, subtract, add, cross } from "./helpers.ts";
import { RecipesBase } from "./base.ts";

export abstract class HolesRecipes extends RecipesBase {
  async createCountersink(input: CountersinkRecipeInput): Promise<CountersinkRecipeResult> {
    const countersinkDepthMm = validateCountersink(input);
    if (!this.operations.revolveProfile) throw new Error("Countersink requires native profile revolve support");
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Countersink");

    const axis = normalize(input.axis);
    const radial = normalize(input.radialDirection);
    const profileStart = subtract(input.entryCenterMm, scale(axis, input.overshootMm));
    const majorRadius = input.countersinkMajorDiameterMm / 2;
    const throughRadius = input.throughDiameterMm / 2;
    const transition = add(input.entryCenterMm, scale(axis, countersinkDepthMm));
    const profilePoints: Vector3[] = [
      add(profileStart, scale(radial, throughRadius)),
      add(profileStart, scale(radial, majorRadius)),
      add(input.entryCenterMm, scale(radial, majorRadius)),
      add(transition, scale(radial, throughRadius)),
    ];
    const completedSteps: RecipeStep[] = [];
    let current = initial;
    let profileBodyId = 0;
    let throughCutterBodyId = 0;
    let countersinkCutterBodyId = 0;
    try {
      const beforeThrough = current;
      current = await this.operations.createCylinder(
        profileStart,
        throughRadius,
        input.throughDepthMm + input.overshootMm * 2,
        undefined,
        current.revision,
        axis,
      );
      throughCutterBodyId = requireSingleAddedBody(beforeThrough, current, "countersink through-hole cutter");
      completedSteps.push(step("create-through-cutter", beforeThrough, current, [throughCutterBodyId]));

      const beforeProfile = current;
      current = await this.operations.createPolyline(profilePoints, true, current.revision);
      profileBodyId = requireSingleAddedBody(beforeProfile, current, "countersink profile", "Wire");
      completedSteps.push(step("create-countersink-profile", beforeProfile, current, [profileBodyId]));

      const beforeRevolve = current;
      current = await this.operations.revolveProfile(profileBodyId, input.entryCenterMm, axis, 360, current.revision);
      countersinkCutterBodyId = requireSingleAddedBody(beforeRevolve, current, "revolved countersink cutter");
      completedSteps.push(step("revolve-countersink-cutter", beforeRevolve, current, [countersinkCutterBodyId]));

      const beforeBoolean = current;
      current = await this.operations.boolean([input.targetId], [throughCutterBodyId, countersinkCutterBodyId], "difference", false, current.revision);
      const resultBodyIds = requireRecipeResult(initial, current, input.targetId, [throughCutterBodyId, countersinkCutterBodyId]);
      if (current.bodies.find((body) => body.id === profileBodyId)?.type !== "Wire") {
        throw new Error(`Countersink profile was not preserved as a Wire: ${profileBodyId}`);
      }
      completedSteps.push(step("boolean-difference", beforeBoolean, current, resultBodyIds));

      return {
        recipe: "countersink",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        countersinkDepthMm,
        profileBodyId,
        resultBodyIds,
        consumedToolIds: [throughCutterBodyId, countersinkCutterBodyId],
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof CountersinkRecipeError) throw error;
      throw new CountersinkRecipeError(error, completedSteps, current.revision);
    }
  }

  async createCountersinkPattern(input: CountersinkPatternRecipeInput): Promise<CountersinkPatternRecipeResult> {
    const countersinkDepthMm = validateCountersinkPattern(input);
    if (!this.operations.revolveProfile) throw new Error("Countersink pattern requires native profile revolve support");
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Countersink pattern");

    const axis = normalize(input.axis);
    const radial = normalize(input.radialDirection);
    const majorRadius = input.countersinkMajorDiameterMm / 2;
    const throughRadius = input.throughDiameterMm / 2;
    const completedSteps: RecipeStep[] = [];
    const profileBodyIds: number[] = [];
    const cutterBodyIds: number[] = [];
    const totalSteps = input.entryCentersMm.length * 3 + 1;
    let current = initial;
    try {
      for (const center of input.entryCentersMm) {
        const profileStart = subtract(center, scale(axis, input.overshootMm));
        const transition = add(center, scale(axis, countersinkDepthMm));
        const profilePoints: Vector3[] = [
          add(profileStart, scale(radial, throughRadius)),
          add(profileStart, scale(radial, majorRadius)),
          add(center, scale(radial, majorRadius)),
          add(transition, scale(radial, throughRadius)),
        ];

        const beforeThrough = current;
        current = await this.operations.createCylinder(
          profileStart,
          throughRadius,
          input.throughDepthMm + input.overshootMm * 2,
          undefined,
          current.revision,
          axis,
        );
        const throughCutterBodyId = requireSingleAddedBody(beforeThrough, current, "countersink pattern through-hole cutter");
        cutterBodyIds.push(throughCutterBodyId);
        completedSteps.push(step("create-through-cutter", beforeThrough, current, [throughCutterBodyId]));

        const beforeProfile = current;
        current = await this.operations.createPolyline(profilePoints, true, current.revision);
        const profileBodyId = requireSingleAddedBody(beforeProfile, current, "countersink pattern profile", "Wire");
        profileBodyIds.push(profileBodyId);
        completedSteps.push(step("create-countersink-profile", beforeProfile, current, [profileBodyId]));

        const beforeRevolve = current;
        current = await this.operations.revolveProfile(profileBodyId, center, axis, 360, current.revision);
        const countersinkCutterBodyId = requireSingleAddedBody(beforeRevolve, current, "revolved countersink pattern cutter");
        cutterBodyIds.push(countersinkCutterBodyId);
        completedSteps.push(step("revolve-countersink-cutter", beforeRevolve, current, [countersinkCutterBodyId]));
      }

      const beforeBoolean = current;
      current = await this.operations.boolean([input.targetId], cutterBodyIds, "difference", false, current.revision);
      const resultBodyIds = requireRecipeResult(initial, current, input.targetId, cutterBodyIds);
      for (const profileBodyId of profileBodyIds) {
        if (current.bodies.find((body) => body.id === profileBodyId)?.type !== "Wire") {
          throw new Error(`Countersink pattern profile was not preserved as a Wire: ${profileBodyId}`);
        }
      }
      completedSteps.push(step("boolean-difference", beforeBoolean, current, resultBodyIds));

      return {
        recipe: "countersink-pattern",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        holeCount: input.entryCentersMm.length,
        countersinkDepthMm,
        profileBodyIds,
        resultBodyIds,
        consumedToolIds: cutterBodyIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof CountersinkPatternRecipeError) throw error;
      throw new CountersinkPatternRecipeError(error, completedSteps, current.revision, totalSteps);
    }
  }

  async createHexNutPocket(input: HexNutPocketRecipeInput): Promise<HexNutPocketRecipeResult> {
    validateHexNutPocket(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Hex nut pocket");

    const axis = normalize(input.axis);
    const flatNormal = normalize(input.flatNormalDirection);
    const around = normalize(cross(axis, flatNormal));
    const profileCenter = subtract(input.entryCenterMm, scale(axis, input.overshootMm));
    const apothem = input.acrossFlatsMm / 2;
    const radius = input.acrossFlatsMm / Math.sqrt(3);
    const halfRadius = radius / 2;
    const profilePoints: Vector3[] = [
      add(add(profileCenter, scale(flatNormal, apothem)), scale(around, halfRadius)),
      add(profileCenter, scale(around, radius)),
      add(subtract(profileCenter, scale(flatNormal, apothem)), scale(around, halfRadius)),
      subtract(subtract(profileCenter, scale(flatNormal, apothem)), scale(around, halfRadius)),
      subtract(profileCenter, scale(around, radius)),
      subtract(add(profileCenter, scale(flatNormal, apothem)), scale(around, halfRadius)),
    ];
    const completedSteps: RecipeStep[] = [];
    let current = initial;
    let profileBodyId = 0;
    let cutterBodyId = 0;
    try {
      const beforeProfile = current;
      current = await this.operations.createPolyline(profilePoints, true, current.revision);
      profileBodyId = requireSingleAddedBody(beforeProfile, current, "hex nut pocket profile", "Wire");
      const previousRegionIds = new Set(beforeProfile.regions.map((region) => region.id));
      const regions = current.regions.filter((region) => !previousRegionIds.has(region.id));
      if (regions.length !== 1) throw new Error(`Expected one newly created closed Region for hex nut pocket profile ${profileBodyId}, found ${regions.length}`);
      completedSteps.push(step("create-hex-pocket-profile", beforeProfile, current, [profileBodyId]));

      const beforeExtrude = current;
      current = await this.operations.extrudeRegions([regions[0]!.id], input.pocketDepthMm + input.overshootMm, current.revision);
      cutterBodyId = requireSingleAddedBody(beforeExtrude, current, "extruded hex nut pocket cutter");
      completedSteps.push(step("extrude-hex-pocket-cutter", beforeExtrude, current, [cutterBodyId]));

      const beforeBoolean = current;
      current = await this.operations.boolean([input.targetId], [cutterBodyId], "difference", false, current.revision);
      const resultBodyIds = requireRecipeResult(initial, current, input.targetId, [cutterBodyId]);
      if (current.bodies.find((body) => body.id === profileBodyId)?.type !== "Wire") {
        throw new Error(`Hex nut pocket profile was not preserved as a Wire: ${profileBodyId}`);
      }
      completedSteps.push(step("boolean-difference", beforeBoolean, current, resultBodyIds));

      return {
        recipe: "hex-nut-pocket",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        profileBodyId,
        resultBodyIds,
        consumedToolIds: [cutterBodyId],
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof HexNutPocketRecipeError) throw error;
      throw new HexNutPocketRecipeError(error, completedSteps, current.revision);
    }
  }

  async createHexNutPocketPattern(input: HexNutPocketPatternRecipeInput): Promise<HexNutPocketPatternRecipeResult> {
    validateHexNutPocketPattern(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Hex nut pocket pattern");

    const axis = normalize(input.axis);
    const flatNormal = normalize(input.flatNormalDirection);
    const around = normalize(cross(axis, flatNormal));
    const apothem = input.acrossFlatsMm / 2;
    const radius = input.acrossFlatsMm / Math.sqrt(3);
    const halfRadius = radius / 2;
    const completedSteps: RecipeStep[] = [];
    const profileBodyIds: number[] = [];
    const cutterBodyIds: number[] = [];
    const totalSteps = input.entryCentersMm.length * 2 + 1;
    let current = initial;
    try {
      for (const center of input.entryCentersMm) {
        const profileCenter = subtract(center, scale(axis, input.overshootMm));
        const profilePoints: Vector3[] = [
          add(add(profileCenter, scale(flatNormal, apothem)), scale(around, halfRadius)),
          add(profileCenter, scale(around, radius)),
          add(subtract(profileCenter, scale(flatNormal, apothem)), scale(around, halfRadius)),
          subtract(subtract(profileCenter, scale(flatNormal, apothem)), scale(around, halfRadius)),
          subtract(profileCenter, scale(around, radius)),
          subtract(add(profileCenter, scale(flatNormal, apothem)), scale(around, halfRadius)),
        ];

        const beforeProfile = current;
        current = await this.operations.createPolyline(profilePoints, true, current.revision);
        const profileBodyId = requireSingleAddedBody(beforeProfile, current, "hex nut pocket pattern profile", "Wire");
        profileBodyIds.push(profileBodyId);
        const previousRegionIds = new Set(beforeProfile.regions.map((region) => region.id));
        const regions = current.regions.filter((region) => !previousRegionIds.has(region.id));
        if (regions.length !== 1) throw new Error(`Expected one newly created closed Region for hex nut pocket pattern profile ${profileBodyId}, found ${regions.length}`);
        completedSteps.push(step("create-hex-pocket-profile", beforeProfile, current, [profileBodyId]));

        const beforeExtrude = current;
        current = await this.operations.extrudeRegions([regions[0]!.id], input.pocketDepthMm + input.overshootMm, current.revision);
        const cutterBodyId = requireSingleAddedBody(beforeExtrude, current, "extruded hex nut pocket pattern cutter");
        cutterBodyIds.push(cutterBodyId);
        completedSteps.push(step("extrude-hex-pocket-cutter", beforeExtrude, current, [cutterBodyId]));
      }

      const beforeBoolean = current;
      current = await this.operations.boolean([input.targetId], cutterBodyIds, "difference", false, current.revision);
      const resultBodyIds = requireRecipeResult(initial, current, input.targetId, cutterBodyIds);
      for (const profileBodyId of profileBodyIds) {
        if (current.bodies.find((body) => body.id === profileBodyId)?.type !== "Wire") {
          throw new Error(`Hex nut pocket pattern profile was not preserved as a Wire: ${profileBodyId}`);
        }
      }
      completedSteps.push(step("boolean-difference", beforeBoolean, current, resultBodyIds));

      return {
        recipe: "hex-nut-pocket-pattern",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        pocketCount: input.entryCentersMm.length,
        profileBodyIds,
        resultBodyIds,
        consumedToolIds: cutterBodyIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof HexNutPocketPatternRecipeError) throw error;
      throw new HexNutPocketPatternRecipeError(error, completedSteps, current.revision, totalSteps);
    }
  }

  async createSlottedHole(input: SlottedHoleRecipeInput): Promise<SlottedHoleRecipeResult> {
    validateSlottedHole(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Slotted hole");

    const axis = normalize(input.axis);
    const slotDirection = normalize(input.slotDirection);
    const widthDirection = normalize(cross(axis, slotDirection));
    const centerDistanceMm = input.overallLengthMm - input.widthMm;
    const profileCenter = subtract(input.entryCenterMm, scale(axis, input.overshootMm));
    const profilePoints = rectanglePoints(profileCenter, slotDirection, widthDirection, centerDistanceMm, input.widthMm);
    const cutterDepthMm = input.throughDepthMm + input.overshootMm * 2;
    const completedSteps: RecipeStep[] = [];
    const consumedToolIds: number[] = [];
    let current = initial;
    let profileBodyId = 0;
    try {
      const beforeProfile = current;
      current = await this.operations.createPolyline(profilePoints, true, current.revision);
      profileBodyId = requireSingleAddedBody(beforeProfile, current, "slotted hole center profile", "Wire");
      completedSteps.push(step("create-slot-profile", beforeProfile, current, [profileBodyId]));
      const region = selectProfileRegion(current, profileBodyId, profilePoints, "slotted hole");

      const beforeExtrude = current;
      current = await this.operations.extrudeRegions([region.id], cutterDepthMm, current.revision);
      const centerCutterId = requireSingleAddedBody(beforeExtrude, current, "slotted hole center cutter");
      consumedToolIds.push(centerCutterId);
      completedSteps.push(step("extrude-slot-center-cutter", beforeExtrude, current, [centerCutterId]));

      for (const sign of [-1, 1] as const) {
        const beforeEnd = current;
        const endCenter = add(profileCenter, scale(slotDirection, sign * centerDistanceMm / 2));
        current = await this.operations.createCylinder(
          endCenter,
          input.widthMm / 2,
          cutterDepthMm,
          undefined,
          current.revision,
          axis,
        );
        const endCutterId = requireSingleAddedBody(beforeEnd, current, "slotted hole end cutter");
        consumedToolIds.push(endCutterId);
        completedSteps.push(step("create-slot-end-cutter", beforeEnd, current, [endCutterId]));
      }

      const beforeBoolean = current;
      current = await this.operations.boolean([input.targetId], consumedToolIds, "difference", false, current.revision);
      const resultBodyIds = requireRecipeResult(initial, current, input.targetId, consumedToolIds);
      if (current.bodies.find((body) => body.id === profileBodyId)?.type !== "Wire") {
        throw new Error(`Slotted hole profile was not preserved as a Wire: ${profileBodyId}`);
      }
      completedSteps.push(step("boolean-difference", beforeBoolean, current, resultBodyIds));

      return {
        recipe: "slotted-hole",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        centerDistanceMm,
        profileBodyId,
        resultBodyIds,
        consumedToolIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof SlottedHoleRecipeError) throw error;
      throw new SlottedHoleRecipeError(error, completedSteps, current.revision);
    }
  }

  async createSlottedHolePattern(input: SlottedHolePatternRecipeInput): Promise<SlottedHolePatternRecipeResult> {
    validateSlottedHolePattern(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Slotted hole pattern");

    const axis = normalize(input.axis);
    const slotDirection = normalize(input.slotDirection);
    const widthDirection = normalize(cross(axis, slotDirection));
    const centerDistanceMm = input.overallLengthMm - input.widthMm;
    const cutterDepthMm = input.throughDepthMm + input.overshootMm * 2;
    const completedSteps: RecipeStep[] = [];
    const profileBodyIds: number[] = [];
    const consumedToolIds: number[] = [];
    const totalSteps = input.entryCentersMm.length * 4 + 1;
    let current = initial;
    try {
      for (const entryCenter of input.entryCentersMm) {
        const profileCenter = subtract(entryCenter, scale(axis, input.overshootMm));
        const profilePoints = rectanglePoints(profileCenter, slotDirection, widthDirection, centerDistanceMm, input.widthMm);

        const beforeProfile = current;
        current = await this.operations.createPolyline(profilePoints, true, current.revision);
        const profileBodyId = requireSingleAddedBody(beforeProfile, current, "slotted hole pattern center profile", "Wire");
        profileBodyIds.push(profileBodyId);
        completedSteps.push(step("create-slot-profile", beforeProfile, current, [profileBodyId]));
        const region = selectProfileRegion(current, profileBodyId, profilePoints, "slotted hole pattern");

        const beforeExtrude = current;
        current = await this.operations.extrudeRegions([region.id], cutterDepthMm, current.revision);
        const centerCutterId = requireSingleAddedBody(beforeExtrude, current, "slotted hole pattern center cutter");
        consumedToolIds.push(centerCutterId);
        completedSteps.push(step("extrude-slot-center-cutter", beforeExtrude, current, [centerCutterId]));

        for (const sign of [-1, 1] as const) {
          const beforeEnd = current;
          const endCenter = add(profileCenter, scale(slotDirection, sign * centerDistanceMm / 2));
          current = await this.operations.createCylinder(
            endCenter,
            input.widthMm / 2,
            cutterDepthMm,
            undefined,
            current.revision,
            axis,
          );
          const endCutterId = requireSingleAddedBody(beforeEnd, current, "slotted hole pattern end cutter");
          consumedToolIds.push(endCutterId);
          completedSteps.push(step("create-slot-end-cutter", beforeEnd, current, [endCutterId]));
        }
      }

      const beforeBoolean = current;
      current = await this.operations.boolean([input.targetId], consumedToolIds, "difference", false, current.revision);
      const resultBodyIds = requireRecipeResult(initial, current, input.targetId, consumedToolIds);
      for (const profileBodyId of profileBodyIds) {
        if (current.bodies.find((body) => body.id === profileBodyId)?.type !== "Wire") {
          throw new Error(`Slotted hole pattern profile was not preserved as a Wire: ${profileBodyId}`);
        }
      }
      completedSteps.push(step("boolean-difference", beforeBoolean, current, resultBodyIds));

      return {
        recipe: "slotted-hole-pattern",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        slotCount: input.entryCentersMm.length,
        centerDistanceMm,
        profileBodyIds,
        resultBodyIds,
        consumedToolIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof SlottedHolePatternRecipeError) throw error;
      throw new SlottedHolePatternRecipeError(error, completedSteps, current.revision, totalSteps);
    }
  }

  async createCounterbore(input: CounterboreRecipeInput): Promise<CounterboreRecipeResult> {
    validateCounterbore(input);
    const initial = await this.operations.state();
    if (initial.revision !== input.revision) {
      throw new Error(`Stale reference: expected revision ${input.revision}, current revision is ${initial.revision}`);
    }
    const target = initial.bodies.find((body) => body.id === input.targetId);
    if (!target) throw new Error(`Unknown target body ID: ${input.targetId}`);
    if (target.type !== "Solid") throw new Error(`Counterbore target must be a Solid: ${input.targetId}`);

    const axis = normalize(input.axis);
    const cutterStart = subtract(input.entryCenterMm, scale(axis, input.overshootMm));
    const completedSteps: RecipeStep[] = [];
    let current = initial;
    try {
      const through = await this.operations.createCylinder(
        cutterStart,
        input.throughDiameterMm / 2,
        input.throughDepthMm + input.overshootMm * 2,
        undefined,
        current.revision,
        axis,
      );
      const throughId = requireSingleAddedBody(current, through, "through-hole cutter");
      completedSteps.push(step("create-through-cutter", current, through, [throughId]));
      current = through;

      const counterbore = await this.operations.createCylinder(
        cutterStart,
        input.counterboreDiameterMm / 2,
        input.counterboreDepthMm + input.overshootMm,
        undefined,
        current.revision,
        axis,
      );
      const counterboreId = requireSingleAddedBody(current, counterbore, "counterbore cutter");
      completedSteps.push(step("create-counterbore-cutter", current, counterbore, [counterboreId]));
      current = counterbore;

      const result = await this.operations.boolean(
        [input.targetId],
        [throughId, counterboreId],
        "difference",
        false,
        current.revision,
      );
      const resultBodyIds = requireRecipeResult(initial, result, input.targetId, [throughId, counterboreId]);
      completedSteps.push(step("boolean-difference", current, result, resultBodyIds));
      current = result;

      return {
        recipe: "counterbore",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        resultBodyIds,
        consumedToolIds: [throughId, counterboreId],
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof CounterboreRecipeError) throw error;
      throw new CounterboreRecipeError(error, completedSteps, current.revision);
    }
  }

  async createCounterborePattern(input: CounterborePatternRecipeInput): Promise<CounterborePatternRecipeResult> {
    validateCounterborePattern(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Counterbore pattern");

    const axis = normalize(input.axis);
    const completedSteps: RecipeStep[] = [];
    const cutterIds: number[] = [];
    const totalSteps = input.entryCentersMm.length * 2 + 1;
    let current = initial;
    try {
      for (const center of input.entryCentersMm) {
        const cutterStart = subtract(center, scale(axis, input.overshootMm));
        const through = await this.operations.createCylinder(
          cutterStart,
          input.throughDiameterMm / 2,
          input.throughDepthMm + input.overshootMm * 2,
          undefined,
          current.revision,
          axis,
        );
        const throughId = requireSingleAddedBody(current, through, "counterbore pattern through cutter");
        cutterIds.push(throughId);
        completedSteps.push(step("create-through-cutter", current, through, [throughId]));
        current = through;

        const counterbore = await this.operations.createCylinder(
          cutterStart,
          input.counterboreDiameterMm / 2,
          input.counterboreDepthMm + input.overshootMm,
          undefined,
          current.revision,
          axis,
        );
        const counterboreId = requireSingleAddedBody(current, counterbore, "counterbore pattern recess cutter");
        cutterIds.push(counterboreId);
        completedSteps.push(step("create-counterbore-cutter", current, counterbore, [counterboreId]));
        current = counterbore;
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
        recipe: "counterbore-pattern",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        holeCount: input.entryCentersMm.length,
        resultBodyIds,
        consumedToolIds: cutterIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof CounterborePatternRecipeError) throw error;
      throw new CounterborePatternRecipeError(error, completedSteps, current.revision, totalSteps);
    }
  }

  async createThroughHole(input: ThroughHoleRecipeInput): Promise<ThroughHoleRecipeResult> {
    validateThroughHole(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Through-hole");

    const axis = normalize(input.axis);
    const cutterStart = subtract(input.entryCenterMm, scale(axis, input.overshootMm));
    const completedSteps: RecipeStep[] = [];
    let current = initial;
    try {
      const through = await this.operations.createCylinder(
        cutterStart,
        input.holeDiameterMm / 2,
        input.throughDepthMm + input.overshootMm * 2,
        undefined,
        current.revision,
        axis,
      );
      const throughId = requireSingleAddedBody(current, through, "through-hole cutter");
      completedSteps.push(step("create-through-cutter", current, through, [throughId]));
      current = through;

      const result = await this.operations.boolean(
        [input.targetId],
        [throughId],
        "difference",
        false,
        current.revision,
      );
      const resultBodyIds = requireRecipeResult(initial, result, input.targetId, [throughId]);
      completedSteps.push(step("boolean-difference", current, result, resultBodyIds));
      current = result;

      return {
        recipe: "through-hole",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        resultBodyIds,
        consumedToolIds: [throughId],
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof ThroughHoleRecipeError) throw error;
      throw new ThroughHoleRecipeError(error, completedSteps, current.revision);
    }
  }

  async createThroughHolePattern(input: ThroughHolePatternRecipeInput): Promise<ThroughHolePatternRecipeResult> {
    validateThroughHolePattern(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Through-hole pattern");

    const axis = normalize(input.axis);
    const completedSteps: RecipeStep[] = [];
    const cutterIds: number[] = [];
    const totalSteps = input.entryCentersMm.length + 1;
    let current = initial;
    try {
      for (const center of input.entryCentersMm) {
        const cutterStart = subtract(center, scale(axis, input.overshootMm));
        const cutter = await this.operations.createCylinder(
          cutterStart,
          input.holeDiameterMm / 2,
          input.throughDepthMm + input.overshootMm * 2,
          undefined,
          current.revision,
          axis,
        );
        const cutterId = requireSingleAddedBody(current, cutter, "through-hole pattern cutter");
        cutterIds.push(cutterId);
        completedSteps.push(step("create-through-cutter", current, cutter, [cutterId]));
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
        recipe: "through-hole-pattern",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        holeCount: input.entryCentersMm.length,
        resultBodyIds,
        consumedToolIds: cutterIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof ThroughHolePatternRecipeError) throw error;
      throw new ThroughHolePatternRecipeError(error, completedSteps, current.revision, totalSteps);
    }
  }

  async createBlindHole(input: BlindHoleRecipeInput): Promise<BlindHoleRecipeResult> {
    validateBlindHole(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Blind-hole");

    const axis = normalize(input.axis);
    const cutterStart = subtract(input.entryCenterMm, scale(axis, input.overshootMm));
    const completedSteps: RecipeStep[] = [];
    let current = initial;
    try {
      const cutter = await this.operations.createCylinder(
        cutterStart,
        input.holeDiameterMm / 2,
        input.holeDepthMm + input.overshootMm,
        undefined,
        current.revision,
        axis,
      );
      const cutterId = requireSingleAddedBody(current, cutter, "blind-hole cutter");
      completedSteps.push(step("create-blind-cutter", current, cutter, [cutterId]));
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
        recipe: "blind-hole",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        resultBodyIds,
        consumedToolIds: [cutterId],
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof BlindHoleRecipeError) throw error;
      throw new BlindHoleRecipeError(error, completedSteps, current.revision);
    }
  }

  async createBlindHolePattern(input: BlindHolePatternRecipeInput): Promise<BlindHolePatternRecipeResult> {
    validateBlindHolePattern(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Blind-hole pattern");

    const axis = normalize(input.axis);
    const completedSteps: RecipeStep[] = [];
    const cutterIds: number[] = [];
    const totalSteps = input.entryCentersMm.length + 1;
    let current = initial;
    try {
      for (const center of input.entryCentersMm) {
        const cutterStart = subtract(center, scale(axis, input.overshootMm));
        const cutter = await this.operations.createCylinder(
          cutterStart,
          input.holeDiameterMm / 2,
          input.holeDepthMm + input.overshootMm,
          undefined,
          current.revision,
          axis,
        );
        const cutterId = requireSingleAddedBody(current, cutter, "blind-hole pattern cutter");
        cutterIds.push(cutterId);
        completedSteps.push(step("create-blind-cutter", current, cutter, [cutterId]));
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
        recipe: "blind-hole-pattern",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        holeCount: input.entryCentersMm.length,
        resultBodyIds,
        consumedToolIds: cutterIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof BlindHolePatternRecipeError) throw error;
      throw new BlindHolePatternRecipeError(error, completedSteps, current.revision, totalSteps);
    }
  }
}

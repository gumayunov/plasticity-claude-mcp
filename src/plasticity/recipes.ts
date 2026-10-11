import { mutationOutcomeIsUncertain, type RuntimeState } from "./runtime.ts";
import type { PlasticityOperations } from "./operations.ts";
import { type Vector3, type RecipeOperations, type CountersinkRecipeInput, type CountersinkRecipeResult, type CountersinkPatternRecipeInput, type CountersinkPatternRecipeResult, type HexNutPocketRecipeInput, type HexNutPocketRecipeResult, type HexNutPocketPatternRecipeInput, type HexNutPocketPatternRecipeResult, type SlottedHoleRecipeInput, type SlottedHoleRecipeResult, type SlottedHolePatternRecipeInput, type SlottedHolePatternRecipeResult, type CounterboreRecipeInput, type CounterborePatternRecipeInput, type ThroughHoleRecipeInput, type ThroughHoleRecipeResult, type ThroughHolePatternRecipeInput, type ThroughHolePatternRecipeResult, type BlindHoleRecipeInput, type BlindHoleRecipeResult, type BlindHolePatternRecipeInput, type BlindHolePatternRecipeResult, type RecipeStep, type CounterboreRecipeResult, type CounterborePatternRecipeResult, type HeatSetInsertPocketRecipeInput, type HeatSetInsertPocketRecipeResult, type HeatSetInsertPocketPatternRecipeInput, type HeatSetInsertPocketPatternRecipeResult, type ScrewBossRecipeInput, type ScrewBossRecipeResult, type ScrewBossPatternRecipeInput, type ScrewBossPatternRecipeResult, type RibRecipeInput, type RibRecipeResult, type RoundVentArrayRecipeInput, type RoundVentArrayRecipeResult, type CantileverSnapFitRecipeInput, type CantileverSnapFitRecipeResult, type HingeBarrelRecipeInput, type HingeBarrelRecipeResult, type CableChannelRecipeInput, type CableChannelRecipeResult, type ConnectorOpeningRecipeInput, type ConnectorOpeningRecipeResult, type MatingEnclosureJointRecipeInput, type MatingEnclosureJointRecipeResult, type LocatingPinPairRecipeInput, type LocatingPinPairRecipeResult, type LocatingPinPairPatternRecipeInput, type LocatingPinPairPatternRecipeResult, type SplitScrewInsertJointRecipeInput, type SplitScrewInsertJointRecipeResult, type TongueGrooveJointRecipeInput, type TongueGrooveJointRecipeResult, type DovetailJointRecipeInput, type DovetailJointRecipeResult } from "./recipes/types.ts";
export { type RecipeOperations, type CountersinkRecipeInput, type CountersinkRecipeResult, type CountersinkPatternRecipeInput, type CountersinkPatternRecipeResult, type HexNutPocketRecipeInput, type HexNutPocketRecipeResult, type HexNutPocketPatternRecipeInput, type HexNutPocketPatternRecipeResult, type SlottedHoleRecipeInput, type SlottedHoleRecipeResult, type SlottedHolePatternRecipeInput, type SlottedHolePatternRecipeResult, type CounterboreRecipeInput, type CounterborePatternRecipeInput, type ThroughHoleRecipeInput, type ThroughHoleRecipeResult, type ThroughHolePatternRecipeInput, type ThroughHolePatternRecipeResult, type BlindHoleRecipeInput, type BlindHoleRecipeResult, type BlindHolePatternRecipeInput, type BlindHolePatternRecipeResult, type RecipeStep, type CounterboreRecipeResult, type CounterborePatternRecipeResult, type HeatSetInsertPocketRecipeInput, type HeatSetInsertPocketRecipeResult, type HeatSetInsertPocketPatternRecipeInput, type HeatSetInsertPocketPatternRecipeResult, type ScrewBossRecipeInput, type ScrewBossRecipeResult, type ScrewBossPatternRecipeInput, type ScrewBossPatternRecipeResult, type RibRecipeInput, type RibRecipeResult, type RoundVentArrayRecipeInput, type RoundVentArrayRecipeResult, type CantileverSnapFitRecipeInput, type CantileverSnapFitRecipeResult, type HingeBarrelRecipeInput, type HingeBarrelRecipeResult, type CableChannelRecipeInput, type CableChannelRecipeResult, type ConnectorOpeningRecipeInput, type ConnectorOpeningRecipeResult, type MatingEnclosureJointRecipeInput, type MatingEnclosureJointRecipeResult, type LocatingPinPairRecipeInput, type LocatingPinPairRecipeResult, type LocatingPinPairPatternRecipeInput, type LocatingPinPairPatternRecipeResult, type SplitScrewInsertJointRecipeInput, type SplitScrewInsertJointRecipeResult, type TongueGrooveJointRecipeInput, type TongueGrooveJointRecipeResult, type DovetailJointRecipeInput, type DovetailJointRecipeResult } from "./recipes/types.ts";
import { CountersinkRecipeError, CountersinkPatternRecipeError, HexNutPocketRecipeError, HexNutPocketPatternRecipeError, SlottedHoleRecipeError, SlottedHolePatternRecipeError, CounterboreRecipeError, CounterborePatternRecipeError, ThroughHoleRecipeError, ThroughHolePatternRecipeError, BlindHoleRecipeError, BlindHolePatternRecipeError, HeatSetInsertPocketRecipeError, HeatSetInsertPocketPatternRecipeError, ScrewBossRecipeError, ScrewBossPatternRecipeError, RibRecipeError, RoundVentArrayRecipeError, CantileverSnapFitRecipeError, HingeBarrelRecipeError, CableChannelRecipeError, ConnectorOpeningRecipeError, MatingEnclosureJointRecipeError, LocatingPinPairRecipeError, LocatingPinPairPatternRecipeError, SplitScrewInsertJointRecipeError, TongueGrooveJointRecipeError, DovetailJointRecipeError } from "./recipes/errors.ts";
export { CountersinkRecipeError, CountersinkPatternRecipeError, HexNutPocketRecipeError, HexNutPocketPatternRecipeError, SlottedHoleRecipeError, SlottedHolePatternRecipeError, CounterboreRecipeError, CounterborePatternRecipeError, ThroughHoleRecipeError, ThroughHolePatternRecipeError, BlindHoleRecipeError, BlindHolePatternRecipeError, HeatSetInsertPocketRecipeError, HeatSetInsertPocketPatternRecipeError, ScrewBossRecipeError, ScrewBossPatternRecipeError, RibRecipeError, RoundVentArrayRecipeError, CantileverSnapFitRecipeError, HingeBarrelRecipeError, CableChannelRecipeError, ConnectorOpeningRecipeError, MatingEnclosureJointRecipeError, LocatingPinPairRecipeError, LocatingPinPairPatternRecipeError, SplitScrewInsertJointRecipeError, TongueGrooveJointRecipeError, DovetailJointRecipeError } from "./recipes/errors.ts";
import { validateCountersink, validateCountersinkPattern, validateHexNutPocket, validateHexNutPocketPattern, validateSlottedHole, validateSlottedHolePattern, validateCounterbore, validateCounterborePattern, validateThroughHole, validateThroughHolePattern, validateBlindHole, validateBlindHolePattern, validateHeatSetInsertPocket, validateHeatSetInsertPocketPattern, validateScrewBoss, validateScrewBossPattern, validateRib, validateRoundVentArray, validateCantileverSnapFit, validateHingeBarrel, validateCableChannel, validateConnectorOpening, validateMatingEnclosureJoint, validateLocatingPinPair, validateLocatingPinPairPattern, validateSplitScrewInsertJoint, validateTongueGrooveJoint, validateDovetailJoint, requireCurrentSolid, requireSingleAddedBody, addedBodyIds, requireRecipeResult, requireSolid, requireAbsent, requirePairedSolidResult, step, rectanglePoints, dovetailPoints, selectProfileRegion, normalize, scale, subtract, add, dot, cross } from "./recipes/helpers.ts";


export class PlasticityRecipes {
  private readonly operations: RecipeOperations;

  constructor(operations: RecipeOperations) {
    this.operations = operations;
  }

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

  async createRib(input: RibRecipeInput): Promise<RibRecipeResult> {
    validateRib(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Rib");

    const completedSteps: RecipeStep[] = [];
    let current = initial;
    let profileBodyId = 0;
    let ribBodyId = 0;
    try {
      const beforeProfile = current;
      current = await this.operations.createPolyline(input.profilePointsMm, true, current.revision);
      profileBodyId = requireSingleAddedBody(beforeProfile, current, "rib profile", "Wire");
      const matchingRegions = current.regions.filter((region) => region.sketchWireIds.includes(profileBodyId));
      if (matchingRegions.length !== 1) {
        throw new Error(`Expected one closed Region for rib profile ${profileBodyId}, found ${matchingRegions.length}`);
      }
      completedSteps.push(step("create-rib-profile", beforeProfile, current, [profileBodyId]));

      const beforeExtrude = current;
      current = await this.operations.extrudeRegions([matchingRegions[0]!.id], input.thicknessMm, current.revision);
      ribBodyId = requireSingleAddedBody(beforeExtrude, current, "extruded rib");
      completedSteps.push(step("extrude-rib", beforeExtrude, current, [ribBodyId]));

      const beforeUnion = current;
      current = await this.operations.boolean([input.targetId], [ribBodyId], "union", false, current.revision);
      const resultBodyIds = requireRecipeResult(initial, current, input.targetId, [ribBodyId]);
      completedSteps.push(step("union-rib-to-target", beforeUnion, current, resultBodyIds));

      return {
        recipe: "rib",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        profileBodyId,
        resultBodyIds,
        consumedToolIds: [ribBodyId],
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof RibRecipeError) throw error;
      throw new RibRecipeError(error, completedSteps, current.revision);
    }
  }

  async createRoundVentArray(input: RoundVentArrayRecipeInput): Promise<RoundVentArrayRecipeResult> {
    validateRoundVentArray(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Round vent array");

    const axis = normalize(input.axis);
    const direction1 = normalize(input.direction1);
    const direction2 = normalize(input.direction2);
    const cutterStart = subtract(input.firstCenterMm, scale(axis, input.overshootMm));
    const holeCount = input.count1 * input.count2;
    const totalSteps = holeCount > 1 ? 3 : 2;
    const completedSteps: RecipeStep[] = [];
    let current = initial;
    try {
      const beforeCutter = current;
      current = await this.operations.createCylinder(
        cutterStart,
        input.holeDiameterMm / 2,
        input.throughDepthMm + input.overshootMm * 2,
        undefined,
        current.revision,
        axis,
      );
      const seedId = requireSingleAddedBody(beforeCutter, current, "vent cutter");
      completedSteps.push(step("create-vent-cutter", beforeCutter, current, [seedId]));

      if (holeCount > 1) {
        const beforePattern = current;
        current = await this.operations.rectangularPattern(
          [seedId],
          direction1,
          input.count1,
          input.spacing1Mm,
          direction2,
          input.count2,
          input.spacing2Mm,
          current.revision,
        );
        const patternedIds = addedBodyIds(initial, current, "Solid");
        if (patternedIds.length !== holeCount) {
          throw new Error(`Expected ${holeCount} patterned vent cutters, found ${patternedIds.length}`);
        }
        completedSteps.push(step("pattern-vent-cutters", beforePattern, current, patternedIds));
      }

      const cutterIds = addedBodyIds(initial, current, "Solid");
      if (cutterIds.length !== holeCount) {
        throw new Error(`Expected ${holeCount} vent cutters before Boolean, found ${cutterIds.length}`);
      }
      const beforeBoolean = current;
      current = await this.operations.boolean([input.targetId], cutterIds, "difference", false, current.revision);
      const resultBodyIds = requireRecipeResult(initial, current, input.targetId, cutterIds);
      completedSteps.push(step("boolean-difference", beforeBoolean, current, resultBodyIds));

      return {
        recipe: "round-vent-array",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        resultBodyIds,
        consumedToolIds: cutterIds,
        holeCount,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof RoundVentArrayRecipeError) throw error;
      throw new RoundVentArrayRecipeError(error, completedSteps, current.revision, totalSteps);
    }
  }

  async createCantileverSnapFit(input: CantileverSnapFitRecipeInput): Promise<CantileverSnapFitRecipeResult> {
    validateCantileverSnapFit(input);
    const beam = normalize(input.beamDirection);
    const thickness = normalize(input.thicknessDirection);
    const widthDirection = normalize(cross(beam, thickness));
    const profilePlaneOffset = scale(widthDirection, -input.widthMm / 2);
    const point = (along: number, above: number): Vector3 => add(
      add(input.baseCenterMm, scale(beam, along)),
      add(scale(thickness, above), profilePlaneOffset),
    );
    const profilePointsMm: Vector3[] = [
      point(-input.baseOverlapMm, 0),
      point(input.lengthMm, 0),
      point(input.lengthMm, input.thicknessMm + input.hookHeightMm),
      point(input.lengthMm - input.hookLengthMm, input.thicknessMm + input.hookHeightMm),
      point(input.lengthMm - input.hookLengthMm, input.thicknessMm),
      point(-input.baseOverlapMm, input.thicknessMm),
    ];
    try {
      const rib = await this.createRib({
        targetId: input.targetId,
        profilePointsMm,
        thicknessMm: input.widthMm,
        revision: input.revision,
      });
      const operationMap: Partial<Record<RecipeStep["operation"], RecipeStep["operation"]>> = {
        "create-rib-profile": "create-snap-profile",
        "extrude-rib": "extrude-snap-body",
        "union-rib-to-target": "union-snap-to-target",
      };
      const steps = rib.steps.map((entry) => ({ ...entry, operation: operationMap[entry.operation] ?? entry.operation }));
      return {
        recipe: "cantilever-snap-fit",
        status: "completed",
        documentToken: rib.documentToken,
        beforeRevision: rib.beforeRevision,
        afterRevision: rib.afterRevision,
        targetId: rib.targetId,
        profileBodyId: rib.profileBodyId,
        resultBodyIds: rib.resultBodyIds,
        consumedToolIds: rib.consumedToolIds,
        undoSteps: rib.undoSteps,
        steps,
      };
    } catch (error) {
      if (error instanceof CantileverSnapFitRecipeError) throw error;
      if (error instanceof RibRecipeError) {
        const operationMap: Partial<Record<RecipeStep["operation"], RecipeStep["operation"]>> = {
          "create-rib-profile": "create-snap-profile",
          "extrude-rib": "extrude-snap-body",
          "union-rib-to-target": "union-snap-to-target",
        };
        const steps = error.completedSteps.map((entry) => ({ ...entry, operation: operationMap[entry.operation] ?? entry.operation }));
        throw new CantileverSnapFitRecipeError(error, steps, error.lastConfirmedRevision);
      }
      throw new CantileverSnapFitRecipeError(error, [], input.revision);
    }
  }

  async createHingeBarrel(input: HingeBarrelRecipeInput): Promise<HingeBarrelRecipeResult> {
    validateHingeBarrel(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Hinge barrel");

    const axis = normalize(input.axis);
    const completedSteps: RecipeStep[] = [];
    let current = initial;
    let barrelId = 0;
    let boreId = 0;
    try {
      const beforeBarrel = current;
      current = await this.operations.createCylinder(
        input.axisStartMm,
        input.outerDiameterMm / 2,
        input.lengthMm,
        undefined,
        current.revision,
        axis,
      );
      barrelId = requireSingleAddedBody(beforeBarrel, current, "hinge barrel");
      completedSteps.push(step("create-hinge-barrel", beforeBarrel, current, [barrelId]));

      const beforeBore = current;
      current = await this.operations.createCylinder(
        subtract(input.axisStartMm, scale(axis, input.cutterOvershootMm)),
        input.pinBoreDiameterMm / 2,
        input.lengthMm + input.cutterOvershootMm * 2,
        undefined,
        current.revision,
        axis,
      );
      boreId = requireSingleAddedBody(beforeBore, current, "hinge bore cutter");
      completedSteps.push(step("create-hinge-bore-cutter", beforeBore, current, [boreId]));

      const beforeHollow = current;
      current = await this.operations.boolean([barrelId], [boreId], "difference", false, current.revision);
      const hollowBodyIds = requireRecipeResult(initial, current, barrelId, [boreId]);
      completedSteps.push(step("hollow-hinge-barrel", beforeHollow, current, hollowBodyIds));

      const beforeUnion = current;
      current = await this.operations.boolean([input.targetId], [barrelId], "union", false, current.revision);
      const resultBodyIds = requireRecipeResult(initial, current, input.targetId, [barrelId]);
      completedSteps.push(step("union-hinge-to-target", beforeUnion, current, resultBodyIds));

      return {
        recipe: "hinge-barrel",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        resultBodyIds,
        consumedToolIds: [boreId, barrelId],
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof HingeBarrelRecipeError) throw error;
      throw new HingeBarrelRecipeError(error, completedSteps, current.revision);
    }
  }

  async cutCableChannel(input: CableChannelRecipeInput): Promise<CableChannelRecipeResult> {
    validateCableChannel(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Cable channel");
    const invalidSpines = input.spineIds.filter((id) => initial.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalidSpines.length > 0) throw new Error(`Cable channel requires current Wire spines: ${invalidSpines.join(", ")}`);

    const completedSteps: RecipeStep[] = [];
    let current = initial;
    try {
      const beforePipes = current;
      current = await this.operations.createPipes(input.spineIds, input.channelDiameterMm, 0, current.revision);
      const cutterIds = addedBodyIds(initial, current, "Solid");
      if (cutterIds.length !== input.spineIds.length) {
        throw new Error(`Expected ${input.spineIds.length} cable-channel cutters, found ${cutterIds.length}`);
      }
      completedSteps.push(step("create-cable-channel-cutters", beforePipes, current, cutterIds));

      const beforeBoolean = current;
      current = await this.operations.boolean([input.targetId], cutterIds, "difference", false, current.revision);
      const resultBodyIds = requireRecipeResult(initial, current, input.targetId, cutterIds);
      completedSteps.push(step("boolean-difference", beforeBoolean, current, resultBodyIds));

      return {
        recipe: "cable-channel",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        spineIds: [...input.spineIds],
        resultBodyIds,
        consumedToolIds: cutterIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof CableChannelRecipeError) throw error;
      throw new CableChannelRecipeError(error, completedSteps, current.revision);
    }
  }

  async createConnectorOpening(input: ConnectorOpeningRecipeInput): Promise<ConnectorOpeningRecipeResult> {
    validateConnectorOpening(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.targetId, input.revision, "Connector opening");

    const axis = normalize(input.axis);
    const widthDirection = normalize(input.widthDirection);
    const heightDirection = normalize(cross(axis, widthDirection));
    const profileCenter = subtract(input.entryCenterMm, scale(axis, input.overshootMm));
    const halfWidth = scale(widthDirection, input.widthMm / 2);
    const halfHeight = scale(heightDirection, input.heightMm / 2);
    const profilePointsMm: Vector3[] = [
      subtract(subtract(profileCenter, halfWidth), halfHeight),
      subtract(add(profileCenter, halfWidth), halfHeight),
      add(add(profileCenter, halfWidth), halfHeight),
      add(subtract(profileCenter, halfWidth), halfHeight),
    ];
    const cutterDepthMm = input.throughDepthMm + input.overshootMm * 2;
    const totalSteps = input.cornerRadiusMm > 0 ? 4 : 3;
    const completedSteps: RecipeStep[] = [];
    let current = initial;
    let profileBodyId = 0;
    let cutterId = 0;
    try {
      const beforeProfile = current;
      current = await this.operations.createPolyline(profilePointsMm, true, current.revision);
      profileBodyId = requireSingleAddedBody(beforeProfile, current, "connector opening profile", "Wire");
      const matchingRegions = current.regions.filter((region) => region.sketchWireIds.includes(profileBodyId));
      if (matchingRegions.length !== 1) {
        throw new Error(`Expected one closed Region for connector opening profile ${profileBodyId}, found ${matchingRegions.length}`);
      }
      completedSteps.push(step("create-connector-profile", beforeProfile, current, [profileBodyId]));

      const beforeExtrude = current;
      current = await this.operations.extrudeRegions([matchingRegions[0]!.id], cutterDepthMm, current.revision);
      cutterId = requireSingleAddedBody(beforeExtrude, current, "connector opening cutter");
      completedSteps.push(step("extrude-connector-cutter", beforeExtrude, current, [cutterId]));

      if (input.cornerRadiusMm > 0) {
        const cutter = current.bodies.find((body) => body.id === cutterId);
        if (!cutter) throw new Error(`Connector opening cutter disappeared: ${cutterId}`);
        const longitudinalEdgeIds = cutter.edges.filter((edge) => {
          if (!edge.line) return false;
          const tangentLength = Math.hypot(...edge.tangent);
          return tangentLength > 1e-9 && Math.abs(Math.abs(dot(edge.tangent, axis) / tangentLength) - 1) < 1e-6;
        }).map((edge) => edge.id);
        if (longitudinalEdgeIds.length !== 4) {
          throw new Error(`Expected four longitudinal connector-cutter edges, found ${longitudinalEdgeIds.length}`);
        }
        const beforeRound = current;
        current = await this.operations.fillet(cutterId, longitudinalEdgeIds, input.cornerRadiusMm, current.revision);
        completedSteps.push(step("round-connector-cutter", beforeRound, current, [cutterId]));
      }

      const beforeBoolean = current;
      current = await this.operations.boolean([input.targetId], [cutterId], "difference", false, current.revision);
      const resultBodyIds = requireRecipeResult(initial, current, input.targetId, [cutterId]);
      completedSteps.push(step("boolean-difference", beforeBoolean, current, resultBodyIds));

      return {
        recipe: "connector-opening",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        targetId: input.targetId,
        profileBodyId,
        resultBodyIds,
        consumedToolIds: [cutterId],
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof ConnectorOpeningRecipeError) throw error;
      throw new ConnectorOpeningRecipeError(error, completedSteps, current.revision, totalSteps);
    }
  }

  async createMatingEnclosureJoint(input: MatingEnclosureJointRecipeInput): Promise<MatingEnclosureJointRecipeResult> {
    validateMatingEnclosureJoint(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.maleTargetId, input.revision, "Mating enclosure male half");
    requireCurrentSolid(initial, input.femaleTargetId, input.revision, "Mating enclosure female half");

    const maleOuterInset = input.wallThicknessMm - input.overlapMm;
    const maleInnerInset = input.wallThicknessMm + input.lipThicknessMm;
    const femaleOuterInset = input.wallThicknessMm - input.overlapMm - input.clearanceMm;
    const femaleInnerInset = input.wallThicknessMm + input.lipThicknessMm + input.clearanceMm;
    const maleOuterOrigin: Vector3 = add(input.seamOriginMm, [maleOuterInset, maleOuterInset, -input.overlapMm]);
    const maleOuterSize: Vector3 = [input.outerWidthMm - maleOuterInset * 2, input.outerDepthMm - maleOuterInset * 2, input.lipHeightMm + input.overlapMm];
    const maleInnerOrigin: Vector3 = add(input.seamOriginMm, [maleInnerInset, maleInnerInset, -input.overlapMm - input.cutterOvershootMm]);
    const maleInnerSize: Vector3 = [input.outerWidthMm - maleInnerInset * 2, input.outerDepthMm - maleInnerInset * 2, input.lipHeightMm + input.overlapMm + input.cutterOvershootMm * 2];
    const femaleOuterOrigin: Vector3 = add(input.seamOriginMm, [femaleOuterInset, femaleOuterInset, -input.cutterOvershootMm]);
    const femaleOuterSize: Vector3 = [input.outerWidthMm - femaleOuterInset * 2, input.outerDepthMm - femaleOuterInset * 2, input.lipHeightMm + input.cutterOvershootMm * 2];
    const femaleInnerOrigin: Vector3 = add(input.seamOriginMm, [femaleInnerInset, femaleInnerInset, -input.cutterOvershootMm * 2]);
    const femaleInnerSize: Vector3 = [input.outerWidthMm - femaleInnerInset * 2, input.outerDepthMm - femaleInnerInset * 2, input.lipHeightMm + input.cutterOvershootMm * 4];

    const completedSteps: RecipeStep[] = [];
    const consumedToolIds: number[] = [];
    let current = initial;
    try {
      const beforeMaleOuter = current;
      current = await this.operations.createBox(maleOuterOrigin, maleOuterSize, undefined, current.revision);
      const maleLipId = requireSingleAddedBody(beforeMaleOuter, current, "male lip outer");
      consumedToolIds.push(maleLipId);
      completedSteps.push(step("create-male-lip-outer", beforeMaleOuter, current, [maleLipId]));

      const beforeMaleInner = current;
      current = await this.operations.createBox(maleInnerOrigin, maleInnerSize, undefined, current.revision);
      const maleInnerId = requireSingleAddedBody(beforeMaleInner, current, "male lip inner cutter");
      consumedToolIds.push(maleInnerId);
      completedSteps.push(step("create-male-lip-inner", beforeMaleInner, current, [maleInnerId]));

      const beforeMaleRing = current;
      current = await this.operations.boolean([maleLipId], [maleInnerId], "difference", false, current.revision);
      requireSolid(current, maleLipId, "Male lip ring");
      requireAbsent(current, [maleInnerId], "Male lip inner cutter");
      completedSteps.push(step("form-male-lip", beforeMaleRing, current, [maleLipId]));

      const beforeMaleUnion = current;
      current = await this.operations.boolean([input.maleTargetId], [maleLipId], "union", false, current.revision);
      requireSolid(current, input.maleTargetId, "Mating enclosure male half");
      requireAbsent(current, [maleLipId], "Male lip ring");
      completedSteps.push(step("union-male-lip", beforeMaleUnion, current, [input.maleTargetId]));

      const beforeFemaleOuter = current;
      current = await this.operations.createBox(femaleOuterOrigin, femaleOuterSize, undefined, current.revision);
      const femaleGrooveId = requireSingleAddedBody(beforeFemaleOuter, current, "female groove outer cutter");
      consumedToolIds.push(femaleGrooveId);
      completedSteps.push(step("create-female-groove-outer", beforeFemaleOuter, current, [femaleGrooveId]));

      const beforeFemaleInner = current;
      current = await this.operations.createBox(femaleInnerOrigin, femaleInnerSize, undefined, current.revision);
      const femaleInnerId = requireSingleAddedBody(beforeFemaleInner, current, "female groove inner cutter");
      consumedToolIds.push(femaleInnerId);
      completedSteps.push(step("create-female-groove-inner", beforeFemaleInner, current, [femaleInnerId]));

      const beforeFemaleRing = current;
      current = await this.operations.boolean([femaleGrooveId], [femaleInnerId], "difference", false, current.revision);
      requireSolid(current, femaleGrooveId, "Female groove ring cutter");
      requireAbsent(current, [femaleInnerId], "Female groove inner cutter");
      completedSteps.push(step("form-female-groove", beforeFemaleRing, current, [femaleGrooveId]));

      const beforeFemaleCut = current;
      current = await this.operations.boolean([input.femaleTargetId], [femaleGrooveId], "difference", false, current.revision);
      const resultBodyIds = requirePairedSolidResult(initial, current, input.maleTargetId, input.femaleTargetId, consumedToolIds, "Mating enclosure joint");
      completedSteps.push(step("cut-female-groove", beforeFemaleCut, current, [input.femaleTargetId]));

      return {
        recipe: "mating-enclosure-joint",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        maleTargetId: input.maleTargetId,
        femaleTargetId: input.femaleTargetId,
        resultBodyIds,
        consumedToolIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof MatingEnclosureJointRecipeError) throw error;
      throw new MatingEnclosureJointRecipeError(error, completedSteps, current.revision);
    }
  }

  async createLocatingPinPair(input: LocatingPinPairRecipeInput): Promise<LocatingPinPairRecipeResult> {
    validateLocatingPinPair(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.maleTargetId, input.revision, "Locating pin male half");
    requireCurrentSolid(initial, input.femaleTargetId, input.revision, "Locating pin female half");

    const axis = normalize(input.axis);
    const cutterStart = subtract(input.baseCenterMm, scale(axis, input.cutterOvershootMm));
    const completedSteps: RecipeStep[] = [];
    const consumedToolIds: number[] = [];
    let current = initial;
    try {
      const beforePin = current;
      current = await this.operations.createCylinder(
        subtract(input.baseCenterMm, scale(axis, input.baseOverlapMm)),
        input.pinDiameterMm / 2,
        input.pinHeightMm + input.baseOverlapMm,
        undefined,
        current.revision,
        axis,
      );
      const pinId = requireSingleAddedBody(beforePin, current, "locating pin");
      consumedToolIds.push(pinId);
      completedSteps.push(step("create-locating-pin", beforePin, current, [pinId]));

      const beforePinUnion = current;
      current = await this.operations.boolean([input.maleTargetId], [pinId], "union", false, current.revision);
      requireSolid(current, input.maleTargetId, "Locating pin male half");
      requireAbsent(current, [pinId], "Locating pin body");
      completedSteps.push(step("union-locating-pin", beforePinUnion, current, [input.maleTargetId]));

      const beforeSocket = current;
      current = await this.operations.createCylinder(
        cutterStart,
        input.pinDiameterMm / 2 + input.radialClearanceMm,
        input.pinHeightMm + input.axialClearanceMm + input.cutterOvershootMm,
        undefined,
        current.revision,
        axis,
      );
      const socketCutterId = requireSingleAddedBody(beforeSocket, current, "locating socket cutter");
      consumedToolIds.push(socketCutterId);
      completedSteps.push(step("create-locating-socket-cutter", beforeSocket, current, [socketCutterId]));

      const beforeSocketCut = current;
      current = await this.operations.boolean([input.femaleTargetId], [socketCutterId], "difference", false, current.revision);
      const resultBodyIds = requirePairedSolidResult(initial, current, input.maleTargetId, input.femaleTargetId, consumedToolIds, "Locating pin pair");
      completedSteps.push(step("cut-locating-socket", beforeSocketCut, current, [input.femaleTargetId]));

      return {
        recipe: "locating-pin-pair",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        maleTargetId: input.maleTargetId,
        femaleTargetId: input.femaleTargetId,
        resultBodyIds,
        consumedToolIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof LocatingPinPairRecipeError) throw error;
      throw new LocatingPinPairRecipeError(error, completedSteps, current.revision);
    }
  }

  async createLocatingPinPairPattern(input: LocatingPinPairPatternRecipeInput): Promise<LocatingPinPairPatternRecipeResult> {
    validateLocatingPinPairPattern(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.maleTargetId, input.revision, "Locating pin male half");
    requireCurrentSolid(initial, input.femaleTargetId, input.revision, "Locating pin female half");

    const axis = normalize(input.axis);
    const completedSteps: RecipeStep[] = [];
    const pinIds: number[] = [];
    const socketCutterIds: number[] = [];
    const consumedToolIds: number[] = [];
    const totalSteps = input.baseCentersMm.length * 2 + 2;
    let current = initial;
    try {
      for (const baseCenterMm of input.baseCentersMm) {
        const beforePin = current;
        current = await this.operations.createCylinder(
          subtract(baseCenterMm, scale(axis, input.baseOverlapMm)),
          input.pinDiameterMm / 2,
          input.pinHeightMm + input.baseOverlapMm,
          undefined,
          current.revision,
          axis,
        );
        const pinId = requireSingleAddedBody(beforePin, current, "locating pin pattern body");
        pinIds.push(pinId);
        consumedToolIds.push(pinId);
        completedSteps.push(step("create-locating-pin", beforePin, current, [pinId]));
      }

      const beforePinUnion = current;
      current = await this.operations.boolean([input.maleTargetId], pinIds, "union", false, current.revision);
      requireSolid(current, input.maleTargetId, "Locating pin male half");
      requireAbsent(current, pinIds, "Locating pin pattern bodies");
      completedSteps.push(step("union-locating-pin", beforePinUnion, current, [input.maleTargetId]));

      for (const baseCenterMm of input.baseCentersMm) {
        const beforeSocket = current;
        current = await this.operations.createCylinder(
          subtract(baseCenterMm, scale(axis, input.cutterOvershootMm)),
          input.pinDiameterMm / 2 + input.radialClearanceMm,
          input.pinHeightMm + input.axialClearanceMm + input.cutterOvershootMm,
          undefined,
          current.revision,
          axis,
        );
        const socketCutterId = requireSingleAddedBody(beforeSocket, current, "locating socket pattern cutter");
        socketCutterIds.push(socketCutterId);
        consumedToolIds.push(socketCutterId);
        completedSteps.push(step("create-locating-socket-cutter", beforeSocket, current, [socketCutterId]));
      }

      const beforeSocketCut = current;
      current = await this.operations.boolean([input.femaleTargetId], socketCutterIds, "difference", false, current.revision);
      const resultBodyIds = requirePairedSolidResult(initial, current, input.maleTargetId, input.femaleTargetId, consumedToolIds, "Locating pin pattern");
      completedSteps.push(step("cut-locating-socket", beforeSocketCut, current, [input.femaleTargetId]));

      return {
        recipe: "locating-pin-pair-pattern",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        maleTargetId: input.maleTargetId,
        femaleTargetId: input.femaleTargetId,
        pinCount: input.baseCentersMm.length,
        resultBodyIds,
        consumedToolIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof LocatingPinPairPatternRecipeError) throw error;
      throw new LocatingPinPairPatternRecipeError(error, completedSteps, current.revision, totalSteps);
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

  async createTongueGrooveJoint(input: TongueGrooveJointRecipeInput): Promise<TongueGrooveJointRecipeResult> {
    validateTongueGrooveJoint(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.tongueTargetId, input.revision, "Tongue target");
    requireCurrentSolid(initial, input.grooveTargetId, input.revision, "Groove target");

    const axis = normalize(input.axis);
    const widthDirection = normalize(input.widthDirection);
    const thicknessDirection = normalize(cross(axis, widthDirection));
    const tongueCenter = subtract(input.baseCenterMm, scale(axis, input.baseOverlapMm));
    const grooveCenter = subtract(input.baseCenterMm, scale(axis, input.cutterOvershootMm));
    const tonguePoints = rectanglePoints(tongueCenter, widthDirection, thicknessDirection, input.tongueWidthMm, input.tongueThicknessMm);
    const groovePoints = rectanglePoints(
      grooveCenter,
      widthDirection,
      thicknessDirection,
      input.tongueWidthMm + input.radialClearanceMm * 2,
      input.tongueThicknessMm + input.radialClearanceMm * 2,
    );
    const completedSteps: RecipeStep[] = [];
    const profileBodyIds: number[] = [];
    const consumedToolIds: number[] = [];
    let current = initial;
    try {
      const beforeTongueProfile = current;
      current = await this.operations.createPolyline(tonguePoints, true, current.revision);
      const tongueProfileId = requireSingleAddedBody(beforeTongueProfile, current, "tongue profile", "Wire");
      profileBodyIds.push(tongueProfileId);
      const tongueRegions = current.regions.filter((region) => region.sketchWireIds.includes(tongueProfileId));
      if (tongueRegions.length !== 1) throw new Error(`Expected one closed Region for tongue profile ${tongueProfileId}, found ${tongueRegions.length}`);
      completedSteps.push(step("create-tongue-profile", beforeTongueProfile, current, [tongueProfileId]));

      const beforeTongueExtrude = current;
      current = await this.operations.extrudeRegions([tongueRegions[0]!.id], input.tongueHeightMm + input.baseOverlapMm, current.revision);
      const tongueId = requireSingleAddedBody(beforeTongueExtrude, current, "tongue body");
      consumedToolIds.push(tongueId);
      completedSteps.push(step("extrude-tongue", beforeTongueExtrude, current, [tongueId]));

      const beforeTongueUnion = current;
      current = await this.operations.boolean([input.tongueTargetId], [tongueId], "union", false, current.revision);
      requireSolid(current, input.tongueTargetId, "Tongue target");
      requireAbsent(current, [tongueId], "Tongue body");
      completedSteps.push(step("union-tongue", beforeTongueUnion, current, [input.tongueTargetId]));

      const beforeGrooveProfile = current;
      current = await this.operations.createPolyline(groovePoints, true, current.revision);
      const grooveProfileId = requireSingleAddedBody(beforeGrooveProfile, current, "groove profile", "Wire");
      profileBodyIds.push(grooveProfileId);
      const grooveRegions = current.regions.filter((region) => region.sketchWireIds.includes(grooveProfileId));
      if (grooveRegions.length === 0) throw new Error(`Expected at least one closed Region for groove profile ${grooveProfileId}`);
      completedSteps.push(step("create-groove-profile", beforeGrooveProfile, current, [grooveProfileId]));

      const beforeGrooveExtrude = current;
      current = await this.operations.extrudeRegions(
        grooveRegions.map((region) => region.id),
        input.tongueHeightMm + input.axialClearanceMm + input.cutterOvershootMm,
        current.revision,
      );
      const grooveCutterId = requireSingleAddedBody(beforeGrooveExtrude, current, "groove cutter");
      consumedToolIds.push(grooveCutterId);
      completedSteps.push(step("extrude-groove-cutter", beforeGrooveExtrude, current, [grooveCutterId]));

      const beforeGrooveCut = current;
      current = await this.operations.boolean([input.grooveTargetId], [grooveCutterId], "difference", false, current.revision);
      const resultBodyIds = requirePairedSolidResult(initial, current, input.tongueTargetId, input.grooveTargetId, consumedToolIds, "Tongue and groove joint");
      completedSteps.push(step("cut-groove", beforeGrooveCut, current, [input.grooveTargetId]));

      return {
        recipe: "tongue-groove-joint",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        tongueTargetId: input.tongueTargetId,
        grooveTargetId: input.grooveTargetId,
        profileBodyIds,
        resultBodyIds,
        consumedToolIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof TongueGrooveJointRecipeError) throw error;
      throw new TongueGrooveJointRecipeError(error, completedSteps, current.revision);
    }
  }

  async createDovetailJoint(input: DovetailJointRecipeInput): Promise<DovetailJointRecipeResult> {
    validateDovetailJoint(input);
    const initial = await this.operations.state();
    requireCurrentSolid(initial, input.maleTargetId, input.revision, "Dovetail male target");
    requireCurrentSolid(initial, input.femaleTargetId, input.revision, "Dovetail female target");

    const axis = normalize(input.axis);
    const widthDirection = normalize(input.widthDirection);
    const thicknessDirection = normalize(cross(axis, widthDirection));
    const maleCenter = subtract(input.baseCenterMm, scale(axis, input.baseOverlapMm));
    const femaleCenter = subtract(input.baseCenterMm, scale(axis, input.cutterOvershootMm));
    const malePoints = dovetailPoints(maleCenter, widthDirection, thicknessDirection, input.rootWidthMm, input.flareMm, input.tongueThicknessMm);
    const femalePoints = dovetailPoints(
      femaleCenter,
      widthDirection,
      thicknessDirection,
      input.rootWidthMm + input.radialClearanceMm * 2,
      input.flareMm,
      input.tongueThicknessMm + input.radialClearanceMm * 2,
    );
    const completedSteps: RecipeStep[] = [];
    const profileBodyIds: number[] = [];
    const consumedToolIds: number[] = [];
    let current = initial;
    try {
      const beforeMaleProfile = current;
      current = await this.operations.createPolyline(malePoints, true, current.revision);
      const maleProfileId = requireSingleAddedBody(beforeMaleProfile, current, "dovetail male profile", "Wire");
      profileBodyIds.push(maleProfileId);
      const maleRegion = selectProfileRegion(current, maleProfileId, malePoints, "dovetail male");
      completedSteps.push(step("create-dovetail-male-profile", beforeMaleProfile, current, [maleProfileId]));

      const beforeMaleExtrude = current;
      current = await this.operations.extrudeRegions([maleRegion.id], input.tongueHeightMm + input.baseOverlapMm, current.revision);
      const maleToolId = requireSingleAddedBody(beforeMaleExtrude, current, "dovetail male body");
      consumedToolIds.push(maleToolId);
      completedSteps.push(step("extrude-dovetail-male", beforeMaleExtrude, current, [maleToolId]));

      const beforeMaleUnion = current;
      current = await this.operations.boolean([input.maleTargetId], [maleToolId], "union", false, current.revision);
      requireSolid(current, input.maleTargetId, "Dovetail male target");
      requireAbsent(current, [maleToolId], "Dovetail male body");
      completedSteps.push(step("union-dovetail-male", beforeMaleUnion, current, [input.maleTargetId]));

      const beforeFemaleProfile = current;
      current = await this.operations.createPolyline(femalePoints, true, current.revision);
      const femaleProfileId = requireSingleAddedBody(beforeFemaleProfile, current, "dovetail female profile", "Wire");
      profileBodyIds.push(femaleProfileId);
      const femaleRegions = current.regions.filter((region) => region.sketchWireIds.includes(femaleProfileId));
      if (femaleRegions.length === 0) throw new Error(`Expected at least one closed Region for dovetail female profile ${femaleProfileId}`);
      completedSteps.push(step("create-dovetail-female-profile", beforeFemaleProfile, current, [femaleProfileId]));

      const beforeFemaleExtrude = current;
      current = await this.operations.extrudeRegions(femaleRegions.map((region) => region.id), input.tongueHeightMm + input.axialClearanceMm + input.cutterOvershootMm, current.revision);
      const femaleToolId = requireSingleAddedBody(beforeFemaleExtrude, current, "dovetail female cutter");
      consumedToolIds.push(femaleToolId);
      completedSteps.push(step("extrude-dovetail-female-cutter", beforeFemaleExtrude, current, [femaleToolId]));

      const beforeFemaleCut = current;
      current = await this.operations.boolean([input.femaleTargetId], [femaleToolId], "difference", false, current.revision);
      const resultBodyIds = requirePairedSolidResult(initial, current, input.maleTargetId, input.femaleTargetId, consumedToolIds, "Dovetail joint");
      completedSteps.push(step("cut-dovetail-female", beforeFemaleCut, current, [input.femaleTargetId]));

      return {
        recipe: "dovetail-joint",
        status: "completed",
        documentToken: current.documentToken,
        beforeRevision: initial.revision,
        afterRevision: current.revision,
        maleTargetId: input.maleTargetId,
        femaleTargetId: input.femaleTargetId,
        rootWidthMm: input.rootWidthMm,
        tipWidthMm: input.rootWidthMm + input.flareMm * 2,
        profileBodyIds,
        resultBodyIds,
        consumedToolIds,
        undoSteps: completedSteps.length,
        steps: completedSteps,
      };
    } catch (error) {
      if (error instanceof DovetailJointRecipeError) throw error;
      throw new DovetailJointRecipeError(error, completedSteps, current.revision);
    }
  }
}
import { type Vector3, type RecipeStep, type RibRecipeInput, type RibRecipeResult, type RoundVentArrayRecipeInput, type RoundVentArrayRecipeResult, type CableChannelRecipeInput, type CableChannelRecipeResult, type ConnectorOpeningRecipeInput, type ConnectorOpeningRecipeResult } from "./types.ts";
import { RibRecipeError, RoundVentArrayRecipeError, CableChannelRecipeError, ConnectorOpeningRecipeError } from "./errors.ts";
import { validateRib, validateRoundVentArray, validateCableChannel, validateConnectorOpening, requireCurrentSolid, requireSingleAddedBody, addedBodyIds, requireRecipeResult, step, normalize, scale, subtract, add, dot, cross } from "./helpers.ts";
import { RecipesBase } from "./base.ts";

export abstract class FeaturesRecipes extends RecipesBase {
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
}

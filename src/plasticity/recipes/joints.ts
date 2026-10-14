import { type Vector3, type RecipeStep, type CantileverSnapFitRecipeInput, type CantileverSnapFitRecipeResult, type HingeBarrelRecipeInput, type HingeBarrelRecipeResult, type MatingEnclosureJointRecipeInput, type MatingEnclosureJointRecipeResult, type LocatingPinPairRecipeInput, type LocatingPinPairRecipeResult, type LocatingPinPairPatternRecipeInput, type LocatingPinPairPatternRecipeResult, type TongueGrooveJointRecipeInput, type TongueGrooveJointRecipeResult, type DovetailJointRecipeInput, type DovetailJointRecipeResult } from "./types.ts";
import { RibRecipeError, CantileverSnapFitRecipeError, HingeBarrelRecipeError, MatingEnclosureJointRecipeError, LocatingPinPairRecipeError, LocatingPinPairPatternRecipeError, TongueGrooveJointRecipeError, DovetailJointRecipeError } from "./errors.ts";
import { validateCantileverSnapFit, validateHingeBarrel, validateMatingEnclosureJoint, validateLocatingPinPair, validateLocatingPinPairPattern, validateTongueGrooveJoint, validateDovetailJoint, requireCurrentSolid, requireSingleAddedBody, requireRecipeResult, requireSolid, requireAbsent, requirePairedSolidResult, step, rectanglePoints, dovetailPoints, selectProfileRegion, normalize, scale, subtract, add, cross } from "./helpers.ts";
import { RecipesBase } from "./base.ts";
import type { FeaturesRecipes } from "./features.ts";

export abstract class JointsRecipes extends RecipesBase {
  declare createRib: FeaturesRecipes["createRib"];
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

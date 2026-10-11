import type { PlasticityOperations } from "../operations.ts";

export type Vector3 = [number, number, number];

export type RecipeOperations = Pick<PlasticityOperations, "state" | "createBox" | "createCylinder" | "createPolyline" | "extrudeRegions" | "rectangularPattern" | "createPipes" | "fillet" | "boolean"> & {
  revolveProfile?: PlasticityOperations["revolveProfile"];
};

export interface CountersinkRecipeInput {
  targetId: number;
  entryCenterMm: Vector3;
  axis: Vector3;
  radialDirection: Vector3;
  throughDiameterMm: number;
  countersinkMajorDiameterMm: number;
  includedAngleDeg: number;
  throughDepthMm: number;
  overshootMm: number;
  revision: string;
}

export interface CountersinkRecipeResult {
  recipe: "countersink";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  countersinkDepthMm: number;
  profileBodyId: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface CountersinkPatternRecipeInput {
  targetId: number;
  entryCentersMm: Vector3[];
  axis: Vector3;
  radialDirection: Vector3;
  throughDiameterMm: number;
  countersinkMajorDiameterMm: number;
  includedAngleDeg: number;
  throughDepthMm: number;
  overshootMm: number;
  revision: string;
}

export interface CountersinkPatternRecipeResult {
  recipe: "countersink-pattern";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  holeCount: number;
  countersinkDepthMm: number;
  profileBodyIds: number[];
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface HexNutPocketRecipeInput {
  targetId: number;
  entryCenterMm: Vector3;
  axis: Vector3;
  flatNormalDirection: Vector3;
  acrossFlatsMm: number;
  pocketDepthMm: number;
  materialDepthMm: number;
  overshootMm: number;
  revision: string;
}

export interface HexNutPocketRecipeResult {
  recipe: "hex-nut-pocket";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  profileBodyId: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface HexNutPocketPatternRecipeInput {
  targetId: number;
  entryCentersMm: Vector3[];
  axis: Vector3;
  flatNormalDirection: Vector3;
  acrossFlatsMm: number;
  pocketDepthMm: number;
  materialDepthMm: number;
  overshootMm: number;
  revision: string;
}

export interface HexNutPocketPatternRecipeResult {
  recipe: "hex-nut-pocket-pattern";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  pocketCount: number;
  profileBodyIds: number[];
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface SlottedHoleRecipeInput {
  targetId: number;
  entryCenterMm: Vector3;
  axis: Vector3;
  slotDirection: Vector3;
  overallLengthMm: number;
  widthMm: number;
  throughDepthMm: number;
  overshootMm: number;
  revision: string;
}

export interface SlottedHoleRecipeResult {
  recipe: "slotted-hole";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  centerDistanceMm: number;
  profileBodyId: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface SlottedHolePatternRecipeInput {
  targetId: number;
  entryCentersMm: Vector3[];
  axis: Vector3;
  slotDirection: Vector3;
  overallLengthMm: number;
  widthMm: number;
  throughDepthMm: number;
  overshootMm: number;
  revision: string;
}

export interface SlottedHolePatternRecipeResult {
  recipe: "slotted-hole-pattern";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  slotCount: number;
  centerDistanceMm: number;
  profileBodyIds: number[];
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface CounterboreRecipeInput {
  targetId: number;
  entryCenterMm: Vector3;
  axis: Vector3;
  throughDiameterMm: number;
  counterboreDiameterMm: number;
  counterboreDepthMm: number;
  throughDepthMm: number;
  overshootMm: number;
  revision: string;
}

export interface CounterborePatternRecipeInput {
  targetId: number;
  entryCentersMm: Vector3[];
  axis: Vector3;
  throughDiameterMm: number;
  counterboreDiameterMm: number;
  counterboreDepthMm: number;
  throughDepthMm: number;
  overshootMm: number;
  revision: string;
}

export interface ThroughHoleRecipeInput {
  targetId: number;
  entryCenterMm: Vector3;
  axis: Vector3;
  holeDiameterMm: number;
  throughDepthMm: number;
  overshootMm: number;
  revision: string;
}

export interface ThroughHoleRecipeResult {
  recipe: "through-hole";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface ThroughHolePatternRecipeInput {
  targetId: number;
  entryCentersMm: Vector3[];
  axis: Vector3;
  holeDiameterMm: number;
  throughDepthMm: number;
  overshootMm: number;
  revision: string;
}

export interface ThroughHolePatternRecipeResult {
  recipe: "through-hole-pattern";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  holeCount: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface BlindHoleRecipeInput {
  targetId: number;
  entryCenterMm: Vector3;
  axis: Vector3;
  holeDiameterMm: number;
  holeDepthMm: number;
  materialDepthMm: number;
  overshootMm: number;
  revision: string;
}

export interface BlindHoleRecipeResult {
  recipe: "blind-hole";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface BlindHolePatternRecipeInput {
  targetId: number;
  entryCentersMm: Vector3[];
  axis: Vector3;
  holeDiameterMm: number;
  holeDepthMm: number;
  materialDepthMm: number;
  overshootMm: number;
  revision: string;
}

export interface BlindHolePatternRecipeResult {
  recipe: "blind-hole-pattern";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  holeCount: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface RecipeStep {
  operation:
    | "create-countersink-profile"
    | "revolve-countersink-cutter"
    | "create-hex-pocket-profile"
    | "extrude-hex-pocket-cutter"
    | "create-slot-profile"
    | "extrude-slot-center-cutter"
    | "create-slot-end-cutter"
    | "create-through-cutter"
    | "create-counterbore-cutter"
    | "create-blind-cutter"
    | "create-pilot-cutter"
    | "create-insert-cutter"
    | "create-lead-in-cutter"
    | "create-boss-body"
    | "union-boss-to-target"
    | "create-boss-hole-cutter"
    | "create-rib-profile"
    | "extrude-rib"
    | "union-rib-to-target"
    | "create-vent-cutter"
    | "pattern-vent-cutters"
    | "create-snap-profile"
    | "extrude-snap-body"
    | "union-snap-to-target"
    | "create-hinge-barrel"
    | "create-hinge-bore-cutter"
    | "hollow-hinge-barrel"
    | "union-hinge-to-target"
    | "create-cable-channel-cutters"
    | "create-connector-profile"
    | "extrude-connector-cutter"
    | "round-connector-cutter"
    | "create-male-lip-outer"
    | "create-male-lip-inner"
    | "form-male-lip"
    | "union-male-lip"
    | "create-female-groove-outer"
    | "create-female-groove-inner"
    | "form-female-groove"
    | "cut-female-groove"
    | "create-locating-pin"
    | "union-locating-pin"
    | "create-locating-socket-cutter"
    | "cut-locating-socket"
    | "create-tongue-profile"
    | "extrude-tongue"
    | "union-tongue"
    | "create-groove-profile"
    | "extrude-groove-cutter"
    | "cut-groove"
    | "create-dovetail-male-profile"
    | "extrude-dovetail-male"
    | "union-dovetail-male"
    | "create-dovetail-female-profile"
    | "extrude-dovetail-female-cutter"
    | "cut-dovetail-female"
    | "boolean-difference";
  beforeRevision: string;
  afterRevision: string;
  affectedBodyIds: number[];
}

export interface CounterboreRecipeResult {
  recipe: "counterbore";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface CounterborePatternRecipeResult {
  recipe: "counterbore-pattern";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  holeCount: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface HeatSetInsertPocketRecipeInput {
  targetId: number;
  entryCenterMm: Vector3;
  axis: Vector3;
  pilotDiameterMm: number;
  pilotDepthMm: number;
  insertDiameterMm: number;
  insertDepthMm: number;
  leadInDiameterMm: number;
  leadInDepthMm: number;
  materialDepthMm: number;
  overshootMm: number;
  revision: string;
}

export interface HeatSetInsertPocketRecipeResult {
  recipe: "heat-set-insert-pocket";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface HeatSetInsertPocketPatternRecipeInput {
  targetId: number;
  entryCentersMm: Vector3[];
  axis: Vector3;
  pilotDiameterMm: number;
  pilotDepthMm: number;
  insertDiameterMm: number;
  insertDepthMm: number;
  leadInDiameterMm: number;
  leadInDepthMm: number;
  materialDepthMm: number;
  overshootMm: number;
  revision: string;
}

export interface HeatSetInsertPocketPatternRecipeResult {
  recipe: "heat-set-insert-pocket-pattern";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  pocketCount: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface ScrewBossRecipeInput {
  targetId: number;
  baseCenterMm: Vector3;
  axis: Vector3;
  outerDiameterMm: number;
  heightMm: number;
  holeDiameterMm: number;
  holeDepthMm: number;
  baseOverlapMm: number;
  cutterOvershootMm: number;
  revision: string;
}

export interface ScrewBossRecipeResult {
  recipe: "screw-boss";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface ScrewBossPatternRecipeInput {
  targetId: number;
  baseCentersMm: Vector3[];
  axis: Vector3;
  outerDiameterMm: number;
  heightMm: number;
  holeDiameterMm: number;
  holeDepthMm: number;
  baseOverlapMm: number;
  cutterOvershootMm: number;
  revision: string;
}

export interface ScrewBossPatternRecipeResult {
  recipe: "screw-boss-pattern";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  bossCount: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface RibRecipeInput {
  targetId: number;
  profilePointsMm: Vector3[];
  thicknessMm: number;
  revision: string;
}

export interface RibRecipeResult {
  recipe: "rib";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  profileBodyId: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface RoundVentArrayRecipeInput {
  targetId: number;
  firstCenterMm: Vector3;
  axis: Vector3;
  holeDiameterMm: number;
  throughDepthMm: number;
  direction1: Vector3;
  count1: number;
  spacing1Mm: number;
  direction2: Vector3;
  count2: number;
  spacing2Mm: number;
  overshootMm: number;
  revision: string;
}

export interface RoundVentArrayRecipeResult {
  recipe: "round-vent-array";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  holeCount: number;
  undoSteps: number;
  steps: RecipeStep[];
}

export interface CantileverSnapFitRecipeInput {
  targetId: number;
  baseCenterMm: Vector3;
  beamDirection: Vector3;
  thicknessDirection: Vector3;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  hookLengthMm: number;
  hookHeightMm: number;
  baseOverlapMm: number;
  revision: string;
}

export interface CantileverSnapFitRecipeResult {
  recipe: "cantilever-snap-fit";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  profileBodyId: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface HingeBarrelRecipeInput {
  targetId: number;
  axisStartMm: Vector3;
  axis: Vector3;
  lengthMm: number;
  outerDiameterMm: number;
  pinBoreDiameterMm: number;
  cutterOvershootMm: number;
  revision: string;
}

export interface HingeBarrelRecipeResult {
  recipe: "hinge-barrel";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface CableChannelRecipeInput {
  targetId: number;
  spineIds: number[];
  channelDiameterMm: number;
  revision: string;
}

export interface CableChannelRecipeResult {
  recipe: "cable-channel";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  spineIds: number[];
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface ConnectorOpeningRecipeInput {
  targetId: number;
  entryCenterMm: Vector3;
  axis: Vector3;
  widthDirection: Vector3;
  widthMm: number;
  heightMm: number;
  cornerRadiusMm: number;
  throughDepthMm: number;
  overshootMm: number;
  revision: string;
}

export interface ConnectorOpeningRecipeResult {
  recipe: "connector-opening";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  targetId: number;
  profileBodyId: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface MatingEnclosureJointRecipeInput {
  maleTargetId: number;
  femaleTargetId: number;
  seamOriginMm: Vector3;
  outerWidthMm: number;
  outerDepthMm: number;
  wallThicknessMm: number;
  lipThicknessMm: number;
  lipHeightMm: number;
  clearanceMm: number;
  overlapMm: number;
  cutterOvershootMm: number;
  revision: string;
}

export interface MatingEnclosureJointRecipeResult {
  recipe: "mating-enclosure-joint";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  maleTargetId: number;
  femaleTargetId: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface LocatingPinPairRecipeInput {
  maleTargetId: number;
  femaleTargetId: number;
  baseCenterMm: Vector3;
  axis: Vector3;
  pinDiameterMm: number;
  pinHeightMm: number;
  radialClearanceMm: number;
  axialClearanceMm: number;
  baseOverlapMm: number;
  cutterOvershootMm: number;
  revision: string;
}

export interface LocatingPinPairRecipeResult {
  recipe: "locating-pin-pair";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  maleTargetId: number;
  femaleTargetId: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface LocatingPinPairPatternRecipeInput extends Omit<LocatingPinPairRecipeInput, "baseCenterMm"> {
  baseCentersMm: Vector3[];
}

export interface LocatingPinPairPatternRecipeResult extends Omit<LocatingPinPairRecipeResult, "recipe"> {
  recipe: "locating-pin-pair-pattern";
  pinCount: number;
}

export interface SplitScrewInsertJointRecipeInput {
  maleTargetId: number;
  femaleTargetId: number;
  screwEntryCentersMm: Vector3[];
  insertEntryCentersMm: Vector3[];
  axis: Vector3;
  fastenerDesignation: string;
  screwLengthMm: number;
  minimumEngagementMm: number;
  maximumEngagementMm: number;
  insertPartNumber: string;
  insertThreadNominalDiameterMm: number;
  insertThreadPitchMm: number;
  insertSourceUrl: string;
  holeDiameterMm: number;
  maleThroughDepthMm: number;
  holeOvershootMm: number;
  pilotDiameterMm: number;
  pilotDepthMm: number;
  insertDiameterMm: number;
  insertDepthMm: number;
  leadInDiameterMm: number;
  leadInDepthMm: number;
  femaleMaterialDepthMm: number;
  insertOvershootMm: number;
  revision: string;
}

export interface SplitScrewInsertJointRecipeResult {
  recipe: "split-screw-insert-joint";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  maleTargetId: number;
  femaleTargetId: number;
  fastenerDesignation: string;
  insertPartNumber: string;
  insertThreadNominalDiameterMm: number;
  insertThreadPitchMm: number;
  insertSourceUrl: string;
  fastenerCount: number;
  screwEngagementMm: number;
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface TongueGrooveJointRecipeInput {
  tongueTargetId: number;
  grooveTargetId: number;
  baseCenterMm: Vector3;
  axis: Vector3;
  widthDirection: Vector3;
  tongueWidthMm: number;
  tongueThicknessMm: number;
  tongueHeightMm: number;
  radialClearanceMm: number;
  axialClearanceMm: number;
  baseOverlapMm: number;
  cutterOvershootMm: number;
  revision: string;
}

export interface TongueGrooveJointRecipeResult {
  recipe: "tongue-groove-joint";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  tongueTargetId: number;
  grooveTargetId: number;
  profileBodyIds: number[];
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

export interface DovetailJointRecipeInput {
  maleTargetId: number;
  femaleTargetId: number;
  baseCenterMm: Vector3;
  axis: Vector3;
  widthDirection: Vector3;
  rootWidthMm: number;
  flareMm: number;
  tongueThicknessMm: number;
  tongueHeightMm: number;
  radialClearanceMm: number;
  axialClearanceMm: number;
  baseOverlapMm: number;
  cutterOvershootMm: number;
  revision: string;
}

export interface DovetailJointRecipeResult {
  recipe: "dovetail-joint";
  status: "completed";
  documentToken: string;
  beforeRevision: string;
  afterRevision: string;
  maleTargetId: number;
  femaleTargetId: number;
  rootWidthMm: number;
  tipWidthMm: number;
  profileBodyIds: number[];
  resultBodyIds: number[];
  consumedToolIds: number[];
  undoSteps: number;
  steps: RecipeStep[];
}

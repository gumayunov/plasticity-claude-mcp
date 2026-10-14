import { type RuntimeState } from "../runtime.ts";
import { type CountersinkRecipeInput, type CountersinkPatternRecipeInput, type HexNutPocketRecipeInput, type HexNutPocketPatternRecipeInput, type SlottedHoleRecipeInput, type SlottedHolePatternRecipeInput, type CounterboreRecipeInput, type CounterborePatternRecipeInput, type ThroughHoleRecipeInput, type ThroughHolePatternRecipeInput, type BlindHoleRecipeInput, type BlindHolePatternRecipeInput, type HeatSetInsertPocketRecipeInput, type HeatSetInsertPocketPatternRecipeInput, type ScrewBossRecipeInput, type ScrewBossPatternRecipeInput, type RibRecipeInput, type Vector3, type RoundVentArrayRecipeInput, type CantileverSnapFitRecipeInput, type HingeBarrelRecipeInput, type CableChannelRecipeInput, type ConnectorOpeningRecipeInput, type MatingEnclosureJointRecipeInput, type LocatingPinPairRecipeInput, type LocatingPinPairPatternRecipeInput, type SplitScrewInsertJointRecipeInput, type TongueGrooveJointRecipeInput, type DovetailJointRecipeInput, type RecipeStep } from "./types.ts";

export function validateCountersink(input: CountersinkRecipeInput): number {
  const depth = validateCountersinkGeometry(input);
  if (input.entryCenterMm.some((value) => !Number.isFinite(value))) throw new Error("Countersink entry center must contain finite values");
  return depth;
}

export function validateCountersinkPattern(input: CountersinkPatternRecipeInput): number {
  if (input.entryCentersMm.length < 2 || input.entryCentersMm.length > 64) throw new Error("Countersink pattern requires between 2 and 64 entry centers");
  const depth = validateCountersinkGeometry(input);
  for (const center of input.entryCentersMm) {
    if (center.some((value) => !Number.isFinite(value))) throw new Error("Countersink pattern centers must contain finite values");
  }
  for (let first = 0; first < input.entryCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.entryCentersMm.length; second += 1) {
      if (Math.hypot(...subtract(input.entryCentersMm[first]!, input.entryCentersMm[second]!)) <= 1e-9) {
        throw new Error(`Countersink pattern centers must be distinct: ${first} and ${second}`);
      }
    }
  }
  return depth;
}

export function validateCountersinkGeometry(input: Omit<CountersinkRecipeInput, "entryCenterMm">): number {
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) throw new Error("Countersink target ID must be a positive integer");
  for (const [name, value] of [
    ["through diameter", input.throughDiameterMm],
    ["major diameter", input.countersinkMajorDiameterMm],
    ["through depth", input.throughDepthMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Countersink ${name} must be positive`);
  }
  if (!Number.isFinite(input.includedAngleDeg) || input.includedAngleDeg <= 0 || input.includedAngleDeg >= 180) {
    throw new Error("Countersink included angle must be greater than 0 and less than 180 degrees");
  }
  if (!Number.isFinite(input.overshootMm) || input.overshootMm < 0) throw new Error("Countersink overshoot must be nonnegative");
  if (input.countersinkMajorDiameterMm <= input.throughDiameterMm) {
    throw new Error("Countersink major diameter must be greater than through diameter");
  }
  const axis = normalize(input.axis);
  const radial = normalize(input.radialDirection);
  if (Math.abs(dot(axis, radial)) > 1e-6) {
    throw new Error("Countersink radial direction must be perpendicular to its cutting axis");
  }
  const depth = (input.countersinkMajorDiameterMm - input.throughDiameterMm)
    / (2 * Math.tan(input.includedAngleDeg * Math.PI / 360));
  if (!Number.isFinite(depth) || depth <= 0 || depth >= input.throughDepthMm) {
    throw new Error("Countersink depth derived from diameters and included angle must be less than through depth");
  }
  return depth;
}

export function validateHexNutPocket(input: HexNutPocketRecipeInput): void {
  validateHexNutPocketGeometry(input);
  if (input.entryCenterMm.some((value) => !Number.isFinite(value))) throw new Error("Hex nut pocket entry center must contain finite values");
}

export function validateHexNutPocketPattern(input: HexNutPocketPatternRecipeInput): void {
  if (input.entryCentersMm.length < 2 || input.entryCentersMm.length > 128) throw new Error("Hex nut pocket pattern requires between 2 and 128 entry centers");
  validateHexNutPocketGeometry(input);
  for (const center of input.entryCentersMm) {
    if (center.some((value) => !Number.isFinite(value))) throw new Error("Hex nut pocket pattern centers must contain finite values");
  }
  for (let first = 0; first < input.entryCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.entryCentersMm.length; second += 1) {
      if (Math.hypot(...subtract(input.entryCentersMm[first]!, input.entryCentersMm[second]!)) <= 1e-9) {
        throw new Error(`Hex nut pocket pattern centers must be distinct: ${first} and ${second}`);
      }
    }
  }
}

export function validateHexNutPocketGeometry(input: Omit<HexNutPocketRecipeInput, "entryCenterMm">): void {
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) throw new Error("Hex nut pocket target ID must be a positive integer");
  for (const [name, value] of [["across-flats size", input.acrossFlatsMm], ["depth", input.pocketDepthMm], ["material depth", input.materialDepthMm]] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Hex nut pocket ${name} must be positive`);
  }
  if (input.pocketDepthMm >= input.materialDepthMm) throw new Error("Hex nut pocket depth must be less than material depth");
  if (!Number.isFinite(input.overshootMm) || input.overshootMm < 0) throw new Error("Hex nut pocket overshoot must be nonnegative");
  const axis = normalize(input.axis);
  const flatNormal = normalize(input.flatNormalDirection);
  if (Math.abs(dot(axis, flatNormal)) > 1e-6) {
    throw new Error("Hex nut pocket flat normal direction must be perpendicular to its cutting axis");
  }
}

export function validateSlottedHole(input: SlottedHoleRecipeInput): void {
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) throw new Error("Slotted hole target ID must be a positive integer");
  if (input.entryCenterMm.some((value) => !Number.isFinite(value))) throw new Error("Slotted hole entry center must contain finite values");
  for (const [name, value] of [
    ["overall length", input.overallLengthMm],
    ["width", input.widthMm],
    ["through depth", input.throughDepthMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Slotted hole ${name} must be positive`);
  }
  if (input.overallLengthMm <= input.widthMm) throw new Error("Slotted hole overall length must be greater than width");
  if (!Number.isFinite(input.overshootMm) || input.overshootMm < 0) throw new Error("Slotted hole overshoot must be nonnegative");
  const axis = normalize(input.axis);
  const slotDirection = normalize(input.slotDirection);
  if (Math.abs(dot(axis, slotDirection)) > 1e-6) {
    throw new Error("Slotted hole direction must be perpendicular to its cutting axis");
  }
}

export function validateSlottedHolePattern(input: SlottedHolePatternRecipeInput): void {
  if (input.entryCentersMm.length < 2 || input.entryCentersMm.length > 64) throw new Error("Slotted hole pattern requires between 2 and 64 entry centers");
  validateSlottedHole({ ...input, entryCenterMm: input.entryCentersMm[0]! });
  for (const center of input.entryCentersMm) {
    if (center.some((value) => !Number.isFinite(value))) throw new Error("Slotted hole pattern centers must contain finite values");
  }
  for (let first = 0; first < input.entryCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.entryCentersMm.length; second += 1) {
      if (Math.hypot(...subtract(input.entryCentersMm[first]!, input.entryCentersMm[second]!)) <= 1e-9) {
        throw new Error(`Slotted hole pattern centers must be distinct: ${first} and ${second}`);
      }
    }
  }
}

export function validateCounterbore(input: CounterboreRecipeInput): void {
  validateCounterboreGeometry(input);
  if (input.entryCenterMm.some((value) => !Number.isFinite(value))) throw new Error("Counterbore entry center must contain finite values");
}

export function validateCounterboreGeometry(input: Omit<CounterboreRecipeInput, "entryCenterMm">): void {
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) throw new Error("Counterbore target ID must be a positive integer");
  for (const [name, value] of [
    ["through diameter", input.throughDiameterMm],
    ["counterbore diameter", input.counterboreDiameterMm],
    ["counterbore depth", input.counterboreDepthMm],
    ["through depth", input.throughDepthMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Counterbore ${name} must be positive`);
  }
  if (!Number.isFinite(input.overshootMm) || input.overshootMm < 0) throw new Error("Counterbore overshoot must be nonnegative");
  if (input.counterboreDiameterMm <= input.throughDiameterMm) {
    throw new Error("Counterbore diameter must be greater than through diameter");
  }
  if (input.counterboreDepthMm >= input.throughDepthMm) {
    throw new Error("Counterbore depth must be less than through depth");
  }
  normalize(input.axis);
}

export function validateCounterborePattern(input: CounterborePatternRecipeInput): void {
  if (input.entryCentersMm.length < 2 || input.entryCentersMm.length > 128) throw new Error("Counterbore pattern requires between 2 and 128 entry centers");
  validateCounterboreGeometry(input);
  for (const center of input.entryCentersMm) {
    if (center.some((value) => !Number.isFinite(value))) throw new Error("Counterbore pattern centers must contain finite values");
  }
  for (let first = 0; first < input.entryCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.entryCentersMm.length; second += 1) {
      if (Math.hypot(...subtract(input.entryCentersMm[first]!, input.entryCentersMm[second]!)) <= 1e-9) {
        throw new Error(`Counterbore pattern centers must be distinct: ${first} and ${second}`);
      }
    }
  }
}

export function validateThroughHole(input: ThroughHoleRecipeInput): void {
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) throw new Error("Through-hole target ID must be a positive integer");
  if (input.entryCenterMm.some((value) => !Number.isFinite(value))) throw new Error("Through-hole entry center must contain finite values");
  for (const [name, value] of [
    ["diameter", input.holeDiameterMm],
    ["through depth", input.throughDepthMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Through-hole ${name} must be positive`);
  }
  if (!Number.isFinite(input.overshootMm) || input.overshootMm < 0) throw new Error("Through-hole overshoot must be nonnegative");
  normalize(input.axis);
}

export function validateThroughHolePattern(input: ThroughHolePatternRecipeInput): void {
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) throw new Error("Through-hole pattern target ID must be a positive integer");
  if (input.entryCentersMm.length < 2 || input.entryCentersMm.length > 256) throw new Error("Through-hole pattern requires between 2 and 256 entry centers");
  for (const center of input.entryCentersMm) {
    if (center.some((value) => !Number.isFinite(value))) throw new Error("Through-hole pattern centers must contain finite values");
  }
  for (let first = 0; first < input.entryCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.entryCentersMm.length; second += 1) {
      if (Math.hypot(...subtract(input.entryCentersMm[first]!, input.entryCentersMm[second]!)) <= 1e-9) {
        throw new Error(`Through-hole pattern centers must be distinct: ${first} and ${second}`);
      }
    }
  }
  for (const [name, value] of [["diameter", input.holeDiameterMm], ["through depth", input.throughDepthMm]] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Through-hole pattern ${name} must be positive`);
  }
  if (!Number.isFinite(input.overshootMm) || input.overshootMm < 0) throw new Error("Through-hole pattern overshoot must be nonnegative");
  normalize(input.axis);
}

export function validateBlindHole(input: BlindHoleRecipeInput): void {
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) throw new Error("Blind-hole target ID must be a positive integer");
  if (input.entryCenterMm.some((value) => !Number.isFinite(value))) throw new Error("Blind-hole entry center must contain finite values");
  for (const [name, value] of [
    ["diameter", input.holeDiameterMm],
    ["depth", input.holeDepthMm],
    ["material depth", input.materialDepthMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Blind-hole ${name} must be positive`);
  }
  if (input.holeDepthMm >= input.materialDepthMm) throw new Error("Blind-hole depth must be less than material depth");
  if (!Number.isFinite(input.overshootMm) || input.overshootMm < 0) throw new Error("Blind-hole overshoot must be nonnegative");
  normalize(input.axis);
}

export function validateBlindHolePattern(input: BlindHolePatternRecipeInput): void {
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) throw new Error("Blind-hole pattern target ID must be a positive integer");
  if (input.entryCentersMm.length < 2 || input.entryCentersMm.length > 256) throw new Error("Blind-hole pattern requires between 2 and 256 entry centers");
  for (const center of input.entryCentersMm) {
    if (center.some((value) => !Number.isFinite(value))) throw new Error("Blind-hole pattern centers must contain finite values");
  }
  for (let first = 0; first < input.entryCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.entryCentersMm.length; second += 1) {
      if (Math.hypot(...subtract(input.entryCentersMm[first]!, input.entryCentersMm[second]!)) <= 1e-9) {
        throw new Error(`Blind-hole pattern centers must be distinct: ${first} and ${second}`);
      }
    }
  }
  for (const [name, value] of [
    ["diameter", input.holeDiameterMm],
    ["depth", input.holeDepthMm],
    ["material depth", input.materialDepthMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Blind-hole pattern ${name} must be positive`);
  }
  if (input.holeDepthMm >= input.materialDepthMm) throw new Error("Blind-hole pattern depth must be less than material depth");
  if (!Number.isFinite(input.overshootMm) || input.overshootMm < 0) throw new Error("Blind-hole pattern overshoot must be nonnegative");
  normalize(input.axis);
}

export function validateHeatSetInsertPocket(input: HeatSetInsertPocketRecipeInput): void {
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) throw new Error("Heat-set insert pocket target ID must be a positive integer");
  for (const [name, value] of [
    ["pilot diameter", input.pilotDiameterMm],
    ["pilot depth", input.pilotDepthMm],
    ["insert diameter", input.insertDiameterMm],
    ["insert depth", input.insertDepthMm],
    ["lead-in diameter", input.leadInDiameterMm],
    ["lead-in depth", input.leadInDepthMm],
    ["material depth", input.materialDepthMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Heat-set insert pocket ${name} must be positive`);
  }
  if (!Number.isFinite(input.overshootMm) || input.overshootMm < 0) throw new Error("Heat-set insert pocket overshoot must be nonnegative");
  if (input.pilotDiameterMm >= input.insertDiameterMm) {
    throw new Error("Heat-set insert pocket pilot diameter must be less than insert diameter");
  }
  if (input.insertDiameterMm >= input.leadInDiameterMm) {
    throw new Error("Heat-set insert pocket insert diameter must be less than lead-in diameter");
  }
  if (input.leadInDepthMm >= input.insertDepthMm) {
    throw new Error("Heat-set insert pocket lead-in depth must be less than insert depth");
  }
  if (input.insertDepthMm >= input.pilotDepthMm) {
    throw new Error("Heat-set insert pocket insert depth must be less than pilot depth");
  }
  if (input.pilotDepthMm >= input.materialDepthMm) {
    throw new Error("Heat-set insert pocket pilot depth must be less than material depth");
  }
  normalize(input.axis);
}

export function validateHeatSetInsertPocketPattern(input: HeatSetInsertPocketPatternRecipeInput): void {
  if (input.entryCentersMm.length < 2 || input.entryCentersMm.length > 64) throw new Error("Heat-set insert pocket pattern requires between 2 and 64 entry centers");
  validateHeatSetInsertPocket({ ...input, entryCenterMm: input.entryCentersMm[0]! });
  for (const center of input.entryCentersMm) {
    if (center.some((value) => !Number.isFinite(value))) throw new Error("Heat-set insert pocket pattern centers must contain finite values");
  }
  for (let first = 0; first < input.entryCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.entryCentersMm.length; second += 1) {
      if (Math.hypot(...subtract(input.entryCentersMm[first]!, input.entryCentersMm[second]!)) <= 1e-9) {
        throw new Error(`Heat-set insert pocket pattern centers must be distinct: ${first} and ${second}`);
      }
    }
  }
}

export function validateScrewBoss(input: ScrewBossRecipeInput): void {
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) throw new Error("Screw boss target ID must be a positive integer");
  for (const [name, value] of [
    ["outer diameter", input.outerDiameterMm],
    ["height", input.heightMm],
    ["hole diameter", input.holeDiameterMm],
    ["hole depth", input.holeDepthMm],
    ["base overlap", input.baseOverlapMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Screw boss ${name} must be positive`);
  }
  if (!Number.isFinite(input.cutterOvershootMm) || input.cutterOvershootMm < 0) {
    throw new Error("Screw boss cutter overshoot must be nonnegative");
  }
  if (input.holeDiameterMm >= input.outerDiameterMm) {
    throw new Error("Screw boss hole diameter must be less than outer diameter");
  }
  if (input.holeDepthMm > input.heightMm) {
    throw new Error("Screw boss hole depth must not exceed boss height");
  }
  normalize(input.axis);
}

export function validateScrewBossPattern(input: ScrewBossPatternRecipeInput): void {
  if (input.baseCentersMm.length < 2 || input.baseCentersMm.length > 64) throw new Error("Screw boss pattern requires between 2 and 64 base centers");
  validateScrewBoss({ ...input, baseCenterMm: input.baseCentersMm[0]! });
  for (const center of input.baseCentersMm) {
    if (center.some((value) => !Number.isFinite(value))) throw new Error("Screw boss pattern centers must contain finite values");
  }
  for (let first = 0; first < input.baseCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.baseCentersMm.length; second += 1) {
      if (Math.hypot(...subtract(input.baseCentersMm[first]!, input.baseCentersMm[second]!)) <= 1e-9) {
        throw new Error(`Screw boss pattern centers must be distinct: ${first} and ${second}`);
      }
    }
  }
}

export function validateRib(input: RibRecipeInput): void {
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) throw new Error("Rib target ID must be a positive integer");
  if (!Number.isFinite(input.thicknessMm) || input.thicknessMm === 0) throw new Error("Rib thickness must be nonzero");
  if (input.profilePointsMm.length < 3) throw new Error("Rib profile requires at least three points");
  if (input.profilePointsMm.some((point) => point.some((value) => !Number.isFinite(value)))) {
    throw new Error("Rib profile points must contain finite values");
  }
  const origin = input.profilePointsMm[0]!;
  let normal: Vector3 | undefined;
  for (let first = 1; first < input.profilePointsMm.length - 1 && !normal; first += 1) {
    for (let second = first + 1; second < input.profilePointsMm.length && !normal; second += 1) {
      const candidate = cross(subtract(input.profilePointsMm[first]!, origin), subtract(input.profilePointsMm[second]!, origin));
      if (Math.hypot(...candidate) > 1e-9) normal = normalize(candidate);
    }
  }
  if (!normal) throw new Error("Rib profile points must define a non-collinear plane");
  const coplanarityToleranceMm = 1e-6;
  for (const point of input.profilePointsMm) {
    const distance = Math.abs(dot(subtract(point, origin), normal));
    if (distance > coplanarityToleranceMm) throw new Error("Rib profile points must be coplanar");
  }
}

export function validateRoundVentArray(input: RoundVentArrayRecipeInput): void {
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) throw new Error("Round vent array target ID must be a positive integer");
  for (const [name, value] of [
    ["hole diameter", input.holeDiameterMm],
    ["through depth", input.throughDepthMm],
    ["direction 1 spacing", input.spacing1Mm],
    ["direction 2 spacing", input.spacing2Mm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Round vent array ${name} must be positive`);
  }
  for (const [name, count] of [["count 1", input.count1], ["count 2", input.count2]] as const) {
    if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error(`Round vent array ${name} must be an integer from 1 to 20`);
  }
  if (!Number.isFinite(input.overshootMm) || input.overshootMm < 0) throw new Error("Round vent array overshoot must be nonnegative");
  const axis = normalize(input.axis);
  const direction1 = normalize(input.direction1);
  const direction2 = normalize(input.direction2);
  if (Math.abs(dot(axis, direction1)) > 1e-6 || Math.abs(dot(axis, direction2)) > 1e-6) {
    throw new Error("Round vent array directions must lie in the entry plane perpendicular to the hole axis");
  }
  if (input.count1 > 1 && input.spacing1Mm <= input.holeDiameterMm) {
    throw new Error("Round vent array direction 1 spacing must exceed the hole diameter");
  }
  if (input.count2 > 1 && input.spacing2Mm <= input.holeDiameterMm) {
    throw new Error("Round vent array direction 2 spacing must exceed the hole diameter");
  }
  if (input.count2 > 1 && Math.abs(dot(direction1, direction2)) > 1 - 1e-9) {
    throw new Error("Round vent array pattern directions must not be parallel when direction 2 is active");
  }
}

export function validateCantileverSnapFit(input: CantileverSnapFitRecipeInput): void {
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) throw new Error("Cantilever snap-fit target ID must be a positive integer");
  for (const [name, value] of [
    ["length", input.lengthMm],
    ["width", input.widthMm],
    ["thickness", input.thicknessMm],
    ["hook length", input.hookLengthMm],
    ["hook height", input.hookHeightMm],
    ["base overlap", input.baseOverlapMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Cantilever snap-fit ${name} must be positive`);
  }
  if (input.hookLengthMm >= input.lengthMm) throw new Error("Cantilever snap-fit hook length must be less than beam length");
  const beam = normalize(input.beamDirection);
  const thickness = normalize(input.thicknessDirection);
  if (Math.abs(dot(beam, thickness)) > 1e-6) {
    throw new Error("Cantilever snap-fit beam and thickness directions must be perpendicular");
  }
}

export function validateHingeBarrel(input: HingeBarrelRecipeInput): void {
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) throw new Error("Hinge barrel target ID must be a positive integer");
  for (const [name, value] of [
    ["length", input.lengthMm],
    ["outer diameter", input.outerDiameterMm],
    ["pin bore diameter", input.pinBoreDiameterMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Hinge barrel ${name} must be positive`);
  }
  if (!Number.isFinite(input.cutterOvershootMm) || input.cutterOvershootMm < 0) {
    throw new Error("Hinge barrel cutter overshoot must be nonnegative");
  }
  if (input.pinBoreDiameterMm >= input.outerDiameterMm) {
    throw new Error("Hinge barrel pin bore diameter must be less than outer diameter");
  }
  normalize(input.axis);
}

export function validateCableChannel(input: CableChannelRecipeInput): void {
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) throw new Error("Cable channel target ID must be a positive integer");
  if (!Number.isFinite(input.channelDiameterMm) || input.channelDiameterMm <= 0) throw new Error("Cable channel diameter must be positive");
  if (input.spineIds.length === 0) throw new Error("Cable channel requires at least one spine");
  if (input.spineIds.some((id) => !Number.isInteger(id) || id <= 0)) throw new Error("Cable channel spine IDs must be positive integers");
  if (new Set(input.spineIds).size !== input.spineIds.length) throw new Error("Cable channel spine IDs must be unique");
  if (input.spineIds.includes(input.targetId)) throw new Error("Cable channel target must not also be a spine");
}

export function validateConnectorOpening(input: ConnectorOpeningRecipeInput): void {
  if (!Number.isInteger(input.targetId) || input.targetId <= 0) throw new Error("Connector opening target ID must be a positive integer");
  if (input.entryCenterMm.some((value) => !Number.isFinite(value))) throw new Error("Connector opening entry center must contain finite values");
  for (const [name, value] of [
    ["width", input.widthMm],
    ["height", input.heightMm],
    ["through depth", input.throughDepthMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Connector opening ${name} must be positive`);
  }
  if (!Number.isFinite(input.cornerRadiusMm) || input.cornerRadiusMm < 0) throw new Error("Connector opening corner radius must be nonnegative");
  if (!Number.isFinite(input.overshootMm) || input.overshootMm < 0) throw new Error("Connector opening overshoot must be nonnegative");
  if (input.cornerRadiusMm >= Math.min(input.widthMm, input.heightMm) / 2) {
    throw new Error("Connector opening corner radius must be less than half its width and height");
  }
  const axis = normalize(input.axis);
  const widthDirection = normalize(input.widthDirection);
  if (Math.abs(dot(axis, widthDirection)) > 1e-6) {
    throw new Error("Connector opening width direction must be perpendicular to its cutting axis");
  }
}

export function validateMatingEnclosureJoint(input: MatingEnclosureJointRecipeInput): void {
  if (!Number.isInteger(input.maleTargetId) || input.maleTargetId <= 0) throw new Error("Mating enclosure male target ID must be a positive integer");
  if (!Number.isInteger(input.femaleTargetId) || input.femaleTargetId <= 0) throw new Error("Mating enclosure female target ID must be a positive integer");
  if (input.maleTargetId === input.femaleTargetId) throw new Error("Mating enclosure halves must be different Solid bodies");
  if (input.seamOriginMm.some((value) => !Number.isFinite(value))) throw new Error("Mating enclosure seam origin must contain finite values");
  for (const [name, value] of [
    ["outer width", input.outerWidthMm],
    ["outer depth", input.outerDepthMm],
    ["wall thickness", input.wallThicknessMm],
    ["lip thickness", input.lipThicknessMm],
    ["lip height", input.lipHeightMm],
    ["overlap", input.overlapMm],
    ["cutter overshoot", input.cutterOvershootMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Mating enclosure ${name} must be positive`);
  }
  if (!Number.isFinite(input.clearanceMm) || input.clearanceMm < 0) throw new Error("Mating enclosure clearance must be nonnegative");
  if (input.wallThicknessMm <= input.overlapMm + input.clearanceMm) {
    throw new Error("Mating enclosure wall thickness must exceed overlap plus clearance");
  }
  const requiredInset = input.wallThicknessMm + input.lipThicknessMm + input.clearanceMm;
  if (input.outerWidthMm <= requiredInset * 2 || input.outerDepthMm <= requiredInset * 2) {
    throw new Error("Mating enclosure outer dimensions are too small for the wall, lip, and clearance");
  }
}

export function validateLocatingPinPair(input: LocatingPinPairRecipeInput): void {
  if (!Number.isInteger(input.maleTargetId) || input.maleTargetId <= 0) throw new Error("Locating pin male target ID must be a positive integer");
  if (!Number.isInteger(input.femaleTargetId) || input.femaleTargetId <= 0) throw new Error("Locating pin female target ID must be a positive integer");
  if (input.maleTargetId === input.femaleTargetId) throw new Error("Locating pin halves must be different Solid bodies");
  if (input.baseCenterMm.some((value) => !Number.isFinite(value))) throw new Error("Locating pin base center must contain finite values");
  for (const [name, value] of [
    ["diameter", input.pinDiameterMm],
    ["height", input.pinHeightMm],
    ["base overlap", input.baseOverlapMm],
    ["cutter overshoot", input.cutterOvershootMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Locating pin ${name} must be positive`);
  }
  if (!Number.isFinite(input.radialClearanceMm) || input.radialClearanceMm < 0) throw new Error("Locating pin radial clearance must be nonnegative");
  if (!Number.isFinite(input.axialClearanceMm) || input.axialClearanceMm < 0) throw new Error("Locating pin axial clearance must be nonnegative");
  normalize(input.axis);
}

export function validateLocatingPinPairPattern(input: LocatingPinPairPatternRecipeInput): void {
  if (input.baseCentersMm.length < 2 || input.baseCentersMm.length > 64) throw new Error("Locating pin pattern requires 2-64 base centers");
  validateLocatingPinPair({ ...input, baseCenterMm: input.baseCentersMm[0] ?? [Number.NaN, Number.NaN, Number.NaN] });
  for (const [index, center] of input.baseCentersMm.entries()) {
    if (center.some((value) => !Number.isFinite(value))) throw new Error(`Locating pin base center ${index} must contain finite values`);
    for (let previous = 0; previous < index; previous += 1) {
      const priorCenter = input.baseCentersMm[previous]!;
      if (Math.hypot(...center.map((value, axisIndex) => value - priorCenter[axisIndex]!)) <= 1e-9) {
        throw new Error(`Locating pin base centers must be distinct; index ${index} duplicates index ${previous}`);
      }
    }
  }
}

export function validateSplitScrewInsertJoint(input: SplitScrewInsertJointRecipeInput): void {
  if (!Number.isInteger(input.maleTargetId) || input.maleTargetId <= 0) throw new Error("Split screw male target ID must be a positive integer");
  if (!Number.isInteger(input.femaleTargetId) || input.femaleTargetId <= 0) throw new Error("Split screw female target ID must be a positive integer");
  if (input.maleTargetId === input.femaleTargetId) throw new Error("Split screw halves must be different Solid bodies");
  if (input.screwEntryCentersMm.length < 1 || input.screwEntryCentersMm.length > 64) throw new Error("Split screw-and-insert joint requires 1-64 matched stations");
  if (input.screwEntryCentersMm.length !== input.insertEntryCentersMm.length) throw new Error("Split screw and insert center counts must match");
  if (!input.fastenerDesignation.trim()) throw new Error("Split screw-and-insert joint requires a resolved fastener designation");
  if (!input.insertPartNumber.trim()) throw new Error("Split screw-and-insert joint requires the exact insert part number");
  let insertSource: URL;
  try {
    insertSource = new URL(input.insertSourceUrl);
  } catch {
    throw new Error("Split screw-and-insert joint requires a manufacturer or qualified insert source URL");
  }
  if (insertSource.protocol !== "https:") throw new Error("Insert source URL must use HTTPS");

  for (const [name, value] of [
    ["screw length", input.screwLengthMm],
    ["minimum engagement", input.minimumEngagementMm],
    ["maximum engagement", input.maximumEngagementMm],
    ["insert thread nominal diameter", input.insertThreadNominalDiameterMm],
    ["insert thread pitch", input.insertThreadPitchMm],
    ["hole diameter", input.holeDiameterMm],
    ["male through depth", input.maleThroughDepthMm],
    ["pilot diameter", input.pilotDiameterMm],
    ["pilot depth", input.pilotDepthMm],
    ["insert diameter", input.insertDiameterMm],
    ["insert depth", input.insertDepthMm],
    ["lead-in diameter", input.leadInDiameterMm],
    ["lead-in depth", input.leadInDepthMm],
    ["female material depth", input.femaleMaterialDepthMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Split screw ${name} must be positive`);
  }
  for (const [name, value] of [["hole overshoot", input.holeOvershootMm], ["insert overshoot", input.insertOvershootMm]] as const) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Split screw ${name} must be nonnegative`);
  }
  if (input.minimumEngagementMm > input.maximumEngagementMm) throw new Error("Minimum screw engagement must not exceed maximum engagement");
  const screwEngagementMm = input.screwLengthMm - input.maleThroughDepthMm;
  if (screwEngagementMm < input.minimumEngagementMm - 1e-9 || screwEngagementMm > input.maximumEngagementMm + 1e-9) {
    throw new Error(`Resolved screw length provides ${screwEngagementMm} mm engagement, outside the explicit ${input.minimumEngagementMm}-${input.maximumEngagementMm} mm insert range`);
  }
  if (input.maximumEngagementMm > input.insertDepthMm - input.leadInDepthMm + 1e-9) {
    throw new Error("Maximum screw engagement exceeds the insert pocket depth after its lead-in");
  }

  const axis = normalize(input.axis);
  validateThroughHole({
    targetId: input.maleTargetId,
    entryCenterMm: input.screwEntryCentersMm[0]!,
    axis,
    holeDiameterMm: input.holeDiameterMm,
    throughDepthMm: input.maleThroughDepthMm,
    overshootMm: input.holeOvershootMm,
    revision: input.revision,
  });
  validateHeatSetInsertPocket({
    targetId: input.femaleTargetId,
    entryCenterMm: input.insertEntryCentersMm[0]!,
    axis,
    pilotDiameterMm: input.pilotDiameterMm,
    pilotDepthMm: input.pilotDepthMm,
    insertDiameterMm: input.insertDiameterMm,
    insertDepthMm: input.insertDepthMm,
    leadInDiameterMm: input.leadInDiameterMm,
    leadInDepthMm: input.leadInDepthMm,
    materialDepthMm: input.femaleMaterialDepthMm,
    overshootMm: input.insertOvershootMm,
    revision: input.revision,
  });

  for (let index = 0; index < input.screwEntryCentersMm.length; index += 1) {
    const screwCenter = input.screwEntryCentersMm[index]!;
    const insertCenter = input.insertEntryCentersMm[index]!;
    const delta = subtract(insertCenter, screwCenter);
    const axialDistance = dot(delta, axis);
    const lateralDistance = Math.hypot(...subtract(delta, scale(axis, axialDistance)));
    if (axialDistance <= 0 || lateralDistance > 0.01 || Math.abs(axialDistance - input.maleThroughDepthMm) > 0.01) {
      throw new Error(`Split screw and insert centers must be coaxial and separated by the measured male through-depth within 0.01 mm (station ${index})`);
    }
    if (screwCenter.some((value) => !Number.isFinite(value)) || insertCenter.some((value) => !Number.isFinite(value))) {
      throw new Error(`Split screw-and-insert station ${index} must contain finite coordinates`);
    }
    for (let previous = 0; previous < index; previous += 1) {
      if (Math.hypot(...subtract(screwCenter, input.screwEntryCentersMm[previous]!)) <= 1e-9
        || Math.hypot(...subtract(insertCenter, input.insertEntryCentersMm[previous]!)) <= 1e-9) {
        throw new Error(`Split screw-and-insert centers must be distinct; station ${index} duplicates station ${previous}`);
      }
    }
  }
}

export function validateTongueGrooveJoint(input: TongueGrooveJointRecipeInput): void {
  if (!Number.isInteger(input.tongueTargetId) || input.tongueTargetId <= 0) throw new Error("Tongue target ID must be a positive integer");
  if (!Number.isInteger(input.grooveTargetId) || input.grooveTargetId <= 0) throw new Error("Groove target ID must be a positive integer");
  if (input.tongueTargetId === input.grooveTargetId) throw new Error("Tongue and groove targets must be different Solid bodies");
  if (input.baseCenterMm.some((value) => !Number.isFinite(value))) throw new Error("Tongue and groove base center must contain finite values");
  for (const [name, value] of [
    ["tongue width", input.tongueWidthMm],
    ["tongue thickness", input.tongueThicknessMm],
    ["tongue height", input.tongueHeightMm],
    ["base overlap", input.baseOverlapMm],
    ["cutter overshoot", input.cutterOvershootMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Tongue and groove ${name} must be positive`);
  }
  if (!Number.isFinite(input.radialClearanceMm) || input.radialClearanceMm < 0) throw new Error("Tongue and groove radial clearance must be nonnegative");
  if (!Number.isFinite(input.axialClearanceMm) || input.axialClearanceMm < 0) throw new Error("Tongue and groove axial clearance must be nonnegative");
  const axis = normalize(input.axis);
  const widthDirection = normalize(input.widthDirection);
  if (Math.abs(dot(axis, widthDirection)) > 1e-6) throw new Error("Tongue and groove width direction must be perpendicular to the mating axis");
}

export function validateDovetailJoint(input: DovetailJointRecipeInput): void {
  if (!Number.isInteger(input.maleTargetId) || input.maleTargetId <= 0) throw new Error("Dovetail male target ID must be a positive integer");
  if (!Number.isInteger(input.femaleTargetId) || input.femaleTargetId <= 0) throw new Error("Dovetail female target ID must be a positive integer");
  if (input.maleTargetId === input.femaleTargetId) throw new Error("Dovetail halves must be different Solid bodies");
  if (input.baseCenterMm.some((value) => !Number.isFinite(value))) throw new Error("Dovetail base center must contain finite values");
  for (const [name, value] of [
    ["root width", input.rootWidthMm],
    ["flare", input.flareMm],
    ["tongue thickness", input.tongueThicknessMm],
    ["tongue height", input.tongueHeightMm],
    ["base overlap", input.baseOverlapMm],
    ["cutter overshoot", input.cutterOvershootMm],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Dovetail ${name} must be positive`);
  }
  if (!Number.isFinite(input.radialClearanceMm) || input.radialClearanceMm < 0) throw new Error("Dovetail radial clearance must be nonnegative");
  if (!Number.isFinite(input.axialClearanceMm) || input.axialClearanceMm < 0) throw new Error("Dovetail axial clearance must be nonnegative");
  const axis = normalize(input.axis);
  const widthDirection = normalize(input.widthDirection);
  if (Math.abs(dot(axis, widthDirection)) > 1e-6) throw new Error("Dovetail width direction must be perpendicular to the mating axis");
}

export function requireCurrentSolid(state: RuntimeState, targetId: number, revision: string, operation: string): void {
  if (state.revision !== revision) {
    throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
  }
  const target = state.bodies.find((body) => body.id === targetId);
  if (!target) throw new Error(`Unknown target body ID: ${targetId}`);
  if (target.type !== "Solid") throw new Error(`${operation} target must be a Solid: ${targetId}`);
}

export function requireSingleAddedBody(before: RuntimeState, after: RuntimeState, label: string, type = "Solid"): number {
  requireSameDocument(before, after);
  const beforeIds = new Set(before.bodies.map((body) => body.id));
  const added = after.bodies.filter((body) => !beforeIds.has(body.id));
  if (added.length !== 1 || added[0]!.type !== type) {
    throw new Error(`Expected one ${type} ${label}, found ${added.length}`);
  }
  return added[0]!.id;
}

export function addedBodyIds(before: RuntimeState, after: RuntimeState, type: string): number[] {
  requireSameDocument(before, after);
  const beforeIds = new Set(before.bodies.map((body) => body.id));
  return after.bodies.filter((body) => !beforeIds.has(body.id) && body.type === type).map((body) => body.id).sort((left, right) => left - right);
}

export function requireRecipeResult(initial: RuntimeState, after: RuntimeState, targetId: number, cutterIds: number[]): number[] {
  requireSameDocument(initial, after);
  const remainingIds = new Set(after.bodies.map((body) => body.id));
  const unmodifiedContextIds = initial.bodies.filter((body) => body.id !== targetId).map((body) => body.id);
  const missingContext = unmodifiedContextIds.filter((id) => !remainingIds.has(id));
  if (missingContext.length > 0) throw new Error(`Recipe changed unrelated bodies: ${missingContext.join(", ")}`);
  const remainingCutters = cutterIds.filter((id) => remainingIds.has(id));
  if (remainingCutters.length > 0) throw new Error(`Recipe cutters were not consumed: ${remainingCutters.join(", ")}`);
  const context = new Set(unmodifiedContextIds);
  const results = after.bodies.filter((body) => !context.has(body.id) && body.type === "Solid").map((body) => body.id);
  if (results.length !== 1) throw new Error(`Expected one Solid recipe result, found ${results.length}`);
  return results;
}

export function requireSolid(state: RuntimeState, id: number, label: string): void {
  if (state.bodies.find((body) => body.id === id)?.type !== "Solid") throw new Error(`${label} is not a current Solid: ${id}`);
}

export function requireAbsent(state: RuntimeState, ids: number[], label: string): void {
  const remaining = ids.filter((id) => state.bodies.some((body) => body.id === id));
  if (remaining.length > 0) throw new Error(`${label} was not consumed: ${remaining.join(", ")}`);
}

export function requirePairedSolidResult(
  initial: RuntimeState,
  after: RuntimeState,
  firstTargetId: number,
  secondTargetId: number,
  consumedToolIds: number[],
  label: string,
): number[] {
  requireSameDocument(initial, after);
  requireSolid(after, firstTargetId, `${label} first target`);
  requireSolid(after, secondTargetId, `${label} second target`);
  requireAbsent(after, consumedToolIds, `${label} temporary geometry`);
  const targetIds = new Set([firstTargetId, secondTargetId]);
  const remainingIds = new Set(after.bodies.map((body) => body.id));
  const missingContext = initial.bodies.filter((body) => !targetIds.has(body.id) && !remainingIds.has(body.id)).map((body) => body.id);
  if (missingContext.length > 0) throw new Error(`${label} recipe changed unrelated bodies: ${missingContext.join(", ")}`);
  return [firstTargetId, secondTargetId];
}

export function requireSameDocument(before: RuntimeState, after: RuntimeState): void {
  if (before.documentToken !== after.documentToken) throw new Error("Plasticity document changed during recipe execution");
}

export function step(operation: RecipeStep["operation"], before: RuntimeState, after: RuntimeState, affectedBodyIds: number[]): RecipeStep {
  requireSameDocument(before, after);
  return { operation, beforeRevision: before.revision, afterRevision: after.revision, affectedBodyIds };
}

export function rectanglePoints(center: Vector3, widthDirection: Vector3, heightDirection: Vector3, widthMm: number, heightMm: number): Vector3[] {
  const halfWidth = scale(widthDirection, widthMm / 2);
  const halfHeight = scale(heightDirection, heightMm / 2);
  return [
    subtract(subtract(center, halfWidth), halfHeight),
    subtract(add(center, halfWidth), halfHeight),
    add(add(center, halfWidth), halfHeight),
    add(subtract(center, halfWidth), halfHeight),
  ];
}

export function dovetailPoints(center: Vector3, widthDirection: Vector3, heightDirection: Vector3, rootWidthMm: number, flareMm: number, thicknessMm: number): Vector3[] {
  const rootHalf = scale(widthDirection, rootWidthMm / 2);
  const tipHalf = scale(widthDirection, rootWidthMm / 2 + flareMm);
  const halfThickness = scale(heightDirection, thicknessMm / 2);
  return [
    subtract(subtract(center, rootHalf), halfThickness),
    subtract(add(center, rootHalf), halfThickness),
    add(add(center, tipHalf), halfThickness),
    add(subtract(center, tipHalf), halfThickness),
  ];
}

export function selectProfileRegion(state: RuntimeState, profileBodyId: number, profilePointsMm: Vector3[], label: string): RuntimeState["regions"][number] {
  const candidates = state.regions.filter((region) => region.sketchWireIds.includes(profileBodyId));
  const expected = pointBounds(profilePointsMm);
  const matching = candidates.filter((region) => boundsNear(region.displayBoundsMm, expected, 0.05));
  if (matching.length !== 1) {
    throw new Error(`Expected one closed Region matching ${label} profile ${profileBodyId}, found ${matching.length} of ${candidates.length} candidates`);
  }
  return matching[0]!;
}

export function pointBounds(points: Vector3[]): { min: Vector3; max: Vector3 } {
  return {
    min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]!))) as Vector3,
    max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]!))) as Vector3,
  };
}

export function boundsNear(actual: { min: Vector3; max: Vector3 }, expected: { min: Vector3; max: Vector3 }, toleranceMm: number): boolean {
  return [0, 1, 2].every((axis) => Math.abs(actual.min[axis]! - expected.min[axis]!) <= toleranceMm
    && Math.abs(actual.max[axis]! - expected.max[axis]!) <= toleranceMm);
}

export function normalize(vector: Vector3): Vector3 {
  if (vector.some((value) => !Number.isFinite(value))) throw new Error("Recipe axis must contain finite values");
  const length = Math.hypot(...vector);
  if (!(length > 1e-9)) throw new Error("Recipe axis must be nonzero");
  return vector.map((value) => value / length) as Vector3;
}

export function scale(vector: Vector3, factor: number): Vector3 {
  return vector.map((value) => {
    const result = value * factor;
    return Object.is(result, -0) ? 0 : result;
  }) as Vector3;
}

export function subtract(left: Vector3, right: Vector3): Vector3 {
  return left.map((value, index) => value - right[index]!) as Vector3;
}

export function add(left: Vector3, right: Vector3): Vector3 {
  return left.map((value, index) => value + right[index]!) as Vector3;
}

export function dot(left: Vector3, right: Vector3): number {
  return left.reduce((sum, value, index) => sum + value * right[index]!, 0);
}

export function cross(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

import { z } from "zod";
import { vector, direction, intent, revision, nonzeroDistance, ids } from "./common.ts";

export const counterboreInputSchema = z.object({
  targetId: z.number().int().positive(),
  entryCenterMm: vector,
  axis: direction,
  throughDiameterMm: z.number().finite().positive(),
  counterboreDiameterMm: z.number().finite().positive(),
  counterboreDepthMm: z.number().finite().positive(),
  throughDepthMm: z.number().finite().positive(),
  overshootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.counterboreDiameterMm <= input.throughDiameterMm) {
    context.addIssue({ code: "custom", path: ["counterboreDiameterMm"], message: "Counterbore diameter must exceed through diameter" });
  }
  if (input.counterboreDepthMm >= input.throughDepthMm) {
    context.addIssue({ code: "custom", path: ["counterboreDepthMm"], message: "Counterbore depth must be less than through depth" });
  }
});
export const counterborePatternInputSchema = z.object({
  targetId: z.number().int().positive(),
  entryCentersMm: z.array(vector).min(2).max(128),
  axis: direction,
  throughDiameterMm: z.number().finite().positive(),
  counterboreDiameterMm: z.number().finite().positive(),
  counterboreDepthMm: z.number().finite().positive(),
  throughDepthMm: z.number().finite().positive(),
  overshootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.counterboreDiameterMm <= input.throughDiameterMm) {
    context.addIssue({ code: "custom", path: ["counterboreDiameterMm"], message: "Counterbore diameter must exceed through diameter" });
  }
  if (input.counterboreDepthMm >= input.throughDepthMm) {
    context.addIssue({ code: "custom", path: ["counterboreDepthMm"], message: "Counterbore depth must be less than through depth" });
  }
  for (let first = 0; first < input.entryCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.entryCentersMm.length; second += 1) {
      const distance = Math.hypot(...input.entryCentersMm[first]!.map((value, index) => value - input.entryCentersMm[second]![index]!));
      if (distance <= 1e-9) {
        context.addIssue({ code: "custom", path: ["entryCentersMm", second], message: `Entry center duplicates index ${first}` });
      }
    }
  }
});
export const throughHoleInputSchema = z.object({
  targetId: z.number().int().positive(),
  entryCenterMm: vector,
  axis: direction,
  holeDiameterMm: z.number().finite().positive(),
  throughDepthMm: z.number().finite().positive(),
  overshootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict();
export const throughHolePatternInputSchema = z.object({
  targetId: z.number().int().positive(),
  entryCentersMm: z.array(vector).min(2).max(256),
  axis: direction,
  holeDiameterMm: z.number().finite().positive(),
  throughDepthMm: z.number().finite().positive(),
  overshootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  for (let first = 0; first < input.entryCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.entryCentersMm.length; second += 1) {
      const distance = Math.hypot(...input.entryCentersMm[first]!.map((value, index) => value - input.entryCentersMm[second]![index]!));
      if (distance <= 1e-9) {
        context.addIssue({ code: "custom", path: ["entryCentersMm", second], message: `Entry center duplicates index ${first}` });
      }
    }
  }
});
export const blindHoleInputSchema = z.object({
  targetId: z.number().int().positive(),
  entryCenterMm: vector,
  axis: direction,
  holeDiameterMm: z.number().finite().positive(),
  holeDepthMm: z.number().finite().positive(),
  materialDepthMm: z.number().finite().positive(),
  overshootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.holeDepthMm >= input.materialDepthMm) {
    context.addIssue({ code: "custom", path: ["holeDepthMm"], message: "Blind-hole depth must be less than material depth" });
  }
});
export const blindHolePatternInputSchema = z.object({
  targetId: z.number().int().positive(),
  entryCentersMm: z.array(vector).min(2).max(256),
  axis: direction,
  holeDiameterMm: z.number().finite().positive(),
  holeDepthMm: z.number().finite().positive(),
  materialDepthMm: z.number().finite().positive(),
  overshootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.holeDepthMm >= input.materialDepthMm) {
    context.addIssue({ code: "custom", path: ["holeDepthMm"], message: "Blind-hole depth must be less than material depth" });
  }
  for (let first = 0; first < input.entryCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.entryCentersMm.length; second += 1) {
      const distance = Math.hypot(...input.entryCentersMm[first]!.map((value, index) => value - input.entryCentersMm[second]![index]!));
      if (distance <= 1e-9) {
        context.addIssue({ code: "custom", path: ["entryCentersMm", second], message: `Entry center duplicates index ${first}` });
      }
    }
  }
});
export const countersinkInputSchema = z.object({
  targetId: z.number().int().positive(),
  entryCenterMm: vector,
  axis: direction,
  radialDirection: direction,
  throughDiameterMm: z.number().finite().positive(),
  countersinkMajorDiameterMm: z.number().finite().positive(),
  includedAngleDeg: z.number().finite().gt(0).lt(180),
  throughDepthMm: z.number().finite().positive(),
  overshootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.countersinkMajorDiameterMm <= input.throughDiameterMm) {
    context.addIssue({ code: "custom", path: ["countersinkMajorDiameterMm"], message: "Countersink major diameter must exceed through diameter" });
  } else {
    const depth = (input.countersinkMajorDiameterMm - input.throughDiameterMm)
      / (2 * Math.tan(input.includedAngleDeg * Math.PI / 360));
    if (!(depth < input.throughDepthMm)) {
      context.addIssue({ code: "custom", path: ["throughDepthMm"], message: "Derived countersink depth must be less than through depth" });
    }
  }
  const dot = input.axis.reduce((sum, value, index) => sum + value * input.radialDirection[index]!, 0);
  const magnitude = Math.hypot(...input.axis) * Math.hypot(...input.radialDirection);
  if (Math.abs(dot) > magnitude * 1e-6) {
    context.addIssue({ code: "custom", path: ["radialDirection"], message: "Radial direction must be perpendicular to axis" });
  }
});
export const countersinkPatternInputSchema = z.object({
  targetId: z.number().int().positive(),
  entryCentersMm: z.array(vector).min(2).max(64),
  axis: direction,
  radialDirection: direction,
  throughDiameterMm: z.number().finite().positive(),
  countersinkMajorDiameterMm: z.number().finite().positive(),
  includedAngleDeg: z.number().finite().gt(0).lt(180),
  throughDepthMm: z.number().finite().positive(),
  overshootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.countersinkMajorDiameterMm <= input.throughDiameterMm) {
    context.addIssue({ code: "custom", path: ["countersinkMajorDiameterMm"], message: "Countersink major diameter must exceed through diameter" });
  } else {
    const depth = (input.countersinkMajorDiameterMm - input.throughDiameterMm)
      / (2 * Math.tan(input.includedAngleDeg * Math.PI / 360));
    if (!(depth < input.throughDepthMm)) {
      context.addIssue({ code: "custom", path: ["throughDepthMm"], message: "Derived countersink depth must be less than through depth" });
    }
  }
  const dot = input.axis.reduce((sum, value, index) => sum + value * input.radialDirection[index]!, 0);
  const magnitude = Math.hypot(...input.axis) * Math.hypot(...input.radialDirection);
  if (Math.abs(dot) > magnitude * 1e-6) {
    context.addIssue({ code: "custom", path: ["radialDirection"], message: "Radial direction must be perpendicular to axis" });
  }
  for (let first = 0; first < input.entryCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.entryCentersMm.length; second += 1) {
      const distance = Math.hypot(...input.entryCentersMm[first]!.map((value, index) => value - input.entryCentersMm[second]![index]!));
      if (distance <= 1e-9) {
        context.addIssue({ code: "custom", path: ["entryCentersMm", second], message: `Entry center duplicates index ${first}` });
      }
    }
  }
});
export const hexNutPocketInputSchema = z.object({
  targetId: z.number().int().positive(),
  entryCenterMm: vector,
  axis: direction,
  flatNormalDirection: direction,
  acrossFlatsMm: z.number().finite().positive(),
  pocketDepthMm: z.number().finite().positive(),
  materialDepthMm: z.number().finite().positive(),
  overshootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.pocketDepthMm >= input.materialDepthMm) {
    context.addIssue({ code: "custom", path: ["pocketDepthMm"], message: "Pocket depth must be less than material depth" });
  }
  const dot = input.axis.reduce((sum, value, index) => sum + value * input.flatNormalDirection[index]!, 0);
  const magnitude = Math.hypot(...input.axis) * Math.hypot(...input.flatNormalDirection);
  if (Math.abs(dot) > magnitude * 1e-6) {
    context.addIssue({ code: "custom", path: ["flatNormalDirection"], message: "Flat normal direction must be perpendicular to axis" });
  }
});
export const hexNutPocketPatternInputSchema = z.object({
  targetId: z.number().int().positive(),
  entryCentersMm: z.array(vector).min(2).max(128),
  axis: direction,
  flatNormalDirection: direction,
  acrossFlatsMm: z.number().finite().positive(),
  pocketDepthMm: z.number().finite().positive(),
  materialDepthMm: z.number().finite().positive(),
  overshootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.pocketDepthMm >= input.materialDepthMm) {
    context.addIssue({ code: "custom", path: ["pocketDepthMm"], message: "Pocket depth must be less than material depth" });
  }
  const dot = input.axis.reduce((sum, value, index) => sum + value * input.flatNormalDirection[index]!, 0);
  const magnitude = Math.hypot(...input.axis) * Math.hypot(...input.flatNormalDirection);
  if (Math.abs(dot) > magnitude * 1e-6) {
    context.addIssue({ code: "custom", path: ["flatNormalDirection"], message: "Flat normal direction must be perpendicular to axis" });
  }
  for (let first = 0; first < input.entryCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.entryCentersMm.length; second += 1) {
      const distance = Math.hypot(...input.entryCentersMm[first]!.map((value, index) => value - input.entryCentersMm[second]![index]!));
      if (distance <= 1e-9) {
        context.addIssue({ code: "custom", path: ["entryCentersMm", second], message: `Entry center duplicates index ${first}` });
      }
    }
  }
});
export const slottedHoleInputSchema = z.object({
  targetId: z.number().int().positive(),
  entryCenterMm: vector,
  axis: direction,
  slotDirection: direction,
  overallLengthMm: z.number().finite().positive(),
  widthMm: z.number().finite().positive(),
  throughDepthMm: z.number().finite().positive(),
  overshootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.overallLengthMm <= input.widthMm) {
    context.addIssue({ code: "custom", path: ["overallLengthMm"], message: "Slot overall length must exceed width" });
  }
  const dot = input.axis.reduce((sum, value, index) => sum + value * input.slotDirection[index]!, 0);
  const magnitude = Math.hypot(...input.axis) * Math.hypot(...input.slotDirection);
  if (Math.abs(dot) > magnitude * 1e-6) {
    context.addIssue({ code: "custom", path: ["slotDirection"], message: "Slot direction must be perpendicular to axis" });
  }
});
export const slottedHolePatternInputSchema = z.object({
  targetId: z.number().int().positive(),
  entryCentersMm: z.array(vector).min(2).max(64),
  axis: direction,
  slotDirection: direction,
  overallLengthMm: z.number().finite().positive(),
  widthMm: z.number().finite().positive(),
  throughDepthMm: z.number().finite().positive(),
  overshootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.overallLengthMm <= input.widthMm) {
    context.addIssue({ code: "custom", path: ["overallLengthMm"], message: "Slot overall length must exceed width" });
  }
  const dot = input.axis.reduce((sum, value, index) => sum + value * input.slotDirection[index]!, 0);
  const magnitude = Math.hypot(...input.axis) * Math.hypot(...input.slotDirection);
  if (Math.abs(dot) > magnitude * 1e-6) {
    context.addIssue({ code: "custom", path: ["slotDirection"], message: "Slot direction must be perpendicular to axis" });
  }
  for (let first = 0; first < input.entryCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.entryCentersMm.length; second += 1) {
      const distance = Math.hypot(...input.entryCentersMm[first]!.map((value, index) => value - input.entryCentersMm[second]![index]!));
      if (distance <= 1e-9) context.addIssue({ code: "custom", path: ["entryCentersMm", second], message: `Entry center duplicates index ${first}` });
    }
  }
});
export const heatSetInsertPocketInputSchema = z.object({
  targetId: z.number().int().positive(),
  entryCenterMm: vector,
  axis: direction,
  pilotDiameterMm: z.number().finite().positive(),
  pilotDepthMm: z.number().finite().positive(),
  insertDiameterMm: z.number().finite().positive(),
  insertDepthMm: z.number().finite().positive(),
  leadInDiameterMm: z.number().finite().positive(),
  leadInDepthMm: z.number().finite().positive(),
  materialDepthMm: z.number().finite().positive(),
  overshootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.pilotDiameterMm >= input.insertDiameterMm) {
    context.addIssue({ code: "custom", path: ["pilotDiameterMm"], message: "Pilot diameter must be less than insert diameter" });
  }
  if (input.insertDiameterMm >= input.leadInDiameterMm) {
    context.addIssue({ code: "custom", path: ["insertDiameterMm"], message: "Insert diameter must be less than lead-in diameter" });
  }
  if (input.leadInDepthMm >= input.insertDepthMm) {
    context.addIssue({ code: "custom", path: ["leadInDepthMm"], message: "Lead-in depth must be less than insert depth" });
  }
  if (input.insertDepthMm >= input.pilotDepthMm) {
    context.addIssue({ code: "custom", path: ["insertDepthMm"], message: "Insert depth must be less than pilot depth" });
  }
  if (input.pilotDepthMm >= input.materialDepthMm) {
    context.addIssue({ code: "custom", path: ["pilotDepthMm"], message: "Pilot depth must be less than material depth" });
  }
});
export const heatSetInsertPocketPatternInputSchema = z.object({
  targetId: z.number().int().positive(),
  entryCentersMm: z.array(vector).min(2).max(64),
  axis: direction,
  pilotDiameterMm: z.number().finite().positive(),
  pilotDepthMm: z.number().finite().positive(),
  insertDiameterMm: z.number().finite().positive(),
  insertDepthMm: z.number().finite().positive(),
  leadInDiameterMm: z.number().finite().positive(),
  leadInDepthMm: z.number().finite().positive(),
  materialDepthMm: z.number().finite().positive(),
  overshootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.pilotDiameterMm >= input.insertDiameterMm) context.addIssue({ code: "custom", path: ["pilotDiameterMm"], message: "Pilot diameter must be less than insert diameter" });
  if (input.insertDiameterMm >= input.leadInDiameterMm) context.addIssue({ code: "custom", path: ["insertDiameterMm"], message: "Insert diameter must be less than lead-in diameter" });
  if (input.leadInDepthMm >= input.insertDepthMm) context.addIssue({ code: "custom", path: ["leadInDepthMm"], message: "Lead-in depth must be less than insert depth" });
  if (input.insertDepthMm >= input.pilotDepthMm) context.addIssue({ code: "custom", path: ["insertDepthMm"], message: "Insert depth must be less than pilot depth" });
  if (input.pilotDepthMm >= input.materialDepthMm) context.addIssue({ code: "custom", path: ["pilotDepthMm"], message: "Pilot depth must be less than material depth" });
  for (let first = 0; first < input.entryCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.entryCentersMm.length; second += 1) {
      const distance = Math.hypot(...input.entryCentersMm[first]!.map((value, index) => value - input.entryCentersMm[second]![index]!));
      if (distance <= 1e-9) context.addIssue({ code: "custom", path: ["entryCentersMm", second], message: `Entry center duplicates index ${first}` });
    }
  }
});
export const screwBossInputSchema = z.object({
  targetId: z.number().int().positive(),
  baseCenterMm: vector,
  axis: direction,
  outerDiameterMm: z.number().finite().positive(),
  heightMm: z.number().finite().positive(),
  holeDiameterMm: z.number().finite().positive(),
  holeDepthMm: z.number().finite().positive(),
  baseOverlapMm: z.number().finite().positive().default(0.5),
  cutterOvershootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.holeDiameterMm >= input.outerDiameterMm) {
    context.addIssue({ code: "custom", path: ["holeDiameterMm"], message: "Hole diameter must be less than boss outer diameter" });
  }
  if (input.holeDepthMm > input.heightMm) {
    context.addIssue({ code: "custom", path: ["holeDepthMm"], message: "Hole depth must not exceed boss height" });
  }
});
export const screwBossPatternInputSchema = z.object({
  targetId: z.number().int().positive(),
  baseCentersMm: z.array(vector).min(2).max(64),
  axis: direction,
  outerDiameterMm: z.number().finite().positive(),
  heightMm: z.number().finite().positive(),
  holeDiameterMm: z.number().finite().positive(),
  holeDepthMm: z.number().finite().positive(),
  baseOverlapMm: z.number().finite().positive().default(0.5),
  cutterOvershootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.holeDiameterMm >= input.outerDiameterMm) {
    context.addIssue({ code: "custom", path: ["holeDiameterMm"], message: "Hole diameter must be less than boss outer diameter" });
  }
  if (input.holeDepthMm > input.heightMm) {
    context.addIssue({ code: "custom", path: ["holeDepthMm"], message: "Hole depth must not exceed boss height" });
  }
  for (let first = 0; first < input.baseCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.baseCentersMm.length; second += 1) {
      const distance = Math.hypot(...input.baseCentersMm[first]!.map((value, index) => value - input.baseCentersMm[second]![index]!));
      if (distance <= 1e-9) context.addIssue({ code: "custom", path: ["baseCentersMm", second], message: `Base center duplicates index ${first}` });
    }
  }
});
export const ribInputSchema = z.object({
  targetId: z.number().int().positive(),
  profilePointsMm: z.array(vector).min(3).max(1000),
  thicknessMm: nonzeroDistance,
  intent,
  revision,
}).strict();
export const roundVentArrayInputSchema = z.object({
  targetId: z.number().int().positive(),
  firstCenterMm: vector,
  axis: direction,
  holeDiameterMm: z.number().finite().positive(),
  throughDepthMm: z.number().finite().positive(),
  direction1: direction,
  count1: z.number().int().min(1).max(20),
  spacing1Mm: z.number().finite().positive(),
  direction2: direction,
  count2: z.number().int().min(1).max(20),
  spacing2Mm: z.number().finite().positive(),
  overshootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.count1 > 1 && input.spacing1Mm <= input.holeDiameterMm) {
    context.addIssue({ code: "custom", path: ["spacing1Mm"], message: "Direction 1 spacing must exceed hole diameter" });
  }
  if (input.count2 > 1 && input.spacing2Mm <= input.holeDiameterMm) {
    context.addIssue({ code: "custom", path: ["spacing2Mm"], message: "Direction 2 spacing must exceed hole diameter" });
  }
});
export const cantileverSnapFitInputSchema = z.object({
  targetId: z.number().int().positive(),
  baseCenterMm: vector,
  beamDirection: direction,
  thicknessDirection: direction,
  lengthMm: z.number().finite().positive(),
  widthMm: z.number().finite().positive(),
  thicknessMm: z.number().finite().positive(),
  hookLengthMm: z.number().finite().positive(),
  hookHeightMm: z.number().finite().positive(),
  baseOverlapMm: z.number().finite().positive().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.hookLengthMm >= input.lengthMm) {
    context.addIssue({ code: "custom", path: ["hookLengthMm"], message: "Hook length must be less than beam length" });
  }
});
export const hingeBarrelInputSchema = z.object({
  targetId: z.number().int().positive(),
  axisStartMm: vector,
  axis: direction,
  lengthMm: z.number().finite().positive(),
  outerDiameterMm: z.number().finite().positive(),
  pinBoreDiameterMm: z.number().finite().positive(),
  cutterOvershootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.pinBoreDiameterMm >= input.outerDiameterMm) {
    context.addIssue({ code: "custom", path: ["pinBoreDiameterMm"], message: "Pin bore diameter must be less than outer diameter" });
  }
});
export const cableChannelInputSchema = z.object({
  targetId: z.number().int().positive(),
  spineIds: ids,
  channelDiameterMm: z.number().finite().positive(),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.spineIds.includes(input.targetId)) {
    context.addIssue({ code: "custom", path: ["spineIds"], message: "Target must not also be a spine" });
  }
  if (new Set(input.spineIds).size !== input.spineIds.length) {
    context.addIssue({ code: "custom", path: ["spineIds"], message: "Spine IDs must be unique" });
  }
});
export const connectorOpeningInputSchema = z.object({
  targetId: z.number().int().positive(),
  entryCenterMm: vector,
  axis: direction,
  widthDirection: direction,
  widthMm: z.number().finite().positive(),
  heightMm: z.number().finite().positive(),
  cornerRadiusMm: z.number().finite().nonnegative().default(0),
  throughDepthMm: z.number().finite().positive(),
  overshootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.cornerRadiusMm >= Math.min(input.widthMm, input.heightMm) / 2) {
    context.addIssue({ code: "custom", path: ["cornerRadiusMm"], message: "Corner radius must be less than half the opening width and height" });
  }
});
export const splitSolidByPlaneInputSchema = z.object({
  targetId: z.number().int().positive(),
  originMm: vector,
  normal: direction,
  xDirection: direction,
  intent,
  revision,
}).strict().superRefine((input, context) => {
  const dot = input.normal.reduce((sum, value, index) => sum + value * input.xDirection[index]!, 0);
  const magnitude = Math.hypot(...input.normal) * Math.hypot(...input.xDirection);
  if (Math.abs(dot) > magnitude * (1 - 1e-6)) {
    context.addIssue({ code: "custom", path: ["xDirection"], message: "Split plane x direction must not be parallel to its normal" });
  }
});
export const splitSolidByPlanesInputSchema = z.object({
  targetId: z.number().int().positive(),
  planes: z.array(z.object({ originMm: vector, normal: direction, xDirection: direction }).strict()).min(1).max(64),
  intent,
  revision,
}).strict();
export const matingEnclosureJointInputSchema = z.object({
  maleTargetId: z.number().int().positive(),
  femaleTargetId: z.number().int().positive(),
  seamOriginMm: vector,
  outerWidthMm: z.number().finite().positive(),
  outerDepthMm: z.number().finite().positive(),
  wallThicknessMm: z.number().finite().positive(),
  lipThicknessMm: z.number().finite().positive(),
  lipHeightMm: z.number().finite().positive(),
  clearanceMm: z.number().finite().nonnegative(),
  overlapMm: z.number().finite().positive().default(0.25),
  cutterOvershootMm: z.number().finite().positive().default(0.25),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.maleTargetId === input.femaleTargetId) {
    context.addIssue({ code: "custom", path: ["femaleTargetId"], message: "Male and female halves must be different bodies" });
  }
  if (input.wallThicknessMm <= input.overlapMm + input.clearanceMm) {
    context.addIssue({ code: "custom", path: ["wallThicknessMm"], message: "Wall thickness must exceed overlap plus clearance" });
  }
  const requiredInset = input.wallThicknessMm + input.lipThicknessMm + input.clearanceMm;
  if (input.outerWidthMm <= requiredInset * 2 || input.outerDepthMm <= requiredInset * 2) {
    context.addIssue({ code: "custom", path: ["outerWidthMm"], message: "Outer dimensions are too small for the wall, lip, and clearance" });
  }
});
export const locatingPinPairInputSchema = z.object({
  maleTargetId: z.number().int().positive(),
  femaleTargetId: z.number().int().positive(),
  baseCenterMm: vector,
  axis: direction,
  pinDiameterMm: z.number().finite().positive(),
  pinHeightMm: z.number().finite().positive(),
  radialClearanceMm: z.number().finite().nonnegative(),
  axialClearanceMm: z.number().finite().nonnegative(),
  baseOverlapMm: z.number().finite().positive().default(0.5),
  cutterOvershootMm: z.number().finite().positive().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.maleTargetId === input.femaleTargetId) {
    context.addIssue({ code: "custom", path: ["femaleTargetId"], message: "Male and female halves must be different bodies" });
  }
});
export const locatingPinPairPatternInputSchema = z.object({
  maleTargetId: z.number().int().positive(),
  femaleTargetId: z.number().int().positive(),
  baseCentersMm: z.array(vector).min(2).max(64),
  axis: direction,
  pinDiameterMm: z.number().finite().positive(),
  pinHeightMm: z.number().finite().positive(),
  radialClearanceMm: z.number().finite().nonnegative(),
  axialClearanceMm: z.number().finite().nonnegative(),
  baseOverlapMm: z.number().finite().positive().default(0.5),
  cutterOvershootMm: z.number().finite().positive().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.maleTargetId === input.femaleTargetId) {
    context.addIssue({ code: "custom", path: ["femaleTargetId"], message: "Male and female halves must be different bodies" });
  }
  for (let first = 0; first < input.baseCentersMm.length; first += 1) {
    for (let second = first + 1; second < input.baseCentersMm.length; second += 1) {
      const distance = Math.hypot(...input.baseCentersMm[first]!.map((value, index) => value - input.baseCentersMm[second]![index]!));
      if (distance <= 1e-9) context.addIssue({ code: "custom", path: ["baseCentersMm", second], message: `Base center duplicates index ${first}` });
    }
  }
});
export const splitScrewInsertJointInputSchema = z.object({
  maleTargetId: z.number().int().positive(),
  femaleTargetId: z.number().int().positive(),
  screwEntryCentersMm: z.array(vector).min(1).max(64),
  insertEntryCentersMm: z.array(vector).min(1).max(64),
  axis: direction,
  fastenerDesignation: z.string().trim().min(1).max(240),
  screwLengthMm: z.number().finite().positive(),
  minimumEngagementMm: z.number().finite().positive(),
  maximumEngagementMm: z.number().finite().positive(),
  insertPartNumber: z.string().trim().min(1).max(160),
  insertThreadNominalDiameterMm: z.number().finite().positive(),
  insertThreadPitchMm: z.number().finite().positive(),
  insertSourceUrl: z.string().url().refine((value) => value.startsWith("https://"), "Insert source URL must use HTTPS"),
  holeDiameterMm: z.number().finite().positive(),
  maleThroughDepthMm: z.number().finite().positive(),
  holeOvershootMm: z.number().finite().nonnegative().default(0.5),
  pilotDiameterMm: z.number().finite().positive(),
  pilotDepthMm: z.number().finite().positive(),
  insertDiameterMm: z.number().finite().positive(),
  insertDepthMm: z.number().finite().positive(),
  leadInDiameterMm: z.number().finite().positive(),
  leadInDepthMm: z.number().finite().positive(),
  femaleMaterialDepthMm: z.number().finite().positive(),
  insertOvershootMm: z.number().finite().nonnegative().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.maleTargetId === input.femaleTargetId) {
    context.addIssue({ code: "custom", path: ["femaleTargetId"], message: "Male and female halves must be different bodies" });
  }
  if (input.screwEntryCentersMm.length !== input.insertEntryCentersMm.length) {
    context.addIssue({ code: "custom", path: ["insertEntryCentersMm"], message: "Screw and insert center counts must match" });
  }
  if (input.minimumEngagementMm > input.maximumEngagementMm) {
    context.addIssue({ code: "custom", path: ["maximumEngagementMm"], message: "Maximum engagement must not be less than minimum engagement" });
  }
  for (const centers of [input.screwEntryCentersMm, input.insertEntryCentersMm]) {
    for (let first = 0; first < centers.length; first += 1) {
      for (let second = first + 1; second < centers.length; second += 1) {
        const distance = Math.hypot(...centers[first]!.map((value, index) => value - centers[second]![index]!));
        if (distance <= 1e-9) context.addIssue({ code: "custom", path: ["screwEntryCentersMm", second], message: `Joint center duplicates index ${first}` });
      }
    }
  }
});
export const tongueGrooveJointInputSchema = z.object({
  tongueTargetId: z.number().int().positive(),
  grooveTargetId: z.number().int().positive(),
  baseCenterMm: vector,
  axis: direction,
  widthDirection: direction,
  tongueWidthMm: z.number().finite().positive(),
  tongueThicknessMm: z.number().finite().positive(),
  tongueHeightMm: z.number().finite().positive(),
  radialClearanceMm: z.number().finite().nonnegative(),
  axialClearanceMm: z.number().finite().nonnegative(),
  baseOverlapMm: z.number().finite().positive().default(0.5),
  cutterOvershootMm: z.number().finite().positive().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.tongueTargetId === input.grooveTargetId) {
    context.addIssue({ code: "custom", path: ["grooveTargetId"], message: "Tongue and groove targets must be different bodies" });
  }
});
export const dovetailJointInputSchema = z.object({
  maleTargetId: z.number().int().positive(),
  femaleTargetId: z.number().int().positive(),
  baseCenterMm: vector,
  axis: direction,
  widthDirection: direction,
  rootWidthMm: z.number().finite().positive(),
  flareMm: z.number().finite().positive(),
  tongueThicknessMm: z.number().finite().positive(),
  tongueHeightMm: z.number().finite().positive(),
  radialClearanceMm: z.number().finite().nonnegative(),
  axialClearanceMm: z.number().finite().nonnegative(),
  baseOverlapMm: z.number().finite().positive().default(0.5),
  cutterOvershootMm: z.number().finite().positive().default(0.5),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.maleTargetId === input.femaleTargetId) {
    context.addIssue({ code: "custom", path: ["femaleTargetId"], message: "Dovetail halves must be different bodies" });
  }
});

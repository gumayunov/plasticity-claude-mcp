import { z } from "zod";
import { intent, revision, printedThreadDefinitionFields, vector, direction, printedThreadProcessSchema, ids } from "./common.ts";

export const splitSolidToVolumeInputSchema = z.object({
  targetId: z.number().int().positive(),
  usableBuildVolumeMm: z.tuple([z.number().finite().positive(), z.number().finite().positive(), z.number().finite().positive()]),
  intent,
  revision,
}).strict();
export const printedExternalThreadInputSchema = z.object({
  ...printedThreadDefinitionFields,
  axisStartMm: vector,
  axis: direction,
  threadLengthMm: z.number().finite().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  intent,
  revision,
}).strict();
export const printedInternalThreadInputSchema = z.object({
  ...printedThreadDefinitionFields,
  targetId: z.number().int().positive(),
  entryCenterMm: vector,
  axis: direction,
  materialDepthMm: z.number().finite().positive(),
  profileClearanceMm: z.number().finite().nonnegative(),
  cutterOvershootMm: z.number().finite().positive().default(0.5),
  intent,
  revision,
}).strict();
export const printedHexNutInputSchema = z.object({
  ...printedThreadDefinitionFields,
  entryCenterMm: vector,
  axis: direction,
  flatNormalDirection: direction,
  acrossFlatsMm: z.number().finite().positive(),
  thicknessMm: z.number().finite().positive(),
  minimumWallThicknessMm: z.number().finite().positive(),
  profileClearanceMm: z.number().finite().nonnegative(),
  cutterOvershootMm: z.number().finite().positive().default(0.5),
  intent,
  revision,
}).strict();
export const printedHexScrewInputSchema = z.object({
  ...printedThreadDefinitionFields,
  axisStartMm: vector,
  axis: direction,
  threadLengthMm: z.number().finite().positive(),
  flatNormalDirection: direction,
  headAcrossFlatsMm: z.number().finite().positive(),
  headHeightMm: z.number().finite().positive(),
  junctionOverlapMm: z.number().finite().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  intent,
  revision,
}).strict();
export const printedHexPairInputSchema = z.object({
  designation: z.string().trim().min(1).max(500),
  pitchMm: z.number().finite().positive(),
  threadDepthMm: z.number().finite().positive(),
  profileClearanceMm: z.number().finite().nonnegative(),
  handedness: z.enum(["right", "left"]).default("right"),
  screwAxisStartMm: vector,
  nutEntryCenterMm: vector,
  axis: direction,
  radialDirection: direction.default([1, 0, 0]),
  flatNormalDirection: direction,
  screwHeadAcrossFlatsMm: z.number().finite().positive(),
  screwHeadHeightMm: z.number().finite().positive(),
  screwJunctionOverlapMm: z.number().finite().positive(),
  nutAcrossFlatsMm: z.number().finite().positive(),
  nutThicknessMm: z.number().finite().positive(),
  nutMinimumWallThicknessMm: z.number().finite().positive(),
  cutterOvershootMm: z.number().finite().positive().default(0.5),
  screwName: z.string().trim().min(1).max(120).optional(),
  qualificationId: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  process: printedThreadProcessSchema,
  sizingBasis: z.string().trim().min(1).max(2000),
  intent,
  revision,
}).strict();
export const printedThreadCalibrationInputSchema = z.object({
  designation: z.string().trim().min(1).max(500),
  pitchMm: z.number().finite().positive(),
  threadDepthMm: z.number().finite().positive(),
  handedness: z.enum(["right", "left"]).default("right"),
  screwAxisStartMm: vector,
  axis: direction,
  radialDirection: direction.default([1, 0, 0]),
  flatNormalDirection: direction,
  screwHeadAcrossFlatsMm: z.number().finite().positive(),
  screwHeadHeightMm: z.number().finite().positive(),
  screwJunctionOverlapMm: z.number().finite().positive(),
  nutAcrossFlatsMm: z.number().finite().positive(),
  nutThicknessMm: z.number().finite().positive(),
  nutMinimumWallThicknessMm: z.number().finite().positive(),
  cutterOvershootMm: z.number().finite().positive().default(0.5),
  screwName: z.string().trim().min(1).max(120).optional(),
  samples: z.array(z.object({
    id: z.string().trim().min(1).max(80),
    nutEntryCenterMm: vector,
    profileClearanceMm: z.number().finite().nonnegative(),
  }).strict()).min(2).max(8),
  process: printedThreadProcessSchema,
  sizingBasis: z.string().trim().min(1).max(2000),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  const ids = new Set<string>();
  const centers = new Set<string>();
  for (let index = 0; index < input.samples.length; index += 1) {
    const sample = input.samples[index]!;
    if (ids.has(sample.id)) context.addIssue({ code: "custom", path: ["samples", index, "id"], message: "Calibration sample IDs must be unique" });
    ids.add(sample.id);
    const center = sample.nutEntryCenterMm.join(",");
    if (centers.has(center)) context.addIssue({ code: "custom", path: ["samples", index, "nutEntryCenterMm"], message: "Calibration nut centers must be unique" });
    centers.add(center);
    if (input.samples.slice(0, index).some((previous) => Math.abs(previous.profileClearanceMm - sample.profileClearanceMm) <= 1e-9)) {
      context.addIssue({ code: "custom", path: ["samples", index, "profileClearanceMm"], message: "Calibration profile clearances must be unique" });
    }
  }
});

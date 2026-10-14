import { z } from "zod";
import { nonzeroDistance, rebuildCurveCommon } from "./common.ts";

export const fragmentIds = z.array(z.string().trim().min(1)).min(1).max(4096);
export const endpointIds = z.array(z.string().trim().min(1)).min(1).max(4096);
export const regionOffsets = z.array(nonzeroDistance).min(1).max(2).refine(
  (values) => new Set(values).size === values.length,
  "Region offset distances must be unique",
);
export const rebuildCurveInputSchema = z.discriminatedUnion("method", [
  z.object({
    ...rebuildCurveCommon,
    method: z.literal("tolerance"),
    toleranceMm: z.number().finite().min(0.001).max(100),
  }).strict(),
  z.object({
    ...rebuildCurveCommon,
    method: z.literal("control-points"),
    pointCount: z.number().int().min(4).max(1000),
  }).strict(),
  z.object({
    ...rebuildCurveCommon,
    method: z.literal("degree-spans"),
    degree: z.number().int().min(1).max(15),
    spans: z.number().int().min(1).max(1000),
  }).strict(),
]).superRefine((value, context) => {
  if (value.method === "degree-spans" && value.degree + value.spans > 1000) {
    context.addIssue({ code: "custom", path: ["spans"], message: "Degree plus spans must not exceed 1000 control points" });
  }
});

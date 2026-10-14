import { z } from "zod";

export const interiorCurveControlPointRefs = z.array(
  z.object({ bodyId: z.number().int().positive(), kind: z.literal("control-point"), pointId: z.number().int().positive() }).strict(),
).min(1).max(4096).refine(
  (values) => new Set(values.map((value) => `${value.bodyId}:${value.pointId}`)).size === values.length,
  "Interior curve control point references must be unique",
).refine(
  (values) => new Set(values.map((value) => value.bodyId)).size === 1,
  "Deleted curve control points must belong to one Wire",
);

import { z } from "zod";
import { faceRef, vector, direction, revision, fastenerGroupLayoutRequirementsSchema } from "./common.ts";

export const fastenerGripLayer = z.object({ id: z.string().trim().min(1).max(120), first: faceRef, second: faceRef }).strict().refine(
  (layer) => layer.first.bodyId === layer.second.bodyId,
  "Each fastener grip layer must use two faces from the same body",
).refine(
  (layer) => layer.first.faceId !== layer.second.faceId,
  "Each fastener grip layer requires two different faces",
);
export const fastenerGroupInspectionInputSchema = z.object({
  bodyId: z.number().int().positive(),
  cylindricalFaceIds: z.array(z.string().trim().min(1)).min(2).max(256).refine(
    (values) => new Set(values).size === values.length,
    "Cylindrical face IDs must be unique",
  ),
  frame: z.object({ originMm: vector, normal: direction, xDirection: direction }).strict(),
  revision,
}).strict();
export const fastenerGroupLayoutInputSchema = z.object({
  bodyId: z.number().int().positive(),
  boundaryFaceId: z.string().trim().min(1),
  opposedFaceId: z.string().trim().min(1).optional(),
  cylindricalFaceIds: z.array(z.string().trim().min(1)).min(2).max(256).refine(
    (values) => new Set(values).size === values.length,
    "Cylindrical face IDs must be unique",
  ),
  frame: z.object({ originMm: vector, normal: direction, xDirection: direction }).strict(),
  requirements: fastenerGroupLayoutRequirementsSchema.optional(),
  revision,
}).strict();

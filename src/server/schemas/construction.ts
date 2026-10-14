import { z } from "zod";
import { vector, direction } from "./common.ts";

export const datumPointDefinitionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("coordinates"), pointMm: vector }).strict(),
  z.object({ type: z.literal("face-center"), bodyId: z.number().int().positive(), faceId: z.string().trim().min(1) }).strict(),
  z.object({ type: z.literal("edge-midpoint"), bodyId: z.number().int().positive(), edgeId: z.string().trim().min(1) }).strict(),
]);
export const datumAxisDefinitionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("two-points"), firstId: z.string().trim().min(1), secondId: z.string().trim().min(1) }).strict()
    .refine((value) => value.firstId !== value.secondId, "Axis point references must be different"),
  z.object({ type: z.literal("origin-direction"), originMm: vector, direction }).strict(),
  z.object({ type: z.literal("linear-edge"), bodyId: z.number().int().positive(), edgeId: z.string().trim().min(1) }).strict(),
  z.object({ type: z.literal("cylindrical-face"), bodyId: z.number().int().positive(), faceId: z.string().trim().min(1) }).strict(),
]);
export const constructionPlaneDefinitionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("explicit"), originMm: vector, normal: direction, xDirection: direction }).strict(),
  z.object({ type: z.literal("three-points"), firstId: z.string().trim().min(1), secondId: z.string().trim().min(1), thirdId: z.string().trim().min(1) }).strict()
    .refine((value) => new Set([value.firstId, value.secondId, value.thirdId]).size === 3, "Plane point references must be different"),
  z.object({ type: z.literal("planar-face"), bodyId: z.number().int().positive(), faceId: z.string().trim().min(1), offsetMm: z.number().finite().default(0) }).strict(),
  z.object({ type: z.literal("offset"), planeId: z.string().trim().min(1), offsetMm: z.number().finite() }).strict(),
  z.object({ type: z.literal("rotated"), planeId: z.string().trim().min(1), axisId: z.string().trim().min(1), angleDegrees: z.number().finite() }).strict(),
]);

import { z } from "zod";
import { vector, intent, revision, vector2, referenceIdentitySchema, direction, arcSweepDegrees, tangentArcCommon, tangentCircleCommon, curveSegmentEndpointSchema, measurementVertexRef, textValue } from "./common.ts";

export const polylineInputSchema = z.union([
  z.object({ pointsMm: z.array(vector).min(2).max(1000), closed: z.boolean().default(false), intent, revision }).strict(),
  z.object({ pointsMm: z.array(vector2).min(2).max(1000), plane: referenceIdentitySchema, closed: z.boolean().default(false), intent, revision }).strict(),
]);
export const circleInputSchema = z.union([
  z.object({ centerMm: vector, radiusMm: z.number().finite().positive(), normal: direction.default([0, 0, 1]), intent, revision }).strict(),
  z.object({ centerMm: vector2, radiusMm: z.number().finite().positive(), plane: referenceIdentitySchema, intent, revision }).strict(),
]);
export const twoPointCircleInputSchema = z.union([
  z.object({ diameterStartMm: vector, diameterEndMm: vector, normal: direction.default([0, 0, 1]), intent, revision }).strict(),
  z.object({ diameterStartMm: vector2, diameterEndMm: vector2, plane: referenceIdentitySchema, intent, revision }).strict(),
]);
export const threePointCircleInputSchema = z.union([
  z.object({ firstMm: vector, secondMm: vector, thirdMm: vector, intent, revision }).strict(),
  z.object({ firstMm: vector2, secondMm: vector2, thirdMm: vector2, plane: referenceIdentitySchema, intent, revision }).strict(),
]);
export const centerArcInputSchema = z.union([
  z.object({
    centerMm: vector,
    radiusMm: z.number().finite().positive(),
    startAngleDegrees: z.number().finite().default(0),
    sweepAngleDegrees: arcSweepDegrees,
    normal: direction.default([0, 0, 1]),
    xDirection: direction.default([1, 0, 0]),
    intent,
    revision,
  }).strict(),
  z.object({
    centerMm: vector2,
    radiusMm: z.number().finite().positive(),
    startAngleDegrees: z.number().finite().default(0),
    sweepAngleDegrees: arcSweepDegrees,
    plane: referenceIdentitySchema,
    intent,
    revision,
  }).strict(),
]);
export const threePointArcInputSchema = z.union([
  z.object({
    startMm: vector,
    throughMm: vector,
    endMm: vector,
    intent,
    revision,
  }).strict(),
  z.object({
    startMm: vector2,
    throughMm: vector2,
    endMm: vector2,
    plane: referenceIdentitySchema,
    intent,
    revision,
  }).strict(),
]);
export const tangentArcInputSchema = z.union([
  z.object({ ...tangentArcCommon, endMm: vector }).strict(),
  z.object({ ...tangentArcCommon, endMm: vector2, plane: referenceIdentitySchema }).strict(),
]);
export const tangentCircleInputSchema = z.union([
  z.object({ ...tangentCircleCommon, solutionPointMm: vector, normal: direction.default([0, 0, 1]) }).strict(),
  z.object({ ...tangentCircleCommon, solutionPointMm: vector2, plane: referenceIdentitySchema }).strict(),
]).refine(
  (value) => value.first.bodyId !== value.second.bodyId || value.first.segmentEntityId !== value.second.segmentEntityId,
  "Tangent-circle segment references must be different",
);
export const bridgeCurveInputSchema = z.object({
  first: curveSegmentEndpointSchema,
  second: curveSegmentEndpointSchema,
  startContinuity: z.enum(["G0", "G1", "G2", "G3"]).default("G2"),
  endContinuity: z.enum(["G0", "G1", "G2", "G3"]).default("G2"),
  intent,
  revision,
}).strict().refine(
  (value) => value.first.bodyId !== value.second.bodyId || value.first.segmentEntityId !== value.second.segmentEntityId || value.first.at !== value.second.at,
  "Curve Bridge endpoint references must be different",
);
export const bridgeCurveVerticesInputSchema = z.object({
  first: measurementVertexRef,
  second: measurementVertexRef,
  startContinuity: z.enum(["G0", "G1", "G2", "G3"]).default("G2"),
  endContinuity: z.enum(["G0", "G1", "G2", "G3"]).default("G2"),
  intent,
  revision,
}).strict().refine(
  (value) => value.first.bodyId !== value.second.bodyId || value.first.vertexId !== value.second.vertexId,
  "Curve Vertex Bridge endpoint references must be different",
);
export const ellipseInputSchema = z.union([
  z.object({
    centerMm: vector,
    majorRadiusMm: z.number().finite().positive(),
    minorRadiusMm: z.number().finite().positive(),
    normal: direction.default([0, 0, 1]),
    xDirection: direction.default([1, 0, 0]),
    angleDegrees: z.number().finite().default(0),
    intent,
    revision,
  }).strict().refine((value) => value.minorRadiusMm <= value.majorRadiusMm, "Ellipse minor radius must not exceed its major radius"),
  z.object({
    centerMm: vector2,
    majorRadiusMm: z.number().finite().positive(),
    minorRadiusMm: z.number().finite().positive(),
    plane: referenceIdentitySchema,
    angleDegrees: z.number().finite().default(0),
    intent,
    revision,
  }).strict().refine((value) => value.minorRadiusMm <= value.majorRadiusMm, "Ellipse minor radius must not exceed its major radius"),
]);
export const regularPolygonInputSchema = z.union([
  z.object({
    centerMm: vector,
    radiusMm: z.number().finite().positive(),
    radiusMode: z.enum(["circumradius", "inradius"]).default("circumradius"),
    vertexCount: z.number().int().min(3).max(256),
    normal: direction.default([0, 0, 1]),
    xDirection: direction.default([1, 0, 0]),
    angleDegrees: z.number().finite().default(0),
    intent,
    revision,
  }).strict(),
  z.object({
    centerMm: vector2,
    radiusMm: z.number().finite().positive(),
    radiusMode: z.enum(["circumradius", "inradius"]).default("circumradius"),
    vertexCount: z.number().int().min(3).max(256),
    plane: referenceIdentitySchema,
    angleDegrees: z.number().finite().default(0),
    intent,
    revision,
  }).strict(),
]);
export const rectangleInputSchema = z.union([
  z.object({
    centerMm: vector,
    widthMm: z.number().finite().positive(),
    heightMm: z.number().finite().positive(),
    normal: direction.default([0, 0, 1]),
    xDirection: direction.default([1, 0, 0]),
    angleDegrees: z.number().finite().default(0),
    intent,
    revision,
  }).strict(),
  z.object({
    centerMm: vector2,
    widthMm: z.number().finite().positive(),
    heightMm: z.number().finite().positive(),
    plane: referenceIdentitySchema,
    angleDegrees: z.number().finite().default(0),
    intent,
    revision,
  }).strict(),
]);
export const textInputSchema = z.union([
  z.object({
    text: textValue,
    fontSizeMm: z.number().finite().positive().max(10_000),
    originMm: vector,
    font: z.literal("inter").default("inter"),
    name: z.string().trim().min(1).max(120).optional(),
    normal: direction.default([0, 0, 1]),
    xDirection: direction.default([1, 0, 0]),
    angleDegrees: z.number().finite().default(0),
    intent,
    revision,
  }).strict(),
  z.object({
    text: textValue,
    fontSizeMm: z.number().finite().positive().max(10_000),
    originMm: vector2,
    plane: referenceIdentitySchema,
    font: z.literal("inter").default("inter"),
    name: z.string().trim().min(1).max(120).optional(),
    angleDegrees: z.number().finite().default(0),
    intent,
    revision,
  }).strict(),
]);

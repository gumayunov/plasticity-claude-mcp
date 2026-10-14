import { z } from "zod";
import { edgeRef, curvatureWireSegmentRef, revision, surfaceFaceRefs, direction, bodyInterferencePair, vector } from "./common.ts";

export const circularEdgeMeasurementRef = z.union([
  edgeRef,
  z.object({ bodyId: z.number().int().positive(), segmentEntityId: z.number().int().nonnegative() }).strict(),
]);
export const sampledCurveEdgeRef = z.union([edgeRef, curvatureWireSegmentRef]);
export const surfaceContinuityInputSchema = z.object({
  edges: z.array(edgeRef).min(1).max(4096).refine(
    (values) => new Set(values.map((value) => `${value.bodyId}:${value.edgeId}`)).size === values.length,
    "Edge references must be unique",
  ),
  positionToleranceMm: z.number().finite().positive().default(0.01),
  normalAngleToleranceDeg: z.number().finite().positive().max(180).default(0.1),
  relativeCurvatureTolerance: z.number().finite().positive().default(0.05),
  revision,
}).strict();
export const edgeCurvatureInputSchema = z.object({
  edges: z.array(z.union([edgeRef, curvatureWireSegmentRef])).min(1).max(4096).refine(
    (values) => new Set(values.map((value) => "edgeId" in value ? `${value.bodyId}:shell:${value.edgeId}` : `${value.bodyId}:wire:${value.segmentEntityId}`)).size === values.length,
    "Edge references must be unique",
  ),
  revision,
}).strict();
export const faceDraftInputSchema = z.object({
  faces: surfaceFaceRefs.max(256),
  pullDirection: direction,
  minimumDraftDeg: z.number().finite().positive().lt(90).default(2),
  samplesPerDirection: z.number().int().min(3).max(32).default(8),
  revision,
}).strict();
export const bodyInterferenceInputSchema = z.object({
  pairs: z.array(bodyInterferencePair).min(1).max(256),
  revision,
}).strict().superRefine((input, context) => {
  const keys = input.pairs.map((pair) => [pair.firstBodyId, pair.secondBodyId].sort((left, right) => left - right).join(":"));
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: "custom", path: ["pairs"], message: "Unordered body pairs must be unique" });
  }
});
export const solidPropertiesInputSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(256).refine(
    (values) => new Set(values).size === values.length,
    "Solid body IDs must be unique",
  ),
  revision,
}).strict();
export const facePropertiesInputSchema = z.object({
  faces: surfaceFaceRefs.max(256),
  revision,
}).strict();
export const measurementPointRef = z.discriminatedUnion("type", [
  z.object({ type: z.literal("coordinates"), pointMm: vector }).strict(),
  z.object({ type: z.literal("vertex"), bodyId: z.number().int().positive(), vertexId: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal("edge-midpoint"), bodyId: z.number().int().positive(), edgeId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("face-center"), bodyId: z.number().int().positive(), faceId: z.string().min(1) }).strict(),
]);
export const topologyMeasurementPointRef = z.discriminatedUnion("type", [
  z.object({ type: z.literal("vertex"), bodyId: z.number().int().positive(), vertexId: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal("edge-midpoint"), bodyId: z.number().int().positive(), edgeId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("face-center"), bodyId: z.number().int().positive(), faceId: z.string().min(1) }).strict(),
]);

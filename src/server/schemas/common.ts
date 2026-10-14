import { z } from "zod";
import { type ConstructionHistoryEntry } from "../../plasticity/construction-history.ts";
import { type EdgeQuery, type FaceQuery } from "../../plasticity/semantic.ts";
import { printedThreadProcessIdentitySchema } from "../../printing/thread-qualification.ts";

export const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const vector2 = z.tuple([z.number().finite(), z.number().finite()]);
export const positiveVector = vector.refine((values) => values.every((value) => value > 0), "All values must be positive");

export const importedReferenceSourceSchema = z.object({
  sourceKind: z.enum(["official-manufacturer-cad", "official-documentation", "official-distributor-cad", "established-cad-library", "verified-community-cad"]),
  sourceUrl: z.string().url().max(4_096).refine((value) => value.startsWith("https://"), "Reference source URL must use HTTPS"),
  sourcePageUrl: z.string().url().max(4_096).refine((value) => value.startsWith("https://"), "Reference source-page URL must use HTTPS").optional(),
  license: z.string().trim().min(1).max(1_000).optional(),
  confidence: z.enum(["verified", "probable", "approximate", "assumed", "measurement-required"]),
}).strict();
export const direction = vector.refine((values) => values.some((value) => value !== 0), "Direction must be nonzero");
export const ids = z.array(z.number().int().positive()).min(1).max(4096);
export const uniqueBodyIds = ids.refine(
  (values) => new Set(values).size === values.length,
  "Body IDs must be unique",
);
export const curveIds = z.array(z.number().int().positive()).min(1).max(64).refine(
  (values) => new Set(values).size === values.length,
  "Wire IDs must be unique",
);
export const instanceIds = z.array(z.number().int().nonnegative()).min(1).max(4096).refine(
  (values) => new Set(values).size === values.length,
  "Instance IDs must be unique",
);
export const referenceMeshIds = z.array(z.number().int().nonnegative()).min(1).max(4096).refine(
  (values) => new Set(values).size === values.length,
  "Reference mesh IDs must be unique",
);
export const optionalBodyIds = z.array(z.number().int().positive()).max(4096).refine(
  (values) => new Set(values).size === values.length,
  "Body IDs must be unique",
).default([]);
export const optionalInstanceIds = z.array(z.number().int().nonnegative()).max(4096).refine(
  (values) => new Set(values).size === values.length,
  "Instance IDs must be unique",
).default([]);
export const optionalReferenceMeshIds = z.array(z.number().int().nonnegative()).max(4096).refine(
  (values) => new Set(values).size === values.length,
  "Reference mesh IDs must be unique",
).default([]);
export const optionalGroupIds = z.array(z.number().int().nonnegative()).max(4096).refine(
  (values) => new Set(values).size === values.length,
  "Group IDs must be unique",
).default([]);
export const regionIds = z.array(z.string().trim().min(1)).min(1).max(4096);
export const nonzeroDistance = z.number().finite().refine((value) => value !== 0, "Distance must be nonzero");
export const faceRef = z.object({ bodyId: z.number().int().positive(), faceId: z.string().min(1) }).strict();
export const edgeRef = z.object({ bodyId: z.number().int().positive(), edgeId: z.string().min(1) }).strict();
export const curvatureWireSegmentRef = z.object({ bodyId: z.number().int().positive(), segmentEntityId: z.number().int().positive() }).strict();
export const measurementVertexRef = z.object({ bodyId: z.number().int().positive(), vertexId: z.number().int().nonnegative() }).strict();
export const surfaceFaceRefs = z.array(faceRef).min(1).max(4096).refine(
  (values) => new Set(values.map((value) => `${value.bodyId}:${value.faceId}`)).size === values.length,
  "Face references must be unique",
);
export const curveControlPointRef = z.discriminatedUnion("kind", [
  z.object({ bodyId: z.number().int().positive(), kind: z.literal("vertex"), pointId: z.number().int().nonnegative() }).strict(),
  z.object({ bodyId: z.number().int().positive(), kind: z.literal("control-point"), pointId: z.number().int().positive() }).strict(),
]);
export const curveControlPointRefs = z.array(curveControlPointRef).min(1).max(4096).refine(
  (values) => new Set(values.map((value) => `${value.bodyId}:${value.kind}:${value.pointId}`)).size === values.length,
  "Curve control point references must be unique",
);
export const revision = z.string().min(1);
export const intent = z.string().trim().min(1).max(1000).optional();
export const bodyInterferencePair = z.object({
  firstBodyId: z.number().int().positive(),
  secondBodyId: z.number().int().positive(),
}).strict().refine((pair) => pair.firstBodyId !== pair.secondBodyId, "An interference pair must contain two different bodies");
export const groupSelectionFields = {
  bodyIds: optionalBodyIds,
  instanceIds: optionalInstanceIds,
  referenceMeshIds: optionalReferenceMeshIds,
  groupIds: optionalGroupIds,
};
export const requireNodeSelection = (input: { bodyIds: number[]; instanceIds: number[]; referenceMeshIds: number[]; groupIds: number[] }, context: z.RefinementCtx) => {
  if (input.bodyIds.length + input.instanceIds.length + input.referenceMeshIds.length + input.groupIds.length === 0) {
    context.addIssue({ code: "custom", message: "At least one body, instance, reference mesh, or group ID is required" });
  }
};
export const fastenerGroupLayoutEnvelopeSchema = z.object({
  id: z.string().trim().min(1).max(120),
  diameterMm: z.number().finite().positive(),
  minimumBoundaryClearanceMm: z.number().finite().nonnegative().default(0),
  minimumMutualClearanceMm: z.number().finite().nonnegative().default(0),
}).strict();
export const fastenerGroupLayoutRequirementsSchema = z.object({
  basis: z.string().trim().min(1).max(1000),
  minimumCenterToEdgeMm: z.number().finite().nonnegative().optional(),
  minimumHoleEdgeClearanceMm: z.number().finite().nonnegative().optional(),
  minimumCenterSpacingMm: z.number().finite().nonnegative().optional(),
  minimumHoleLigamentMm: z.number().finite().nonnegative().optional(),
  envelopes: z.array(fastenerGroupLayoutEnvelopeSchema).max(16).refine(
    (values) => new Set(values.map((value) => value.id)).size === values.length,
    "Envelope IDs must be unique",
  ).optional(),
}).strict().superRefine((input, context) => {
  if (input.minimumCenterToEdgeMm === undefined
      && input.minimumHoleEdgeClearanceMm === undefined
      && input.minimumCenterSpacingMm === undefined
      && input.minimumHoleLigamentMm === undefined
      && (input.envelopes?.length ?? 0) === 0) {
    context.addIssue({ code: "custom", message: "At least one layout requirement or envelope is required" });
  }
});
export const scalarMatch = z.object({
  value: z.number().finite(),
  tolerance: z.number().finite().nonnegative().default(0.01),
}).strict();
export const printedThreadDefinitionFields = {
  nominalDiameterMm: z.number().finite().positive(),
  pitchMm: z.number().finite().positive(),
  threadDepthMm: z.number().finite().positive(),
  radialDirection: direction.default([1, 0, 0]),
  handedness: z.enum(["right", "left"]).default("right"),
};
export const printedThreadProcessSchema = printedThreadProcessIdentitySchema;
export const pointMatch = z.object({
  pointMm: vector,
  toleranceMm: z.number().finite().nonnegative().default(0.01),
}).strict();
export const directionMatch = z.object({
  vector: direction,
  toleranceDeg: z.number().finite().min(0).max(180).default(1),
  oriented: z.boolean().default(false),
}).strict();
export const normalMatch = z.object({
  vector: direction,
  toleranceDeg: z.number().finite().min(0).max(180).default(1),
  oriented: z.boolean().default(true),
}).strict();
export const bounds = z.object({ min: vector, max: vector }).strict().refine(
  ({ min, max }) => min.every((value, axis) => value <= max[axis]!),
  "Bounds minimum must not exceed maximum",
);
export const faceQuerySchema = z.object({
  bodyIds: z.array(z.number().int().positive()).max(4096).optional(),
  surfaceTypes: z.array(z.string().trim().min(1).max(80)).max(32).optional(),
  planar: z.boolean().optional(),
  normal: normalMatch.optional(),
  radiusMm: scalarMatch.optional(),
  blendRadiusMm: scalarMatch.optional(),
  center: pointMatch.optional(),
  boundsMm: bounds.optional(),
  edgeCount: z.number().int().nonnegative().optional(),
  adjacentEdgeIds: z.array(z.string().min(1)).max(4096).optional(),
}).strict();
export const edgeQuerySchema = z.object({
  bodyIds: z.array(z.number().int().positive()).max(4096).optional(),
  curveTypes: z.array(z.string().trim().min(1).max(80)).max(32).optional(),
  line: z.boolean().optional(),
  circle: z.boolean().optional(),
  direction: directionMatch.optional(),
  lengthMm: scalarMatch.optional(),
  center: pointMatch.optional(),
  boundsMm: bounds.optional(),
  adjacentFaceIds: z.array(z.string().min(1)).max(4096).optional(),
}).strict();
export const referenceIdentitySchema = z.object({
  id: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  documentToken: z.string().trim().min(1),
  revision,
}).strict();
export const arcSweepDegrees = z.number().finite().refine(
  (value) => value !== 0 && Math.abs(value) < 360,
  "Arc sweep angle must be nonzero and have magnitude less than 360 degrees",
);
export const tangentArcCommon = {
  bodyId: z.number().int().positive(),
  segmentEntityId: z.number().int().positive(),
  startAt: z.enum(["start", "end"]),
  flipTangent: z.boolean().default(false),
  intent,
  revision,
};
export const curveSegmentSchema = z.object({
  bodyId: z.number().int().positive(),
  segmentEntityId: z.number().int().positive(),
}).strict();
export const tangentCircleCommon = {
  first: curveSegmentSchema,
  second: curveSegmentSchema,
  radiusMm: z.number().finite().positive(),
  intent,
  revision,
};
export const curveSegmentEndpointSchema = z.object({
  bodyId: z.number().int().positive(),
  segmentEntityId: z.number().int().positive(),
  at: z.enum(["start", "end"]),
}).strict();
export const shellEdgeEndpointSchema = edgeRef.extend({
  vertexId: z.number().int().nonnegative(),
}).strict();
export const rebuildCurveCommon = {
  ids: curveIds,
  preserveParameterization: z.boolean().default(false),
  preserveChain: z.boolean().default(true),
  keepCorners: z.boolean().default(true),
  intent,
  revision,
};
export const textValue = z.string().max(120).refine((value) => value.trim().length > 0, "Text must be nonempty")
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), "Text must not contain control characters");

export interface JournalEntry {
  id: string;
  operation: string;
  intent: string | null;
  input: unknown;
  documentToken: string;
  beforeRevision: string;
  afterDocumentToken: string | null;
  afterRevision: string | null;
  status: "completed" | "failed" | "unknown";
  diff: ConstructionHistoryEntry["change"] | null;
  error: string | null;
  occurredAt: string;
}

export interface NamedSelection {
  id: string;
  name: string;
  kind: "faces" | "edges";
  query: FaceQuery | EdgeQuery;
  expectedCount: number | null;
  documentToken: string;
  createdRevision: string;
  createdAt: string;
}

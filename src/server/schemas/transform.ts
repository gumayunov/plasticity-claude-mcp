import { z } from "zod";
import { faceRef, intent, revision, measurementVertexRef, vector, edgeRef } from "./common.ts";

export const cylindricalAlignmentInputSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(4096).refine((values) => new Set(values).size === values.length, "Moving body IDs must be unique"),
  sourceFace: faceRef,
  targetFace: faceRef,
  relation: z.enum(["opposed", "same"]).default("same"),
  axialMode: z.enum(["preserve", "anchor"]).default("preserve"),
  axialOffsetMm: z.number().finite().default(0),
  rotationAroundAxisDeg: z.number().finite().default(0),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  if (input.axialMode === "preserve" && input.axialOffsetMm !== 0) {
    context.addIssue({ code: "custom", path: ["axialOffsetMm"], message: "Axial offset is available only in anchor mode" });
  }
});
export const vertexAlignmentInputSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(4096).refine((values) => new Set(values).size === values.length, "Moving body IDs must be unique"),
  sourceVertex: measurementVertexRef,
  targetVertex: measurementVertexRef,
  offsetMm: vector.default([0, 0, 0]),
  intent,
  revision,
}).strict();
export const linearEdgeAlignmentInputSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(4096).refine((values) => new Set(values).size === values.length, "Moving body IDs must be unique"),
  sourceEdge: edgeRef,
  targetEdge: edgeRef,
  relation: z.enum(["opposed", "same"]).default("same"),
  axialOffsetMm: z.number().finite().default(0),
  rotationAroundAxisDeg: z.number().finite().default(0),
  intent,
  revision,
}).strict();

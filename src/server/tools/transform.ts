import { z } from "zod";
import { vector, positiveVector, direction, ids, faceRef, revision, intent } from "../schemas/common.ts";
import { cylindricalAlignmentInputSchema, vertexAlignmentInputSchema, linearEdgeAlignmentInputSchema } from "../schemas/transform.ts";
import type { ToolContext } from "../context.ts";

export function registerTransformTools(ctx: ToolContext): void {
  const { session, tool, journaled } = ctx;
  tool("plasticity_align_planar_faces", "Rigidly rotate and move current bodies so the center and normal of one exact planar source face align with a fixed exact planar target face. The opposed relation seats outward face normals against each other; same keeps them parallel. Positive gap is measured from the target along its outward normal. The normal-to-normal rotation is the shortest rotation and does not independently align in-plane edges. All moving bodies preserve their relative placement and the alignment occupies one native Undo step.", z.object({
    ids: z.array(z.number().int().positive()).min(1).max(4096).refine((values) => new Set(values).size === values.length, "Moving body IDs must be unique"),
    sourceFace: faceRef,
    targetFace: faceRef,
    relation: z.enum(["opposed", "same"]).default("opposed"),
    gapMm: z.number().finite().default(0),
    intent,
    revision,
  }).strict(), async ({ ids: bodyIds, sourceFace, targetFace, relation, gapMm, intent: purpose, revision: current }) =>
    await journaled("align-planar-faces", purpose, { bodyIds, sourceFace, targetFace, relation, gapMm }, () => session.get().alignPlanarFaces(bodyIds, sourceFace, targetFace, relation, gapMm, current)));
  tool("plasticity_align_cylindrical_faces", "Rigidly align exact native cylinder axes for one or more moving bodies in one Undo step. The preserve mode removes only transverse axis offset and keeps the cluster's axial position; anchor aligns the source axis origin to the target origin plus a signed axial offset along the target axis. The same/opposed relation controls axis direction, and an optional rotation around the fixed target axis controls roll. This is a direct placement, not a persistent concentric constraint.", cylindricalAlignmentInputSchema, async ({ ids: bodyIds, sourceFace, targetFace, relation, axialMode, axialOffsetMm, rotationAroundAxisDeg, intent: purpose, revision: current }) =>
    await journaled("align-cylindrical-faces", purpose, { bodyIds, sourceFace, targetFace, relation, axialMode, axialOffsetMm, rotationAroundAxisDeg }, () => session.get().alignCylindricalFaces(bodyIds, sourceFace, targetFace, relation, axialMode, axialOffsetMm, rotationAroundAxisDeg, current)));
  tool("plasticity_align_vertices", "Rigidly translate one or more moving bodies so one exact current B-Rep source vertex reaches a fixed target vertex plus an explicit world-space millimeter offset. The moving bodies retain their relative placement and the operation occupies one Undo step. This is direct placement, not a persistent coincident constraint.", vertexAlignmentInputSchema, async ({ ids: bodyIds, sourceVertex, targetVertex, offsetMm, intent: purpose, revision: current }) =>
    await journaled("align-vertices", purpose, { bodyIds, sourceVertex, targetVertex, offsetMm }, () => session.get().alignVertices(bodyIds, sourceVertex, targetVertex, offsetMm, current)));
  tool("plasticity_align_linear_edges", "Rigidly align one exact native Line edge from a moving body set to a fixed Line edge in one Undo step. Source and target edge midpoints are aligned with an optional signed axial offset along the fixed target tangent; same/opposed controls tangent direction, and rotationAroundAxisDeg controls roll around the fixed target line. Re-read the exact edges after placement because native edge parameter direction is topological, not a semantic assembly direction.", linearEdgeAlignmentInputSchema, async ({ ids: bodyIds, sourceEdge, targetEdge, relation, axialOffsetMm, rotationAroundAxisDeg, intent: purpose, revision: current }) =>
    await journaled("align-linear-edges", purpose, { bodyIds, sourceEdge, targetEdge, relation, axialOffsetMm, rotationAroundAxisDeg }, () => session.get().alignLinearEdges(bodyIds, sourceEdge, targetEdge, relation, axialOffsetMm, rotationAroundAxisDeg, current)));

  tool("plasticity_move", "Move bodies. Requires the current revision; delta is millimeters.", z.object({ ids, deltaMm: vector, intent, revision }), async ({ ids: bodyIds, deltaMm, intent: purpose, revision: current }) =>
    await journaled("move", purpose, { bodyIds, deltaMm }, () => session.get().move(bodyIds, deltaMm, current)));
  tool("plasticity_rotate", "Rotate bodies around a world pivot and axis. Angle is degrees.", z.object({ ids, pivotMm: vector, axis: direction, degrees: z.number().finite(), intent, revision }), async ({ ids: bodyIds, pivotMm, axis, degrees, intent: purpose, revision: current }) =>
    await journaled("rotate", purpose, { bodyIds, pivotMm, axis, degrees }, () => session.get().rotate(bodyIds, pivotMm, axis, degrees, current)));
  tool("plasticity_scale", "Scale bodies around a world pivot with positive XYZ factors.", z.object({ ids, pivotMm: vector, factors: positiveVector, intent, revision }), async ({ ids: bodyIds, pivotMm, factors, intent: purpose, revision: current }) =>
    await journaled("scale", purpose, { bodyIds, pivotMm, factors }, () => session.get().scale(bodyIds, pivotMm, factors, current)));
  tool("plasticity_set_block_dimensions", "Set the exact local width, length, and height of one current Solid that Plasticity still recognizes as a dimensionable block. This is a one-step native direct edit centered on the existing block; it does not create a persistent parametric constraint. Read the resulting B-Rep dimensions back after the edit.", z.object({ id: z.number().int().positive(), widthMm: z.number().finite().positive(), lengthMm: z.number().finite().positive(), heightMm: z.number().finite().positive(), intent, revision }).strict(), async ({ id, widthMm, lengthMm, heightMm, intent: purpose, revision: current }) =>
    await journaled("set-block-dimensions", purpose, { id, widthMm, lengthMm, heightMm }, () => session.get().setBlockDimensions(id, widthMm, lengthMm, heightMm, current)));
  tool("plasticity_set_radius_dimension", "Set the exact radius of one current cylindrical B-Rep face through Plasticity's native direct-dimension command. This changes recognized coaxial geometry in one Undo step; it is not a fillet command or persistent parametric constraint. Read the resulting cylindrical face radius back after the edit.", z.object({ face: faceRef, radiusMm: z.number().finite().positive(), intent, revision }).strict(), async ({ face, radiusMm, intent: purpose, revision: current }) =>
    await journaled("set-radius-dimension", purpose, { face, radiusMm }, () => session.get().setRadiusDimension(face, radiusMm, current)));
  tool("plasticity_set_rectangle_dimensions", "Set Plasticity's exact local width and length for one closed planar Wire that the native dimension command recognizes as a rectangle. The profile remains centered and its Region updates in one Undo step. This is a direct edit, not a persistent constraint; read the resulting Wire B-Rep bounds back.", z.object({ id: z.number().int().positive(), widthMm: z.number().finite().positive(), lengthMm: z.number().finite().positive(), intent, revision }).strict(), async ({ id, widthMm, lengthMm, intent: purpose, revision: current }) =>
    await journaled("set-rectangle-dimensions", purpose, { id, widthMm, lengthMm }, () => session.get().setRectangleDimensions(id, widthMm, lengthMm, current)));
  tool("plasticity_mirror", "Mirror exact bodies across a world-space plane, either copying or moving the originals.", z.object({ ids, planeOriginMm: vector, planeNormal: direction, keepOriginal: z.boolean().default(true), intent, revision }), async ({ ids: bodyIds, planeOriginMm, planeNormal, keepOriginal, intent: purpose, revision: current }) =>
    await journaled("mirror", purpose, { bodyIds, planeOriginMm, planeNormal, keepOriginal }, () => session.get().mirror(bodyIds, planeOriginMm, planeNormal, keepOriginal, current)));
  tool("plasticity_rectangular_pattern", "Create a native rectangular body pattern using counts and center-to-center spacing in millimeters.", z.object({
    ids,
    direction1: direction,
    count1: z.number().int().min(2).max(1000),
    spacing1Mm: z.number().finite().positive(),
    direction2: direction.default([0, 1, 0]),
    count2: z.number().int().min(1).max(1000).default(1),
    spacing2Mm: z.number().finite().nonnegative().default(0),
    intent,
    revision,
  }).strict().refine((value) => value.count2 === 1 || value.spacing2Mm > 0, "Second-axis spacing must be positive when count2 is greater than one"), async ({ ids: bodyIds, direction1, count1, spacing1Mm, direction2, count2, spacing2Mm, intent: purpose, revision: current }) =>
    await journaled("rectangular-pattern", purpose, { bodyIds, direction1, count1, spacing1Mm, direction2, count2, spacing2Mm }, () => session.get().rectangularPattern(bodyIds, direction1, count1, spacing1Mm, direction2, count2, spacing2Mm, current)));
  tool("plasticity_radial_pattern", "Create a native radial body pattern around a world-space axis.", z.object({ ids, centerMm: vector, axis: direction, count: z.number().int().min(2).max(1000), sweepDegrees: z.number().finite().positive().max(360).default(360), intent, revision }).strict(), async ({ ids: bodyIds, centerMm, axis, count, sweepDegrees, intent: purpose, revision: current }) =>
    await journaled("radial-pattern", purpose, { bodyIds, centerMm, axis, count, sweepDegrees }, () => session.get().radialPattern(bodyIds, centerMm, axis, count, sweepDegrees, current)));
}

import { z } from "zod";
import { vector, positiveVector, direction, faceRef, edgeRef, measurementVertexRef, revision, intent } from "../schemas/common.ts";
import type { ToolContext } from "../context.ts";

export function registerFacesTools(ctx: ToolContext): void {
  const { session, tool, journaled } = ctx;
  tool("plasticity_insert_isoparam_edges", "Insert native U- or V-isoparametric edges into one current Solid or Sheet face. This splits the selected face in place while preserving the body ID and occupies one Plasticity history step; it does not create independent Wire bodies. U/V follow the face's native parameterization, so inspect the resulting analytic surfaces, dimensions, topology, and mass properties instead of assuming a world direction or unchanged numerical integration.", z.object({
    face: faceRef,
    direction: z.enum(["u", "v"]),
    count: z.number().int().min(1).max(1000).default(1),
    intent,
    revision,
  }).strict(), async ({ face, direction: paramDirection, count, intent: purpose, revision: current }) =>
    await journaled("insert-isoparam-edges", purpose, { face, direction: paramDirection, count }, () =>
      session.get().insertIsoparamEdges(face, paramDirection, count, current)));
  tool("plasticity_extract_faces", "Copy exact current faces into separate native Sheet bodies while preserving their source bodies.", z.object({ faces: z.array(faceRef).min(1).max(4096), intent, revision }).strict(), async ({ faces, intent: purpose, revision: current }) =>
    await journaled("extract-faces", purpose, { faces }, () => session.get().extractFaces(faces, current)));
  tool("plasticity_extract_edges", "Copy exact current body edges into native Wire curves while preserving their source bodies.", z.object({ edges: z.array(edgeRef).min(1).max(4096), intent, revision }).strict(), async ({ edges, intent: purpose, revision: current }) =>
    await journaled("extract-edges", purpose, { edges }, () => session.get().extractEdges(edges, current)));
  tool("plasticity_unjoin_faces", "Detach exact current faces from their native shells into separate Sheet bodies.", z.object({ faces: z.array(faceRef).min(1).max(4096), intent, revision }).strict(), async ({ faces, intent: purpose, revision: current }) =>
    await journaled("unjoin-faces", purpose, { faces }, () => session.get().unjoinFaces(faces, current)));
  tool("plasticity_delete_faces", "Delete exact current faces from Solid or Sheet bodies, leaving the remaining native shell editable.", z.object({ faces: z.array(faceRef).min(1).max(4096), intent, revision }).strict(), async ({ faces, intent: purpose, revision: current }) =>
    await journaled("delete-faces", purpose, { faces }, () => session.get().deleteFaces(faces, current)));
  tool("plasticity_dissolve_faces", "Remove selected exact face boundaries by merging the faces into compatible adjacent native surfaces.", z.object({ faces: z.array(faceRef).min(1).max(4096), intent, revision }).strict(), async ({ faces, intent: purpose, revision: current }) =>
    await journaled("dissolve-faces", purpose, { faces }, () => session.get().dissolveFaces(faces, current)));
  tool("plasticity_draft_faces", "Draft exact faces by a signed angle around a planar neutral reference face. Positive angles open away from the reference face.", z.object({ id: z.number().int().positive(), faceIds: z.array(z.string()).min(1), referenceFace: faceRef, angleDegrees: z.number().finite().gt(-89).lt(89).refine((value) => value !== 0, "Draft angle must be nonzero"), intent, revision }).strict(), async ({ id, faceIds, referenceFace, angleDegrees, intent: purpose, revision: current }) =>
    await journaled("draft-faces", purpose, { id, faceIds, referenceFace, angleDegrees }, () => session.get().draftFaces(id, faceIds, referenceFace, angleDegrees, current)));
  tool("plasticity_offset_faces", "Offset exact B-Rep faces by a signed distance in millimeters.", z.object({ id: z.number().int().positive(), faceIds: z.array(z.string()).min(1), distanceMm: z.number().finite().refine((value) => value !== 0, "Distance must be nonzero"), intent, revision }), async ({ id, faceIds, distanceMm, intent: purpose, revision: current }) =>
    await journaled("offset-faces", purpose, { id, faceIds, distanceMm }, () => session.get().offsetFaces(id, faceIds, distanceMm, current)));
  tool("plasticity_move_faces", "Move exact current B-Rep faces by one nonzero world-space delta in millimeters. Plasticity extends and retrims adjacent faces; all topology references become stale after the edit.", z.object({ faces: z.array(faceRef).min(1).max(4096), deltaMm: direction, intent, revision }).strict(), async ({ faces, deltaMm, intent: purpose, revision: current }) =>
    await journaled("move-faces", purpose, { faces, deltaMm }, () => session.get().moveFaces(faces, deltaMm, current)));
  tool("plasticity_rotate_faces", "Rotate exact current B-Rep faces around a world-space pivot and axis. Pivot is millimeters and angle is degrees; Plasticity extends and retrims adjacent faces, invalidating old topology references.", z.object({ faces: z.array(faceRef).min(1).max(4096), pivotMm: vector, axis: direction, degrees: z.number().finite().refine((value) => value !== 0, "Angle must be nonzero"), intent, revision }).strict(), async ({ faces, pivotMm, axis, degrees, intent: purpose, revision: current }) =>
    await journaled("rotate-faces", purpose, { faces, pivotMm, axis, degrees }, () => session.get().rotateFaces(faces, pivotMm, axis, degrees, current)));
  tool("plasticity_scale_faces", "Scale exact current B-Rep face surfaces by positive world-space XYZ factors about a millimeter pivot. This is a direct surface edit: adjacent faces are retrimmed, and scaling a planar face within its unchanged infinite plane may be a no-op. Re-read exact geometry afterward.", z.object({
    faces: z.array(faceRef).min(1).max(4096),
    pivotMm: vector,
    factors: positiveVector.refine((values) => values.some((value) => value !== 1), "At least one scale factor must change"),
    intent,
    revision,
  }).strict(), async ({ faces, pivotMm, factors, intent: purpose, revision: current }) =>
    await journaled("scale-faces", purpose, { faces, pivotMm, factors }, () => session.get().scaleFaces(faces, pivotMm, factors, current)));
  tool("plasticity_thicken_faces", "Copy exact current faces from one Solid or Sheet into a new independent native body with nonnegative front and back thicknesses in millimeters. The original body is preserved. Front follows each selected face normal and back goes against it; at least one side must be positive. Re-read all topology and identify the new bodies after success.", z.object({
    faces: z.array(faceRef).min(1).max(4096),
    frontMm: z.number().finite().nonnegative(),
    backMm: z.number().finite().nonnegative(),
    intent,
    revision,
  }).strict().refine((value) => value.frontMm > 0 || value.backMm > 0, "At least one face-thickening distance must be positive"), async ({ faces, frontMm, backMm, intent: purpose, revision: current }) =>
    await journaled("thicken-faces", purpose, { faces, frontMm, backMm }, () => session.get().thickenFaces(faces, frontMm, backMm, current)));
  tool("plasticity_offset_face_loops", "Insert native offset loops around exact current faces from one Solid or Sheet at a signed millimeter distance. Positive and negative signs follow Plasticity's face and adjacent-surface orientation; they can place the new loop on the selected face or propagate it over adjacent faces. This splits topology without intentionally changing volume. Re-read the exact new faces and edges instead of assuming a world direction.", z.object({ faces: z.array(faceRef).min(1).max(4096), distanceMm: z.number().finite().refine((value) => value !== 0, "Distance must be nonzero"), individual: z.boolean().default(true), intent, revision }).strict(), async ({ faces, distanceMm, individual, intent: purpose, revision: current }) =>
    await journaled("offset-face-loops", purpose, { faces, distanceMm, individual }, () => session.get().offsetFaceLoops(faces, distanceMm, individual, current)));
  tool("plasticity_patch_solid_edge_loops", "Create independent native Sheet patches from exact edge loops selected on one current Solid. The source Solid, including any opening or through-hole, is preserved; this tool constructs covering surfaces and does not claim to heal, fill, or Boolean-close the Solid. Re-read the returned Sheets before thickening, sewing, or other downstream work.", z.object({ edges: z.array(edgeRef).min(1).max(4096), intent, revision }).strict(), async ({ edges, intent: purpose, revision: current }) =>
    await journaled("patch-solid-edge-loops", purpose, { edges }, () => session.get().patchSolidEdgeLoops(edges, current)));
  tool("plasticity_move_edges", "Move exact current B-Rep edges from one body by a nonzero world-space millimeter delta. Plasticity rebuilds adjacent faces, invalidating all prior topology references.", z.object({ edges: z.array(edgeRef).min(1).max(4096), deltaMm: direction, intent, revision }).strict(), async ({ edges, deltaMm, intent: purpose, revision: current }) =>
    await journaled("move-edges", purpose, { edges, deltaMm }, () => session.get().moveEdges(edges, deltaMm, current)));
  tool("plasticity_offset_edges", "Create native parallel edge offsets on one body at a signed millimeter distance. The sign chooses an adjacent surface according to Plasticity's oriented edge, so re-read the added strip and all topology after the edit.", z.object({ edges: z.array(edgeRef).min(1).max(4096), distanceMm: z.number().finite().refine((value) => value !== 0, "Distance must be nonzero"), intent, revision }).strict(), async ({ edges, distanceMm, intent: purpose, revision: current }) =>
    await journaled("offset-edges", purpose, { edges, distanceMm }, () => session.get().offsetEdges(edges, distanceMm, current)));
  tool("plasticity_delete_edges", "Remove exact current B-Rep edges from one body through Plasticity's native surface healing. Use for removable split or seam edges between compatible adjacent faces; the native operation can reject structural edges. Re-read all topology after success.", z.object({ edges: z.array(edgeRef).min(1).max(4096), intent, revision }).strict(), async ({ edges, intent: purpose, revision: current }) =>
    await journaled("delete-edges", purpose, { edges }, () => session.get().deleteEdges(edges, current)));
  tool("plasticity_offset_vertices", "Insert exact native split vertices at one positive millimeter distance along every incident edge of one or more current Solid or Sheet vertices from the same body. This preserves the outer shape and volume while rebuilding topology; it does not move the corner, chamfer it, or fillet it. Re-read every topology reference after success.", z.object({ vertices: z.array(measurementVertexRef).min(1).max(4096).refine((values) => new Set(values.map((value) => `${value.bodyId}:${value.vertexId}`)).size === values.length, "Shell vertex references must be unique"), distanceMm: z.number().finite().positive(), intent, revision }).strict(), async ({ vertices, distanceMm, intent: purpose, revision: current }) =>
    await journaled("offset-vertices", purpose, { vertices, distanceMm }, () => session.get().offsetVertices(vertices, distanceMm, current)));
  tool("plasticity_rectangular_face_pattern", "Repeat one exact connected feature-face set on the same Solid or Sheet in a native rectangular array. Counts include the source feature and spacing is center-to-center in millimeters. Re-read all topology and validate the result because Plasticity must recognize the selected faces as a repeatable feature.", z.object({
    faces: z.array(faceRef).min(1).max(4096),
    direction1: direction,
    count1: z.number().int().min(2).max(1000),
    spacing1Mm: z.number().finite().positive(),
    direction2: direction.default([0, 1, 0]),
    count2: z.number().int().min(1).max(1000).default(1),
    spacing2Mm: z.number().finite().nonnegative().default(0),
    intent,
    revision,
  }).strict().refine((value) => value.count2 === 1 || value.spacing2Mm > 0, "Second-axis spacing must be positive when count2 is greater than one"), async ({ faces, direction1, count1, spacing1Mm, direction2, count2, spacing2Mm, intent: purpose, revision: current }) =>
    await journaled("rectangular-face-pattern", purpose, { faces, direction1, count1, spacing1Mm, direction2, count2, spacing2Mm }, () => session.get().rectangularFacePattern(faces, direction1, count1, spacing1Mm, direction2, count2, spacing2Mm, current)));
  tool("plasticity_radial_face_pattern", "Repeat one exact connected feature-face set on the same Solid or Sheet around a world-space axis in a native radial array. Count includes the source feature and sweep is in degrees. Re-read all topology and validate the result because Plasticity must recognize the selected faces as a repeatable feature.", z.object({ faces: z.array(faceRef).min(1).max(4096), centerMm: vector, axis: direction, count: z.number().int().min(2).max(1000), sweepDegrees: z.number().finite().positive().max(360).default(360), intent, revision }).strict(), async ({ faces, centerMm, axis, count, sweepDegrees, intent: purpose, revision: current }) =>
    await journaled("radial-face-pattern", purpose, { faces, centerMm, axis, count, sweepDegrees }, () => session.get().radialFacePattern(faces, centerMm, axis, count, sweepDegrees, current)));
}

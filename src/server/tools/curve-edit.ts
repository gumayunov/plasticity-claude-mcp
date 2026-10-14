import { z } from "zod";
import { vector, direction, ids, uniqueBodyIds, curveIds, regionIds, nonzeroDistance, faceRef, measurementVertexRef, revision, intent, referenceIdentitySchema, curveSegmentSchema } from "../schemas/common.ts";
import { fragmentIds, endpointIds, regionOffsets, rebuildCurveInputSchema } from "../schemas/curve-edit.ts";
import type { ToolContext } from "../context.ts";

export function registerCurveEditTools(ctx: ToolContext): void {
  const { session, tool, journaled } = ctx;
  tool("plasticity_offset_planar_curves", "Create native offsets from planar Wire bodies. Signed distance follows each Wire orientation and is measured in millimeters.", z.object({ ids, distanceMm: nonzeroDistance, intent, revision }).strict(), async ({ ids: wireIds, distanceMm, intent: purpose, revision: current }) =>
    await journaled("offset-planar-curves", purpose, { ids: wireIds, distanceMm }, () => session.get().offsetPlanarCurves(wireIds, distanceMm, current)));
  tool("plasticity_offset_regions", "Create one or two native signed offsets from explicit Regions in the same sketch, preserving the source curves.", z.object({ regionIds, offsetsMm: regionOffsets, individual: z.boolean().default(true), intent, revision }).strict(), async ({ regionIds: selectedRegions, offsetsMm, individual, intent: purpose, revision: current }) =>
    await journaled("offset-regions", purpose, { regionIds: selectedRegions, offsetsMm, individual }, () => session.get().offsetRegions(selectedRegions, offsetsMm, individual, current)));
  tool("plasticity_trim_curve_fragments", "Remove one or more explicit revision-bound curve fragments using Plasticity's native Trim operation.", z.object({ fragmentIds, intent, revision }).strict(), async ({ fragmentIds: selectedFragments, intent: purpose, revision: current }) =>
    await journaled("trim-curve-fragments", purpose, { fragmentIds: selectedFragments }, () => session.get().trimCurveFragments(selectedFragments, current)));
  tool("plasticity_extend_curve_endpoints", "Extend one or more explicit revision-bound open Wire endpoints by a positive distance in millimeters.", z.object({ endpointIds, distanceMm: z.number().finite().positive(), intent, revision }).strict(), async ({ endpointIds: selectedEndpoints, distanceMm, intent: purpose, revision: current }) =>
    await journaled("extend-curve-endpoints", purpose, { endpointIds: selectedEndpoints, distanceMm }, () => session.get().extendCurveEndpoints(selectedEndpoints, distanceMm, current)));
  tool("plasticity_fillet_curve_vertices", "Round one or more exact interior or closed Wire vertices with Plasticity's native curve fillet in one history step. Vertex references come from plasticity_list_curve_vertices and are revision-bound; the positive radius is in millimeters. The edited Wire may receive a new stable body ID, so use the returned state before further work.", z.object({ vertices: z.array(measurementVertexRef).min(1).max(128).refine((values) => new Set(values.map((value) => `${value.bodyId}:${value.vertexId}`)).size === values.length, "Curve vertex references must be unique"), radiusMm: z.number().finite().positive(), intent, revision }).strict(), async ({ vertices, radiusMm, intent: purpose, revision: current }) =>
    await journaled("fillet-curve-vertices", purpose, { vertices, radiusMm }, () => session.get().filletCurveVertices(vertices, radiusMm, current)));
  tool("plasticity_unjoin_curves", "Split compound native Wire bodies into separate editable curve bodies.", z.object({ ids, intent, revision }).strict(), async ({ ids: wireIds, intent: purpose, revision: current }) =>
    await journaled("unjoin-curves", purpose, { ids: wireIds }, () => session.get().unjoinCurves(wireIds, current)));
  tool("plasticity_duplicate_curves", "Create independent exact native copies of one or more current Wire bodies in place while preserving the sources. The copies receive new stable body IDs and can be transformed or edited separately.", z.object({ ids, intent, revision }).strict(), async ({ ids: wireIds, intent: purpose, revision: current }) =>
    await journaled("duplicate-curves", purpose, { ids: wireIds }, () => session.get().duplicateCurves(wireIds, current)), false, { destructiveHint: false });
  tool("plasticity_create_curves_from_regions", "Create independent exact native Wire copies of the boundaries of explicit current planar Regions while preserving the source Wire geometry. Coincident boundary copies make Plasticity recompute automatic Regions, so all previous Region references become stale; use the returned state or plasticity_list_regions before downstream work.", z.object({ regionIds, intent, revision }).strict(), async ({ regionIds: selectedRegions, intent: purpose, revision: current }) =>
    await journaled("create-curves-from-regions", purpose, { regionIds: selectedRegions }, () => session.get().createCurvesFromRegions(selectedRegions, current)), false, { destructiveHint: false });
  tool("plasticity_join_curves", "Join two or more native Wire bodies into one editable compound curve.", z.object({ ids: ids.min(2), intent, revision }).strict(), async ({ ids: wireIds, intent: purpose, revision: current }) =>
    await journaled("join-curves", purpose, { ids: wireIds }, () => session.get().joinCurves(wireIds, current)));
  tool("plasticity_rebuild_curves", "Rebuild current native Wire bodies in one Plasticity history step. tolerance asks Plasticity to fit within an explicit millimeter target; control-points sets the native control-point count; degree-spans sets exact NURBS degree and span count. Read plasticity_inspect_curve_structure before and after, and measure geometric drift because a requested fit setting is not independent proof of deviation.", rebuildCurveInputSchema, async ({ ids: wireIds, intent: purpose, revision: current, ...options }) =>
    await journaled("rebuild-curves", purpose, { ids: wireIds, ...options }, () => session.get().rebuildCurves(wireIds, options, current)));
  tool("plasticity_raise_curve_degree", "Raise the native degree of every B-Spline segment in one or more current Wire bodies by one while preserving its shape. This adds edit freedom without adding shape detail. Inspect native curve structure before and after; each call occupies one Plasticity history step.", z.object({ ids, intent, revision }).strict(), async ({ ids: wireIds, intent: purpose, revision: current }) =>
    await journaled("raise-curve-degree", purpose, { ids: wireIds }, () => session.get().raiseCurveDegree(wireIds, current)));
  tool("plasticity_subdivide_curves", "Insert native knots into one or more current B-Spline Wire bodies while preserving degree and shape. This adds local edit points without changing the curve's path. Inspect native curve structure before and after; each call occupies one Plasticity history step.", z.object({ ids, intent, revision }).strict(), async ({ ids: wireIds, intent: purpose, revision: current }) =>
    await journaled("subdivide-curves", purpose, { ids: wireIds }, () => session.get().subdivideCurves(wireIds, current)));
  tool("plasticity_insert_curve_knot", "Insert one native knot into one exact current B-Spline Wire segment while preserving its path and degree. Use plasticity_list_curve_directions immediately before this call and pass a normalizedParameter strictly between 0 and 1, where 0 is the returned segment start and 1 is its end. This adds one local control point in one Plasticity history step; inspect native structure and functional geometry afterward.", z.object({ segment: curveSegmentSchema, normalizedParameter: z.number().finite().gt(0).lt(1), intent, revision }).strict(), async ({ segment, normalizedParameter, intent: purpose, revision: current }) =>
    await journaled("insert-curve-knot", purpose, { segment, normalizedParameter }, () => session.get().insertCurveKnot(segment, normalizedParameter, current)));
  tool("plasticity_split_curve_segment", "Split one exact nonperiodic current Wire segment into two consecutive segments at a normalized parameter strictly between 0 and 1. Evaluate the intended point first with plasticity_evaluate_curve_segments. The Wire body remains one body and its path is preserved, but every old segment reference becomes stale. Full periodic circles are rejected because one split point only relocates their seam.", z.object({ segment: curveSegmentSchema, normalizedParameter: z.number().finite().gt(0).lt(1), intent, revision }).strict(), async ({ segment, normalizedParameter, intent: purpose, revision: current }) =>
    await journaled("split-curve-segment", purpose, { segment, normalizedParameter }, () => session.get().splitCurveSegment(segment, normalizedParameter, current)));
  tool("plasticity_planarize_curves", "Orthogonally project one or more current Wire bodies onto an explicit world-space plane. This changes a spatial curve's path and may reverse its parameter direction, unlike degree elevation or subdivision. Verify planarity, endpoints, direction, and functional measurements afterward. The operation occupies one Plasticity history step.", z.object({ ids, originMm: vector, normal: direction, intent, revision }).strict(), async ({ ids: wireIds, originMm, normal, intent: purpose, revision: current }) =>
    await journaled("planarize-curves", purpose, { ids: wireIds, originMm, normal }, () => session.get().planarizeCurves(wireIds, originMm, normal, current)));
  tool("plasticity_reverse_curves", "Reverse the native direction of one or more current Wire bodies.", z.object({ ids, intent, revision }).strict(), async ({ ids: wireIds, intent: purpose, revision: current }) =>
    await journaled("reverse-curves", purpose, { ids: wireIds }, () => session.get().reverseCurves(wireIds, current)));
  tool("plasticity_create_body_outlines", "Create exact native Wire silhouettes from current Solid or Sheet bodies on an explicit current construction plane. Source placement keeps each outline at the source silhouette plane; workplane placement projects it onto the selected plane. Source bodies are preserved and the selected plane becomes active.", z.object({
    ids: z.array(z.number().int().positive()).min(1).max(4096).refine((values) => new Set(values).size === values.length, "Body IDs must be unique"),
    plane: referenceIdentitySchema,
    placement: z.enum(["source", "workplane"]).default("workplane"),
    intent,
    revision,
  }).strict(), async ({ ids: bodyIds, plane, placement, intent: purpose, revision: current }) =>
    await journaled("create-body-outlines", purpose, { bodyIds, plane, placement }, () =>
      session.get().createBodyOutlines(bodyIds, plane, placement, current)));
  tool("plasticity_project_curves_onto_body", "Project native Wire bodies onto a surface body along an explicit world-space vector while preserving the source curves.", z.object({
    targetId: z.number().int().positive(),
    curveIds: ids,
    direction,
    bidirectional: z.boolean().default(false),
    occlude: z.boolean().default(true),
    completion: z.enum(["none", "edge", "face-set"]).default("none"),
    intent,
    revision,
  }).strict(), async ({ targetId, curveIds, direction: projectionDirection, bidirectional, occlude, completion, intent: purpose, revision: current }) =>
    await journaled("project-curves-onto-body", purpose, { targetId, curveIds, direction: projectionDirection, bidirectional, occlude, completion }, () =>
      session.get().projectCurvesOntoBody(targetId, curveIds, projectionDirection, { bidirectional, occlude, completion }, current)));
  tool("plasticity_create_body_intersection_curves", "Create independent exact Wire curves at every native intersection between one Solid or Sheet target and one or more Solid or Sheet tools. All source bodies are preserved and the complete operation occupies one Plasticity history step.", z.object({
    targetId: z.number().int().positive(),
    toolIds: ids,
    intent,
    revision,
  }).strict(), async ({ targetId, toolIds, intent: purpose, revision: current }) =>
    await journaled("create-body-intersection-curves", purpose, { targetId, toolIds }, () =>
      session.get().createBodyIntersectionCurves(targetId, toolIds, current)));
  tool("plasticity_project_curve_pair", "Create an independent 3D Wire by intersecting the bidirectional extrusion surfaces of two distinct native Wire bodies. Supply one explicit world-space projection direction for each source and a depth in millimeters large enough for both temporary surfaces to overlap. Source curves are preserved and the operation occupies one Plasticity history step.", z.object({
    firstId: z.number().int().positive(),
    firstDirection: direction,
    secondId: z.number().int().positive(),
    secondDirection: direction,
    projectionDepthMm: z.number().finite().positive(),
    intent,
    revision,
  }).strict(), async ({ firstId, firstDirection, secondId, secondDirection, projectionDepthMm, intent: purpose, revision: current }) =>
    await journaled("project-curve-pair", purpose, { firstId, firstDirection, secondId, secondDirection, projectionDepthMm }, () =>
      session.get().projectCurvePair(firstId, firstDirection, secondId, secondDirection, projectionDepthMm, current)));
  tool("plasticity_deform_curves_between_faces", "Create independent native Wire copies by mapping selected curves from one exact source face onto a different exact target face. Source Wires and both reference-face bodies are preserved. Scale U/V/normal and orientation flags are dimensionless native mapping controls; inspect the returned exact curve points, tangents, lengths, and bounds because deformation intentionally changes geometry.", z.object({
    ids: uniqueBodyIds,
    sourceFace: faceRef,
    targetFace: faceRef,
    scaleU: z.number().finite().positive().max(1000).default(1),
    scaleV: z.number().finite().positive().max(1000).default(1),
    scaleNormal: z.number().finite().positive().max(1000).default(1),
    flipUV: z.boolean().default(false),
    flipNormal: z.boolean().default(false),
    mirror: z.boolean().default(false),
    intent,
    revision,
  }).strict().refine(
    (value) => value.sourceFace.bodyId !== value.targetFace.bodyId || value.sourceFace.faceId !== value.targetFace.faceId,
    "Source and target deformation faces must be different",
  ).refine(
    (value) => !value.ids.includes(value.sourceFace.bodyId) && !value.ids.includes(value.targetFace.bodyId),
    "Deformation curves must be separate from source and target face bodies",
  ), async ({ ids: curveIds, sourceFace, targetFace, scaleU, scaleV, scaleNormal, flipUV, flipNormal, mirror, intent: purpose, revision: current }) =>
    await journaled("deform-curves-between-faces", purpose, { curveIds, sourceFace, targetFace, scaleU, scaleV, scaleNormal, flipUV, flipNormal, mirror }, () =>
      session.get().deformCurvesBetweenFaces(curveIds, sourceFace, targetFace, { scaleU, scaleV, scaleNormal, flipUV, flipNormal, mirror }, current)), false, { destructiveHint: false });
  tool("plasticity_curve_pattern", "Distribute current Solid or Sheet bodies along the full length of one native Wire spine. Count includes the source position; Plasticity creates independent native bodies, preserves the spine, and applies its verified tangent-following orientation in one history step.", z.object({
    ids: z.array(z.number().int().positive()).min(1).max(4096).refine((values) => new Set(values).size === values.length, "Curve-pattern body IDs must be unique"),
    spineId: z.number().int().positive(),
    count: z.number().int().min(2).max(1000),
    intent,
    revision,
  }).strict(), async ({ ids: bodyIds, spineId, count, intent: purpose, revision: current }) =>
    await journaled("curve-pattern", purpose, { bodyIds, spineId, count }, () => session.get().curvePattern(bodyIds, spineId, count, current)));
}

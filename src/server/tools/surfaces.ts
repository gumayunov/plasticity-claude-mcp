import { z } from "zod";
import { vector, direction, ids, uniqueBodyIds, regionIds, faceRef, surfaceFaceRefs, revision, intent } from "../schemas/common.ts";
import { bridgeShellEdgesInputSchema } from "../schemas/surfaces.ts";
import type { ToolContext } from "../context.ts";

export function registerSurfacesTools(ctx: ToolContext): void {
  const { session, tool, journaled } = ctx;
  tool("plasticity_bridge_shell_edges", "Create one independent native B-Spline between explicitly selected endpoints of two exact current Solid or Sheet edges while preserving both source bodies. Each reference must pair a current edgeId with one of that edge's returned vertexIds. G0 through G3 continuity is selected independently at the two ends; exact endpoint and tangent read-back is required after the one-step operation.", bridgeShellEdgesInputSchema, async ({ first, second, startContinuity, endContinuity, intent: purpose, revision: current }) =>
    await journaled("bridge-shell-edges", purpose, { first, second, startContinuity, endContinuity }, () =>
      session.get().bridgeShellEdges(first, second, startContinuity, endContinuity, current)));
  tool("plasticity_raise_surface_degree", "Raise the U and V degree of every selected current native B-Surface face by one Plasticity step in one history entry. Plasticity 26.1.3 may also change span/control-point counts and exact geometry; inspect the surface structure, bounds, topology, and functional dimensions before and after instead of assuming shape preservation.", z.object({ faces: surfaceFaceRefs, intent, revision }).strict(), async ({ faces, intent: purpose, revision: current }) =>
    await journaled("raise-surface-degree", purpose, { faces }, () => session.get().raiseSurfaceDegree(faces, current)));
  tool("plasticity_untrim_faces", "Restore selected current Solid or Sheet faces to the natural bounds of their carrier surfaces in one native history entry. The selected trim boundaries are discarded, the result can overlap neighboring geometry, and all topology references become stale; inspect surface structure, bounds, validation, and intersections before continuing.", z.object({ faces: surfaceFaceRefs, intent, revision }).strict(), async ({ faces, intent: purpose, revision: current }) =>
    await journaled("untrim-faces", purpose, { faces }, () => session.get().untrimFaces(faces, current)));
  tool("plasticity_sweep_regions", "Sweep one or more explicit closed Regions along a native Wire spine to create exact Solid geometry.", z.object({
    regionIds,
    spineId: z.number().int().positive(),
    alignment: z.enum(["normal", "parallel", "transport"]).default("normal"),
    corner: z.enum(["miter", "round"]).default("miter"),
    twistDegrees: z.number().finite().default(0),
    scale: z.number().finite().positive().default(1),
    simplify: z.boolean().default(false),
    intent,
    revision,
  }).strict(), async ({ regionIds: selectedRegions, spineId, alignment, corner, twistDegrees, scale, simplify, intent: purpose, revision: current }) =>
    await journaled("sweep-regions", purpose, { regionIds: selectedRegions, spineId, alignment, corner, twistDegrees, scale, simplify }, () =>
      session.get().sweepRegions(selectedRegions, spineId, { alignment, corner, twistDegrees, scale, simplify }, current)));
  tool("plasticity_loft_regions", "Loft an ordered list of closed Regions from different sketch planes into exact capped geometry, optionally shaped by native Wire guide curves that intersect every profile.", z.object({
    regionIds: regionIds.min(2),
    guideIds: z.array(z.number().int().positive()).max(4096).default([]),
    trimGuides: z.boolean().default(true),
    closed: z.boolean().default(false),
    simplify: z.boolean().default(true),
    intent,
    revision,
  }).strict(), async ({ regionIds: selectedRegions, guideIds, trimGuides, closed, simplify, intent: purpose, revision: current }) =>
    await journaled("loft-regions", purpose, { regionIds: selectedRegions, guideIds, trimGuides, closed, simplify }, () =>
      session.get().loftRegions(selectedRegions, { guideIds, trimGuides, closed, simplify }, current)));
  tool("plasticity_loft_curves", "Create one independent native loft surface through an ordered list of current Wire profiles while preserving every profile and guide. Optional Wire guides must intersect every profile. Closed mode requires at least three profiles and closes the loft sequence; natural, unconstrained, or clamped native curvature plus positive dimensionless end magnitudes control shape. The operation never joins the result to source bodies; verify the returned Sheet topology and bounds.", z.object({
    profileIds: z.array(z.number().int().positive()).min(2).max(32).refine((values) => new Set(values).size === values.length, "Curve loft profile IDs must be unique"),
    guideIds: z.array(z.number().int().positive()).max(64).refine((values) => new Set(values).size === values.length, "Curve loft guide IDs must be unique").default([]),
    trimGuides: z.boolean().default(true),
    trimProfiles: z.boolean().default(true),
    closed: z.boolean().default(false),
    simplify: z.boolean().default(true),
    curvature: z.enum(["natural", "unconstrained", "clamped"]).default("unconstrained"),
    startMagnitude: z.number().finite().positive().default(1),
    endMagnitude: z.number().finite().positive().default(1),
    intent,
    revision,
  }).strict(), async ({ profileIds, guideIds, trimGuides, trimProfiles, closed, simplify, curvature, startMagnitude, endMagnitude, intent: purpose, revision: current }) =>
    await journaled("loft-curves", purpose, { profileIds, guideIds, trimGuides, trimProfiles, closed, simplify, curvature, startMagnitude, endMagnitude }, () =>
      session.get().loftCurves(profileIds, { guideIds, trimGuides, trimProfiles, closed, simplify, curvature, startMagnitude, endMagnitude }, current)));
  tool("plasticity_loft_faces", "Create one independent native capped loft Solid through an ordered list of exact planar faces from different current Solid or Sheet source bodies while preserving every source. Optional current Wire guides must intersect every profile. Natural, unconstrained, or clamped native end conditions and positive magnitudes control the two ends; verify the returned B-Rep rather than treating magnitude as a millimeter distance.", z.object({
    faces: z.array(faceRef).min(2).max(32),
    guideIds: z.array(z.number().int().positive()).max(64).default([]),
    trimGuides: z.boolean().default(true),
    simplify: z.boolean().default(true),
    startCondition: z.enum(["natural", "unconstrained", "clamped"]).default("unconstrained"),
    endCondition: z.enum(["natural", "unconstrained", "clamped"]).default("unconstrained"),
    startMagnitude: z.number().finite().positive().default(1),
    endMagnitude: z.number().finite().positive().default(1),
    intent,
    revision,
  }).strict(), async ({ faces, guideIds, trimGuides, simplify, startCondition, endCondition, startMagnitude, endMagnitude, intent: purpose, revision: current }) =>
    await journaled("loft-faces", purpose, { faces, guideIds, trimGuides, simplify, startCondition, endCondition, startMagnitude, endMagnitude }, () =>
      session.get().loftFaces(faces, { guideIds, trimGuides, simplify, startCondition, endCondition, startMagnitude, endMagnitude }, current)));
  tool("plasticity_patch_regions", "Create native Sheet bodies that fill explicit revision-bound closed Regions.", z.object({ regionIds, intent, revision }).strict(), async ({ regionIds: selectedRegions, intent: purpose, revision: current }) =>
    await journaled("patch-regions", purpose, { regionIds: selectedRegions }, () => session.get().patchRegions(selectedRegions, current)));
  tool("plasticity_patch_closed_wires", "Create independent native Sheet patches from current closed Wire bodies while preserving every source Wire. Unlike planar Region patching, this accepts nonplanar closed boundaries and can create B-Surfaces. Re-read exact boundaries, surface structure, area, and native validity; the native fill is not a constrained engineering surface unless those properties are separately verified.", z.object({ ids: uniqueBodyIds, intent, revision }).strict(), async ({ ids: wireIds, intent: purpose, revision: current }) =>
    await journaled("patch-closed-wires", purpose, { wireIds }, () => session.get().patchClosedWires(wireIds, current)), false, { destructiveHint: false });
  tool("plasticity_bridge_surface", "Create a native G2 transition surface between boundary sides of two Sheet faces. Pick points and width are millimeters; each pick point must lie on the intended boundary edge.", z.object({
    first: faceRef.extend({ pickPointMm: vector }).strict(),
    second: faceRef.extend({ pickPointMm: vector }).strict(),
    widthMm: z.number().finite().positive(),
    softness: z.number().finite().positive().default(1),
    intent,
    revision,
  }).strict().refine((value) => value.first.bodyId !== value.second.bodyId, "Surface Bridge requires two different Sheet bodies"), async ({ first, second, widthMm, softness, intent: purpose, revision: current }) =>
    await journaled("bridge-surface", purpose, { first, second, widthMm, softness }, () =>
      session.get().bridgeSurface(first, second, widthMm, softness, current)));
  tool("plasticity_join_sheets", "Sew two or more native Sheet bodies along coincident edges.", z.object({ ids: ids.min(2), intent, revision }).strict(), async ({ ids: sheetIds, intent: purpose, revision: current }) =>
    await journaled("join-sheets", purpose, { ids: sheetIds }, () => session.get().joinSheets(sheetIds, current)));
  tool("plasticity_create_constrained_surface", "Create a native B-Surface constrained by paired 3D points and normal vectors.", z.object({
    pointsMm: z.array(vector).min(4).max(1000),
    normals: z.array(direction).min(4).max(1000),
    toleranceMm: z.number().finite().positive().default(0.01),
    angularToleranceDegrees: z.number().finite().positive().max(90).default(5),
    optimization: z.enum(["performance", "smoothness"]).default("performance"),
    intent,
    revision,
  }).strict().refine((value) => value.pointsMm.length === value.normals.length, "Provide one normal per point"), async ({ pointsMm, normals, toleranceMm, angularToleranceDegrees, optimization, intent: purpose, revision: current }) =>
    await journaled("create-constrained-surface", purpose, { pointsMm, normals, toleranceMm, angularToleranceDegrees, optimization }, () =>
      session.get().createConstrainedSurface(pointsMm, normals, { toleranceMm, angularToleranceDegrees, optimization }, current)));
  tool("plasticity_rebuild_face", "Refit one exact current Solid or Sheet face as a native B-Surface with projected boundary edges. The positive millimeter tolerance is an approximation setting, not a measured deviation bound. Plasticity rebuilds the owning body in one history step and invalidates every prior topology reference; re-read dimensions, surface structure, continuity, mass properties, and native validity afterward.", z.object({
    face: faceRef,
    toleranceMm: z.number().finite().positive().max(10),
    intent,
    revision,
  }).strict(), async ({ face, toleranceMm, intent: purpose, revision: current }) =>
    await journaled("rebuild-face", purpose, { face, toleranceMm }, () => session.get().rebuildFace(face, toleranceMm, current)));
  tool("plasticity_match_faces", "Replace one or more exact current Solid or Sheet face surfaces with the carrier surface of one separate current replacement face. Plasticity extends or trims adjacent faces to meet the replacement surface and performs the direct edit in one history step. An external replacement body is preserved; the edited bodies keep their stable IDs, but all prior topology references become stale. Verify bounds, analytic surface type, mass properties, interference, and native validity afterward.", z.object({
    faces: surfaceFaceRefs,
    replacement: faceRef,
    intent,
    revision,
  }).strict().refine(
    (value) => !value.faces.some((face) => face.bodyId === value.replacement.bodyId && face.faceId === value.replacement.faceId),
    "Replacement face must be separate from the faces being matched",
  ), async ({ faces, replacement, intent: purpose, revision: current }) =>
    await journaled("match-faces", purpose, { faces, replacement }, () => session.get().matchFaces(faces, replacement, current)));
  tool("plasticity_deform_bodies_between_faces", "Create independent native Solid or Sheet copies by mapping all faces of selected bodies from one exact source face onto a different exact target face. Source bodies and both reference-face bodies are preserved. Scale U/V/normal and orientation flags are dimensionless native mapping controls; inspect the resulting exact geometry because deformation intentionally changes shape and dimensions.", z.object({
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
    "Deformation bodies must be separate from source and target face bodies",
  ), async ({ ids: bodyIds, sourceFace, targetFace, scaleU, scaleV, scaleNormal, flipUV, flipNormal, mirror, intent: purpose, revision: current }) =>
    await journaled("deform-bodies-between-faces", purpose, { bodyIds, sourceFace, targetFace, scaleU, scaleV, scaleNormal, flipUV, flipNormal, mirror }, () =>
      session.get().deformBodiesBetweenFaces(bodyIds, sourceFace, targetFace, { scaleU, scaleV, scaleNormal, flipUV, flipNormal, mirror }, current)), false, { destructiveHint: false });
}

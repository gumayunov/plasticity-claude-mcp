import { z } from "zod";
import { vector, positiveVector, direction, ids, curveIds, regionIds, nonzeroDistance, faceRef, revision, intent } from "../schemas/common.ts";
import type { ToolContext } from "../context.ts";

export function registerSolidsTools(ctx: ToolContext): void {
  const { session, tool, journaled } = ctx;
  tool("plasticity_create_box", "Create an axis-aligned exact CAD box. Coordinates and size are millimeters.", z.object({ originMm: vector, sizeMm: positiveVector, name: z.string().trim().min(1).max(120).optional(), intent, revision }), async ({ originMm, sizeMm, name, intent: purpose, revision: current }) =>
    await journaled("create-box", purpose, { originMm, sizeMm, name }, () => session.get().createBox(originMm, sizeMm, name, current)));
  tool("plasticity_create_cylinder", "Create an exact CAD cylinder along a world-space axis. Dimensions are millimeters.", z.object({ centerMm: vector, radiusMm: z.number().finite().positive(), heightMm: z.number().finite().positive(), axis: direction.default([0, 0, 1]), name: z.string().trim().min(1).max(120).optional(), intent, revision }), async ({ centerMm, radiusMm, heightMm, axis, name, intent: purpose, revision: current }) =>
    await journaled("create-cylinder", purpose, { centerMm, radiusMm, heightMm, axis, name }, () => session.get().createCylinder(centerMm, radiusMm, heightMm, name, current, axis)));
  tool("plasticity_create_cone", "Create an exact cone or conical frustum Solid and preserve its editable meridional polyline profile in one Plasticity history step. The bottom center, unequal bottom and top radii, height, axis, and nonparallel radial direction are explicit. Use topRadiusMm=0 for a pointed cone and plasticity_create_cylinder when the radii are equal.", z.object({
    bottomCenterMm: vector,
    bottomRadiusMm: z.number().finite().positive(),
    topRadiusMm: z.number().finite().nonnegative(),
    heightMm: z.number().finite().positive(),
    axis: direction.default([0, 0, 1]),
    radialDirection: direction.default([1, 0, 0]),
    name: z.string().trim().min(1).max(120).optional(),
    intent,
    revision,
  }).strict(), async ({ bottomCenterMm, bottomRadiusMm, topRadiusMm, heightMm, axis, radialDirection, name, intent: purpose, revision: current }) =>
    await journaled("create-cone", purpose, { bottomCenterMm, bottomRadiusMm, topRadiusMm, heightMm, axis, radialDirection, name }, () =>
      session.get().createCone(bottomCenterMm, bottomRadiusMm, topRadiusMm, heightMm, axis, radialDirection, name, current)));
  tool("plasticity_create_torus", "Create an exact ring torus Solid and preserve its editable native circular profile in one Plasticity history step. Center, major radius to the tube centerline, minor tube radius, symmetry axis, and radial zero direction are explicit; the major radius must exceed the minor radius.", z.object({
    centerMm: vector,
    majorRadiusMm: z.number().finite().positive(),
    minorRadiusMm: z.number().finite().positive(),
    axis: direction.default([0, 0, 1]),
    radialDirection: direction.default([1, 0, 0]),
    name: z.string().trim().min(1).max(120).optional(),
    intent,
    revision,
  }).strict(), async ({ centerMm, majorRadiusMm, minorRadiusMm, axis, radialDirection, name, intent: purpose, revision: current }) =>
    await journaled("create-torus", purpose, { centerMm, majorRadiusMm, minorRadiusMm, axis, radialDirection, name }, () =>
      session.get().createTorus(centerMm, majorRadiusMm, minorRadiusMm, axis, radialDirection, name, current)));
  tool("plasticity_create_sphere", "Create an exact CAD sphere in millimeters.", z.object({ centerMm: vector, radiusMm: z.number().finite().positive(), name: z.string().trim().min(1).max(120).optional(), intent, revision }), async ({ centerMm, radiusMm, name, intent: purpose, revision: current }) =>
    await journaled("create-sphere", purpose, { centerMm, radiusMm, name }, () => session.get().createSphere(centerMm, radiusMm, name, current)));
  tool("plasticity_boolean", "Apply exact CAD union, difference, or intersection.", z.object({ targetIds: ids, toolIds: ids, operation: z.enum(["union", "difference", "intersection"]), keepTools: z.boolean().default(false), intent, revision }), async ({ targetIds, toolIds, operation, keepTools, intent: purpose, revision: current }) =>
    await journaled(`boolean-${operation}`, purpose, { targetIds, toolIds, keepTools }, () => session.get().boolean(targetIds, toolIds, operation, keepTools, current)));
  tool("plasticity_cut_with_faces", "Split current Solid or Sheet bodies with current planar cutter faces. Cutter bodies are preserved. To trim an open Sheet, inspect the returned exact Sheet parts and delete only the unwanted part at the returned revision.", z.object({ targetIds: ids, cutterFaces: z.array(faceRef).min(1).max(4096), intent, revision }).strict(), async ({ targetIds, cutterFaces, intent: purpose, revision: current }) =>
    await journaled("cut-with-faces", purpose, { targetIds, cutterFaces }, () => session.get().cutWithFaces(targetIds, cutterFaces, current)));
  tool("plasticity_fillet", "Fillet current edge IDs with a radius in millimeters.", z.object({ id: z.number().int().positive(), edgeIds: z.array(z.string()).min(1), radiusMm: z.number().finite().positive(), intent, revision }), async ({ id, edgeIds, radiusMm, intent: purpose, revision: current }) =>
    await journaled("fillet", purpose, { id, edgeIds, radiusMm }, () => session.get().fillet(id, edgeIds, radiusMm, current)));
  tool("plasticity_chamfer", "Chamfer current edge IDs by an equal distance in millimeters.", z.object({ id: z.number().int().positive(), edgeIds: z.array(z.string()).min(1), distanceMm: z.number().finite().positive(), intent, revision }), async ({ id, edgeIds, distanceMm, intent: purpose, revision: current }) =>
    await journaled("chamfer", purpose, { id, edgeIds, distanceMm }, () => session.get().chamfer(id, edgeIds, distanceMm, current)));
  tool("plasticity_remove_fillets", "Remove every native fillet recognized on one or more current Solid or Sheet bodies.", z.object({ ids, intent, revision }).strict(), async ({ ids: bodyIds, intent: purpose, revision: current }) =>
    await journaled("remove-fillets", purpose, { ids: bodyIds }, () => session.get().removeFillets(bodyIds, current)));
  tool("plasticity_refillet_faces", "Change recognized native fillet faces by a signed radius delta in millimeters.", z.object({ faces: z.array(faceRef).min(1).max(4096), deltaMm: nonzeroDistance, intent, revision }).strict(), async ({ faces, deltaMm, intent: purpose, revision: current }) =>
    await journaled("refillet-faces", purpose, { faces, deltaMm }, () => session.get().refilletFaces(faces, deltaMm, current)));
  tool("plasticity_extrude_faces", "Extrude current face IDs by a distance in millimeters.", z.object({ id: z.number().int().positive(), faceIds: z.array(z.string()).min(1), distanceMm: z.number().finite(), intent, revision }), async ({ id, faceIds, distanceMm, intent: purpose, revision: current }) =>
    await journaled("extrude-faces", purpose, { id, faceIds, distanceMm }, () => session.get().extrudeFaces(id, faceIds, distanceMm, current)));
  tool("plasticity_extrude_profile", "Extrude one unambiguous closed planar Wire profile into a native Solid.", z.object({ id: z.number().int().positive(), distanceMm: z.number().finite(), intent, revision }), async ({ id, distanceMm, intent: purpose, revision: current }) =>
    await journaled("extrude-profile", purpose, { id, distanceMm }, () => session.get().extrudeProfile(id, distanceMm, current)));
  tool("plasticity_extrude_regions", "Extrude one or more explicit revision-bound planar regions into native solids.", z.object({ regionIds, distanceMm: z.number().finite(), intent, revision }).strict(), async ({ regionIds: selectedRegions, distanceMm, intent: purpose, revision: current }) =>
    await journaled("extrude-regions", purpose, { regionIds: selectedRegions, distanceMm }, () => session.get().extrudeRegions(selectedRegions, distanceMm, current)));
  tool("plasticity_imprint_curves_on_body", "Project native Wire bodies onto a Solid or Sheet and split its exact faces along the projected curves.", z.object({
    targetId: z.number().int().positive(),
    curveIds: ids,
    direction,
    bidirectional: z.boolean().default(false),
    occlude: z.boolean().default(true),
    completion: z.enum(["none", "edge", "face-set"]).default("none"),
    intent,
    revision,
  }).strict(), async ({ targetId, curveIds, direction: imprintDirection, bidirectional, occlude, completion, intent: purpose, revision: current }) =>
    await journaled("imprint-curves-on-body", purpose, { targetId, curveIds, direction: imprintDirection, bidirectional, occlude, completion }, () =>
      session.get().imprintCurvesOnBody(targetId, curveIds, imprintDirection, { bidirectional, occlude, completion }, current)));
  tool("plasticity_imprint_bodies", "Split a Solid or Sheet target along exact intersections with preserved Solid or Sheet tool bodies.", z.object({ targetId: z.number().int().positive(), toolIds: ids, intent, revision }).strict(), async ({ targetId, toolIds, intent: purpose, revision: current }) =>
    await journaled("imprint-bodies", purpose, { targetId, toolIds }, () => session.get().imprintBodies(targetId, toolIds, current)));
  tool("plasticity_create_pipes", "Create native solid or hollow circular pipes along one or more Wire spines. Diameter and optional wall thickness are millimeters.", z.object({
    spineIds: ids,
    diameterMm: z.number().finite().positive(),
    wallThicknessMm: z.number().finite().nonnegative().default(0),
    intent,
    revision,
  }).strict(), async ({ spineIds, diameterMm, wallThicknessMm, intent: purpose, revision: current }) =>
    await journaled("create-pipes", purpose, { spineIds, diameterMm, wallThicknessMm }, () =>
      session.get().createPipes(spineIds, diameterMm, wallThicknessMm, current)));
  tool("plasticity_revolve_profile", "Revolve a planar Wire profile around a world-space axis. Axis origin is millimeters and the positive angle is degrees.", z.object({ id: z.number().int().positive(), axisOriginMm: vector, axis: direction, angleDegrees: z.number().finite().positive().max(360), intent, revision }).strict(), async ({ id, axisOriginMm, axis, angleDegrees, intent: purpose, revision: current }) =>
    await journaled("revolve-profile", purpose, { id, axisOriginMm, axis, angleDegrees }, () => session.get().revolveProfile(id, axisOriginMm, axis, angleDegrees, current)));
  tool("plasticity_hollow_faces", "Remove selected faces and shell a solid with an inward or outward wall thickness in millimeters.", z.object({ id: z.number().int().positive(), faceIds: z.array(z.string()).min(1), wallThicknessMm: z.number().finite().positive(), direction: z.enum(["inward", "outward"]).default("inward"), intent, revision }), async ({ id, faceIds, wallThicknessMm, direction: shellDirection, intent: purpose, revision: current }) =>
    await journaled("hollow-faces", purpose, { id, faceIds, wallThicknessMm, direction: shellDirection }, () => session.get().hollowFaces(id, faceIds, wallThicknessMm, shellDirection, current)));
  tool("plasticity_hollow_solids", "Turn one or more current Solid bodies into closed hollow Solids without removing an opening face. Inward preserves the outside envelope; outward preserves the original interior envelope. Wall thickness is in millimeters and every body is changed in one native history step.", z.object({
    ids: z.array(z.number().int().positive()).min(1).max(4096).refine((values) => new Set(values).size === values.length, "Solid IDs must be unique"),
    wallThicknessMm: z.number().finite().positive(),
    direction: z.enum(["inward", "outward"]).default("inward"),
    intent,
    revision,
  }).strict(), async ({ ids: solidIds, wallThicknessMm, direction: shellDirection, intent: purpose, revision: current }) =>
    await journaled("hollow-solids", purpose, { ids: solidIds, wallThicknessMm, direction: shellDirection }, () => session.get().hollowSolids(solidIds, wallThicknessMm, shellDirection, current)));
}

import { z } from "zod";
import { vector, ids, uniqueBodyIds, faceRef, revision, intent } from "../schemas/common.ts";
import type { ToolContext } from "../context.ts";

export function registerSheetsTools(ctx: ToolContext): void {
  const { session, tool, journaled } = ctx;
  tool("plasticity_reverse_sheets", "Reverse the native surface normal orientation of one or more current Sheet bodies.", z.object({ ids, intent, revision }).strict(), async ({ ids: sheetIds, intent: purpose, revision: current }) =>
    await journaled("reverse-sheets", purpose, { ids: sheetIds }, () => session.get().reverseSheets(sheetIds, current)));
  tool("plasticity_unwrap_face", "Create an exact planar native Sheet development from one current analytic Cylinder face while preserving the source body. This is geometric surface unwrapping; it does not add sheet thickness, bend radii, bend allowances, or manufacturing compensation. Plasticity chooses the seam and planar placement, so inspect the returned Sheet bounds and edges.", z.object({ face: faceRef, intent, revision }).strict(), async ({ face, intent: purpose, revision: current }) =>
    await journaled("unwrap-face", purpose, { face }, () => session.get().unwrapFace(face, current)), false, { destructiveHint: false });
  tool("plasticity_analyze_cone_development", "Calculate an area-preserving annular-sector profile from one complete native conical-frustum face bounded by two full circles and one straight seam. Returns exact B-Rep source identity, radii, sector radii, slant length and included angle; it does not create geometry. Pointed cones, partial cone faces and faces with additional boundaries are rejected.", z.object({ face: faceRef, intent, revision }).strict(), async ({ face, intent: purpose, revision: current }) =>
    await journaled("analyze-cone-development", purpose, { face }, () => session.get().analyzeConeDevelopment(face, current)), true);
  tool("plasticity_create_cone_development", "Create an exact area-preserving planar annular-sector Sheet from one complete native conical-frustum face. The profile is placed in the world XY plane with its inner arc starting at originMm; source Solid is preserved. This performs six native history steps (two arcs, two radial lines, join and patch), validates the Sheet and compares exact B-Rep boundary lengths and face area with the source. If interrupted or an error is returned after edits begin, inspect plasticity_status/changes before deciding whether to continue or undo; this tool never retries or rolls back automatically. Pointed cones, partial cone faces, and faces with additional boundary loops are unsupported.", z.object({
    face: faceRef,
    originMm: vector,
    intent,
    revision,
  }).strict(), async ({ face, originMm, intent: purpose, revision: current }) =>
    await journaled("create-cone-development", purpose, { face, originMm }, () => session.get().createConeDevelopment(face, originMm, current)), false, { destructiveHint: false });
  tool("plasticity_insert_sheet", "Insert one separate current fill Sheet into explicit boundary edges of another current target Sheet. Plasticity consumes both input bodies and returns one rebuilt Sheet or Solid in one history step; every prior body and topology reference becomes stale, so inspect the returned state and validate the result.", z.object({
    targetSheetId: z.number().int().positive(),
    edgeIds: z.array(z.string().trim().min(1)).min(1).max(4096).refine((values) => new Set(values).size === values.length, "Target boundary edge IDs must be unique"),
    fillSheetId: z.number().int().positive(),
    intent,
    revision,
  }).strict().refine((value) => value.targetSheetId !== value.fillSheetId, "Target and fill Sheet IDs must be different"), async ({ targetSheetId, edgeIds, fillSheetId, intent: purpose, revision: current }) =>
    await journaled("insert-sheet", purpose, { targetSheetId, edgeIds, fillSheetId }, () => session.get().insertSheet(targetSheetId, edgeIds, fillSheetId, current)));
  tool("plasticity_unjoin_shells", "Explode every face of one or more current multi-face Solid or Sheet bodies into independent single-face native Sheets in one Plasticity history step. The selected bodies are replaced, one result may reuse a source stable ID, and all prior body and topology references become stale; use the returned state.", z.object({ ids: uniqueBodyIds, intent, revision }).strict(), async ({ ids: bodyIds, intent: purpose, revision: current }) =>
    await journaled("unjoin-shells", purpose, { ids: bodyIds }, () => session.get().unjoinShells(bodyIds, current)));
  tool("plasticity_create_solid_from_sheet", "Create a native Solid from one closed Sheet shell while preserving the source Sheet.", z.object({ id: z.number().int().positive(), intent, revision }).strict(), async ({ id, intent: purpose, revision: current }) =>
    await journaled("create-solid-from-sheet", purpose, { id }, () => session.get().createSolidFromSheet(id, current)));
  tool("plasticity_patch_sheet_hole", "Fill one closed boundary loop on a native Sheet using exact current edge IDs.", z.object({ id: z.number().int().positive(), edgeIds: z.array(z.string().min(1)).min(3).max(4096), intent, revision }).strict(), async ({ id, edgeIds, intent: purpose, revision: current }) =>
    await journaled("patch-sheet-hole", purpose, { id, edgeIds }, () => session.get().patchSheetHole(id, edgeIds, current)));
  tool("plasticity_cap_sheet_holes", "Cap every planar open boundary of one or more native Sheet bodies in one history step.", z.object({ ids, intent, revision }).strict(), async ({ ids: sheetIds, intent: purpose, revision: current }) =>
    await journaled("cap-sheet-holes", purpose, { ids: sheetIds }, () => session.get().capSheetHoles(sheetIds, current)));
  tool("plasticity_extend_sheet_edges", "Linearly extend selected boundary edges of one native Sheet by a positive millimeter distance.", z.object({ id: z.number().int().positive(), edgeIds: z.array(z.string().trim().min(1)).min(1).max(4096), distanceMm: z.number().finite().positive(), intent, revision }).strict(), async ({ id, edgeIds, distanceMm, intent: purpose, revision: current }) =>
    await journaled("extend-sheet-edges", purpose, { id, edgeIds, distanceMm }, () => session.get().extendSheetEdges(id, edgeIds, distanceMm, current)));
  tool("plasticity_thicken_sheets", "Thicken native Sheet bodies into solids. Front and back distances are nonnegative millimeters on opposite sides of each sheet.", z.object({ ids, frontMm: z.number().finite().nonnegative(), backMm: z.number().finite().nonnegative(), intent, revision }).strict().refine((value) => value.frontMm + value.backMm > 0, "At least one thicken distance must be positive"), async ({ ids: bodyIds, frontMm, backMm, intent: purpose, revision: current }) =>
    await journaled("thicken-sheets", purpose, { bodyIds, frontMm, backMm }, () => session.get().thickenSheets(bodyIds, frontMm, backMm, current)));
}

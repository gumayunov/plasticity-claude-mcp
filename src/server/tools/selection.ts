import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ids, curveIds, instanceIds, referenceMeshIds, faceRef, edgeRef, curveControlPointRefs, revision, groupSelectionFields, requireNodeSelection, faceQuerySchema, edgeQuerySchema, type NamedSelection } from "../schemas/common.ts";
import type { ToolContext } from "../context.ts";

export function registerSelectionTools(ctx: ToolContext): void {
  const { session, namedSelections, tool, evaluateNamedSelection } = ctx;
  tool("plasticity_current_selection", "Read bodies, linked instances, approximate reference meshes, groups, faces, edges, regions, and native Wire boundary/control handles currently selected by the user in Plasticity.", z.object({}), async () =>
    await session.get().selection(), true);
  tool("plasticity_select_bodies", "Replace the current Plasticity selection with stable body IDs.", z.object({ ids, revision }), async ({ ids: bodyIds, revision: current }) =>
    await session.get().selectBodies(bodyIds, current));
  tool("plasticity_select_curves", "Replace the current Plasticity selection with whole native Wire curves, using current revision-bound Wire IDs. The returned curveIds identify selected Wires; bodyIds may also contain the same native Wire IDs.", z.object({ ids, revision }).strict(), async ({ ids: curveIds, revision: current }) =>
    await session.get().selectCurves(curveIds, current));
  tool("plasticity_select_nodes", "Replace the current Plasticity selection with a mixed set of current bodies, linked instances, approximate reference meshes, and native groups so the agent can point out assembly content in the application.", z.object({ ...groupSelectionFields, revision }).strict().superRefine(requireNodeSelection), async ({ bodyIds, instanceIds: currentInstanceIds, referenceMeshIds: currentReferenceMeshIds, groupIds: currentGroupIds, revision: current }) =>
    await session.get().selectNodes(bodyIds, currentInstanceIds, currentReferenceMeshIds, currentGroupIds, current));
  tool("plasticity_select_reference_meshes", "Replace the current Plasticity selection with current imported STL/OBJ reference meshes so the agent and user can point at the same approximate reference objects in the application.", z.object({ ids: referenceMeshIds, revision }).strict(), async ({ ids: currentIds, revision: current }) =>
    await session.get().selectReferenceMeshes(currentIds, current));
  tool("plasticity_select_faces", "Replace the current Plasticity selection with exact revision-bound B-Rep faces so the agent can point out surfaces in the application.", z.object({ faces: z.array(faceRef).min(1).max(4096).refine((values) => new Set(values.map((value) => `${value.bodyId}:${value.faceId}`)).size === values.length, "Face references must be unique"), revision }).strict(), async ({ faces, revision: current }) =>
    await session.get().selectFaces(faces, current));
  tool("plasticity_select_edges", "Replace the current Plasticity selection with exact revision-bound B-Rep edges so the agent can point out boundaries in the application.", z.object({ edges: z.array(edgeRef).min(1).max(4096).refine((values) => new Set(values.map((value) => `${value.bodyId}:${value.edgeId}`)).size === values.length, "Edge references must be unique"), revision }).strict(), async ({ edges, revision: current }) =>
    await session.get().selectEdges(edges, current));
  tool("plasticity_select_curve_control_points", "Replace the current Plasticity selection with revision-bound Wire boundary vertices and interior B-Spline control points so the agent can point out the handles it will edit. References must come from plasticity_list_curve_control_points.", z.object({ points: curveControlPointRefs, revision }).strict(), async ({ points, revision: current }) =>
    await session.get().selectCurveControlPoints(points, current));
  tool("plasticity_save_named_selection", "Save a semantic face or edge query and re-evaluate it after topology changes.", z.discriminatedUnion("kind", [
    z.object({ name: z.string().trim().min(1).max(120), kind: z.literal("faces"), query: faceQuerySchema, expectedCount: z.number().int().positive().max(4096).optional(), revision }).strict(),
    z.object({ name: z.string().trim().min(1).max(120), kind: z.literal("edges"), query: edgeQuerySchema, expectedCount: z.number().int().positive().max(4096).optional(), revision }).strict(),
  ]), async ({ name, kind, query, expectedCount, revision: expected }) => {
    const state = await session.get().state();
    if (state.revision !== expected) throw new Error(`Stale reference: expected revision ${expected}, current revision is ${state.revision}`);
    if ([...namedSelections.values()].some((selection) => selection.name === name && selection.documentToken === state.documentToken)) {
      throw new Error(`Named selection already exists in this document: ${name}`);
    }
    const selection: NamedSelection = {
      id: randomUUID(),
      name,
      kind,
      query,
      expectedCount: expectedCount ?? null,
      documentToken: state.documentToken,
      createdRevision: state.revision,
      createdAt: new Date().toISOString(),
    };
    namedSelections.set(selection.id, selection);
    return evaluateNamedSelection(selection, state);
  });
  tool("plasticity_list_named_selections", "Re-evaluate all semantic named selections against the current document revision.", z.object({}), async () => {
    const state = await session.get().state();
    return {
      documentToken: state.documentToken,
      revision: state.revision,
      selections: [...namedSelections.values()].map((selection) => evaluateNamedSelection(selection, state)),
    };
  }, true);
  tool("plasticity_delete_named_selection", "Delete one MCP semantic named selection without changing Plasticity geometry.", z.object({ selectionId: z.string().uuid() }).strict(), async ({ selectionId }) => {
    if (!namedSelections.delete(selectionId)) throw new Error(`Unknown named selection: ${selectionId}`);
    return { deleted: selectionId };
  });
}

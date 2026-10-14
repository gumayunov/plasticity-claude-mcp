import { z } from "zod";
import { revision, intent, referenceIdentitySchema } from "../schemas/common.ts";
import { datumPointDefinitionSchema, datumAxisDefinitionSchema, constructionPlaneDefinitionSchema } from "../schemas/construction.ts";
import type { ToolContext } from "../context.ts";

export function registerConstructionTools(ctx: ToolContext): void {
  const { session, tool, journaled } = ctx;
  tool("plasticity_define_datum_point", "Define a revision-bound point from coordinates or exact current topology.", z.object({ definition: datumPointDefinitionSchema, revision, intent }).strict(), async ({ definition, revision: current, intent: purpose }) =>
    await journaled("define-datum-point", purpose, { definition }, () => session.get().defineDatumPoint(definition, current)), false, { destructiveHint: false });
  tool("plasticity_define_datum_axis", "Define a revision-bound axis from points, coordinates, a linear edge, or a cylindrical face.", z.object({ definition: datumAxisDefinitionSchema, revision, intent }).strict(), async ({ definition, revision: current, intent: purpose }) =>
    await journaled("define-datum-axis", purpose, { definition }, () => session.get().defineDatumAxis(definition, current)), false, { destructiveHint: false });
  tool("plasticity_create_construction_plane", "Create a native saved construction plane from an exact plane definition.", z.object({ definition: constructionPlaneDefinitionSchema, name: z.string().trim().min(1).max(120).optional(), revision, intent }).strict(), async ({ definition, name, revision: current, intent: purpose }) =>
    await journaled("create-construction-plane", purpose, { definition, name }, () => session.get().createConstructionPlane(definition, name, current)));
  tool("plasticity_list_construction_geometry", "List session datums and current standard and saved construction planes.", z.object({}).strict(), async () =>
    await session.get().listConstructionGeometry(), true);
  tool("plasticity_set_workplane", "Activate a current construction plane in the selected Plasticity window.", z.object({ plane: referenceIdentitySchema, intent }).strict(), async ({ plane, intent: purpose }) =>
    await journaled("set-workplane", purpose, { plane }, () => session.get().setConstructionWorkplane(plane)));
  tool("plasticity_remove_construction_plane", "Remove one current saved construction plane. Standard planes are protected.", z.object({ plane: referenceIdentitySchema, intent }).strict(), async ({ plane, intent: purpose }) =>
    await journaled("remove-construction-plane", purpose, { plane }, () => session.get().removeConstructionPlane(plane)));
  tool("plasticity_refresh_datum", "Re-resolve a geometry-backed datum after a document revision change.", z.object({ reference: referenceIdentitySchema, intent }).strict(), async ({ reference, intent: purpose }) =>
    await journaled("refresh-datum", purpose, { reference }, () => session.get().refreshDatum(reference)), false, { destructiveHint: false });
}

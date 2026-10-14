import { z } from "zod";
import { ids, intent, revision } from "./common.ts";

export const appearanceMaterialInputSchema = z.object({
  ids,
  materialId: z.number().int().nonnegative().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  roughness: z.number().finite().min(0).max(1).optional(),
  metalness: z.number().finite().min(0).max(1).optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
  intent,
  revision,
}).strict().superRefine((input, context) => {
  const appearanceFields = [input.name, input.colorHex, input.roughness, input.metalness, input.opacity];
  if (input.materialId !== undefined && appearanceFields.some((value) => value !== undefined)) {
    context.addIssue({ code: "custom", path: ["materialId"], message: "Use an existing materialId or define a new appearance, not both" });
  }
  if (input.materialId === undefined && (input.name === undefined || input.colorHex === undefined)) {
    context.addIssue({ code: "custom", path: ["name"], message: "A new appearance requires both name and colorHex" });
  }
});

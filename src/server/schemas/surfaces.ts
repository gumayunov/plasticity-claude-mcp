import { z } from "zod";
import { shellEdgeEndpointSchema, intent, revision } from "./common.ts";

export const bridgeShellEdgesInputSchema = z.object({
  first: shellEdgeEndpointSchema,
  second: shellEdgeEndpointSchema,
  startContinuity: z.enum(["G0", "G1", "G2", "G3"]).default("G2"),
  endContinuity: z.enum(["G0", "G1", "G2", "G3"]).default("G2"),
  intent,
  revision,
}).strict().refine(
  (value) => value.first.bodyId !== value.second.bodyId || value.first.edgeId !== value.second.edgeId,
  "Shell Edge Bridge requires two different source edges",
);

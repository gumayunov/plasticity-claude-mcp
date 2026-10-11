import { z } from "zod";

export const curveSegmentSampleSchema = z.object({
  bodyId: z.number().int().positive(),
  segmentEntityId: z.number().int().positive(),
  normalizedParameter: z.number().finite().min(0).max(1),
}).strict();

import assert from "node:assert/strict";
import test from "node:test";

import { z } from "zod";

import { catalogSummary, compactJsonSchema } from "./tool-catalog.ts";

test("a uniform millimetre tuple collapses to a fixed-length array", () => {
  const exported = z.toJSONSchema(z.object({ originMm: z.tuple([z.number(), z.number(), z.number()]) }));
  assert.deepEqual(compactJsonSchema(exported), {
    type: "object",
    properties: { originMm: { type: "array", minItems: 3, maxItems: 3, items: { type: "number" } } },
    required: ["originMm"],
    additionalProperties: false,
  });
});

test("mixed tuples and open arrays keep their exported form", () => {
  const exported = z.toJSONSchema(z.object({ pair: z.tuple([z.number(), z.string()]), ids: z.array(z.number()).max(4) }));
  const compact = compactJsonSchema(exported) as { properties: Record<string, unknown> };
  assert.ok("prefixItems" in (compact.properties.pair as object));
  assert.deepEqual(compact.properties.ids, { type: "array", maxItems: 4, items: { type: "number" } });
});

test("catalog summaries keep the first sentence only", () => {
  assert.equal(catalogSummary("Create a box. Coordinates are millimeters."), "Create a box.");
  assert.equal(catalogSummary("Measure 1.5 mm offsets exactly"), "Measure 1.5 mm offsets exactly");
  assert.equal(catalogSummary("x".repeat(300)).length, 240);
});

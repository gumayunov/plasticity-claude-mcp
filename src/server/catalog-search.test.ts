import assert from "node:assert/strict";
import { test } from "node:test";

import { closestNames, levenshtein, rankCatalog } from "./catalog-search.ts";

const entries = [
  { name: "plasticity_fillet", description: "Fillet current edge IDs with a radius in millimeters.", toolset: "solids" },
  { name: "plasticity_fillet_curve_vertices", description: "Round corners of planar wires.", toolset: "curve-edit" },
  { name: "plasticity_create_box", description: "Create an axis-aligned exact CAD box.", toolset: "solids" },
  { name: "plasticity_measure_point_distance", description: "Measure the exact straight-line distance between two points; mentions plasticity_create_box.", toolset: "measure" },
  { name: "plasticity_list_regions", description: "List planar regions.", toolset: "curve-query" },
];

test("an exact name returns only that tool", () => {
  assert.deepEqual(rankCatalog(entries, "plasticity_create_box").map((entry) => entry.name), ["plasticity_create_box"]);
});

test("name matches outrank toolset and description matches", () => {
  assert.deepEqual(rankCatalog(entries, "fillet").map((entry) => entry.name), ["plasticity_fillet", "plasticity_fillet_curve_vertices"]);
  assert.deepEqual(rankCatalog(entries, "measure distance").map((entry) => entry.name)[0], "plasticity_measure_point_distance");
  assert.deepEqual(rankCatalog(entries, "curve").map((entry) => entry.name), ["plasticity_fillet_curve_vertices", "plasticity_list_regions"]);
});

test("unrelated queries return nothing", () => {
  assert.deepEqual(rankCatalog(entries, "zebra"), []);
});

test("levenshtein and closest names", () => {
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.deepEqual(closestNames("plasticity_filet", entries.map((entry) => entry.name), 1), ["plasticity_fillet"]);
  assert.equal(closestNames("x", entries.map((entry) => entry.name)).length, 3);
});

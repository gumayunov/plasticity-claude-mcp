import { SMOKE_INTENT, expectBounds, mutate, onlyBody, onlyRegion, requireCondition } from "../harness.ts";
import type { LiveCheck, McpCaller } from "../types.ts";

async function circleRegion(mcp: McpCaller, centerMm: [number, number, number], radiusMm: number, label: string) {
  return onlyRegion((await mutate(mcp, "plasticity_create_circle", { centerMm, radiusMm, intent: SMOKE_INTENT })).regionsAdded, label);
}

export const sweepRegion: LiveCheck = {
  name: "sweep-region",
  async run({ mcp }) {
    const profile = await circleRegion(mcp, [0, 0, 0], 2, "sweep profile");
    const spine = onlyBody((await mutate(mcp, "plasticity_create_polyline", { pointsMm: [[0, 0, 0], [0, 0, 20]], closed: false, intent: SMOKE_INTENT })).added, "Wire", "sweep spine");
    const solid = onlyBody((await mutate(mcp, "plasticity_sweep_regions", { regionIds: [profile.id], spineId: spine.id, intent: SMOKE_INTENT })).added, "Solid", "swept solid");
    expectBounds(solid.boundsMm, [-2, -2, 0], [2, 2, 20], "swept solid");
    requireCondition(solid.faceCount === 3, `sweep: expected 3 faces, got ${solid.faceCount}`);
    return { boundsMm: solid.boundsMm, faceCount: solid.faceCount };
  },
};

export const loftRegions: LiveCheck = {
  name: "loft-regions",
  async run({ mcp }) {
    const bottom = await circleRegion(mcp, [0, 0, 0], 5, "bottom profile");
    const top = await circleRegion(mcp, [0, 0, 20], 2, "top profile");
    const solid = onlyBody((await mutate(mcp, "plasticity_loft_regions", { regionIds: [bottom.id, top.id], intent: SMOKE_INTENT })).added, "Solid", "lofted solid");
    expectBounds(solid.boundsMm, [-5, -5, 0], [5, 5, 20], "lofted solid");
    requireCondition(solid.faceCount === 3, `loft: expected 3 faces, got ${solid.faceCount}`);
    return { boundsMm: solid.boundsMm, faceCount: solid.faceCount };
  },
};

export const mirrorAndPattern: LiveCheck = {
  name: "mirror-pattern",
  async run({ mcp }) {
    const box = onlyBody((await mutate(mcp, "plasticity_create_box", { originMm: [10, 0, 0], sizeMm: [10, 10, 10], intent: SMOKE_INTENT })).added, "Solid", "source box");
    const mirrored = onlyBody((await mutate(mcp, "plasticity_mirror", {
      ids: [box.id], planeOriginMm: [0, 0, 0], planeNormal: [1, 0, 0], keepOriginal: true, intent: SMOKE_INTENT,
    })).added, "Solid", "mirrored box");
    expectBounds(mirrored.boundsMm, [-20, 0, 0], [-10, 10, 10], "mirrored box");
    const patterned = await mutate(mcp, "plasticity_rectangular_pattern", {
      ids: [box.id], direction1: [0, 1, 0], count1: 3, spacing1Mm: 20, intent: SMOKE_INTENT,
    });
    const copies = patterned.added.filter((body) => body.type === "Solid")
      .sort((a, b) => (a.boundsMm?.min[1] ?? 0) - (b.boundsMm?.min[1] ?? 0));
    requireCondition(copies.length === 2, `pattern: expected 2 new solids, got ${copies.length}`);
    expectBounds(copies[0]!.boundsMm, [10, 20, 0], [20, 30, 10], "pattern copy 1");
    expectBounds(copies[1]!.boundsMm, [10, 40, 0], [20, 50, 10], "pattern copy 2");
    return { mirroredBoundsMm: mirrored.boundsMm, patternCopies: copies.length };
  },
};

import { SMOKE_INTENT, expectBounds, expectClose, mutate, onlyBody, onlyRegion, requireCondition, unionBounds } from "../harness.ts";
import type { LiveCheck, McpCaller } from "../types.ts";

// Region bounds come from the render mesh, so they get a looser tolerance than exact B-Rep bounds.
const REGION_TOLERANCE_MM = 0.1;

async function rectangle(mcp: McpCaller) {
  const outcome = await mutate(mcp, "plasticity_create_rectangle", { centerMm: [0, 0, 0], widthMm: 20, heightMm: 10, intent: SMOKE_INTENT });
  return { wire: onlyBody(outcome.added, "Wire", "rectangle wire"), region: onlyRegion(outcome.regionsAdded, "rectangle region") };
}

async function polyline(mcp: McpCaller, pointsMm: Array<[number, number, number]>, label: string) {
  return onlyBody((await mutate(mcp, "plasticity_create_polyline", { pointsMm, closed: false, intent: SMOKE_INTENT })).added, "Wire", label);
}

export const rectangleCircleRegion: LiveCheck = {
  name: "rectangle-circle-region",
  async run({ mcp }) {
    const rect = await rectangle(mcp);
    expectBounds(rect.wire.boundsMm, [-10, -5, 0], [10, 5, 0], "rectangle wire");
    expectBounds(rect.region.displayBoundsMm, [-10, -5, 0], [10, 5, 0], "rectangle region", REGION_TOLERANCE_MM);
    const circle = await mutate(mcp, "plasticity_create_circle", { centerMm: [30, 0, 0], radiusMm: 5, intent: SMOKE_INTENT });
    const circleWire = onlyBody(circle.added, "Wire", "circle wire");
    const circleRegion = onlyRegion(circle.regionsAdded, "circle region");
    expectBounds(circleWire.boundsMm, [25, -5, 0], [35, 5, 0], "circle wire");
    expectBounds(circleRegion.displayBoundsMm, [25, -5, 0], [35, 5, 0], "circle region", REGION_TOLERANCE_MM);
    return { rectangleBoundsMm: rect.wire.boundsMm, circleBoundsMm: circleWire.boundsMm };
  },
};

export const extrudeRegion: LiveCheck = {
  name: "extrude-region",
  async run({ mcp }) {
    const { region } = await rectangle(mcp);
    const solid = onlyBody((await mutate(mcp, "plasticity_extrude_regions", { regionIds: [region.id], distanceMm: 5, intent: SMOKE_INTENT })).added, "Solid", "extruded solid");
    expectBounds(solid.boundsMm, [-10, -5, 0], [10, 5, 5], "extruded solid");
    requireCondition(solid.faceCount === 6, `extrude: expected 6 faces, got ${solid.faceCount}`);
    return { boundsMm: solid.boundsMm, faceCount: solid.faceCount };
  },
};

export const curveOffset: LiveCheck = {
  name: "curve-offset",
  async run({ mcp }) {
    const { wire } = await rectangle(mcp);
    const offset = onlyBody((await mutate(mcp, "plasticity_offset_planar_curves", { ids: [wire.id], distanceMm: 2, intent: SMOKE_INTENT })).added, "Wire", "offset wire");
    expectBounds(offset.boundsMm, [-12, -7, 0], [12, 7, 0], "offset wire");
    return { boundsMm: offset.boundsMm };
  },
};

// Two crossing lines give four fragments; trimming the left and bottom ones leaves an "L" in the first quadrant.
export const curveTrim: LiveCheck = {
  name: "curve-trim",
  async run({ mcp }) {
    await polyline(mcp, [[-10, 0, 0], [10, 0, 0]], "horizontal line");
    await polyline(mcp, [[0, -10, 0], [0, 10, 0]], "vertical line");
    const listed = await mcp.call("plasticity_list_curve_fragments", {});
    const fragments = listed.fragments as Array<{ id: string; midpointMm: [number, number, number] }>;
    requireCondition(fragments.length === 4, `expected 4 curve fragments, got ${fragments.length}`);
    const doomed = fragments.filter((fragment) => fragment.midpointMm[0] < -1 || fragment.midpointMm[1] < -1).map((fragment) => fragment.id);
    requireCondition(doomed.length === 2, `expected 2 fragments to trim, got ${doomed.length}`);
    const { after } = await mutate(mcp, "plasticity_trim_curve_fragments", { fragmentIds: doomed, intent: SMOKE_INTENT });
    const bounds = unionBounds(after.bodies.filter((body) => body.type === "Wire"));
    expectBounds(bounds, [0, 0, 0], [10, 10, 0], "trimmed wires");
    return { boundsMm: bounds, fragmentCount: fragments.length };
  },
};

export const curveJoin: LiveCheck = {
  name: "curve-join",
  async run({ mcp }) {
    const first = await polyline(mcp, [[0, 0, 0], [10, 0, 0]], "first segment");
    const second = await polyline(mcp, [[10, 0, 0], [10, 5, 0]], "second segment");
    // Plasticity joins into the first Wire (same id, new geometry) and removes the others.
    const joined = await mutate(mcp, "plasticity_join_curves", { ids: [first.id, second.id], intent: SMOKE_INTENT });
    requireCondition(joined.removed.length === 1 && joined.removed[0]!.id === second.id, `join: expected only the second wire to be removed, got ${joined.removed.map((body) => body.id).join(", ") || "none"}`);
    const wire = joined.after.bodies.find((body) => body.id === first.id);
    requireCondition(wire?.type === "Wire", "join: the first wire is missing after the join");
    expectBounds(wire.boundsMm, [0, 0, 0], [10, 5, 0], "joined wire");
    expectClose(joined.after.bodies.filter((body) => body.type === "Wire").length, 1, "wire count after join", 0);
    return { boundsMm: wire.boundsMm };
  },
};

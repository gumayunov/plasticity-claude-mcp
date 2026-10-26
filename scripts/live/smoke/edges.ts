import { SMOKE_INTENT, expectBounds, expectClose, mutate, onlyBody, requireCondition, snapshot, type BodySummary } from "../harness.ts";
import type { LiveCheck, McpCaller } from "../types.ts";

async function createBox(mcp: McpCaller, originMm: [number, number, number], sizeMm: [number, number, number], label: string): Promise<BodySummary> {
  return onlyBody((await mutate(mcp, "plasticity_create_box", { originMm, sizeMm, intent: SMOKE_INTENT })).added, "Solid", label);
}

async function verticalEdgeIds(mcp: McpCaller, bodyId: number): Promise<string[]> {
  const { revision } = await snapshot(mcp);
  const found = await mcp.call("plasticity_find_edges", { revision, query: { bodyIds: [bodyId], line: true, direction: { vector: [0, 0, 1] } } });
  const ids = (found.matches as Array<{ id: string }>).map((edge) => edge.id);
  requireCondition(ids.length === 4, `expected 4 vertical edges on body ${bodyId}, got ${ids.length}`);
  return ids;
}

export const filletAndChamfer: LiveCheck = {
  name: "fillet-chamfer",
  async run({ mcp }) {
    const filletBox = await createBox(mcp, [0, 0, 0], [20, 20, 10], "fillet box");
    const filleted = await mutate(mcp, "plasticity_fillet", { id: filletBox.id, edgeIds: await verticalEdgeIds(mcp, filletBox.id), radiusMm: 2, intent: SMOKE_INTENT });
    const fillet = onlyBody(filleted.after.bodies, "Solid", "filleted body");
    requireCondition(fillet.faceCount === 10 && fillet.edgeCount === 24, `fillet: expected 10 faces/24 edges, got ${fillet.faceCount}/${fillet.edgeCount}`);
    expectBounds(fillet.boundsMm, [0, 0, 0], [20, 20, 10], "filleted body");

    const chamferBox = await createBox(mcp, [40, 0, 0], [20, 20, 10], "chamfer box");
    const chamfered = await mutate(mcp, "plasticity_chamfer", { id: chamferBox.id, edgeIds: await verticalEdgeIds(mcp, chamferBox.id), distanceMm: 2, intent: SMOKE_INTENT });
    const chamfer = chamfered.after.bodies.find((body) => body.type === "Solid" && (body.boundsMm?.min[0] ?? -1) >= 39.99);
    requireCondition(chamfer, "chamfered body not found");
    requireCondition(chamfer.faceCount === 10, `chamfer: expected 10 faces, got ${chamfer.faceCount}`);
    expectBounds(chamfer.boundsMm, [40, 0, 0], [60, 20, 10], "chamfered body");
    return { filletFaces: fillet.faceCount, filletEdges: fillet.edgeCount, chamferFaces: chamfer.faceCount, chamferEdges: chamfer.edgeCount };
  },
};

export const undoRedo: LiveCheck = {
  name: "undo-redo",
  async run({ mcp }) {
    const box = await createBox(mcp, [0, 0, 0], [20, 20, 10], "undo box");
    await mutate(mcp, "plasticity_fillet", { id: box.id, edgeIds: await verticalEdgeIds(mcp, box.id), radiusMm: 2, intent: SMOKE_INTENT });
    const undone = onlyBody((await mutate(mcp, "plasticity_undo", { intent: SMOKE_INTENT })).after.bodies, "Solid", "after undo");
    requireCondition(undone.faceCount === 6, `undo: expected 6 faces, got ${undone.faceCount}`);
    const redone = onlyBody((await mutate(mcp, "plasticity_redo", { intent: SMOKE_INTENT })).after.bodies, "Solid", "after redo");
    requireCondition(redone.faceCount === 10, `redo: expected 10 faces, got ${redone.faceCount}`);
    expectBounds(redone.boundsMm, [0, 0, 0], [20, 20, 10], "after redo");
    return { facesAfterUndo: undone.faceCount, facesAfterRedo: redone.faceCount };
  },
};

export const measurements: LiveCheck = {
  name: "measurements",
  async run({ mcp }) {
    const box = await createBox(mcp, [0, 0, 0], [20, 10, 5], "measured box");
    const { revision } = await snapshot(mcp);
    const properties = (await mcp.call("plasticity_measure_solid_properties", { ids: [box.id], revision })).bodies[0];
    expectClose(properties.volumeMm3, 1000, "volume", 0.001);
    expectClose(properties.surfaceAreaMm2, 700, "surface area", 0.001);
    const centroid = properties.volumeCentroidMm as [number, number, number];
    [10, 5, 2.5].forEach((expected, axis) => expectClose(centroid[axis]!, expected, `centroid[${axis}]`));
    const distance = await mcp.call("plasticity_measure_point_distance", {
      first: { type: "coordinates", pointMm: [0, 0, 0] },
      second: { type: "coordinates", pointMm: [3, 4, 0] },
      revision,
    });
    expectClose(distance.distanceMm, 5, "point distance");
    return { volumeMm3: properties.volumeMm3, surfaceAreaMm2: properties.surfaceAreaMm2, centroidMm: centroid, distanceMm: distance.distanceMm };
  },
};

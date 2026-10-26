import { SMOKE_INTENT, expectBounds, expectClose, extentMm, mutate, onlyBody, requireCondition } from "../harness.ts";
import type { LiveCheck } from "../types.ts";

export const boxPrimitive: LiveCheck = {
  name: "box-primitive",
  async run({ mcp }) {
    const { added } = await mutate(mcp, "plasticity_create_box", { originMm: [0, 0, 0], sizeMm: [80, 40, 8], intent: SMOKE_INTENT });
    const box = onlyBody(added, "Solid", "box");
    expectBounds(box.boundsMm, [0, 0, 0], [80, 40, 8], "box");
    requireCondition(box.faceCount === 6 && box.edgeCount === 12, `box topology: expected 6 faces/12 edges, got ${box.faceCount}/${box.edgeCount}`);
    return { boundsMm: box.boundsMm, faceCount: box.faceCount, edgeCount: box.edgeCount };
  },
};

export const cylinderAndSphere: LiveCheck = {
  name: "cylinder-sphere",
  async run({ mcp }) {
    const cylinder = onlyBody((await mutate(mcp, "plasticity_create_cylinder", {
      centerMm: [0, 0, 0], radiusMm: 5, heightMm: 20, intent: SMOKE_INTENT,
    })).added, "Solid", "cylinder");
    expectClose(extentMm(cylinder.boundsMm, 0, "cylinder"), 10, "cylinder X extent");
    expectClose(extentMm(cylinder.boundsMm, 1, "cylinder"), 10, "cylinder Y extent");
    expectClose(extentMm(cylinder.boundsMm, 2, "cylinder"), 20, "cylinder Z extent");
    requireCondition(cylinder.faceCount === 3, `cylinder: expected 3 faces, got ${cylinder.faceCount}`);
    const sphere = onlyBody((await mutate(mcp, "plasticity_create_sphere", {
      centerMm: [30, 0, 0], radiusMm: 5, intent: SMOKE_INTENT,
    })).added, "Solid", "sphere");
    expectBounds(sphere.boundsMm, [25, -5, -5], [35, 5, 5], "sphere");
    return { cylinderBoundsMm: cylinder.boundsMm, cylinderFaces: cylinder.faceCount, sphereBoundsMm: sphere.boundsMm };
  },
};

export const booleanUnion: LiveCheck = {
  name: "boolean-union",
  async run({ mcp }) {
    const first = onlyBody((await mutate(mcp, "plasticity_create_box", { originMm: [0, 0, 0], sizeMm: [20, 20, 10], intent: SMOKE_INTENT })).added, "Solid", "first box");
    const second = onlyBody((await mutate(mcp, "plasticity_create_box", { originMm: [10, 0, 0], sizeMm: [20, 20, 10], intent: SMOKE_INTENT })).added, "Solid", "second box");
    const { after } = await mutate(mcp, "plasticity_boolean", { targetIds: [first.id], toolIds: [second.id], operation: "union", intent: SMOKE_INTENT });
    const solid = onlyBody(after.bodies, "Solid", "union result");
    expectBounds(solid.boundsMm, [0, 0, 0], [30, 20, 10], "union");
    return { boundsMm: solid.boundsMm, faceCount: solid.faceCount, edgeCount: solid.edgeCount };
  },
};

// Plate 80 × 40 × 8 with two Ø6 through holes; cylinders overshoot the plate by 1 mm on each side.
export const booleanDifference: LiveCheck = {
  name: "boolean-difference",
  async run({ mcp }) {
    const plate = onlyBody((await mutate(mcp, "plasticity_create_box", { originMm: [0, 0, 0], sizeMm: [80, 40, 8], intent: SMOKE_INTENT })).added, "Solid", "plate");
    const tools: number[] = [];
    for (const x of [20, 60]) {
      tools.push(onlyBody((await mutate(mcp, "plasticity_create_cylinder", {
        centerMm: [x, 20, -1], radiusMm: 3, heightMm: 10, intent: SMOKE_INTENT,
      })).added, "Solid", `cylinder at x=${x}`).id);
    }
    const { after } = await mutate(mcp, "plasticity_boolean", { targetIds: [plate.id], toolIds: tools, operation: "difference", intent: SMOKE_INTENT });
    const result = onlyBody(after.bodies, "Solid", "difference result");
    expectBounds(result.boundsMm, [0, 0, 0], [80, 40, 8], "difference");
    requireCondition(result.faceCount === 8, `difference: expected 8 faces, got ${result.faceCount}`);
    const properties = await mcp.call("plasticity_measure_solid_properties", { ids: [result.id], revision: after.revision });
    const volumeMm3 = properties.bodies[0].volumeMm3 as number;
    expectClose(volumeMm3, 80 * 40 * 8 - 2 * Math.PI * 3 * 3 * 8, "difference volume", 0.5);
    return { boundsMm: result.boundsMm, faceCount: result.faceCount, edgeCount: result.edgeCount, volumeMm3 };
  },
};

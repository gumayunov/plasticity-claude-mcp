import { z } from "zod";
import { vector, direction, ids, revision, intent } from "../schemas/common.ts";
import { polylineInputSchema, circleInputSchema, twoPointCircleInputSchema, threePointCircleInputSchema, centerArcInputSchema, threePointArcInputSchema, tangentArcInputSchema, tangentCircleInputSchema, bridgeCurveInputSchema, bridgeCurveVerticesInputSchema, ellipseInputSchema, regularPolygonInputSchema, rectangleInputSchema, textInputSchema } from "../schemas/sketch.ts";
import type { ToolContext } from "../context.ts";

export function registerSketchTools(ctx: ToolContext): void {
  const { session, tool, journaled } = ctx;
  tool("plasticity_create_polyline", "Create a native polyline or closed profile in world coordinates or a referenced construction plane.", polylineInputSchema, async (input) =>
    await journaled("create-polyline", input.intent, { pointsMm: input.pointsMm, closed: input.closed, plane: "plane" in input ? input.plane : undefined }, () =>
      session.get().createPolyline(input.pointsMm, input.closed, input.revision, "plane" in input ? input.plane : undefined)));
  tool("plasticity_create_slot_profiles", "Create exact closed constant-width slot or channel profiles around one or more current planar Wire spines in one native Plasticity history step. Each source Wire is preserved and each result is a separate editable Wire suitable for Region extrusion or cutting. Width is the full finished profile width. A lone straight segment does not define a unique native plane; use a planar multi-segment or curved spine, or use plasticity_create_slotted_hole for a straight fastener slot.", z.object({
    wireIds: z.array(z.number().int().positive()).min(1).max(256).refine((ids) => new Set(ids).size === ids.length, "Wire IDs must be unique"),
    widthMm: z.number().finite().positive(),
    intent,
    revision,
  }).strict(), async ({ wireIds, widthMm, intent: purpose, revision: current }) =>
    await journaled("create-slot-profiles", purpose, { wireIds, widthMm }, () => session.get().createSlotProfiles(wireIds, widthMm, current)));
  tool("plasticity_create_nurbs_curve", "Create a native interpolating NURBS curve through three or more world-space points in millimeters.", z.object({ pointsMm: z.array(vector).min(3).max(1000), closed: z.boolean().default(false), intent, revision }).strict(), async ({ pointsMm, closed, intent: purpose, revision: current }) =>
    await journaled("create-nurbs-curve", purpose, { pointsMm, closed }, () => session.get().createNurbsCurve(pointsMm, closed, current)));
  tool("plasticity_create_helix", "Create a constant-radius native helix around a world-space axis. Coordinates and radius are millimeters.", z.object({ axisStartMm: vector, axisEndMm: vector, radiusMm: z.number().finite().positive(), turns: z.number().finite().positive().max(10_000), radialDirection: direction.default([1, 0, 0]), handedness: z.enum(["right", "left"]).default("right"), intent, revision }).strict(), async ({ axisStartMm, axisEndMm, radiusMm, turns, radialDirection, handedness, intent: purpose, revision: current }) =>
    await journaled("create-helix", purpose, { axisStartMm, axisEndMm, radiusMm, turns, radialDirection, handedness }, () => session.get().createHelix(axisStartMm, axisEndMm, radiusMm, turns, radialDirection, handedness, current)));
  tool("plasticity_create_circle", "Create a native circle in world coordinates or a referenced construction plane.", circleInputSchema, async (input) =>
    await journaled("create-circle", input.intent, { centerMm: input.centerMm, radiusMm: input.radiusMm, plane: "plane" in input ? input.plane : undefined, normal: "normal" in input ? input.normal : undefined }, () =>
      session.get().createCircle(input.centerMm, input.radiusMm, input.revision, "normal" in input ? input.normal : [0, 0, 1], "plane" in input ? input.plane : undefined)));
  tool("plasticity_create_two_point_circle", "Create one exact native circle from the two endpoints of its diameter. In world coordinates, the explicit plane normal must be perpendicular to the diameter; plane-local inputs inherit the referenced construction plane. The result is a closed Wire with an automatic Region.", twoPointCircleInputSchema, async (input) =>
    await journaled("create-two-point-circle", input.intent, input, () => session.get().createTwoPointCircle(
      input.diameterStartMm,
      input.diameterEndMm,
      input.revision,
      "normal" in input ? input.normal : [0, 0, 1],
      "plane" in input ? input.plane : undefined,
    )));
  tool("plasticity_create_three_point_circle", "Create one exact native circle through three distinct non-collinear points. The three points determine its plane, center, and radius; plane-local inputs are resolved through the referenced construction plane. The result is a closed Wire with an automatic Region.", threePointCircleInputSchema, async (input) =>
    await journaled("create-three-point-circle", input.intent, input, () => session.get().createThreePointCircle(
      input.firstMm,
      input.secondMm,
      input.thirdMm,
      input.revision,
      "plane" in input ? input.plane : undefined,
    )));
  tool("plasticity_create_center_arc", "Create one exact native circular arc from center, radius, start angle, and signed sweep. Positive sweep is counterclockwise around the plane normal; the sweep magnitude must be below 360 degrees. Inputs may use world coordinates or a referenced construction plane.", centerArcInputSchema, async (input) =>
    await journaled("create-center-arc", input.intent, input, () => session.get().createCenterArc(
      input.centerMm,
      input.radiusMm,
      input.startAngleDegrees,
      input.sweepAngleDegrees,
      input.revision,
      "normal" in input ? input.normal : [0, 0, 1],
      "xDirection" in input ? input.xDirection : [1, 0, 0],
      "plane" in input ? input.plane : undefined,
    )));
  tool("plasticity_create_three_point_arc", "Create one exact native circular arc from a start point through a second point to an end point. Point order selects the minor or major arc and preserves start-to-end curve direction. Inputs may use world coordinates or a referenced construction plane.", threePointArcInputSchema, async (input) =>
    await journaled("create-three-point-arc", input.intent, input, () => session.get().createThreePointArc(
      input.startMm,
      input.throughMm,
      input.endMm,
      input.revision,
      "plane" in input ? input.plane : undefined,
    )));
  tool("plasticity_create_tangent_arc", "Create one exact native circular arc tangent to a selected current Wire segment at its start or end and terminating at an explicit point. Use plasticity_list_curve_directions to obtain the segment entity and its exact endpoints. flipTangent selects the opposite tangent sense, which can select the major rather than minor arc. The end may use world coordinates or a referenced construction plane.", tangentArcInputSchema, async (input) =>
    await journaled("create-tangent-arc", input.intent, input, () => session.get().createTangentArc(
      input.bodyId,
      input.segmentEntityId,
      input.startAt,
      input.endMm,
      input.flipTangent,
      input.revision,
      "plane" in input ? input.plane : undefined,
    )));
  tool("plasticity_create_tangent_circle", "Create one exact fixed-radius native circle tangent to two current Wire segments. Use plasticity_list_curve_directions immediately before this call. solutionPointMm selects the intended solution near one of the possible circle centers; it is not an additional geometric constraint. World-space inputs require the sketch-plane normal, while plane-local inputs inherit the referenced construction plane. Both source Wires remain unchanged.", tangentCircleInputSchema, async (input) =>
    await journaled("create-tangent-circle", input.intent, input, () => session.get().createTangentCircle(
      input.first,
      input.second,
      input.solutionPointMm,
      input.radiusMm,
      input.revision,
      "normal" in input ? input.normal : [0, 0, 1],
      "plane" in input ? input.plane : undefined,
    )));
  tool("plasticity_bridge_curves", "Create one independent native B-Spline between two exact current Wire segment endpoints while preserving both source Wires. Use plasticity_list_curve_directions immediately before this call. G0 matches position, G1 adds tangent continuity, G2 adds curvature continuity, and G3 adds third-order geometric continuity at each end. The operation occupies one Plasticity history step.", bridgeCurveInputSchema, async ({ first, second, startContinuity, endContinuity, intent: purpose, revision: current }) =>
    await journaled("bridge-curves", purpose, { first, second, startContinuity, endContinuity }, () =>
      session.get().bridgeCurves(first, second, startContinuity, endContinuity, current)));
  tool("plasticity_bridge_curve_vertices", "Create one independent native B-Spline between two exact current open Wire vertices while preserving both source Wires. Use plasticity_list_curve_vertices immediately before this call and pass its numeric vertexId values. G0 through G3 continuity is selected independently at the two ends; internal or stale vertices are rejected before mutation.", bridgeCurveVerticesInputSchema, async ({ first, second, startContinuity, endContinuity, intent: purpose, revision: current }) =>
    await journaled("bridge-curve-vertices", purpose, { first, second, startContinuity, endContinuity }, () =>
      session.get().bridgeCurveVertices(first, second, startContinuity, endContinuity, current)));
  tool("plasticity_create_ellipse", "Create one exact native closed elliptical Wire and Region from explicit major and minor radii. The major axis follows xDirection rotated by angleDegrees in the selected plane. Inputs may use world coordinates or a referenced construction plane.", ellipseInputSchema, async (input) =>
    await journaled("create-ellipse", input.intent, input, () => session.get().createEllipse(
      input.centerMm,
      input.majorRadiusMm,
      input.minorRadiusMm,
      input.revision,
      "normal" in input ? input.normal : [0, 0, 1],
      "xDirection" in input ? input.xDirection : [1, 0, 0],
      "plane" in input ? input.plane : undefined,
      input.angleDegrees,
    )));
  tool("plasticity_create_regular_polygon", "Create one exact native closed regular-polygon Wire and Region with 3-256 vertices. radiusMode=circumradius places every vertex on the supplied radius; radiusMode=inradius uses the supplied center-to-edge distance. Inputs may use world coordinates or a referenced construction plane.", regularPolygonInputSchema, async (input) =>
    await journaled("create-regular-polygon", input.intent, input, () => session.get().createRegularPolygon(
      input.centerMm,
      input.radiusMm,
      input.radiusMode,
      input.vertexCount,
      input.revision,
      "normal" in input ? input.normal : [0, 0, 1],
      "xDirection" in input ? input.xDirection : [1, 0, 0],
      "plane" in input ? input.plane : undefined,
      input.angleDegrees,
    )));
  tool("plasticity_create_rectangle", "Create an exact native rectangular Wire and Region from its center, width, and height in world coordinates or a referenced construction plane. Positive angle rotates the width axis around the plane normal in degrees.", rectangleInputSchema, async (input) =>
    await journaled("create-rectangle", input.intent, {
      centerMm: input.centerMm,
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      plane: "plane" in input ? input.plane : undefined,
      normal: "normal" in input ? input.normal : undefined,
      xDirection: "xDirection" in input ? input.xDirection : undefined,
      angleDegrees: input.angleDegrees,
    }, () => session.get().createRectangle(
      input.centerMm,
      input.widthMm,
      input.heightMm,
      input.revision,
      "normal" in input ? input.normal : [0, 0, 1],
      "xDirection" in input ? input.xDirection : [1, 0, 0],
      "plane" in input ? input.plane : undefined,
      input.angleDegrees,
    )));
  tool("plasticity_create_text", "Create Plasticity-native closed Wire outlines for text at a world or construction-plane baseline origin. Font size is nominal millimeters; inspect the resulting exact curve bounds before using the outlines for embossing, engraving, or clearance-critical geometry. Plasticity may create multiple Wires and Regions.", textInputSchema, async (input) =>
    await journaled("create-text", input.intent, input, () => session.get().createText({
      text: input.text,
      fontSizeMm: input.fontSizeMm,
      originMm: input.originMm,
      font: input.font,
      revision: input.revision,
      angleDegrees: input.angleDegrees,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...("normal" in input ? { normal: input.normal, xDirection: input.xDirection } : {}),
      ...("plane" in input ? { plane: input.plane } : {}),
    })));
}

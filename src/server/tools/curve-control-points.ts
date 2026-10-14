import { z } from "zod";
import { vector, positiveVector, direction, measurementVertexRef, curveControlPointRefs, revision, intent } from "../schemas/common.ts";
import { interiorCurveControlPointRefs } from "../schemas/curve-control-points.ts";
import type { ToolContext } from "../context.ts";

export function registerCurveControlPointsTools(ctx: ToolContext): void {
  const { session, tool, journaled } = ctx;
  tool("plasticity_convert_curve_vertices_to_control_points", "Convert one or more exact current interior or closed Wire vertices into native B-Spline control vertices in one Plasticity history step. References must come from plasticity_list_curve_vertices at the current revision. Open endpoints are not convertible. The Wire path, segment structure, length, and topology change, so discard every old vertex and segment reference and inspect the returned Wire before continuing.", z.object({
    vertices: z.array(measurementVertexRef).min(1).max(4096).refine((values) => new Set(values.map((value) => `${value.bodyId}:${value.vertexId}`)).size === values.length, "Curve vertex references must be unique"),
    intent,
    revision,
  }).strict(), async ({ vertices, intent: purpose, revision: current }) =>
    await journaled("convert-curve-vertices-to-control-points", purpose, { vertices }, () => session.get().convertCurveVerticesToControlPoints(vertices, current)));
  tool("plasticity_move_curve_control_points", "Move one or more exact current Wire control handles by a shared world-space millimeter delta in one Plasticity history step. References must come from plasticity_list_curve_control_points at the current revision. Boundary vertices edit curve ends or joins; interior control points reshape B-Splines. Re-read control points and exact B-Rep geometry afterward.", z.object({
    points: curveControlPointRefs,
    deltaMm: vector.refine((value) => Math.hypot(...value) > 0, "Curve control point move delta must be nonzero"),
    intent,
    revision,
  }).strict(), async ({ points, deltaMm, intent: purpose, revision: current }) =>
    await journaled("move-curve-control-points", purpose, { points, deltaMm }, () => session.get().moveCurveControlPoints(points, deltaMm, current)));
  tool("plasticity_slide_curve_control_points", "Slide one or more exact current Wire handles by a positive millimeter distance along each handle's local positive-U or negative-U control-polygon direction. Use the unit directions returned by plasticity_list_curve_control_points to predict the world-space result. All handles share one direction sense and distance, and the edit occupies one Plasticity history step. Re-read handles and exact B-Rep geometry afterward.", z.object({
    points: curveControlPointRefs,
    direction: z.enum(["positive-u", "negative-u"]),
    distanceMm: z.number().finite().positive(),
    intent,
    revision,
  }).strict(), async ({ points, direction: slideDirection, distanceMm, intent: purpose, revision: current }) =>
    await journaled("slide-curve-control-points", purpose, { points, direction: slideDirection, distanceMm }, () => session.get().slideCurveControlPoints(points, slideDirection, distanceMm, current)));
  tool("plasticity_rotate_curve_control_points", "Rotate exact current Wire control handles around an explicit world-space pivot and axis in one Plasticity history step. References must come from plasticity_list_curve_control_points at the current revision. The angle is in degrees; re-read handles and exact B-Rep geometry afterward.", z.object({
    points: curveControlPointRefs,
    pivotMm: vector,
    axis: direction,
    degrees: z.number().finite().refine((value) => value !== 0, "Rotation angle must be nonzero"),
    intent,
    revision,
  }).strict(), async ({ points, pivotMm, axis, degrees, intent: purpose, revision: current }) =>
    await journaled("rotate-curve-control-points", purpose, { points, pivotMm, axis, degrees }, () => session.get().rotateCurveControlPoints(points, pivotMm, axis, degrees, current)));
  tool("plasticity_scale_curve_control_points", "Scale exact current Wire control handles around an explicit world-space pivot with positive XYZ factors in one Plasticity history step. References must come from plasticity_list_curve_control_points at the current revision. Re-read handles and exact B-Rep geometry afterward.", z.object({
    points: curveControlPointRefs,
    pivotMm: vector,
    factors: positiveVector.refine((values) => values.some((value) => value !== 1), "Scale must change at least one factor"),
    intent,
    revision,
  }).strict(), async ({ points, pivotMm, factors, intent: purpose, revision: current }) =>
    await journaled("scale-curve-control-points", purpose, { points, pivotMm, factors }, () => session.get().scaleCurveControlPoints(points, pivotMm, factors, current)));
  tool("plasticity_delete_curve_control_points", "Delete one or more current interior B-Spline control points from a single Wire in one Plasticity history step. References must come from plasticity_list_curve_control_points at the current revision. This changes the curve path and reindexes the remaining control-point IDs, so discard every old handle reference and re-read structure, handles, endpoints, tangents, and functional geometry afterward.", z.object({
    points: interiorCurveControlPointRefs,
    intent,
    revision,
  }).strict(), async ({ points, intent: purpose, revision: current }) =>
    await journaled("delete-curve-control-points", purpose, { points }, () => session.get().deleteCurveControlPoints(points, current)));
}

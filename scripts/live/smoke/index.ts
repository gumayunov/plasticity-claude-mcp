import type { LiveCheck } from "../types.ts";
import { connectReadScene } from "./connect.ts";
import { curveJoin, curveOffset, curveTrim, extrudeRegion, rectangleCircleRegion } from "./curves.ts";
import { filletAndChamfer, measurements, undoRedo } from "./edges.ts";
import { booleanDifference, booleanUnion, boxPrimitive, cylinderAndSphere } from "./primitives.ts";

export const smokeChecks: LiveCheck[] = [
  connectReadScene,
  boxPrimitive,
  cylinderAndSphere,
  booleanUnion,
  booleanDifference,
  filletAndChamfer,
  undoRedo,
  measurements,
  rectangleCircleRegion,
  extrudeRegion,
  curveOffset,
  curveTrim,
  curveJoin,
];

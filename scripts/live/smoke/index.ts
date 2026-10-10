import type { LiveCheck } from "../types.ts";
import { connectReadScene } from "./connect.ts";
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
];

import type { LiveCheck } from "../types.ts";
import { compatibilityReport } from "./compat.ts";
import { connectReadScene } from "./connect.ts";
import { curveJoin, curveOffset, curveTrim, extrudeRegion, rectangleCircleRegion } from "./curves.ts";
import { exportStepStl, importStep, saveAndReopen, viewportScreenshot } from "./io.ts";
import { loftRegions, mirrorAndPattern, sweepRegion } from "./surfaces.ts";
import { filletAndChamfer, measurements, undoRedo } from "./edges.ts";
import { booleanDifference, booleanUnion, boxPrimitive, cylinderAndSphere } from "./primitives.ts";

export const smokeChecks: LiveCheck[] = [
  connectReadScene,
  compatibilityReport,
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
  sweepRegion,
  loftRegions,
  mirrorAndPattern,
  exportStepStl,
  importStep,
  saveAndReopen,
  viewportScreenshot,
];

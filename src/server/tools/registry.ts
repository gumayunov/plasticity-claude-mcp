import type { ToolContext } from "../context.ts";
import { registerSessionTools } from "./session.ts";
import { registerFastenersTools } from "./fasteners.ts";
import { registerPrintingTools } from "./printing.ts";
import { registerSelectionTools } from "./selection.ts";
import { registerTransformTools } from "./transform.ts";
import { registerMeasureTools } from "./measure.ts";
import { registerCurveQueryTools } from "./curve-query.ts";
import { registerReferencesTools } from "./references.ts";
import { registerSceneTools } from "./scene.ts";
import { registerConstructionTools } from "./construction.ts";
import { registerSolidsTools } from "./solids.ts";
import { registerRecipesTools } from "./recipes.ts";
import { registerSketchTools } from "./sketch.ts";
import { registerSurfacesTools } from "./surfaces.ts";
import { registerCurveEditTools } from "./curve-edit.ts";
import { registerCurveControlPointsTools } from "./curve-control-points.ts";
import { registerSheetsTools } from "./sheets.ts";
import { registerFacesTools } from "./faces.ts";
import { registerDocumentTools } from "./document.ts";
import { registerExchangeTools } from "./exchange.ts";

// Tool groups in registration order; the name of each group is its file name.
export const TOOLSET_REGISTRATIONS: ReadonlyArray<readonly [string, (ctx: ToolContext) => void]> = [
  ["session", registerSessionTools],
  ["fasteners", registerFastenersTools],
  ["printing", registerPrintingTools],
  ["selection", registerSelectionTools],
  ["transform", registerTransformTools],
  ["measure", registerMeasureTools],
  ["curve-query", registerCurveQueryTools],
  ["references", registerReferencesTools],
  ["scene", registerSceneTools],
  ["construction", registerConstructionTools],
  ["solids", registerSolidsTools],
  ["recipes", registerRecipesTools],
  ["sketch", registerSketchTools],
  ["surfaces", registerSurfacesTools],
  ["curve-edit", registerCurveEditTools],
  ["curve-control-points", registerCurveControlPointsTools],
  ["sheets", registerSheetsTools],
  ["faces", registerFacesTools],
  ["document", registerDocumentTools],
  ["exchange", registerExchangeTools],
];

import { applyMixins } from "../mixins.ts";
import { OperationsBase } from "./base.ts";
import { MeasureOperations } from "./measure.ts";
import { SceneOperations } from "./scene.ts";
import { ConstructionOperations } from "./construction.ts";
import { CurveQueryOperations } from "./curve-query.ts";
import { TransformOperations } from "./transform.ts";
import { SolidsOperations } from "./solids.ts";
import { SketchOperations } from "./sketch.ts";
import { SurfacesOperations } from "./surfaces.ts";
import { CurveEditOperations } from "./curve-edit.ts";
import { CurveControlPointsOperations } from "./curve-control-points.ts";
import { SheetsOperations } from "./sheets.ts";
import { FacesOperations } from "./faces.ts";
import { DocumentOperations } from "./document.ts";
import { ExchangeOperations } from "./exchange.ts";

export class PlasticityOperations extends OperationsBase {}
export interface PlasticityOperations extends MeasureOperations, SceneOperations, ConstructionOperations, CurveQueryOperations, TransformOperations, SolidsOperations, SketchOperations, SurfacesOperations, CurveEditOperations, CurveControlPointsOperations, SheetsOperations, FacesOperations, DocumentOperations, ExchangeOperations {}
applyMixins(PlasticityOperations, [MeasureOperations, SceneOperations, ConstructionOperations, CurveQueryOperations, TransformOperations, SolidsOperations, SketchOperations, SurfacesOperations, CurveEditOperations, CurveControlPointsOperations, SheetsOperations, FacesOperations, DocumentOperations, ExchangeOperations]);

export * from "./types.ts";
export * from "./native-snippets.ts";
export * from "./helpers.ts";

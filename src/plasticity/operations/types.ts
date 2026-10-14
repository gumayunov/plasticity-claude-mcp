import { type ReferenceIdentity } from "../references.ts";
import { type EdgeReference, type FaceReference, type MeasurementPointReference } from "../measurements.ts";

export type Vector3 = [number, number, number];
export type Vector2 = [number, number];
export type NativeImportUnit = "millimeter" | "centimeter" | "meter" | "inch" | "foot";
export type ReferenceMeshUnit = NativeImportUnit;
export type TopologyMeasurementPointReference = Exclude<MeasurementPointReference, { type: "coordinates" }>;

export interface PlasticitySelection {
  documentToken: string;
  revision: string;
  bodyIds: number[];
  curveIds: number[];
  instanceIds: number[];
  referenceMeshIds: number[];
  groupIds: number[];
  faces: Array<{ bodyId: number | null; faceId: string }>;
  edges: Array<{ bodyId: number | null; edgeId: string }>;
  regionIds: string[];
  curveControlPoints: CurveControlPointReference[];
}

export interface CurveFragmentDescriptor {
  id: string;
  bodyId: number;
  ancestorVersionId: number;
  fragmentViewId: number;
  entityId: number;
  measurementSource: "native-brep";
  startMm: Vector3;
  midpointMm: Vector3;
  endMm: Vector3;
  lengthMm: number;
}

export interface CurveEndpointDescriptor {
  id: string;
  bodyId: number;
  bodyVersionId: number;
  entityId: number;
  measurementSource: "native-brep";
  positionMm: Vector3;
}

export interface CurveVertexDescriptor {
  id: string;
  bodyId: number;
  bodyVersionId: number;
  vertexId: number;
  viewVersionId: string;
  measurementSource: "native-brep";
  positionMm: Vector3;
  endpoint: boolean;
  adjacentEdgeEntityIds: number[];
}

export interface CurveDirectionDescriptor {
  id: number;
  versionId: number;
  measurementSource: "native-brep";
  closed: boolean;
  segments: Array<{
    entityId: number;
    curveType: string;
    startMm: Vector3;
    endMm: Vector3;
    startTangent: Vector3;
    endTangent: Vector3;
    lengthMm: number;
    circleGeometry?: {
      centerMm: Vector3;
      radiusMm: number;
      normal: Vector3;
      reference: Vector3;
      startMm: Vector3;
      midpointMm: Vector3;
      endMm: Vector3;
    };
  }>;
}

export interface CurveSegmentReference {
  bodyId: number;
  segmentEntityId: number;
}

export type CurvatureEdgeReference = EdgeReference | CurveSegmentReference;

export type FaceDraftClassification = "positive" | "negative" | "neutral" | "mixed";

export interface FaceDraftAnalysis {
  face: FaceReference;
  bodyVersionId: number;
  surfaceType: string;
  measurementSource: "native-brep-face-normal-grid";
  classification: FaceDraftClassification;
  sampleCount: number;
  sampleCounts: { positive: number; negative: number; neutral: number };
  minimumSignedDraft: { valueDeg: number; positionMm: Vector3; normal: Vector3 };
  maximumSignedDraft: { valueDeg: number; positionMm: Vector3; normal: Vector3 };
  minimumAbsoluteDraftDeg: number;
  maximumAbsoluteDraftDeg: number;
}

export interface NativeFaceDraftSamples {
  face: FaceReference;
  bodyVersionId: number;
  surfaceType: string;
  samples: Array<{ positionMm: Vector3; normal: Vector3 }>;
}

export interface CurveSegmentEndpointReference extends CurveSegmentReference {
  at: "start" | "end";
}

export interface CurveSegmentSampleReference extends CurveSegmentReference {
  normalizedParameter: number;
}

export interface CurveSegmentSampleDescriptor {
  reference: CurveSegmentSampleReference;
  bodyVersionId: number;
  curveType: string;
  measurementSource: "native-brep";
  positionMm: Vector3;
  tangent: Vector3;
}

export interface ShellEdgeEndpointReference extends EdgeReference {
  vertexId: number;
}

export interface CurveStructureDescriptor {
  id: number;
  versionId: number;
  measurementSource: "native-brep";
  segments: Array<{
    entityId: number;
    curveType: string;
    lengthMm: number;
    degree: number | null;
    controlPointCount: number | null;
    spanCount: number | null;
    activeSpanCount: number | null;
    distinctKnotCount: number | null;
    knots: Array<{ normalizedParameter: number; multiplicity: number; withinSegment: boolean }> | null;
    rational: boolean | null;
    periodic: boolean | null;
    circle: { centerMm: Vector3; radiusMm: number; normal: Vector3 } | null;
  }>;
}

export interface SurfaceStructureDescriptor {
  bodyId: number;
  faceId: string;
  bodyVersionId: number;
  measurementSource: "native-brep";
  surfaceType: string;
  trimmed: boolean;
  faceParameterBounds: { uMin: number; uMax: number; vMin: number; vMax: number };
  naturalParameterBounds: { uMin: number; uMax: number; vMin: number; vMax: number } | null;
  bSpline: {
    uDegree: number;
    vDegree: number;
    uSpanCount: number;
    vSpanCount: number;
    uControlPointCount: number;
    vControlPointCount: number;
    rational: boolean;
  } | null;
}

export interface CurvePlanarityDescriptor {
  id: number;
  versionId: number;
  measurementSource: "native-brep";
  planar: boolean;
  plane: { originMm: Vector3; normal: Vector3 } | null;
}

export type CurveControlPointReference =
  | { bodyId: number; kind: "vertex"; pointId: number }
  | { bodyId: number; kind: "control-point"; pointId: number };

export interface CurveControlPointDescriptor {
  id: number;
  versionId: number;
  positionSource: "native-control-handle";
  boundaryVertices: Array<{
    reference: { bodyId: number; kind: "vertex"; pointId: number };
    versionId: string;
    positionMm: Vector3;
    slideDirections: { positiveU: Vector3; negativeU: Vector3 } | null;
  }>;
  interiorControlPoints: Array<{
    reference: { bodyId: number; kind: "control-point"; pointId: number };
    versionId: string;
    positionMm: Vector3;
    slideDirections: { positiveU: Vector3; negativeU: Vector3 } | null;
  }>;
}

export type RebuildCurveOptions =
  | { method: "tolerance"; toleranceMm: number; preserveParameterization?: boolean; preserveChain?: boolean; keepCorners?: boolean }
  | { method: "control-points"; pointCount: number; preserveParameterization?: boolean; preserveChain?: boolean; keepCorners?: boolean }
  | { method: "degree-spans"; degree: number; spans: number; preserveParameterization?: boolean; preserveChain?: boolean; keepCorners?: boolean };

export interface CurveIntersectionDescriptor {
  id: string;
  bodyIds: [number, number];
  bodyVersionIds: [number, number];
  edgeEntityIds: [number, number];
  measurementSource: "native-brep";
  positionMm: Vector3;
}

export interface BodyValidationDescriptor {
  id: number;
  versionId: number;
  type: string;
  name: string | null;
  measurementSource: "native-brep";
  faceCount: number;
  edgeCount: number;
  boundaryEdgeIds: string[];
  closed: boolean;
  nativeCheckCodes: number[];
  nativeValid: boolean;
  printableSolid: boolean;
}

export type AppearanceMaterialInput =
  | { materialId: number }
  | { name: string; colorHex: string; roughness: number; metalness: number; opacity: number };

export interface VertexReference {
  bodyId: number;
  vertexId: number;
}

export interface CreateTextInput {
  text: string;
  fontSizeMm: number;
  originMm: Vector3 | Vector2;
  font?: "inter";
  name?: string;
  revision?: string;
  normal?: Vector3;
  xDirection?: Vector3;
  plane?: ReferenceIdentity;
  angleDegrees?: number;
}

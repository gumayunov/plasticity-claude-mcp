import { type RuntimeState } from "../runtime.ts";
import { frameFromOriginNormalX, normalize } from "../construction.ts";
import { millimetersToMeters } from "../units.ts";
import { inspectRectangularMember, type MemberEvidence, type MemberRequest } from "../member-geometry.ts";
import { inspectPlanarSection, type SectionEvidence, type SectionRequest } from "../section-geometry.ts";
import { inspectArbitrarySection, type ArbitrarySectionEvidence, type ArbitrarySectionRequest } from "../arbitrary-section.ts";
import { checkBodyInterference, type BodyInterferenceEvidence, type BodyInterferencePair } from "../interference.ts";
import { measureSolidProperties, type SolidPropertiesEvidence } from "../solid-properties.ts";
import { measureFaceProperties, type FacePropertiesEvidence } from "../face-properties.ts";
import { inspectSingleFastenerPlate, type FastenerPlateEvidence, type FastenerPlateRequest } from "../fastener-geometry.ts";
import { inspectIntegralRectangularPlate, type IntegralPlateEvidence, type IntegralPlateRequest } from "../integral-plate-geometry.ts";
import { inspectFastenerGroupGeometry, type FastenerGroupGeometryEvidence, type FastenerGroupGeometryRequest } from "../fastener-group-geometry.ts";
import { inspectFastenerGroupLayout, type FastenerGroupLayoutEvidence, type FastenerGroupLayoutRequest } from "../fastener-group-layout.ts";
import { measureFastenerGripStack, measureLinearEdges, measureNonparallelPlanarPolygonFaceClearance, measureParallelPlanarFaceClearance, measurePlanarFaces, measurePointDistance, measurePointToCircularEdge, measurePointToLinearEdge, measurePointToPlanarFace, measurePointToSampledCurveEdge, type EdgeReference, type NativeWireCircularSegment, type FastenerGripLayerReference, type FaceReference, type MeasurementPointReference, type WireSegmentReference } from "../measurements.ts";
import { type Vector3, type TopologyMeasurementPointReference, type CurvatureEdgeReference, type FaceDraftAnalysis, type NativeFaceDraftSamples, type BodyValidationDescriptor, type VertexReference } from "./types.ts";
import { requirePositiveFinite, summarizeFaceDraftSamples, leastParallelWorldAxis, requireVertexReference, requireTopologySelection } from "./helpers.ts";
import { OperationsBase } from "./base.ts";
import type { CurveQueryOperations } from "./curve-query.ts";

export abstract class MeasureOperations extends OperationsBase {
  declare listCurveDirections: CurveQueryOperations["listCurveDirections"];
  async measurePointDistance(first: MeasurementPointReference, second: MeasurementPointReference, revision: string) {
    return measurePointDistance(await this.state(), first, second, revision);
  }

  async measurePointToLinearEdge(point: MeasurementPointReference, edge: EdgeReference, revision: string) {
    return measurePointToLinearEdge(await this.state(), point, edge, revision);
  }

  async measurePointToSampledCurveEdge(
    point: MeasurementPointReference,
    edgeReference: EdgeReference | WireSegmentReference,
    revision: string,
    requestedToleranceMm = 0.01,
    maxSegments = 2048,
  ) {
    const before = await this.assertRevision(revision);
    if (!Number.isFinite(requestedToleranceMm) || requestedToleranceMm <= 0) throw new Error("Curve approximation tolerance must be positive and finite");
    if (!Number.isInteger(maxSegments) || maxSegments < 64 || maxSegments > 8192) throw new Error("Curve approximation maxSegments must be an integer from 64 to 8192");
    const body = before.bodies.find((candidate) => candidate.id === edgeReference.bodyId);
    let expectedCurveType: string | undefined;
    if ("edgeId" in edgeReference) {
      const edge = body?.edges.find((candidate) => candidate.id === edgeReference.edgeId);
      if (!edge) throw new Error(`Unknown current B-Rep edge: ${edgeReference.bodyId}:${edgeReference.edgeId}`);
      if (edge.line || edge.circle) throw new Error("Sampled curved-edge measurement only accepts non-linear, non-circular B-Rep edges; use the exact line or circle measurement tool");
      expectedCurveType = edge.curveType;
    } else {
      if (body?.type !== "Wire") throw new Error(`Curved Wire segment reference requires a current Wire body: ${edgeReference.bodyId}`);
      if (!Number.isInteger(edgeReference.segmentEntityId) || edgeReference.segmentEntityId <= 0) throw new Error("Wire segment entity ID must be a positive integer");
    }

    const sampled = await this.runtime.readNative<{
      curveType: string;
      lengthMm: number;
      isLine: boolean;
      isCircle: boolean;
      samples: Array<{ normalizedParameter: number; positionMm: [number, number, number] }>;
      maxObservedChordDeviationMm: number;
    }>(`function (args) {
      const mm = value => value * 1000;
      const vector = value => [mm(value.x), mm(value.y), mm(value.z)];
      const pointSegmentDistance = (point, first, second) => {
        const dx = second.x - first.x, dy = second.y - first.y, dz = second.z - first.z;
        const length2 = dx * dx + dy * dy + dz * dz;
        const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - first.x) * dx + (point.y - first.y) * dy + (point.z - first.z) * dz) / length2));
        return Math.hypot(point.x - (first.x + dx * t), point.y - (first.y + dy * t), point.z - (first.z + dz * t));
      };
      let item;
      for (const [versionId, candidate] of this.geo.geometryModel) {
        if (this.db.lookupStableId(versionId) === args.reference.bodyId) { item = candidate; break; }
      }
      if (!item) throw new Error('Curved-edge body is no longer current: ' + args.reference.bodyId);
      let nativeEdge;
      if (args.reference.kind === 'wire-segment') {
        if (item.view?.constructor?.name !== 'Wire') throw new Error('Curved segment source is no longer a Wire: ' + args.reference.bodyId);
        for (const segmentView of Array.from(item.view.segments ?? [])) {
          const candidate = this.db.lookupTopologyItem(segmentView);
          if (Number(candidate?.Id?.()) === args.reference.segmentEntityId) { nativeEdge = candidate; break; }
        }
        if (!nativeEdge) throw new Error('Stale or unknown Wire segment: ' + args.reference.bodyId + ':' + args.reference.segmentEntityId);
      } else {
        if (!['Solid', 'Sheet'].includes(item.view?.constructor?.name)) throw new Error('Curved-edge measurement requires a current Solid or Sheet');
        const edgeViews = item.view.high?.edges;
        if (!edgeViews) throw new Error('Native B-Rep edge views are unavailable');
        const viewIndex = edgeViews.versionIds.indexOf(args.reference.edgeId);
        const edgeView = viewIndex >= 0 ? edgeViews.get(viewIndex) : null;
        if (!edgeView) throw new Error('Stale or unknown B-Rep edge: ' + args.reference.bodyId + ':' + args.reference.edgeId);
        const modelEdges = item.model?.GetEdges?.();
        for (let index = 0; index < (modelEdges?.Size?.() ?? 0); index++) {
          const candidate = modelEdges.Get(index);
          if (candidate.Id() === edgeView.entityId) { nativeEdge = candidate; break; }
        }
        if (!nativeEdge) throw new Error('Native B-Rep edge entity is unavailable');
      }
      const wrappedCurve = nativeEdge.GetCurve();
      const curve = wrappedCurve?.curve ?? wrappedCurve;
      const curveType = String(curve?.constructor?.name ?? 'Unknown');
      const nativeLength = nativeEdge.FindLength();
      const lengthMm = mm(typeof nativeLength === 'number' ? nativeLength : nativeLength?.length);
      if (!Number.isFinite(lengthMm) || lengthMm <= 0) throw new Error('Native curved-edge length is unavailable');
      const isLine = typeof nativeEdge.IsLine === 'function' ? Boolean(nativeEdge.IsLine()) : /line/i.test(curveType);
      const isCircle = typeof nativeEdge.IsCircle === 'function' && Boolean(nativeEdge.IsCircle());
      let segmentCount = 64;
      let maxObservedChordDeviationMm = 0;
      let samples = [];
      for (;;) {
        const nativePoints = Array.from({ length: segmentCount + 1 }, (_unused, index) => nativeEdge.GetPointAndTangent(index / segmentCount).position);
        maxObservedChordDeviationMm = 0;
        for (let index = 0; index < segmentCount; index++) {
          const midpoint = nativeEdge.GetPointAndTangent((index + 0.5) / segmentCount).position;
          maxObservedChordDeviationMm = Math.max(maxObservedChordDeviationMm, mm(pointSegmentDistance(midpoint, nativePoints[index], nativePoints[index + 1])));
        }
        samples = nativePoints.map((position, index) => ({ normalizedParameter: index / segmentCount, positionMm: vector(position) }));
        if (maxObservedChordDeviationMm <= args.requestedToleranceMm || segmentCount >= args.maxSegments) break;
        segmentCount = Math.min(segmentCount * 2, args.maxSegments);
      }
      return { curveType, lengthMm, isLine, isCircle, samples, maxObservedChordDeviationMm };
    }`, [], [{ reference: "edgeId" in edgeReference
      ? { kind: "brep-edge", bodyId: edgeReference.bodyId, edgeId: edgeReference.edgeId }
      : { kind: "wire-segment", bodyId: edgeReference.bodyId, segmentEntityId: edgeReference.segmentEntityId }, requestedToleranceMm, maxSegments }]);
    const after = await this.state();
    if (after.documentToken !== before.documentToken || after.revision !== before.revision) {
      throw new Error("Plasticity document changed while the curved-edge distance was being measured");
    }
    if (expectedCurveType !== undefined && expectedCurveType !== sampled.curveType) throw new Error("Native curved-edge type no longer matches the current edge reference");
    if (sampled.isLine || sampled.isCircle) throw new Error("Sampled curved-edge measurement only accepts non-linear, non-circular B-Rep edges; use the exact line or circle measurement tool");
    return measurePointToSampledCurveEdge(after, point, edgeReference, revision, sampled.samples, {
      requestedToleranceMm,
      maxObservedChordDeviationMm: sampled.maxObservedChordDeviationMm,
    }, "edgeId" in edgeReference ? undefined : {
      bodyId: edgeReference.bodyId,
      segmentEntityId: edgeReference.segmentEntityId,
      curveType: sampled.curveType,
      lengthMm: sampled.lengthMm,
      linear: sampled.isLine,
      circular: sampled.isCircle,
    });
  }

  async measurePointToCircularEdge(point: MeasurementPointReference, edge: EdgeReference | WireSegmentReference, revision: string) {
    const state = await this.state();
    if ("edgeId" in edge) return measurePointToCircularEdge(state, point, edge, revision);
    const inventory = await this.listCurveDirections();
    if (inventory.revision !== revision || inventory.documentToken !== state.documentToken) throw new Error("Circular Wire segment reference is stale");
    const curve = inventory.curves.find((candidate) => candidate.id === edge.bodyId);
    const segment = curve?.segments.find((candidate) => candidate.entityId === edge.segmentEntityId);
    if (!segment?.circleGeometry) throw new Error("Measurement Wire segment requires exact native circular B-Rep geometry");
    const geometry: NativeWireCircularSegment = {
      segmentEntityId: segment.entityId,
      lengthMm: segment.lengthMm,
      circleGeometry: segment.circleGeometry,
    };
    return measurePointToCircularEdge(state, point, edge, revision, geometry);
  }

  async measurePointToPlanarFace(point: MeasurementPointReference, face: FaceReference, revision: string) {
    return measurePointToPlanarFace(await this.state(), point, face, revision);
  }

  async measurePlanarFaces(first: FaceReference, second: FaceReference, revision: string, angularToleranceDeg = 0.01) {
    return measurePlanarFaces(await this.state(), first, second, revision, angularToleranceDeg);
  }

  async measureParallelPlanarFaceClearance(first: FaceReference, second: FaceReference, revision: string) {
    return measureParallelPlanarFaceClearance(await this.state(), first, second, revision);
  }

  async measureNonparallelPlanarPolygonFaceClearance(first: FaceReference, second: FaceReference, revision: string) {
    return measureNonparallelPlanarPolygonFaceClearance(await this.state(), first, second, revision);
  }

  async measureLinearEdges(first: EdgeReference, second: EdgeReference, revision: string, angularToleranceDeg = 0.01) {
    return measureLinearEdges(await this.state(), first, second, revision, angularToleranceDeg);
  }

  async measureFastenerGripStack(layers: FastenerGripLayerReference[], axis: Vector3, revision: string, angularToleranceDeg = 0.01) {
    return measureFastenerGripStack(await this.state(), layers, axis, revision, angularToleranceDeg);
  }

  async analyzeEdgeCurvature(edges: CurvatureEdgeReference[], revision: string) {
    const state = await this.assertRevision(revision);
    if (edges.length === 0) throw new Error("At least one edge is required for curvature analysis");
    const keys = edges.map((edge) => "edgeId" in edge ? `${edge.bodyId}:shell:${edge.edgeId}` : `${edge.bodyId}:wire:${edge.segmentEntityId}`);
    if (new Set(keys).size !== keys.length) throw new Error("Curvature edge references must be unique");
    const bodyVersions = new Map<number, number>();
    for (const reference of edges) {
      const body = state.bodies.find((candidate) => candidate.id === reference.bodyId);
      if (!body || !["Wire", "Solid", "Sheet"].includes(body.type)) {
        throw new Error(`Unknown current Wire, Solid, or Sheet body ID: ${reference.bodyId}`);
      }
      if (body.type === "Wire") {
        if (!("segmentEntityId" in reference)) {
          throw new Error(`Wire curvature reference ${reference.bodyId} requires a native segmentEntityId`);
        }
      } else {
        if (!("edgeId" in reference) || !body.edges.some((candidate) => candidate.id === reference.edgeId)) {
          throw new Error(`Unknown current edge ID ${"edgeId" in reference ? reference.edgeId : "(missing)"} on body ${reference.bodyId}`);
        }
      }
      bodyVersions.set(body.id, body.versionId);
    }
    const analyses = await this.runtime.readNative(`async function (evalCurvatureMeasurements, Measurement, Target, Landmark, args) {
      const selected = args.edges.map(reference => {
        let item;
        for (const [versionId, candidate] of this.geo.geometryModel) {
          if (this.db.lookupStableId(versionId) === reference.bodyId) { item = candidate; break; }
        }
        if (!item || !['Wire', 'Solid', 'Sheet'].includes(item.view?.constructor?.name)) {
          throw new Error('Unknown current Wire, Solid, or Sheet body ID: ' + reference.bodyId);
        }
        let entityId;
        if (item.view.constructor.name === 'Wire') {
          if (!Number.isInteger(reference.segmentEntityId)) throw new Error('Wire curvature reference requires a native segmentEntityId');
          const modelEdges = item.model?.GetEdges?.();
          for (let index = 0; index < (modelEdges?.Size?.() ?? 0); index += 1) {
            const modelEdge = modelEdges.Get(index);
            if (Number(modelEdge.Id()) === reference.segmentEntityId) { entityId = reference.segmentEntityId; break; }
          }
          if (!Number.isInteger(entityId)) throw new Error('Stale or unknown Wire segment: ' + reference.bodyId + ':' + reference.segmentEntityId);
        } else {
          const edgeIndex = item.view.high.edges.versionIds.indexOf(reference.edgeId);
          if (edgeIndex < 0) throw new Error('Stale or unknown shell edge: ' + reference.edgeId);
          entityId = Number(item.view.high.edges.get(edgeIndex).entityId);
        }
        return {
          reference,
          bodyVersionId: args.bodyVersions.find(candidate => candidate.bodyId === reference.bodyId)?.versionId,
          modelBodyId: Number(item.model.Id()),
          entityId,
        };
      });
      const measurements = selected.map(candidate => {
        const measurement = new Measurement();
        measurement.target = new Target(Landmark.Edge, candidate.entityId, candidate.modelBodyId);
        measurement.tmin = 0;
        measurement.tmax = 1;
        return measurement;
      });
      const evaluated = await evalCurvatureMeasurements(measurements, [], this.analyzer, undefined, undefined);
      if (evaluated.measurements.length !== selected.length || evaluated.views.length !== selected.length) {
        throw new Error('Plasticity curvature measurements and views are inconsistent');
      }
      const zeroTolerancePerMm = 1e-12;
      return selected.map((candidate, index) => {
        const view = evaluated.views[index];
        const edgeIds = Array.from(view.edgeIds ?? [], Number);
        const analysisIndex = edgeIds.findIndex(edgeId => edgeId === candidate.entityId);
        if (analysisIndex < 0 || !view.analyses?.[analysisIndex]) {
          throw new Error('Plasticity returned curvature data for an unexpected edge');
        }
        const analysis = view.analyses[analysisIndex];
        const spikes = Array.from(analysis.spikes ?? [], Number);
        if (spikes.length === 0 || spikes.length % 6 !== 0) {
          throw new Error('Plasticity returned malformed curvature samples');
        }
        const samples = [];
        for (let offset = 0; offset < spikes.length; offset += 6) {
          const positionMm = [spikes[offset] * 1000, spikes[offset + 1] * 1000, spikes[offset + 2] * 1000];
          const vectorPerMm = [spikes[offset + 3] / 1000, spikes[offset + 4] / 1000, spikes[offset + 5] / 1000];
          const curvaturePerMm = Math.hypot(...vectorPerMm);
          if (![...positionMm, ...vectorPerMm, curvaturePerMm].every(Number.isFinite)) {
            throw new Error('Plasticity returned a non-finite curvature sample');
          }
          samples.push({ positionMm, vectorPerMm, curvaturePerMm });
        }
        let minimum = samples[0];
        let maximum = samples[0];
        let sum = 0;
        let minimumPositive = Infinity;
        let containsZeroCurvature = false;
        for (const sample of samples) {
          if (sample.curvaturePerMm < minimum.curvaturePerMm) minimum = sample;
          if (sample.curvaturePerMm > maximum.curvaturePerMm) maximum = sample;
          sum += sample.curvaturePerMm;
          if (sample.curvaturePerMm <= zeroTolerancePerMm) containsZeroCurvature = true;
          else minimumPositive = Math.min(minimumPositive, sample.curvaturePerMm);
        }
        return {
          edge: candidate.reference,
          bodyVersionId: candidate.bodyVersionId,
          measurementSource: 'native-brep-100-samples',
          sampleCount: samples.length,
          minimumCurvaturePerMm: minimum.curvaturePerMm,
          maximumCurvaturePerMm: maximum.curvaturePerMm,
          meanCurvaturePerMm: sum / samples.length,
          minimumCurvatureAtMm: minimum.positionMm,
          maximumCurvatureAtMm: maximum.positionMm,
          maximumCurvatureVectorPerMm: maximum.vectorPerMm,
          minimumRadiusOfCurvatureMm: maximum.curvaturePerMm > zeroTolerancePerMm ? 1 / maximum.curvaturePerMm : null,
          maximumFiniteRadiusOfCurvatureMm: Number.isFinite(minimumPositive) ? 1 / minimumPositive : null,
          containsZeroCurvature,
        };
      });
    }`, ["evalCurvatureMeasurements", "CurvatureMeasurement", "Target", "TopologyLandmark"], [{
      edges,
      bodyVersions: [...bodyVersions].map(([bodyId, versionId]) => ({ bodyId, versionId })),
    }]);
    return { documentToken: state.documentToken, revision: state.revision, analyses };
  }

  async analyzeFaceDraft(
    faces: FaceReference[],
    pullDirection: Vector3,
    minimumDraftDeg: number,
    samplesPerDirection: number,
    revision: string,
  ): Promise<{
    documentToken: string;
    revision: string;
    pullDirection: Vector3;
    minimumDraftDeg: number;
    samplesPerDirection: number;
    analyses: FaceDraftAnalysis[];
    limitation: string;
  }> {
    const before = await this.assertRevision(revision);
    requireTopologySelection(before, faces, "face");
    const invalidBodies = [...new Set(faces.map((reference) => reference.bodyId))].filter((bodyId) => {
      const type = before.bodies.find((body) => body.id === bodyId)?.type;
      return type !== "Solid" && type !== "Sheet";
    });
    if (invalidBodies.length > 0) throw new Error(`Face draft analysis requires current Solid or Sheet bodies: ${invalidBodies.join(", ")}`);
    if (!Number.isFinite(minimumDraftDeg) || minimumDraftDeg <= 0 || minimumDraftDeg >= 90) {
      throw new Error("Minimum draft angle must be greater than 0 and less than 90 degrees");
    }
    if (!Number.isInteger(samplesPerDirection) || samplesPerDirection < 3 || samplesPerDirection > 32) {
      throw new Error("Draft samples per direction must be an integer from 3 through 32");
    }
    const unitPullDirection = normalize(pullDirection, "Draft pull direction");
    const bodyVersions = new Map(before.bodies.map((body) => [body.id, body.versionId]));
    const native = await this.runtime.readNative<NativeFaceDraftSamples[]>(`function (args) {
      const mm = value => value * 1000;
      const vectorMm = value => [mm(value.x), mm(value.y), mm(value.z)];
      const direction = value => [Number(value.x), Number(value.y), Number(value.z)];
      const result = [];
      for (const reference of args.faces) {
        let found;
        for (const [versionId, item] of this.geo.geometryModel) {
          if (this.db.lookupStableId(versionId) === reference.bodyId) { found = [versionId, item]; break; }
        }
        if (!found || !['Solid', 'Sheet'].includes(found[1].view?.constructor?.name)) {
          throw new Error('Unknown current draft-analysis body ID: ' + reference.bodyId);
        }
        const [versionId, item] = found;
        const faceViews = item.view.high.faces;
        const viewIndex = faceViews.versionIds.indexOf(reference.faceId);
        if (viewIndex < 0) throw new Error('Unknown current draft-analysis face: ' + reference.bodyId + ':' + reference.faceId);
        const entityId = Number(faceViews.get(viewIndex).entityId);
        const nativeFaces = item.model.GetFaces();
        let face;
        for (let index = 0; index < nativeFaces.Size(); index += 1) {
          const candidate = nativeFaces.Get(index);
          if (Number(candidate.Id()) === entityId) { face = candidate; break; }
        }
        if (!face) throw new Error('Native draft-analysis face is unavailable: ' + reference.bodyId + ':' + reference.faceId);
        const grid = Array.from(face.EvalGrid(args.samplesPerDirection, args.samplesPerDirection), Number);
        if (grid.length === 0 || grid.length % 3 !== 0 || !grid.every(Number.isFinite)) {
          throw new Error('Plasticity returned malformed native face samples');
        }
        const seed = face.FindUVMidpoint();
        const NativeVector = seed?.position?.constructor;
        if (typeof NativeVector !== 'function') throw new Error('Plasticity native Vector constructor is unavailable');
        const samples = [];
        for (let offset = 0; offset < grid.length; offset += 3) {
          const requested = new NativeVector(grid[offset], grid[offset + 1], grid[offset + 2]);
          const uv = face.FindPointNear(requested);
          const evaluated = face.EvalNormal(uv.u, uv.v);
          const positionMm = vectorMm(evaluated.position);
          const normal = direction(evaluated.normal);
          if (![...positionMm, ...normal].every(Number.isFinite)) {
            throw new Error('Plasticity returned non-finite native face-normal data');
          }
          samples.push({ positionMm, normal });
        }
        result.push({
          face: reference,
          bodyVersionId: Number(versionId),
          surfaceType: String(face.GetSurface()?.surface?.constructor?.name ?? 'Unknown'),
          samples,
        });
      }
      return result;
    }`, [], [{ faces, samplesPerDirection }]);
    const after = await this.state();
    if (after.documentToken !== before.documentToken || after.revision !== before.revision) {
      throw new Error("Plasticity document changed during native face draft analysis");
    }
    if (native.length !== faces.length) throw new Error("Native face draft result count does not match the request");
    const analyses = native.map((entry, index) => {
      const reference = faces[index]!;
      if (entry.face.bodyId !== reference.bodyId || entry.face.faceId !== reference.faceId || entry.bodyVersionId !== bodyVersions.get(reference.bodyId)) {
        throw new Error(`Native face draft identity mismatch for ${reference.bodyId}:${reference.faceId}`);
      }
      return summarizeFaceDraftSamples(entry, unitPullDirection, minimumDraftDeg);
    });
    return {
      documentToken: after.documentToken,
      revision: after.revision,
      pullDirection: unitPullDirection,
      minimumDraftDeg,
      samplesPerDirection,
      analyses,
      limitation: "Native B-Rep normals are evaluated at a finite grid of interior face points; extrema between samples, mold parting, release paths, and print support requirements are not proven.",
    };
  }

  async analyzeSurfaceContinuity(
    edges: EdgeReference[],
    revision: string,
    positionToleranceMm = 0.01,
    normalAngleToleranceDeg = 0.1,
    relativeCurvatureTolerance = 0.05,
  ) {
    const state = await this.assertRevision(revision);
    if (edges.length === 0) throw new Error("At least one edge is required for surface continuity analysis");
    const keys = edges.map((edge) => `${edge.bodyId}:${edge.edgeId}`);
    if (new Set(keys).size !== keys.length) throw new Error("Surface continuity edge references must be unique");
    requirePositiveFinite(positionToleranceMm, "Position tolerance");
    requirePositiveFinite(normalAngleToleranceDeg, "Normal angle tolerance");
    requirePositiveFinite(relativeCurvatureTolerance, "Relative curvature tolerance");
    const bodyVersions = new Map<number, number>();
    for (const reference of edges) {
      const body = state.bodies.find((candidate) => candidate.id === reference.bodyId);
      if (!body || (body.type !== "Solid" && body.type !== "Sheet")) {
        throw new Error(`Unknown current Solid or Sheet body ID: ${reference.bodyId}`);
      }
      const edge = body.edges.find((candidate) => candidate.id === reference.edgeId);
      if (!edge) throw new Error(`Unknown current edge ID ${reference.edgeId} on body ${reference.bodyId}`);
      if (edge.faceIds.length !== 2) {
        throw new Error(`Surface continuity edge ${reference.edgeId} on body ${reference.bodyId} must have exactly two adjacent faces`);
      }
      bodyVersions.set(body.id, body.versionId);
    }
    const tolerances = {
      positionMm: positionToleranceMm,
      normalAngleDeg: normalAngleToleranceDeg,
      relativeCurvature: relativeCurvatureTolerance,
    };
    const analyses = await this.runtime.readNative(`async function (Factory, ContinuityType, evalSurfaceContinuityMeasurements, Refresh, args) {
      const selected = args.edges.map(reference => {
        let item;
        for (const [versionId, candidate] of this.geo.geometryModel) {
          if (this.db.lookupStableId(versionId) === reference.bodyId) { item = candidate; break; }
        }
        if (!item || !['Solid', 'Sheet'].includes(item.view?.constructor?.name)) {
          throw new Error('Unknown current Solid or Sheet body ID: ' + reference.bodyId);
        }
        const edgeIndex = item.view.high.edges.versionIds.indexOf(reference.edgeId);
        if (edgeIndex < 0) throw new Error('Stale or unknown edge: ' + reference.edgeId);
        const edge = item.view.high.edges.get(edgeIndex);
        const faceId = topologyId => {
          for (let index = 0; index < item.view.high.faces.versionIds.length; index += 1) {
            const face = item.view.high.faces.get(index);
            if (Number(face.entityId) === Number(topologyId)) return item.view.high.faces.versionIds[index];
          }
          return null;
        };
        return {
          reference,
          bodyVersionId: args.bodyVersions.find(candidate => candidate.bodyId === reference.bodyId)?.versionId,
          modelBodyId: Number(item.model.Id()),
          entityId: Number(edge.entityId),
          edge,
          faceId,
        };
      });
      const factory = new Factory(this);
      factory.g0Tolerance = args.tolerances.positionMm / 1000;
      factory.g1ToleranceDegrees = args.tolerances.normalAngleDeg;
      factory.g2Tolerance = args.tolerances.relativeCurvature;
      factory.continuity = ContinuityType.G2;
      factory.edges = selected.map(candidate => candidate.edge);
      const measurements = await factory.calculate();
      const evaluated = await evalSurfaceContinuityMeasurements(measurements, [], this.analyzer, undefined, undefined);
      if (evaluated.measurements.length !== evaluated.views.length) {
        throw new Error('Plasticity continuity measurements and views are inconsistent');
      }
      const vectorMm = value => [Number(value.x) * 1000, Number(value.y) * 1000, Number(value.z) * 1000];
      return evaluated.measurements.map((measurement, index) => {
        const view = evaluated.views[index];
        const selectedEdge = selected.find(candidate =>
          candidate.modelBodyId === Number(measurement.referenceEdge?.bodyId)
          && candidate.entityId === Number(measurement.referenceEdge?.topologyId));
        if (!selectedEdge) throw new Error('Plasticity returned continuity data for an unexpected edge');
        const firstFaceId = selectedEdge.faceId(measurement.referenceFace?.topologyId);
        const secondFaceId = selectedEdge.faceId(measurement.targetFace?.topologyId);
        if (!firstFaceId || !secondFaceId) throw new Error('Plasticity returned an unknown adjacent face');
        const maximumPositionDeviationMm = Number(view.g0max) * 1000;
        const maximumNormalAngleDeviationDeg = Number(view.g1max) * 180 / Math.PI;
        const maximumRelativeCurvatureDeviation = Number(view.g2max);
        if (![maximumPositionDeviationMm, maximumNormalAngleDeviationDeg, maximumRelativeCurvatureDeviation].every(Number.isFinite)) {
          throw new Error('Plasticity returned a non-finite continuity deviation');
        }
        const G0 = maximumPositionDeviationMm <= args.tolerances.positionMm;
        const G1 = G0 && maximumNormalAngleDeviationDeg <= args.tolerances.normalAngleDeg;
        const G2 = G1 && maximumRelativeCurvatureDeviation <= args.tolerances.relativeCurvature;
        return {
          edge: selectedEdge.reference,
          adjacentFaces: [
            { bodyId: selectedEdge.reference.bodyId, faceId: firstFaceId },
            { bodyId: selectedEdge.reference.bodyId, faceId: secondFaceId },
          ],
          bodyVersionId: selectedEdge.bodyVersionId,
          measurementSource: 'native-brep-100-samples',
          sampleCount: Number(Refresh.Samples),
          maximumPositionDeviationMm,
          maximumPositionDeviationAtMm: vectorMm(view.g0maxBase),
          maximumNormalAngleDeviationDeg,
          maximumNormalAngleDeviationAtMm: vectorMm(view.g1maxBase),
          maximumRelativeCurvatureDeviation,
          maximumRelativeCurvatureDeviationAtMm: vectorMm(view.g2maxBase),
          tolerances: args.tolerances,
          passes: { G0, G1, G2 },
          achievedContinuity: G2 ? 'G2' : G1 ? 'G1' : G0 ? 'G0' : 'discontinuous',
        };
      });
    }`, ["MeasureContinuityFactory", "ContinuityType", "evalSurfaceContinuityMeasurements", "EvalSurfaceContinuityMeasurements_refresh"], [{
      edges,
      tolerances,
      bodyVersions: [...bodyVersions].map(([bodyId, versionId]) => ({ bodyId, versionId })),
    }]);
    return { documentToken: state.documentToken, revision: state.revision, analyses };
  }

  async listMeasurements(): Promise<{
    documentToken: string;
    revision: string;
    measurements: NonNullable<RuntimeState["measurements"]>;
  }> {
    const state = await this.state();
    return { documentToken: state.documentToken, revision: state.revision, measurements: state.measurements ?? [] };
  }

  async listSectionAnalyses(): Promise<{
    documentToken: string;
    revision: string;
    sectionAnalyses: NonNullable<RuntimeState["sectionAnalyses"]>;
  }> {
    const state = await this.state();
    return { documentToken: state.documentToken, revision: state.revision, sectionAnalyses: state.sectionAnalyses ?? [] };
  }

  async createSectionAnalysis(
    originMm: Vector3,
    normal: Vector3,
    xDirection: Vector3 | undefined,
    name: string | undefined,
    revision: string,
  ): Promise<RuntimeState> {
    const current = await this.assertRevision(revision);
    const unitNormal = normalize(normal, "Section analysis normal");
    const preferredX = xDirection ?? leastParallelWorldAxis(unitNormal);
    const frame = frameFromOriginNormalX(originMm, unitNormal, preferredX);
    if ((current.sectionAnalyses ?? []).length > 0) {
      throw new Error("Plasticity already has an active section analysis; delete it before creating another");
    }
    await this.runtime.mutate(`function (SectionAnalysisFactory, Vector3, Matrix4, args) {
      const viewports = Array.from(this.viewports ?? []);
      if (viewports.length === 0 || !this.shading) throw new Error('Plasticity does not expose a usable section-analysis viewport');
      if (this.shading.isSectioned) throw new Error('Plasticity already has an active section analysis; delete it before creating another');
      const section = new SectionAnalysisFactory(this).section;
      const point = new Vector3(...args.point);
      const normal = new Vector3(...args.normal).negate().normalize();
      section.position.copy(point);
      section.originalPosition.copy(point);
      section.plane.setFromNormalAndCoplanarPoint(normal, point);
      section.originalPlane.copy(section.plane);
      section.name = args.name ?? '';
      section.visible = true;
      section.helper.worldPosition.copy(point);
      if (args.xDirection) {
        const x = new Vector3(...args.xDirection).addScaledVector(normal, -new Vector3(...args.xDirection).dot(normal)).normalize();
        const y = new Vector3().crossVectors(normal, x).normalize();
        section.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(normal, x, y));
      }
      section.updateMatrixWorld(true);
      this.shading.section = section;
      for (const viewport of viewports) viewport.setNeedsRender();
      return section.versionId;
    }`, ["SectionAnalysisFactory", "Vector3", "Matrix4"], [{
      point: frame.originMm.map(millimetersToMeters),
      normal: frame.normal,
      xDirection: frame.xDirection,
      name: name ?? null,
    }]);
    return await this.state();
  }

  async deleteSectionAnalysis(id: number, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (!(state.sectionAnalyses ?? []).some((section) => section.id === id)) {
      throw new Error(`Unknown current section analysis ID: ${id}`);
    }
    await this.runtime.mutate(`function (args) {
      const active = this.shading?.section;
      if (!active || Number(active.versionId) !== args.id) throw new Error('Unknown active section analysis ID: ' + args.id);
      this.shading.section = null;
      for (const viewport of this.viewports ?? []) viewport.setNeedsRender();
    }`, [], [{ id }]);
    return await this.state();
  }

  async createVertexDistanceMeasurement(
    first: VertexReference,
    second: VertexReference,
    name: string | undefined,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireVertexReference(state, first, "first");
    requireVertexReference(state, second, "second");
    if (first.bodyId === second.bodyId && first.vertexId === second.vertexId) {
      throw new Error("Distance measurement vertices must be different");
    }
    await this.runtime.mutate(`async function (Factory, args) {
      const editor = this;
      const wanted = new Map(args.vertices.map(reference => [reference.bodyId + ':' + reference.vertexId, reference]));
      const matches = new Map();
      for (const entry of this.snaps.cache.entries ?? []) {
        for (let index = 0; index < (entry.positions?.length ?? 0) / 3; index += 1) {
          const snap = entry.lookup(index);
          if (snap?.constructor?.name !== 'Snaps_ShellVertexSnap') continue;
          const bodyId = this.db.lookupStableId(snap.item?.versionId);
          const vertexId = snap.model?.Id?.();
          const key = bodyId + ':' + vertexId;
          if (wanted.has(key) && !matches.has(key)) matches.set(key, snap);
        }
      }
      const snaps = args.vertices.map(reference => matches.get(reference.bodyId + ':' + reference.vertexId));
      if (snaps.some(snap => !snap)) throw new Error('Plasticity vertex snaps are unavailable for the requested measurement');
      let failure;
      const command = new this.commands.MeasureDistanceCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor);
          factory.p1(snaps[0].position, snaps[0]);
          factory.p2(snaps[1].position, snaps[1]);
          const measurement = await factory.calculate();
          if (args.name) measurement.userData.name = args.name;
          await editor.measurements.update([measurement], [], []);
          for (const viewport of editor.viewports ?? []) viewport.setNeedsRender();
          return measurement;
        } catch (error) {
          failure = error;
          throw error;
        }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["PointToPointMeasurementFactory"], [{ vertices: [first, second], name: name ?? null }]);
    return await this.state();
  }

  async createTopologyDistanceMeasurement(
    first: TopologyMeasurementPointReference,
    second: TopologyMeasurementPointReference,
    name: string | undefined,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    for (const [index, reference] of [first, second].entries()) {
      const body = state.bodies.find((candidate) => candidate.id === reference.bodyId);
      if (!body || !["Solid", "Sheet"].includes(body.type)) {
        throw new Error(`Topology distance point ${index + 1} requires a current Solid or Sheet body: ${reference.bodyId}`);
      }
    }
    const measured = measurePointDistance(state, first, second, revision);
    if (measured.distanceMm <= 1e-9) throw new Error("Distance measurement topology points must be different");
    await this.runtime.mutate(`async function (Factory, args) {
      const editor = this;
      const findItem = bodyId => {
        for (const [versionId, item] of editor.geo.geometryModel) {
          if (editor.db.lookupStableId(versionId) === bodyId) return item;
        }
        throw new Error('Unknown current body ID: ' + bodyId);
      };
      const entityId = (reference, item) => {
        if (reference.type === 'vertex') return reference.vertexId;
        const collection = reference.type === 'edge-midpoint' ? item.view?.high?.edges : item.view?.high?.faces;
        const stableId = reference.type === 'edge-midpoint' ? reference.edgeId : reference.faceId;
        const index = collection?.versionIds?.indexOf(stableId) ?? -1;
        if (index < 0) throw new Error('Stale or unknown topology reference: ' + stableId);
        return Number(collection.get(index).entityId);
      };
      const wanted = args.points.map(reference => {
        const item = findItem(reference.bodyId);
        return { reference, entityId: entityId(reference, item) };
      });
      const snaps = wanted.map(({ reference, entityId }) => {
        for (const entry of editor.snaps.cache.entries ?? []) {
          for (let index = 0; index < (entry.positions?.length ?? 0) / 3; index += 1) {
            const candidate = entry.lookup(index);
            if (editor.db.lookupStableId(candidate?.item?.versionId) !== reference.bodyId) continue;
            if (reference.type === 'vertex'
              && candidate?.constructor?.name === 'Snaps_ShellVertexSnap'
              && Number(candidate.model?.Id?.()) === entityId) return candidate;
            if (reference.type === 'edge-midpoint'
              && candidate?.constructor?.name === 'EdgePointSnap'
              && Number(candidate.model?.Id?.()) === entityId) return candidate;
            if (reference.type === 'face-center'
              && candidate?.constructor?.name === 'Snaps_FaceCenterPointSnap'
              && Number(candidate.faceSnap?.model?.Id?.()) === entityId) return candidate;
          }
        }
        throw new Error('Plasticity topology snap is unavailable for ' + reference.type + ' on body ' + reference.bodyId);
      });
      let failure;
      const command = new this.commands.MeasureDistanceCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor);
          factory.p1(snaps[0].position, snaps[0]);
          factory.p2(snaps[1].position, snaps[1]);
          const measurement = await factory.calculate();
          if (args.name) measurement.userData.name = args.name;
          await editor.measurements.update([measurement], [], []);
          for (const viewport of editor.viewports ?? []) viewport.setNeedsRender();
          return measurement;
        } catch (error) {
          failure = error;
          throw error;
        }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["PointToPointMeasurementFactory"], [{ points: [first, second], name: name ?? null }]);
    return await this.state();
  }

  async createRadiusMeasurement(
    edge: CurvatureEdgeReference,
    name: string | undefined,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    const body = state.bodies.find((candidate) => candidate.id === edge.bodyId);
    if (!body || !["Wire", "Solid", "Sheet"].includes(body.type)) {
      throw new Error(`Unknown current Wire, Solid, or Sheet body ID: ${edge.bodyId}`);
    }
    if (body.type === "Wire") {
      if (!("segmentEntityId" in edge)) {
        throw new Error(`Wire radius measurement ${edge.bodyId} requires a native segmentEntityId`);
      }
    } else {
      if (!("edgeId" in edge)) throw new Error(`Solid or Sheet radius measurement ${edge.bodyId} requires an edgeId`);
      const currentEdge = body.edges.find((candidate) => candidate.id === edge.edgeId);
      if (!currentEdge) throw new Error(`Unknown current edge ID ${edge.edgeId} on body ${edge.bodyId}`);
      if (!currentEdge.circle) throw new Error(`Radius measurement requires a circular edge: ${edge.bodyId}:${edge.edgeId}`);
    }
    await this.runtime.mutate(`async function (Factory, args) {
      const editor = this;
      let item;
      for (const [versionId, candidate] of this.geo.geometryModel) {
        if (this.db.lookupStableId(versionId) === args.edge.bodyId) { item = candidate; break; }
      }
      if (!item || !['Wire', 'Solid', 'Sheet'].includes(item.view?.constructor?.name)) {
        throw new Error('Unknown current Wire, Solid, or Sheet body ID: ' + args.edge.bodyId);
      }
      let entityId;
      let modelEdge;
      const modelEdges = item.model?.GetEdges?.();
      if (item.view.constructor.name === 'Wire') {
        if (!Number.isInteger(args.edge.segmentEntityId)) throw new Error('Wire radius measurement requires a native segmentEntityId');
        entityId = args.edge.segmentEntityId;
      } else {
        const edgeIndex = item.view.high.edges.versionIds.indexOf(args.edge.edgeId);
        if (edgeIndex < 0) throw new Error('Stale or unknown shell edge: ' + args.edge.edgeId);
        entityId = Number(item.view.high.edges.get(edgeIndex).entityId);
      }
      for (let index = 0; index < (modelEdges?.Size?.() ?? 0); index += 1) {
        const candidate = modelEdges.Get(index);
        if (Number(candidate.Id()) === entityId) { modelEdge = candidate; break; }
      }
      if (!modelEdge) throw new Error('Stale or unknown native edge: ' + args.edge.bodyId + ':' + entityId);
      if (!modelEdge.IsCircle()) throw new Error('Radius measurement requires a circular edge');
      let snap;
      for (const entry of this.snaps.cache.entries ?? []) {
        for (let index = 0; index < (entry.positions?.length ?? 0) / 3; index += 1) {
          const candidate = entry.lookup(index);
          if (!['EdgePointSnap', 'CurveSegmentMidpointSnap'].includes(candidate?.constructor?.name)) continue;
          if (this.db.lookupStableId(candidate.item?.versionId) !== args.edge.bodyId) continue;
          if (Number(candidate.model?.Id?.()) !== entityId) continue;
          snap = candidate;
          break;
        }
        if (snap) break;
      }
      if (!snap) throw new Error('Plasticity circular-edge snap is unavailable for the requested radius measurement');
      let failure;
      const command = new this.commands.MeasureRadiusCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor);
          factory.snap = snap;
          const measurement = await factory.calculate();
          if (args.name) measurement.userData.name = args.name;
          await editor.measurements.update([measurement], [], []);
          for (const viewport of editor.viewports ?? []) viewport.setNeedsRender();
          return measurement;
        } catch (error) {
          failure = error;
          throw error;
        }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["RadialMeasurementFactory"], [{ edge, name: name ?? null }]);
    return await this.state();
  }

  async deleteMeasurement(id: number, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (!(state.measurements ?? []).some((measurement) => measurement.id === id)) {
      throw new Error(`Unknown current measurement ID: ${id}`);
    }
    await this.runtime.mutate(`async function (RemoveMeasurementCommand, args) {
      const measurement = this.measurements.lookupByStableId(args.id);
      if (!measurement) throw new Error('Unknown measurement ID: ' + args.id);
      this.selection.selected.removeAll();
      this.selection.selected.addMeasurement(measurement);
      let failure;
      const command = new RemoveMeasurementCommand(this);
      command.remember = false;
      const execute = command.execute.bind(command);
      command.execute = async function () {
        try { return await execute(); }
        catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
      for (const viewport of this.viewports ?? []) viewport.setNeedsRender();
    }`, ["RemoveMeasurementCommand"], [{ id }]);
    return await this.state();
  }

  async inspectRectangularMember(request: MemberRequest): Promise<MemberEvidence> {
    return await inspectRectangularMember(this.runtime, request, this.datumRegistry.sessionId);
  }

  async inspectPlanarSection(request: SectionRequest): Promise<SectionEvidence> {
    return await inspectPlanarSection(this.runtime, request, this.datumRegistry.sessionId);
  }

  async inspectArbitrarySection(request: ArbitrarySectionRequest): Promise<ArbitrarySectionEvidence> {
    return await inspectArbitrarySection(this.runtime, request, this.datumRegistry.sessionId);
  }

  async checkInterference(pairs: BodyInterferencePair[], revision: string): Promise<BodyInterferenceEvidence> {
    return await checkBodyInterference(this.runtime, pairs, revision, this.datumRegistry.sessionId);
  }

  async measureSolidProperties(ids: number[], revision: string): Promise<SolidPropertiesEvidence> {
    return await measureSolidProperties(this.runtime, ids, revision, this.datumRegistry.sessionId);
  }

  async measureFaceProperties(faces: FaceReference[], revision: string): Promise<FacePropertiesEvidence> {
    return await measureFaceProperties(this.runtime, faces, revision, this.datumRegistry.sessionId);
  }

  async inspectSingleFastenerPlate(request: FastenerPlateRequest): Promise<FastenerPlateEvidence> {
    return await inspectSingleFastenerPlate(this.runtime, request, this.datumRegistry.sessionId);
  }

  async inspectIntegralRectangularPlate(request: IntegralPlateRequest): Promise<IntegralPlateEvidence> {
    return await inspectIntegralRectangularPlate(this.runtime, request, this.datumRegistry.sessionId);
  }

  async inspectFastenerGroup(request: FastenerGroupGeometryRequest): Promise<FastenerGroupGeometryEvidence> {
    return await inspectFastenerGroupGeometry(this.runtime, request, this.datumRegistry.sessionId);
  }

  async inspectFastenerGroupLayout(request: FastenerGroupLayoutRequest): Promise<FastenerGroupLayoutEvidence> {
    return await inspectFastenerGroupLayout(this.runtime, request, this.datumRegistry.sessionId);
  }

  async validateBodies(ids: number[], revision: string): Promise<{
    documentToken: string;
    revision: string;
    measurementSource: "native-brep";
    bodies: BodyValidationDescriptor[];
  }> {
    const before = await this.state();
    if (before.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${before.revision}`);
    }
    if (ids.length === 0) throw new Error("At least one body ID is required");
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) throw new Error("Body IDs must be unique");
    const bodies = uniqueIds.map((id) => before.bodies.find((body) => body.id === id));
    const missing = uniqueIds.filter((_id, index) => !bodies[index]);
    if (missing.length > 0) throw new Error(`Unknown body IDs: ${missing.join(", ")}`);

    const nativeChecks = await this.runtime.readNative<Array<{ id: number; nativeCheckCodes: number[] }>>(`function (args) {
      const wanted = new Set(args.ids);
      const result = [];
      for (const [versionId, item] of this.geo.geometryModel) {
        const id = this.db.lookupStableId(versionId);
        if (!wanted.has(id)) continue;
        const model = item.model;
        if (!model || typeof model.Check !== 'function') throw new Error('Native Check is unavailable for body ID: ' + id);
        result.push({ id, nativeCheckCodes: Array.from(model.Check(), Number) });
      }
      return result;
    }`, [], [{ ids: uniqueIds }]);
    const after = await this.state();
    if (after.documentToken !== before.documentToken || after.revision !== before.revision) {
      throw new Error("Plasticity document changed while bodies were being validated");
    }
    const checksById = new Map(nativeChecks.map((entry) => [entry.id, entry.nativeCheckCodes]));
    const unread = uniqueIds.filter((id) => !checksById.has(id));
    if (unread.length > 0) throw new Error(`Native validation did not return body IDs: ${unread.join(", ")}`);

    return {
      documentToken: after.documentToken,
      revision: after.revision,
      measurementSource: "native-brep",
      bodies: bodies.map((body) => {
        const current = body!;
        const nativeCheckCodes = checksById.get(current.id)!;
        const nativeValid = nativeCheckCodes.length === 0;
        // A periodic Solid face may expose its seam edge once through GetFaces(),
        // although the Parasolid body is closed. Trust the native Solid type plus
        // Check() for closure; retain the adjacency heuristic for open Sheets.
        const boundaryEdgeIds = current.type === "Solid"
          ? []
          : current.edges.filter((edge) => edge.faceIds.length === 1).map((edge) => edge.id);
        const closed = current.type === "Solid" ? nativeValid : current.type !== "Wire" && boundaryEdgeIds.length === 0;
        return {
          id: current.id,
          versionId: current.versionId,
          type: current.type,
          name: current.name,
          measurementSource: "native-brep",
          faceCount: current.faces.length,
          edgeCount: current.edges.length,
          boundaryEdgeIds,
          closed,
          nativeCheckCodes,
          nativeValid,
          printableSolid: current.type === "Solid" && closed && nativeValid,
        };
      }),
    };
  }
}

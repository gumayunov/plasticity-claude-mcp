import { type RuntimeState } from "../runtime.ts";
import { countActiveCurveSpans } from "../curve-span-count.ts";
import { type FaceReference } from "../measurements.ts";
import { type CurveFragmentDescriptor, type CurveEndpointDescriptor, type CurveVertexDescriptor, type CurveDirectionDescriptor, type CurveSegmentSampleReference, type CurveSegmentSampleDescriptor, type CurveStructureDescriptor, type SurfaceStructureDescriptor, type CurvePlanarityDescriptor, type CurveControlPointReference, type CurveControlPointDescriptor, type CurveIntersectionDescriptor } from "./types.ts";
import { requireTopologySelection } from "./helpers.ts";
import { OperationsBase } from "./base.ts";

export abstract class CurveQueryOperations extends OperationsBase {
  async listRegions(): Promise<{
    documentToken: string;
    revision: string;
    regions: RuntimeState["regions"];
  }> {
    const state = await this.state();
    return { documentToken: state.documentToken, revision: state.revision, regions: state.regions };
  }

  async listCurveFragments(): Promise<{
    documentToken: string;
    revision: string;
    fragments: CurveFragmentDescriptor[];
  }> {
    const before = await this.state();
    const fragments = await this.runtime.read<CurveFragmentDescriptor[]>(`function () {
      const mm = value => value * 1000;
      const vector = value => [mm(value.x), mm(value.y), mm(value.z)];
      const result = [];
      for (const info of this.fragments.read.modelId2info.values()) {
        const bodyId = this.db.lookupStableId(info.ancestorViewId);
        const fragmentItem = this.geo.geometryModel.get(info.fragmentViewId);
        if (!Number.isInteger(bodyId) || !fragmentItem) continue;
        for (const segment of Array.from(fragmentItem.view?.segments ?? [])) {
          const edge = this.db.lookupTopologyItem(segment);
          const start = edge.GetPointAndTangent(0);
          const midpoint = edge.GetPointAndTangent(0.5);
          const end = edge.GetPointAndTangent(1);
          result.push({
            id: String(segment.versionId),
            bodyId,
            ancestorVersionId: info.ancestorViewId,
            fragmentViewId: info.fragmentViewId,
            entityId: Number(segment.entityId),
            measurementSource: 'native-brep',
            startMm: vector(start.position),
            midpointMm: vector(midpoint.position),
            endMm: vector(end.position),
            lengthMm: mm(edge.FindLength().length),
          });
        }
      }
      return result.sort((left, right) => left.id.localeCompare(right.id));
    }`);
    const after = await this.state();
    if (after.documentToken !== before.documentToken || after.revision !== before.revision) {
      throw new Error("Plasticity document changed while curve fragments were being listed");
    }
    return { documentToken: after.documentToken, revision: after.revision, fragments };
  }

  async listCurveEndpoints(): Promise<{
    documentToken: string;
    revision: string;
    endpoints: CurveEndpointDescriptor[];
  }> {
    const before = await this.state();
    const endpoints = await this.runtime.read<CurveEndpointDescriptor[]>(`function () {
      const mm = value => value * 1000;
      const vector = value => [mm(value.x), mm(value.y), mm(value.z)];
      const result = [];
      for (const [versionId, item] of this.geo.geometryModel) {
        if (item.view?.constructor?.name !== 'Wire') continue;
        const bodyId = this.db.lookupStableId(versionId);
        if (!Number.isInteger(bodyId)) continue;
        for (const vertex of Array.from(item.view.vertices ?? [])) {
          const model = this.db.lookupTopologyItem(vertex);
          if (!model.IsSpur()) continue;
          result.push({
            id: String(vertex.versionId),
            bodyId,
            bodyVersionId: versionId,
            entityId: Number(vertex.entityId),
            measurementSource: 'native-brep',
            positionMm: vector(model.GetPoint()),
          });
        }
      }
      return result.sort((left, right) => left.id.localeCompare(right.id));
    }`);
    const after = await this.state();
    if (after.documentToken !== before.documentToken || after.revision !== before.revision) {
      throw new Error("Plasticity document changed while curve endpoints were being listed");
    }
    return { documentToken: after.documentToken, revision: after.revision, endpoints };
  }

  async listCurveVertices(): Promise<{
    documentToken: string;
    revision: string;
    vertices: CurveVertexDescriptor[];
  }> {
    const before = await this.state();
    const vertices = await this.runtime.readNative<CurveVertexDescriptor[]>(`function () {
      const mm = value => value * 1000;
      const vector = value => [mm(value.x), mm(value.y), mm(value.z)];
      const result = [];
      for (const [versionId, item] of this.geo.geometryModel) {
        if (item.view?.constructor?.name !== 'Wire') continue;
        const bodyId = this.db.lookupStableId(versionId);
        if (!Number.isInteger(bodyId)) continue;
        const bodyEdges = item.model?.GetEdges?.();
        for (const view of Array.from(item.view.vertices ?? [])) {
          const vertex = this.db.lookupTopologyItem(view);
          const vertexId = Number(vertex.Id());
          if (!Number.isInteger(vertexId)) continue;
          const adjacentEdgeEntityIds = [];
          for (let index = 0; index < (bodyEdges?.Size?.() ?? 0); index += 1) {
            const edge = bodyEdges.Get(index);
            const ends = edge.GetVertices();
            if (ends.left?.Id?.() !== vertexId && ends.right?.Id?.() !== vertexId) continue;
            const edgeId = Number(edge.Id());
            if (Number.isInteger(edgeId)) adjacentEdgeEntityIds.push(edgeId);
          }
          adjacentEdgeEntityIds.sort((left, right) => left - right);
          result.push({
            id: bodyId + ':' + vertexId,
            bodyId,
            bodyVersionId: Number(versionId),
            vertexId,
            viewVersionId: String(view.versionId),
            measurementSource: 'native-brep',
            positionMm: vector(vertex.GetPoint()),
            endpoint: Boolean(vertex.IsSpur()),
            adjacentEdgeEntityIds,
          });
        }
      }
      return result.sort((left, right) => left.bodyId - right.bodyId || left.vertexId - right.vertexId);
    }`, [], []);
    const after = await this.state();
    if (after.documentToken !== before.documentToken || after.revision !== before.revision) {
      throw new Error("Plasticity document changed while curve vertices were being listed");
    }
    return { documentToken: after.documentToken, revision: after.revision, vertices };
  }

  async listCurveDirections(): Promise<{
    documentToken: string;
    revision: string;
    curves: CurveDirectionDescriptor[];
  }> {
    const before = await this.state();
    const curves = await this.runtime.readNative<CurveDirectionDescriptor[]>(`function () {
      const mm = value => value * 1000;
      const vector = value => [mm(value.x), mm(value.y), mm(value.z)];
      const direction = value => {
        const length = Math.hypot(value.x, value.y, value.z);
        if (!(length > 0)) throw new Error('Native curve tangent is zero');
        return [value.x / length, value.y / length, value.z / length];
      };
      const result = [];
      for (const [versionId, item] of this.geo.geometryModel) {
        if (item.view?.constructor?.name !== 'Wire') continue;
        const id = this.db.lookupStableId(versionId);
        if (!Number.isInteger(id)) continue;
        const edges = item.model?.GetEdges?.();
        const segments = [];
        for (let index = 0; index < (edges?.Size?.() ?? 0); index += 1) {
          const edge = edges.Get(index);
          const start = edge.GetPointAndTangent(0);
          const end = edge.GetPointAndTangent(1);
          const midpoint = edge.GetPointAndTangent(0.5);
          const nativeCurve = edge.GetCurve();
          const curve = nativeCurve?.curve ?? nativeCurve;
          let circleGeometry = null;
          if (edge.IsCircle()) {
            const info = curve?.GetInfo?.();
            const basis = info?.basis;
            if (basis?.Location && basis?.Axis && basis?.Ref && Number.isFinite(info?.radius) && info.radius > 0) {
              circleGeometry = {
                centerMm: vector(basis.Location),
                radiusMm: mm(info.radius),
                normal: direction(basis.Axis),
                reference: direction(basis.Ref),
                startMm: vector(start.position),
                midpointMm: vector(midpoint.position),
                endMm: vector(end.position),
              };
            }
          }
          segments.push({
            entityId: Number(edge.Id()),
            curveType: curve?.constructor?.name ?? 'Unknown',
            startMm: vector(start.position),
            endMm: vector(end.position),
            startTangent: direction(start.tangent),
            endTangent: direction(end.tangent),
            lengthMm: mm(edge.FindLength().length),
            ...(circleGeometry === null ? {} : { circleGeometry }),
          });
        }
        let closed = true;
        for (const vertex of Array.from(item.view.vertices ?? [])) {
          if (this.db.lookupTopologyItem(vertex).IsSpur()) { closed = false; break; }
        }
        result.push({ id, versionId, measurementSource: 'native-brep', closed, segments });
      }
      return result.sort((left, right) => left.id - right.id);
    }`, [], []);
    const after = await this.state();
    if (after.documentToken !== before.documentToken || after.revision !== before.revision) {
      throw new Error("Plasticity document changed while curve directions were being listed");
    }
    return { documentToken: after.documentToken, revision: after.revision, curves };
  }

  async evaluateCurveSegments(samples: CurveSegmentSampleReference[], revision: string): Promise<{
    documentToken: string;
    revision: string;
    samples: CurveSegmentSampleDescriptor[];
  }> {
    const before = await this.assertRevision(revision);
    if (samples.length === 0) throw new Error("At least one curve segment sample is required");
    const keys = samples.map((sample) => `${sample.bodyId}:${sample.segmentEntityId}:${sample.normalizedParameter}`);
    if (new Set(keys).size !== keys.length) throw new Error("Curve segment samples must be unique");
    for (const sample of samples) {
      if (before.bodies.find((body) => body.id === sample.bodyId)?.type !== "Wire") {
        throw new Error(`Curve segment evaluation requires a current Wire body: ${sample.bodyId}`);
      }
      if (!Number.isInteger(sample.segmentEntityId) || sample.segmentEntityId <= 0) {
        throw new Error("Curve segment entity ID must be a positive integer");
      }
      if (!Number.isFinite(sample.normalizedParameter) || sample.normalizedParameter < 0 || sample.normalizedParameter > 1) {
        throw new Error("Curve segment normalized parameter must be from 0 to 1");
      }
    }
    const evaluated = await this.runtime.readNative<CurveSegmentSampleDescriptor[]>(`function (args) {
      const mm = value => value * 1000;
      const vector = value => [mm(value.x), mm(value.y), mm(value.z)];
      const direction = value => {
        const length = Math.hypot(value.x, value.y, value.z);
        if (!(length > 0)) throw new Error('Native curve tangent is zero');
        return [value.x / length, value.y / length, value.z / length];
      };
      const result = [];
      for (const reference of args.samples) {
        let found;
        for (const [versionId, item] of this.geo.geometryModel) {
          if (this.db.lookupStableId(versionId) === reference.bodyId) { found = [versionId, item]; break; }
        }
        if (!found || found[1].view?.constructor?.name !== 'Wire') throw new Error('Curve segment source is no longer a Wire: ' + reference.bodyId);
        const [versionId, item] = found;
        let edge;
        for (const candidate of Array.from(item.view.segments ?? [])) {
          const model = this.db.lookupTopologyItem(candidate);
          if (Number(model?.Id?.()) === reference.segmentEntityId) { edge = model; break; }
        }
        if (!edge) throw new Error('Stale or unknown curve segment: ' + reference.bodyId + ':' + reference.segmentEntityId);
        const evaluated = edge.GetPointAndTangent(reference.normalizedParameter);
        const wrapped = edge.GetCurve();
        const curve = wrapped?.curve ?? wrapped;
        result.push({
          reference,
          bodyVersionId: Number(versionId),
          curveType: String(curve?.constructor?.name ?? 'Unknown'),
          measurementSource: 'native-brep',
          positionMm: vector(evaluated.position),
          tangent: direction(evaluated.tangent),
        });
      }
      return result;
    }`, [], [{ samples }]);
    const after = await this.state();
    if (after.documentToken !== before.documentToken || after.revision !== before.revision) {
      throw new Error("Plasticity document changed while curve segments were being evaluated");
    }
    return { documentToken: after.documentToken, revision: after.revision, samples: evaluated };
  }

  async inspectCurveStructure(ids: number[], revision: string): Promise<{
    documentToken: string;
    revision: string;
    curves: CurveStructureDescriptor[];
  }> {
    const before = await this.assertRevision(revision);
    if (ids.length === 0) throw new Error("At least one Wire ID is required");
    if (new Set(ids).size !== ids.length) throw new Error("Wire IDs must be unique");
    const selected = ids.map((id) => before.bodies.find((body) => body.id === id));
    const invalid = ids.filter((_id, index) => selected[index]?.type !== "Wire");
    if (invalid.length > 0) throw new Error(`Curve structure requires current Wire bodies: ${invalid.join(", ")}`);
    const curves = await this.runtime.readNative<CurveStructureDescriptor[]>(`function (args) {
      const countActiveCurveSpans = (${countActiveCurveSpans.toString()});
      const mm = value => value * 1000;
      const result = [];
      for (const wantedId of args.ids) {
        let found;
        for (const [versionId, item] of this.geo.geometryModel) {
          if (this.db.lookupStableId(versionId) === wantedId) { found = [versionId, item]; break; }
        }
        if (!found) throw new Error('Unknown current Wire ID: ' + wantedId);
        const [versionId, item] = found;
        if (item.view?.constructor?.name !== 'Wire') throw new Error('Curve structure requires a Wire: ' + wantedId);
        const edges = item.model?.GetEdges?.();
        const segments = [];
        for (let index = 0; index < (edges?.Size?.() ?? 0); index += 1) {
          const edge = edges.Get(index);
          const wrapped = edge.GetCurve();
          const nativeCurve = wrapped?.curve ?? wrapped;
          let info;
          try { info = nativeCurve?.GetInfo?.(); } catch {}
          const curveType = String(nativeCurve?.constructor?.name ?? 'Unknown');
          let circle = null;
          if (curveType === 'Circle' && info?.basis && Number.isFinite(info.radius) && info.radius > 0) {
            const axis = info.basis.Axis;
            const location = info.basis.Location;
            if ([axis?.x, axis?.y, axis?.z, location?.x, location?.y, location?.z].every(Number.isFinite)) {
              const axisLength = Math.hypot(axis.x, axis.y, axis.z);
              if (axisLength > 0) circle = {
                centerMm: [mm(location.x), mm(location.y), mm(location.z)],
                radiusMm: mm(info.radius),
                normal: [axis.x / axisLength, axis.y / axisLength, axis.z / axisLength],
              };
            }
          }
          let knots = null;
          let activeSpanCount = null;
          if (Number.isInteger(info?.numDistinctKnots) && info.numDistinctKnots > 0 && info?.knotVals && info?.knotMults) {
            const values = [];
            for (let knotIndex = 0; knotIndex < info.numDistinctKnots; knotIndex += 1) {
              const nativeParameter = Number(info.knotVals[knotIndex]);
              const multiplicity = Number(info.knotMults[knotIndex]);
              const normalizedParameter = Number(edge.Normalize(nativeParameter));
              if (!Number.isFinite(normalizedParameter) || !Number.isInteger(multiplicity)) { values.length = 0; break; }
              values.push({
                normalizedParameter,
                multiplicity,
                withinSegment: normalizedParameter >= -1e-12 && normalizedParameter <= 1 + 1e-12,
              });
            }
            if (values.length === info.numDistinctKnots) {
              knots = values;
              activeSpanCount = countActiveCurveSpans(values.filter(value => value.withinSegment).map(value => value.normalizedParameter));
            }
          }
          segments.push({
            entityId: Number(edge.Id()),
            curveType,
            lengthMm: mm(edge.FindLength().length),
            degree: Number.isInteger(info?.degree) ? Number(info.degree) : null,
            controlPointCount: Number.isInteger(info?.numVerts) ? Number(info.numVerts) : null,
            spanCount: Number.isInteger(info?.numSpans) ? Number(info.numSpans) : null,
            activeSpanCount,
            distinctKnotCount: Number.isInteger(info?.numDistinctKnots) ? Number(info.numDistinctKnots) : null,
            knots,
            rational: typeof info?.isRational === 'boolean' ? info.isRational : null,
            periodic: typeof info?.isPeriodic === 'boolean' ? info.isPeriodic : null,
            circle,
          });
        }
        result.push({ id: wantedId, versionId: Number(versionId), measurementSource: 'native-brep', segments });
      }
      return result;
    }`, [], [{ ids }]);
    const after = await this.state();
    if (after.documentToken !== before.documentToken || after.revision !== before.revision) {
      throw new Error("Plasticity document changed while curve structure was being inspected");
    }
    return { documentToken: after.documentToken, revision: after.revision, curves };
  }

  async inspectSurfaceStructure(faces: FaceReference[], revision: string): Promise<{
    documentToken: string;
    revision: string;
    surfaces: SurfaceStructureDescriptor[];
  }> {
    const before = await this.assertRevision(revision);
    requireTopologySelection(before, faces, "face");
    const invalidBodies = [...new Set(faces.map((reference) => reference.bodyId))].filter((bodyId) => {
      const type = before.bodies.find((body) => body.id === bodyId)?.type;
      return type !== "Solid" && type !== "Sheet";
    });
    if (invalidBodies.length > 0) throw new Error(`Surface structure requires current Solid or Sheet bodies: ${invalidBodies.join(", ")}`);
    const surfaces = await this.runtime.readNative<SurfaceStructureDescriptor[]>(`function (args) {
      const finiteBounds = value => value && ['uMin', 'uMax', 'vMin', 'vMax'].every(key => Number.isFinite(value[key]))
        ? { uMin: Number(value.uMin), uMax: Number(value.uMax), vMin: Number(value.vMin), vMax: Number(value.vMax) }
        : null;
      const result = [];
      for (const reference of args.faces) {
        let found;
        for (const [versionId, item] of this.geo.geometryModel) {
          if (this.db.lookupStableId(versionId) === reference.bodyId) { found = [versionId, item]; break; }
        }
        if (!found) throw new Error('Unknown current surface body ID: ' + reference.bodyId);
        const [versionId, item] = found;
        const faceViews = item.view?.high?.faces;
        const viewIndex = faceViews?.versionIds?.indexOf(reference.faceId) ?? -1;
        if (viewIndex < 0) throw new Error('Unknown current surface face: ' + reference.bodyId + ':' + reference.faceId);
        const faceView = faceViews.get(viewIndex);
        const nativeFaces = item.model?.GetFaces?.();
        let face;
        for (let index = 0; index < (nativeFaces?.Size?.() ?? 0); index += 1) {
          const candidate = nativeFaces.Get(index);
          if (candidate.Id() === faceView.entityId) { face = candidate; break; }
        }
        if (!face) throw new Error('Native surface face is unavailable: ' + reference.bodyId + ':' + reference.faceId);
        const carrier = face.GetSurface();
        const surface = carrier?.surface;
        if (!surface) throw new Error('Native carrier surface is unavailable: ' + reference.bodyId + ':' + reference.faceId);
        const faceBounds = finiteBounds(carrier);
        if (!faceBounds) throw new Error('Native face parameter bounds are unavailable: ' + reference.bodyId + ':' + reference.faceId);
        let info;
        try { info = surface.GetInfo(); } catch {}
        let naturalBounds;
        try { naturalBounds = finiteBounds(surface.GetUVBox()); } catch { naturalBounds = null; }
        const bSpline = surface.constructor?.name === 'BSurf' &&
          ['uDegree', 'vDegree', 'uSpans', 'vSpans', 'uVertices', 'vVertices'].every(key => Number.isInteger(info?.[key]))
          ? {
              uDegree: Number(info.uDegree), vDegree: Number(info.vDegree),
              uSpanCount: Number(info.uSpans), vSpanCount: Number(info.vSpans),
              uControlPointCount: Number(info.uVertices), vControlPointCount: Number(info.vVertices),
              rational: Boolean(info.isRational),
            }
          : null;
        result.push({
          bodyId: reference.bodyId,
          faceId: reference.faceId,
          bodyVersionId: Number(versionId),
          measurementSource: 'native-brep',
          surfaceType: String(surface.constructor?.name ?? 'Unknown'),
          trimmed: !face.IsUntrimmed(),
          faceParameterBounds: faceBounds,
          naturalParameterBounds: naturalBounds,
          bSpline,
        });
      }
      return result;
    }`, [], [{ faces }]);
    const after = await this.state();
    if (after.documentToken !== before.documentToken || after.revision !== before.revision) {
      throw new Error("Plasticity document changed while surface structure was being inspected");
    }
    return { documentToken: after.documentToken, revision: after.revision, surfaces };
  }

  async inspectCurvePlanarity(ids: number[], revision: string): Promise<{
    documentToken: string;
    revision: string;
    curves: CurvePlanarityDescriptor[];
  }> {
    const before = await this.assertRevision(revision);
    if (ids.length === 0) throw new Error("At least one Wire ID is required");
    if (new Set(ids).size !== ids.length) throw new Error("Wire IDs must be unique");
    const invalid = ids.filter((id) => before.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalid.length > 0) throw new Error(`Curve planarity requires current Wire bodies: ${invalid.join(", ")}`);
    const curves = await this.runtime.readNative<CurvePlanarityDescriptor[]>(`function (args) {
      const mm = value => value * 1000;
      const vector = value => [mm(value.x), mm(value.y), mm(value.z)];
      const direction = value => [value.x, value.y, value.z];
      const result = [];
      for (const wantedId of args.ids) {
        let found;
        for (const [versionId, item] of this.geo.geometryModel) {
          if (this.db.lookupStableId(versionId) === wantedId) { found = [versionId, item]; break; }
        }
        if (!found) throw new Error('Unknown current Wire ID: ' + wantedId);
        const [versionId, item] = found;
        if (item.view?.constructor?.name !== 'Wire') throw new Error('Curve planarity requires a Wire: ' + wantedId);
        const basis = item.model?.FindPlanarBasis?.();
        result.push({
          id: wantedId,
          versionId: Number(versionId),
          measurementSource: 'native-brep',
          planar: Boolean(basis),
          plane: basis ? { originMm: vector(basis.Location), normal: direction(basis.Axis) } : null,
        });
      }
      return result;
    }`, [], [{ ids }]);
    const after = await this.state();
    if (after.documentToken !== before.documentToken || after.revision !== before.revision) {
      throw new Error("Plasticity document changed while curve planarity was being inspected");
    }
    return { documentToken: after.documentToken, revision: after.revision, curves };
  }

  async listCurveControlPoints(ids: number[], revision: string): Promise<{
    documentToken: string;
    revision: string;
    curves: CurveControlPointDescriptor[];
  }> {
    const before = await this.assertRevision(revision);
    if (ids.length === 0) throw new Error("At least one Wire ID is required");
    if (new Set(ids).size !== ids.length) throw new Error("Wire IDs must be unique");
    const invalid = ids.filter((id) => before.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalid.length > 0) throw new Error(`Curve control points require current Wire bodies: ${invalid.join(", ")}`);
    const curves = await this.runtime.readNative<CurveControlPointDescriptor[]>(`function (SlideFactory, args) {
      const mm = value => value * 1000;
      const position = value => [mm(value.x), mm(value.y), mm(value.z)];
      const direction = value => [value.x, value.y, value.z];
      const slideDirections = (view, kind) => {
        try {
          const factory = new SlideFactory(this);
          if (kind === 'vertex') factory.vertices = [view];
          else factory.cvs = [view];
          const positiveU = direction(factory.orientation.posU);
          const negativeU = direction(factory.orientation.negU);
          if (![...positiveU, ...negativeU].every(Number.isFinite)) return null;
          if (Math.hypot(...positiveU) < 1e-12 || Math.hypot(...negativeU) < 1e-12) return null;
          return { positiveU, negativeU };
        } catch { return null; }
      };
      const result = [];
      let totalApproximationPoints = 0;
      for (const wantedId of args.ids) {
        let found;
        for (const [versionId, item] of this.geo.geometryModel) {
          if (this.db.lookupStableId(versionId) === wantedId) { found = [versionId, item]; break; }
        }
        if (!found) throw new Error('Unknown current Wire ID: ' + wantedId);
        const [versionId, item] = found;
        if (item.view?.constructor?.name !== 'Wire') throw new Error('Curve control points require a Wire: ' + wantedId);
        const boundaryVertices = Array.from(item.view.vertices ?? []).map(vertex => ({
          reference: { bodyId: wantedId, kind: 'vertex', pointId: Number(vertex.id) },
          versionId: String(vertex.versionId),
          positionMm: position(vertex.position),
          slideDirections: slideDirections(vertex, 'vertex'),
        }));
        const interiorControlPoints = Array.from(item.view.cvs ?? []).map(controlPoint => ({
          reference: { bodyId: wantedId, kind: 'control-point', pointId: Number(controlPoint.id) },
          versionId: String(controlPoint.versionId),
          positionMm: position(controlPoint.position),
          slideDirections: slideDirections(controlPoint, 'control-point'),
        }));
        result.push({
          id: wantedId,
          versionId: Number(versionId),
          positionSource: 'native-control-handle',
          boundaryVertices,
          interiorControlPoints,
        });
      }
      return result;
    }`, ["MultiSlideControlPointFactory"], [{ ids }]);
    const after = await this.state();
    if (after.documentToken !== before.documentToken || after.revision !== before.revision) {
      throw new Error("Plasticity document changed while curve control points were being listed");
    }
    return { documentToken: after.documentToken, revision: after.revision, curves };
  }

  async listCurveIntersections(): Promise<{
    documentToken: string;
    revision: string;
    intersections: CurveIntersectionDescriptor[];
  }> {
    const before = await this.state();
    const intersections = await this.runtime.read<CurveIntersectionDescriptor[]>(`function () {
      const mm = value => value * 1000;
      const result = new Map();
      for (const cross of this.crosses.crosses) {
        const sides = [cross.on1, cross.on2].map(on => {
          const versionId = Number(on.versionId);
          const item = this.geo.geometryModel.get(versionId);
          const bodyId = this.db.lookupStableId(versionId);
          if (!item || item.view?.constructor?.name !== 'Wire' || !Number.isInteger(bodyId)) return null;
          return { bodyId, versionId, edgeEntityId: Number(on.edgeId), parameter: Number(on.t) };
        });
        if (sides.some(side => side === null)) continue;
        sides.sort((left, right) => left.versionId - right.versionId || left.edgeEntityId - right.edgeEntityId || left.parameter - right.parameter);
        const [first, second] = sides;
        const id = first.versionId + ':' + first.edgeEntityId + '@' + first.parameter + '|' + second.versionId + ':' + second.edgeEntityId + '@' + second.parameter;
        result.set(id, {
          id,
          bodyIds: [first.bodyId, second.bodyId],
          bodyVersionIds: [first.versionId, second.versionId],
          edgeEntityIds: [first.edgeEntityId, second.edgeEntityId],
          measurementSource: 'native-brep',
          positionMm: [mm(cross.position.x), mm(cross.position.y), mm(cross.position.z)],
        });
      }
      return Array.from(result.values()).sort((left, right) => left.id.localeCompare(right.id));
    }`);
    const after = await this.state();
    if (after.documentToken !== before.documentToken || after.revision !== before.revision) {
      throw new Error("Plasticity document changed while curve intersections were being listed");
    }
    return { documentToken: after.documentToken, revision: after.revision, intersections };
  }

  async assertCurveControlPointReferences(points: CurveControlPointReference[], revision: string): Promise<{
    documentToken: string;
    revision: string;
    curves: CurveControlPointDescriptor[];
  }> {
    await this.assertRevision(revision);
    if (points.length === 0) throw new Error("At least one curve control point is required");
    const keys = points.map((point) => `${point.bodyId}:${point.kind}:${point.pointId}`);
    if (new Set(keys).size !== keys.length) throw new Error("Curve control point references must be unique");
    const bodyIds = [...new Set(points.map((point) => point.bodyId))];
    const inventory = await this.listCurveControlPoints(bodyIds, revision);
    const available = new Set(inventory.curves.flatMap((curve) => [
      ...curve.boundaryVertices.map((point) => `${curve.id}:vertex:${point.reference.pointId}`),
      ...curve.interiorControlPoints.map((point) => `${curve.id}:control-point:${point.reference.pointId}`),
    ]));
    const missing = keys.filter((key) => !available.has(key));
    if (missing.length > 0) throw new Error(`Unknown current curve control point references: ${missing.join(", ")}`);
    return inventory;
  }
}

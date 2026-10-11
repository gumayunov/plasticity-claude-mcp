import { type RuntimeState } from "../runtime.ts";
import { normalize } from "../construction.ts";
import { type ReferenceIdentity } from "../references.ts";
import { millimetersToMeters } from "../units.ts";
import { type FaceReference } from "../measurements.ts";
import { type Vector3, type CurveSegmentReference, type RebuildCurveOptions, type VertexReference } from "./types.ts";
import { findView, commandStart, commandEnd } from "./native-snippets.ts";
import { toMeters, requireTopologySelection } from "./helpers.ts";
import { OperationsBase } from "./base.ts";
import type { ConstructionOperations } from "./construction.ts";
import type { CurveQueryOperations } from "./curve-query.ts";

export abstract class CurveEditOperations extends OperationsBase {
  declare listCurveVertices: CurveQueryOperations["listCurveVertices"];
  declare syncConstructionState: ConstructionOperations["syncConstructionState"];
  async offsetPlanarCurves(ids: number[], distanceMm: number, revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    if (!Number.isFinite(distanceMm) || distanceMm === 0) throw new Error("Planar curve offset distance must be nonzero");
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) throw new Error("At least one Wire ID is required");
    if (uniqueIds.length !== ids.length) throw new Error("Wire IDs must be unique");
    await this.runtime.mutate(`async function (Factory, args) {
      const findWire = id => {
        for (const [versionId, item] of this.geo.geometryModel) {
          if (this.db.lookupStableId(versionId) !== id) continue;
          if (item.view?.constructor?.name !== 'Wire') throw new Error('Planar curve offset requires Wire bodies');
          return item.view;
        }
        throw new Error('Unknown Wire ID: ' + id);
      };
      ${commandStart("OffsetPlanarCurveCommand")}
      factory.curves = args.ids.map(findWire);
      factory.distance1 = args.distance;
      ${commandEnd}
    }`, ["OffsetPlanarCurvesFactory"], [{ ids: uniqueIds, distance: millimetersToMeters(distanceMm) }]);
    return await this.state();
  }

  async offsetRegions(regionIds: string[], offsetsMm: number[], individual: boolean, revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (regionIds.length === 0) throw new Error("At least one Region ID is required");
    const uniqueRegionIds = [...new Set(regionIds)];
    if (uniqueRegionIds.length !== regionIds.length) throw new Error("Region IDs must be unique");
    if (offsetsMm.length < 1 || offsetsMm.length > 2) throw new Error("Region offset requires one or two distances");
    if (offsetsMm.some((value) => !Number.isFinite(value) || value === 0)) throw new Error("Region offset distances must be finite and nonzero");
    if (new Set(offsetsMm).size !== offsetsMm.length) throw new Error("Region offset distances must be unique");
    const selected = uniqueRegionIds.map((id) => state.regions.find((region) => region.id === id));
    const missing = uniqueRegionIds.filter((_id, index) => !selected[index]);
    if (missing.length > 0) throw new Error(`Stale or unknown regions: ${missing.join(", ")}`);
    const islandVersionIds = new Set(selected.map((region) => region!.islandVersionId));
    if (islandVersionIds.size !== 1) throw new Error("Region offsets must belong to the same sketch island");
    const islandVersionId = selected[0]!.islandVersionId;
    await this.runtime.mutate(`async function (Factory, args) {
      ${commandStart("OffsetRegionCommand")}
      const island = editor.geo.geometryModel.get(args.islandVersionId);
      if (!island || island.view?.constructor?.name !== 'SketchIsland') throw new Error('Stale or unknown Region sketch');
      const wanted = new Set(args.regionIds);
      const regions = [];
      for (let index = 0; index < (island.view.regions?.length ?? 0); index += 1) {
        const region = island.view.regions.get(index);
        if (region && wanted.has(String(region.versionId))) regions.push(region);
      }
      const found = new Set(regions.map(region => String(region.versionId)));
      const missing = args.regionIds.filter(id => !found.has(id));
      if (missing.length > 0) throw new Error('Stale or unknown regions: ' + missing.join(', '));
      factory.sketch = island.view;
      factory.regions = regions;
      factory.distance1 = args.distance1;
      factory.distance2 = args.distance2;
      factory.isIndividual = args.individual;
      ${commandEnd}
    }`, ["OffsetRegionFactory"], [{
      regionIds: uniqueRegionIds,
      islandVersionId,
      distance1: millimetersToMeters(offsetsMm[0]!),
      distance2: offsetsMm[1] === undefined ? 0 : millimetersToMeters(offsetsMm[1]),
      individual,
    }]);
    return await this.state();
  }

  async trimCurveFragments(fragmentIds: string[], revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    if (fragmentIds.length === 0) throw new Error("At least one curve fragment ID is required");
    const uniqueIds = [...new Set(fragmentIds)];
    if (uniqueIds.length !== fragmentIds.length) throw new Error("Curve fragment IDs must be unique");
    await this.runtime.mutate(`async function (Factory, args) {
      ${commandStart("TrimCommand")}
      const wanted = new Set(args.fragmentIds);
      const selected = [];
      for (const info of editor.fragments.read.modelId2info.values()) {
        const fragmentItem = editor.geo.geometryModel.get(info.fragmentViewId);
        if (!fragmentItem) continue;
        for (const segment of Array.from(fragmentItem.view?.segments ?? [])) {
          if (wanted.has(String(segment.versionId))) selected.push(segment);
        }
      }
      const found = new Set(selected.map(segment => String(segment.versionId)));
      const missing = args.fragmentIds.filter(id => !found.has(id));
      if (missing.length > 0) throw new Error('Stale or unknown curve fragments: ' + missing.join(', '));
      factory.segments = selected;
      ${commandEnd}
    }`, ["TrimFactory"], [{ fragmentIds: uniqueIds }]);
    return await this.state();
  }

  async extendCurveEndpoints(endpointIds: string[], distanceMm: number, revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    if (!Number.isFinite(distanceMm) || distanceMm <= 0) throw new Error("Curve extension distance must be positive");
    if (endpointIds.length === 0) throw new Error("At least one curve endpoint ID is required");
    const uniqueIds = [...new Set(endpointIds)];
    if (uniqueIds.length !== endpointIds.length) throw new Error("Curve endpoint IDs must be unique");
    await this.runtime.mutate(`async function (Factory, args) {
      ${commandStart("ExtendCurveCommand")}
      const wanted = new Set(args.endpointIds);
      const selected = [];
      for (const [, item] of editor.geo.geometryModel) {
        if (item.view?.constructor?.name !== 'Wire') continue;
        for (const vertex of Array.from(item.view.vertices ?? [])) {
          if (!wanted.has(String(vertex.versionId))) continue;
          const model = editor.db.lookupTopologyItem(vertex);
          if (!model.IsSpur()) throw new Error('Curve extension requires open Wire endpoints');
          selected.push(vertex);
        }
      }
      const found = new Set(selected.map(vertex => String(vertex.versionId)));
      const missing = args.endpointIds.filter(id => !found.has(id));
      if (missing.length > 0) throw new Error('Stale or unknown curve endpoints: ' + missing.join(', '));
      factory.vertices = selected;
      factory.distance = args.distance;
      ${commandEnd}
    }`, ["MultiExtendVertexFactory"], [{ endpointIds: uniqueIds, distance: millimetersToMeters(distanceMm) }]);
    return await this.state();
  }

  async filletCurveVertices(vertices: VertexReference[], radiusMm: number, revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    if (!Number.isFinite(radiusMm) || radiusMm <= 0) throw new Error("Curve fillet radius must be positive");
    if (vertices.length === 0) throw new Error("At least one curve vertex is required");
    const keys = vertices.map(({ bodyId, vertexId }) => `${bodyId}:${vertexId}`);
    if (new Set(keys).size !== keys.length) throw new Error("Curve vertex references must be unique");
    const listed = await this.listCurveVertices();
    if (listed.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${listed.revision}`);
    }
    const byKey = new Map(listed.vertices.map((vertex) => [vertex.id, vertex]));
    const missing = keys.filter((key) => !byKey.has(key));
    if (missing.length > 0) throw new Error(`Stale or unknown curve vertices: ${missing.join(", ")}`);
    const endpoints = keys.filter((key) => byKey.get(key)?.endpoint);
    if (endpoints.length > 0) throw new Error(`Curve fillet requires interior or closed Wire vertices: ${endpoints.join(", ")}`);
    const invalidDegree = keys.filter((key) => byKey.get(key)?.adjacentEdgeEntityIds.length !== 2);
    if (invalidDegree.length > 0) throw new Error(`Curve fillet requires exactly two adjacent segments at every vertex: ${invalidDegree.join(", ")}`);
    await this.runtime.mutate(`async function (Factory, args) {
      const host = this;
      const wanted = new Set(args.vertices.map(reference => reference.bodyId + ':' + reference.vertexId));
      const selected = [];
      const found = new Set();
      for (const [versionId, item] of host.geo.geometryModel) {
        if (item.view?.constructor?.name !== 'Wire') continue;
        const bodyId = host.db.lookupStableId(versionId);
        if (!Number.isInteger(bodyId)) continue;
        for (const view of Array.from(item.view.vertices ?? [])) {
          const vertex = host.db.lookupTopologyItem(view);
          const key = bodyId + ':' + vertex.Id();
          if (!wanted.has(key)) continue;
          selected.push(view);
          found.add(key);
        }
      }
      const missing = Array.from(wanted).filter(key => !found.has(key));
      if (missing.length > 0) throw new Error('Stale or unknown curve vertices: ' + missing.join(', '));
      ${commandStart("FilletVertexCommand")}
      factory.vertices = selected;
      factory.radius = args.radius;
      ${commandEnd}
    }`, ["FilletVertexFactory"], [{ vertices, radius: millimetersToMeters(radiusMm) }]);
    return await this.state();
  }

  async unjoinCurves(ids: number[], revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (ids.length === 0) throw new Error("At least one Wire ID is required");
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) throw new Error("Wire IDs must be unique");
    const invalid = uniqueIds.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalid.length > 0) throw new Error(`Curve unjoin requires current Wire bodies: ${invalid.join(", ")}`);
    await this.runtime.mutate(`async function (Command, Factory, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.curves = args.ids.map(find);
          return await factory.commit();
        } catch (error) {
          failure = error;
          throw error;
        }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["UnjoinCurvesCommand", "UnjoinCurvesFactory"], [{ ids: uniqueIds }]);
    return await this.state();
  }

  async duplicateCurves(ids: number[], revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (ids.length === 0) throw new Error("At least one Wire ID is required");
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) throw new Error("Wire IDs must be unique");
    const invalid = uniqueIds.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalid.length > 0) throw new Error(`Curve duplication requires current Wire bodies: ${invalid.join(", ")}`);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new this.commands.DuplicateCommand(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.curves = args.ids.map(find);
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["CurveDuplicateFactory"], [{ ids: uniqueIds }]);
    return await this.state();
  }

  async createCurvesFromRegions(regionIds: string[], revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (regionIds.length === 0) throw new Error("At least one Region ID is required");
    const uniqueIds = [...new Set(regionIds)];
    if (uniqueIds.length !== regionIds.length) throw new Error("Region IDs must be unique");
    const current = new Set(state.regions.map((region) => region.id));
    const missing = uniqueIds.filter((id) => !current.has(id));
    if (missing.length > 0) throw new Error(`Stale or unknown Region IDs: ${missing.join(", ")}`);
    await this.runtime.mutate(`async function (Factory, args) {
      const wanted = new Set(args.regionIds);
      const regions = [];
      for (const [, item] of this.geo.geometryModel) {
        if (item.view?.constructor?.name !== 'SketchIsland') continue;
        for (let index = 0; index < (item.view.regions?.length ?? 0); index += 1) {
          const region = item.view.regions.get(index);
          if (region && wanted.has(String(region.versionId))) regions.push(region);
        }
      }
      const found = new Set(regions.map(region => String(region.versionId)));
      const missing = args.regionIds.filter(id => !found.has(id));
      if (missing.length > 0) throw new Error('Stale or unknown Regions: ' + missing.join(', '));
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new this.commands.DuplicateCommand(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.regions = regions;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["CreateCurvesFromRegionsFactory"], [{ regionIds: uniqueIds }]);
    return await this.state();
  }

  async joinCurves(ids: number[], revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (ids.length < 2) throw new Error("At least two Wire IDs are required");
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) throw new Error("Wire IDs must be unique");
    const invalid = uniqueIds.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalid.length > 0) throw new Error(`Curve join requires current Wire bodies: ${invalid.join(", ")}`);
    await this.runtime.mutate(`async function (Command, Factory, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.curves = args.ids.map(find);
          return await factory.commit();
        } catch (error) {
          failure = error;
          throw error;
        }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["JoinCurvesCommand", "JoinCurvesFactory"], [{ ids: uniqueIds }]);
    return await this.state();
  }

  async rebuildCurves(ids: number[], options: RebuildCurveOptions, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (ids.length === 0) throw new Error("At least one Wire ID is required");
    if (new Set(ids).size !== ids.length) throw new Error("Wire IDs must be unique");
    const invalid = ids.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalid.length > 0) throw new Error(`Curve rebuild requires current Wire bodies: ${invalid.join(", ")}`);
    const preserveParameterization = options.preserveParameterization ?? false;
    const preserveChain = options.preserveChain ?? true;
    const keepCorners = options.keepCorners ?? true;
    let method: 0 | 1 | 2;
    let parameters: { tolerance?: number; pointCount?: number; degree?: number; spans?: number };
    switch (options.method) {
      case "tolerance":
        if (!Number.isFinite(options.toleranceMm) || options.toleranceMm <= 0) throw new Error("Curve rebuild tolerance must be positive");
        method = 0;
        parameters = { tolerance: millimetersToMeters(options.toleranceMm) };
        break;
      case "control-points":
        if (!Number.isInteger(options.pointCount) || options.pointCount < 4 || options.pointCount > 10_000) {
          throw new Error("Curve rebuild control-point count must be an integer from 4 to 10000");
        }
        method = 1;
        parameters = { pointCount: options.pointCount };
        break;
      case "degree-spans":
        if (!Number.isInteger(options.degree) || options.degree < 1 || options.degree > 15) {
          throw new Error("Curve rebuild degree must be an integer from 1 to 15");
        }
        if (!Number.isInteger(options.spans) || options.spans < 1 || options.spans > 10_000 || options.degree + options.spans > 10_000) {
          throw new Error("Curve rebuild spans must produce from 2 to 10000 control points with the selected degree");
        }
        method = 2;
        parameters = { degree: options.degree, spans: options.spans };
        break;
      default:
        throw new Error(`Unsupported curve rebuild method: ${String((options as { method?: unknown }).method)}`);
    }
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("RebuildCurveCommand")}
      factory.curves = args.ids.map(find);
      factory.method = args.method;
      factory.preserveParameterization = args.preserveParameterization;
      factory.preserveChain = args.preserveChain;
      factory.keepCorners = args.keepCorners;
      if (args.method === 0) factory.tolerance = args.parameters.tolerance;
      else if (args.method === 1) factory.pointCount = args.parameters.pointCount;
      else {
        factory.degree = args.parameters.degree;
        factory.spans = args.parameters.spans;
      }
      ${commandEnd}
    }`, ["RebuildCurveFactory"], [{
      ids,
      method,
      parameters,
      preserveParameterization,
      preserveChain,
      keepCorners,
    }]);
    return await this.state();
  }

  async raiseCurveDegree(ids: number[], revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (ids.length === 0) throw new Error("At least one Wire ID is required");
    if (new Set(ids).size !== ids.length) throw new Error("Wire IDs must be unique");
    const invalid = ids.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalid.length > 0) throw new Error(`Curve degree elevation requires current Wire bodies: ${invalid.join(", ")}`);
    await this.runtime.mutate(`async function (Factory, Command, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.curves = args.ids.map(find);
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["RaiseDegreeCurveFactory", "RaiseDegreeCurveCommand"], [{ ids }]);
    return await this.state();
  }

  async subdivideCurves(ids: number[], revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (ids.length === 0) throw new Error("At least one Wire ID is required");
    if (new Set(ids).size !== ids.length) throw new Error("Wire IDs must be unique");
    const invalid = ids.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalid.length > 0) throw new Error(`Curve subdivision requires current Wire bodies: ${invalid.join(", ")}`);
    await this.runtime.mutate(`async function (Factory, Command, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.curves = args.ids.map(find);
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["SubdivideCurveFactory", "SubdivideCurveCommand"], [{ ids }]);
    return await this.state();
  }

  async insertCurveKnot(
    reference: CurveSegmentReference,
    normalizedParameter: number,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (state.bodies.find((body) => body.id === reference.bodyId)?.type !== "Wire") {
      throw new Error(`Curve knot insertion requires a current Wire body: ${reference.bodyId}`);
    }
    if (!Number.isInteger(reference.segmentEntityId) || reference.segmentEntityId <= 0) {
      throw new Error("Curve knot segment entity ID must be a positive integer");
    }
    if (!Number.isFinite(normalizedParameter) || normalizedParameter <= 0 || normalizedParameter >= 1) {
      throw new Error("Curve knot normalized parameter must be greater than 0 and less than 1");
    }
    await this.runtime.mutate(`async function (Factory, Command, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const wire = find(args.reference.bodyId);
      if (wire?.constructor?.name !== 'Wire') throw new Error('Curve knot source is no longer a Wire');
      let segment;
      let edge;
      for (const candidate of Array.from(wire.segments ?? [])) {
        const model = editor.db.lookupTopologyItem(candidate);
        if (Number(model?.Id?.()) !== args.reference.segmentEntityId) continue;
        segment = candidate;
        edge = model;
        break;
      }
      if (!segment || !edge) throw new Error('Stale or unknown curve segment: ' + args.reference.bodyId + ':' + args.reference.segmentEntityId);
      const wrapped = edge.GetCurve();
      const curve = wrapped?.curve ?? wrapped;
      if (curve?.constructor?.name !== 'BCurve') throw new Error('Curve knot insertion requires a native B-Spline segment');
      const nativeParameter = edge.Denormalize(args.normalizedParameter);
      if (!Number.isFinite(nativeParameter)) throw new Error('Native curve parameter is unavailable');

      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.segment = segment;
          const model = factory._segment?.model;
          if (!model) throw new Error('Insert Knot model bridge is unavailable in this Plasticity version');
          // InsertKnotFactory's public segment setter does not populate its private UI parameter.
          // Keep the native factory transaction, database replacement, and history behavior while
          // supplying the explicit normalized MCP parameter to the same kernel Edge::InsertKnot call.
          factory._segment.model = new Proxy(model, {
            get(target, key) {
              if (key === 'InsertKnot') return () => target.InsertKnot(nativeParameter);
              const value = Reflect.get(target, key, target);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["InsertKnotFactory", "InsertKnotCommand"], [{ reference, normalizedParameter }]);
    return await this.state();
  }

  async splitCurveSegment(
    reference: CurveSegmentReference,
    normalizedParameter: number,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (state.bodies.find((body) => body.id === reference.bodyId)?.type !== "Wire") {
      throw new Error(`Curve segment split requires a current Wire body: ${reference.bodyId}`);
    }
    if (!Number.isInteger(reference.segmentEntityId) || reference.segmentEntityId <= 0) {
      throw new Error("Curve split segment entity ID must be a positive integer");
    }
    if (!Number.isFinite(normalizedParameter) || normalizedParameter <= 0 || normalizedParameter >= 1) {
      throw new Error("Curve split normalized parameter must be greater than 0 and less than 1");
    }
    await this.runtime.mutate(`async function (Factory, Command, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const wire = find(args.reference.bodyId);
      if (wire?.constructor?.name !== 'Wire') throw new Error('Curve split source is no longer a Wire');
      let segment;
      let edge;
      for (const candidate of Array.from(wire.segments ?? [])) {
        const model = editor.db.lookupTopologyItem(candidate);
        if (Number(model?.Id?.()) !== args.reference.segmentEntityId) continue;
        segment = candidate;
        edge = model;
        break;
      }
      if (!segment || !edge) throw new Error('Stale or unknown curve segment: ' + args.reference.bodyId + ':' + args.reference.segmentEntityId);
      if (edge.IsPeriodic()) throw new Error('Periodic closed curve segments cannot be split at only one point');

      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.segment = segment;
          const model = factory._segment?.model;
          if (!model) throw new Error('Split Segment model bridge is unavailable in this Plasticity version');
          // SplitSegmentFactory receives the split parameter only from its private UI command.
          // Preserve the native commit/database/history path and supply the explicit MCP value
          // to the same normalized Edge::SplitAt call used by that factory.
          factory._segment.model = new Proxy(model, {
            get(target, key) {
              if (key === 'SplitAt') return () => target.SplitAt(args.normalizedParameter);
              const value = Reflect.get(target, key, target);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["SplitSegmentFactory", "SplitSegmentCommand"], [{ reference, normalizedParameter }]);
    return await this.state();
  }

  async planarizeCurves(ids: number[], originMm: Vector3, normal: Vector3, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (ids.length === 0) throw new Error("At least one Wire ID is required");
    if (new Set(ids).size !== ids.length) throw new Error("Wire IDs must be unique");
    const invalid = ids.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalid.length > 0) throw new Error(`Curve planarization requires current Wire bodies: ${invalid.join(", ")}`);
    const unitNormal = normalize(normal);
    await this.runtime.mutate(`async function (Factory, Command, Vector, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.curves = args.ids.map(find);
          factory.origin.copy(new Vector(...args.origin));
          factory.normal.copy(new Vector(...args.normal));
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["PlanarizeCurveFactory", "DeformCurveCommand", "Vector3"], [{ ids, origin: toMeters(originMm), normal: unitNormal }]);
    return await this.state();
  }

  async reverseCurves(ids: number[], revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (ids.length === 0) throw new Error("At least one Wire ID is required");
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) throw new Error("Wire IDs must be unique");
    const invalid = uniqueIds.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalid.length > 0) throw new Error(`Curve reversal requires current Wire bodies: ${invalid.join(", ")}`);
    await this.runtime.mutate(`async function (Command, Factory, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.curves = args.ids.map(find);
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["ReverseCurveCommand", "ReverseCurveFactory"], [{ ids: uniqueIds }]);
    return await this.state();
  }

  async createBodyOutlines(
    ids: number[],
    planeIdentity: ReferenceIdentity,
    placement: "source" | "workplane",
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.syncConstructionState(revision);
    if (ids.length === 0) throw new Error("At least one Solid or Sheet is required for body outlines");
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) throw new Error("Body outline IDs must be unique");
    if (placement !== "source" && placement !== "workplane") {
      throw new Error(`Unsupported body outline placement: ${String(placement)}`);
    }
    const invalid = uniqueIds.filter((id) => {
      const type = state.bodies.find((body) => body.id === id)?.type;
      return type !== "Solid" && type !== "Sheet";
    });
    if (invalid.length > 0) throw new Error(`Body outlines require current Solid or Sheet bodies: ${invalid.join(", ")}`);
    const plane = this.datumRegistry.requireCurrentPlane(planeIdentity, state.documentToken, state.revision);
    const factoryBinding = placement === "source" ? "CreateOutlineFromShellsFactory" : "ProjectOutlineFromShellsFactory";
    await this.runtime.mutate(`async function (Factory, Database, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const viewport = Array.from(this.viewports)[0];
      if (!viewport) throw new Error('Plasticity viewport is unavailable');
      let selected;
      if (args.plane.source === 'standard') {
        selected = Database[args.plane.nativeId];
      } else {
        const snapshot = this.planes.snapshot();
        const idEntries = snapshot.ids instanceof Map ? Array.from(snapshot.ids) : Object.entries(snapshot.ids ?? {});
        const idEntry = idEntries.find(([, nativeId]) => String(nativeId) === args.plane.nativeId);
        const index = idEntry ? Number(idEntry[0]) : undefined;
        selected = snapshot.planes?.[index];
      }
      if (!selected) throw new Error('Construction plane is unavailable: ' + args.plane.nativeId);
      const previous = viewport.constructionPlane;
      viewport.constructionPlane = selected;
      if (viewport.constructionPlane !== selected) throw new Error('Plasticity did not activate the requested outline plane');
      viewport.setNeedsRender();

      const shells = args.ids.map(id => {
        const view = find(id);
        if (view.constructor.name !== 'Solid' && view.constructor.name !== 'Sheet') {
          throw new Error('Body outline inputs must be Solid or Sheet bodies');
        }
        return view;
      });
      const editor = this;
      let failure;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.shells = shells;
          return await factory.commit();
        } catch (error) {
          failure = error;
          viewport.constructionPlane = previous;
          viewport.setNeedsRender();
          throw error;
        }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, [factoryBinding, "ConstructionPlaneDatabase"], [{
      ids: uniqueIds,
      plane: { id: plane.id, nativeId: plane.nativeId, source: plane.source },
    }]);
    return await this.state();
  }

  async curvePattern(ids: number[], spineId: number, count: number, revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (ids.length === 0) throw new Error("At least one Solid or Sheet is required for a curve pattern");
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) throw new Error("Curve-pattern body IDs must be unique");
    const invalid = uniqueIds.filter((id) => {
      const type = state.bodies.find((body) => body.id === id)?.type;
      return type !== "Solid" && type !== "Sheet";
    });
    if (invalid.length > 0) throw new Error(`Curve pattern requires current Solid or Sheet bodies: ${invalid.join(", ")}`);
    if (state.bodies.find((body) => body.id === spineId)?.type !== "Wire") {
      throw new Error(`Curve pattern requires a current Wire spine: ${spineId}`);
    }
    if (!Number.isInteger(count) || count < 2 || count > 1000) {
      throw new Error("Curve-pattern count must be an integer between 2 and 1000");
    }
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          const spine = find(args.spineId);
          if (spine.constructor.name !== 'Wire') throw new Error('Curve pattern spine must be a Wire');
          factory.items = args.ids.map(find);
          factory.curve = spine;
          factory.num = args.count;
          factory.shouldMakeInstances = false;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["CurveArrayFactory"], [{ ids: uniqueIds, spineId, count }]);
    return await this.state();
  }

  async projectCurvesOntoBody(
    targetId: number,
    curveIds: number[],
    direction: Vector3,
    options: { bidirectional?: boolean; occlude?: boolean; completion?: "none" | "edge" | "face-set" },
    revision: string,
  ): Promise<RuntimeState> {
    await this.assertRevision(revision);
    if (curveIds.length === 0) throw new Error("At least one Wire ID is required");
    const uniqueIds = [...new Set(curveIds)];
    if (uniqueIds.length !== curveIds.length) throw new Error("Wire IDs must be unique");
    if (uniqueIds.includes(targetId)) throw new Error("Projection curves must not include the target body");
    const length = Math.hypot(...direction);
    if (!Number.isFinite(length) || length === 0) throw new Error("Projection direction must be nonzero");
    const normalizedDirection = direction.map((value) => value / length) as Vector3;
    const completion = options.completion ?? "none";
    const completionName = ({ none: "None", edge: "Edge", "face-set": "FaceSet" } as const)[completion];
    if (!completionName) throw new Error(`Unsupported projection completion: ${completion}`);
    await this.runtime.mutate(`async function (Factory, Vector, ProjectionMethod, ProjectionCompletionType, args) {
      const find = id => {
        for (const [versionId, item] of this.geo.geometryModel) {
          if (this.db.lookupStableId(versionId) === id) return item.view;
        }
        throw new Error('Unknown body ID: ' + id);
      };
      ${commandStart("ProjectCurveBodyCommand")}
      const target = find(args.targetId);
      if (target.constructor.name === 'Wire') throw new Error('Projection target must be a surface body');
      const curves = args.curveIds.map(id => {
        const curve = find(id);
        if (curve.constructor.name !== 'Wire') throw new Error('Projection inputs must be Wire bodies');
        return curve;
      });
      factory.target = target;
      factory.curves = curves;
      factory.method = ProjectionMethod.Vector;
      factory.direction.copy(new Vector(...args.direction));
      factory.bidirectional = args.bidirectional;
      factory.occlude = args.occlude;
      factory.complete = ProjectionCompletionType[args.completionName];
      ${commandEnd}
    }`, ["ProjectCurveBodyFactory", "Vector3", "ProjectionMethod", "ProjectionCompletionType"], [{
      targetId,
      curveIds: uniqueIds,
      direction: normalizedDirection,
      bidirectional: options.bidirectional ?? false,
      occlude: options.occlude ?? true,
      completionName,
    }]);
    return await this.state();
  }

  async createBodyIntersectionCurves(targetId: number, toolIds: number[], revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (toolIds.length === 0) throw new Error("At least one intersection tool body is required");
    const uniqueIds = [...new Set(toolIds)];
    if (uniqueIds.length !== toolIds.length) throw new Error("Intersection tool body IDs must be unique");
    if (uniqueIds.includes(targetId)) throw new Error("The intersection target cannot also be a tool body");
    const targetType = state.bodies.find((body) => body.id === targetId)?.type;
    if (targetType !== "Solid" && targetType !== "Sheet") {
      throw new Error(`Body intersection target must be a current Solid or Sheet: ${targetId}`);
    }
    const invalid = uniqueIds.filter((id) => {
      const type = state.bodies.find((body) => body.id === id)?.type;
      return type !== "Solid" && type !== "Sheet";
    });
    if (invalid.length > 0) throw new Error(`Body intersection tools must be current Solid or Sheet bodies: ${invalid.join(", ")}`);
    await this.runtime.mutate(`async function (Command, Factory, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.target = find(args.targetId);
          factory.tools = args.toolIds.map(find);
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["ProjectBodyBodyCommand", "ProjectBodyBodyFactory"], [{ targetId, toolIds: uniqueIds }]);
    return await this.state();
  }

  async projectCurvePair(
    firstId: number,
    firstDirection: Vector3,
    secondId: number,
    secondDirection: Vector3,
    projectionDepthMm: number,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (firstId === secondId) throw new Error("Curve projection requires two distinct Wire bodies");
    for (const id of [firstId, secondId]) {
      if (state.bodies.find((body) => body.id === id)?.type !== "Wire") {
        throw new Error(`Curve projection requires a current Wire body: ${id}`);
      }
    }
    const normalize = (value: Vector3, label: string): Vector3 => {
      const length = Math.hypot(...value);
      if (!Number.isFinite(length) || length === 0) throw new Error(`${label} must be nonzero`);
      return value.map((component) => component / length) as Vector3;
    };
    const first = normalize(firstDirection, "First projection direction");
    const second = normalize(secondDirection, "Second projection direction");
    const crossLength = Math.hypot(
      first[1] * second[2] - first[2] * second[1],
      first[2] * second[0] - first[0] * second[2],
      first[0] * second[1] - first[1] * second[0],
    );
    if (crossLength <= 1e-9) throw new Error("Curve projection directions must not be parallel");
    if (!Number.isFinite(projectionDepthMm) || projectionDepthMm <= 0) {
      throw new Error("Curve projection depth must be positive");
    }
    await this.runtime.mutate(`async function (Command, Factory, Vector, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.curve1 = find(args.firstId);
          factory.curve2 = find(args.secondId);
          factory.extrude1.direction.copy(new Vector(...args.firstDirection));
          factory.extrude1.distance1 = args.projectionDepth;
          factory.extrude1.distance2 = -args.projectionDepth;
          factory.extrude2.direction.copy(new Vector(...args.secondDirection));
          factory.extrude2.distance1 = args.projectionDepth;
          factory.extrude2.distance2 = -args.projectionDepth;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["ProjectCurveCurveCommand", "ProjectCurveCurveFactory", "Vector3"], [{
      firstId,
      firstDirection: first,
      secondId,
      secondDirection: second,
      projectionDepth: millimetersToMeters(projectionDepthMm),
    }]);
    return await this.state();
  }

  async deformCurvesBetweenFaces(
    ids: number[],
    sourceFace: FaceReference,
    targetFace: FaceReference,
    options: {
      scaleU: number;
      scaleV: number;
      scaleNormal: number;
      flipUV: boolean;
      flipNormal: boolean;
      mirror: boolean;
    },
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (ids.length === 0 || new Set(ids).size !== ids.length) {
      throw new Error("Deformation curve IDs must be a nonempty unique list");
    }
    const current = new Map(state.bodies.map((body) => [body.id, body]));
    const missing = ids.filter((id) => !current.has(id));
    if (missing.length > 0) throw new Error(`Unknown current deformation curve IDs: ${missing.join(", ")}`);
    const invalid = ids.filter((id) => current.get(id)!.type !== "Wire");
    if (invalid.length > 0) throw new Error(`Curve deformation requires current Wire bodies: ${invalid.join(", ")}`);
    if (sourceFace.bodyId === targetFace.bodyId && sourceFace.faceId === targetFace.faceId) {
      throw new Error("Source and target deformation faces must be different");
    }
    requireTopologySelection(state, [sourceFace, targetFace], "face");
    const referenceBodyIds = new Set([sourceFace.bodyId, targetFace.bodyId]);
    const overlapping = ids.filter((id) => referenceBodyIds.has(id));
    if (overlapping.length > 0) {
      throw new Error(`Deformation curves must be separate from source and target face bodies: ${overlapping.join(", ")}`);
    }
    for (const [name, value] of Object.entries({
      scaleU: options.scaleU,
      scaleV: options.scaleV,
      scaleNormal: options.scaleNormal,
    })) {
      if (!Number.isFinite(value) || value <= 0 || value > 1000) {
        throw new Error(`${name} must be positive and at most 1000`);
      }
    }
    await this.runtime.mutate(`async function (Factory, Command, args) {
      ${findView}
      const findFace = ref => {
        const view = find(ref.bodyId);
        const index = view.high.faces.versionIds.indexOf(ref.faceId);
        if (index < 0) throw new Error('Stale or unknown face: ' + ref.faceId);
        return view.high.faces.get(index);
      };
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.curves = args.ids.map(id => {
            const view = find(id);
            if (view.constructor.name !== 'Wire') throw new Error('Curve deformation inputs must remain Wire bodies');
            return view;
          });
          factory.sourceFace = findFace(args.sourceFace);
          factory.targetFace = findFace(args.targetFace);
          factory.keepTools = true;
          factory.scaleU = args.options.scaleU;
          factory.scaleV = args.options.scaleV;
          factory.scaleNormal = args.options.scaleNormal;
          factory.flipUV = args.options.flipUV;
          factory.flipNormal = args.options.flipNormal;
          factory.mirror = args.options.mirror;
          factory.offsetU = 0;
          factory.offsetV = 0;
          factory.offsetNormal = 0;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["DeformCurveFactory", "DeformCurveCommand"], [{ ids, sourceFace, targetFace, options }]);
    return await this.state();
  }
}

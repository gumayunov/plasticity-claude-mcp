import { open } from "node:fs/promises";
import { type RuntimeState } from "../runtime.ts";
import { dot, scale, subtract } from "../construction.ts";
import { millimetersToMeters } from "../units.ts";
import { type FaceReference } from "../measurements.ts";
import { type Vector3, type ShellEdgeEndpointReference } from "./types.ts";
import { findView, findFaceViews, commandStart, commandEnd } from "./native-snippets.ts";
import { toMeters, requireTopologySelection } from "./helpers.ts";
import { OperationsBase } from "./base.ts";

export abstract class SurfacesOperations extends OperationsBase {
  async bridgeShellEdges(
    first: ShellEdgeEndpointReference,
    second: ShellEdgeEndpointReference,
    startContinuity: "G0" | "G1" | "G2" | "G3",
    endContinuity: "G0" | "G1" | "G2" | "G3",
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    const references = [first, second];
    if (first.bodyId === second.bodyId && first.edgeId === second.edgeId) {
      throw new Error("Shell Edge Bridge requires two different source edges");
    }
    requireTopologySelection(state, references, "edge");
    const resolved = references.map((reference, index) => {
      const body = state.bodies.find((candidate) => candidate.id === reference.bodyId)!;
      if (body.type !== "Solid" && body.type !== "Sheet") {
        throw new Error(`Shell Edge Bridge source ${index + 1} must belong to a Solid or Sheet`);
      }
      const edge = body.edges.find((candidate) => candidate.id === reference.edgeId)!;
      if (!edge.vertexIds.includes(reference.vertexId)) {
        throw new Error(`Shell Edge Bridge vertex ${reference.vertexId} is not an endpoint of ${reference.bodyId}:${reference.edgeId}`);
      }
      const vertex = body.vertices?.find((candidate) => candidate.id === reference.vertexId);
      if (!vertex) throw new Error(`Shell Edge Bridge requires current native B-Rep vertex ${reference.bodyId}:${reference.vertexId}`);
      return { body, edge, vertex };
    });
    const delta = subtract(resolved[1]!.vertex.positionMm, resolved[0]!.vertex.positionMm);
    if (dot(delta, delta) <= 1e-18) throw new Error("Shell Edge Bridge endpoints must be distinct");

    await this.runtime.mutate(`async function (Factory, Command, Continuity, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const edge = reference => {
        const view = find(reference.bodyId);
        if (view?.constructor?.name !== 'Solid' && view?.constructor?.name !== 'Sheet') {
          throw new Error('Shell Edge Bridge source is no longer a Solid or Sheet');
        }
        const index = view.high.edges.versionIds.indexOf(reference.edgeId);
        if (index < 0) throw new Error('Stale or unknown Shell Edge Bridge edge: ' + reference.bodyId + ':' + reference.edgeId);
        return view.high.edges.get(index);
      };
      const matches = (position, expected) => position &&
        (position.x - expected[0]) ** 2 +
        (position.y - expected[1]) ** 2 +
        (position.z - expected[2]) ** 2 <= 1e-18;
      editor.selection.selected.removeAll();
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.edge1 = edge(args.first);
          factory.edge2 = edge(args.second);
          factory.pickClosestVertices();
          if (!matches(factory.startPosition, args.firstPosition)) factory.side1 = !factory.side1;
          if (!matches(factory.endPosition, args.secondPosition)) factory.side2 = !factory.side2;
          if (!matches(factory.startPosition, args.firstPosition) || !matches(factory.endPosition, args.secondPosition)) {
            throw new Error('Requested Shell Edge Bridge endpoints are unavailable');
          }
          factory.startCurvature = Continuity[args.startContinuity];
          factory.endCurvature = Continuity[args.endContinuity];
          factory.lockDistances = true;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["BridgeEdgeFactory", "BridgeEdgeCommand", "ContinuityType"], [{
      first,
      second,
      firstPosition: toMeters(resolved[0]!.vertex.positionMm),
      secondPosition: toMeters(resolved[1]!.vertex.positionMm),
      startContinuity,
      endContinuity,
    }]);
    return await this.state();
  }

  async raiseSurfaceDegree(faces: FaceReference[], revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, faces, "face");
    const invalid = faces.filter((reference) => {
      const body = state.bodies.find((candidate) => candidate.id === reference.bodyId);
      return (body?.type !== "Solid" && body?.type !== "Sheet") ||
        body.faces.find((face) => face.id === reference.faceId)?.surfaceType !== "BSurf";
    });
    if (invalid.length > 0) {
      throw new Error(`Surface degree elevation requires current B-Surface faces: ${invalid.map((face) => `${face.bodyId}:${face.faceId}`).join(", ")}`);
    }
    await this.runtime.mutate(`async function (Factory, Command, args) {
      ${findFaceViews}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.faces = selectedFaces;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["RaiseDegreeFaceFactory", "RaiseDegreeFaceCommand"], [{ faces }]);
    return await this.state();
  }

  async rebuildFace(face: FaceReference, toleranceMm: number, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, [face], "face");
    const body = state.bodies.find((candidate) => candidate.id === face.bodyId);
    if (body?.type !== "Solid" && body?.type !== "Sheet") {
      throw new Error(`Face rebuild requires a current Solid or Sheet body: ${face.bodyId}`);
    }
    if (!Number.isFinite(toleranceMm) || toleranceMm <= 0 || toleranceMm > 10) {
      throw new Error("Face rebuild tolerance must be positive and no greater than 10 mm");
    }
    await this.runtime.mutate(`async function (Factory, Command, RebuildFaceMethod, ChangeEdgeMethod, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const view = find(args.face.bodyId);
      if (view?.constructor?.name !== 'Solid' && view?.constructor?.name !== 'Sheet') {
        throw new Error('Face rebuild source is no longer a Solid or Sheet');
      }
      const index = view.high.faces.versionIds.indexOf(args.face.faceId);
      if (index < 0) throw new Error('Stale or unknown face: ' + args.face.faceId);
      const selectedFace = view.high.faces.get(index);
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.shell = view;
          factory.face = selectedFace;
          factory.method = RebuildFaceMethod.Refit;
          factory.tolerance = args.tolerance;
          factory.changeEdgeMethod = ChangeEdgeMethod.Project;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["RebuildFaceFactory", "RebuildFaceCommand", "RebuildFaceMethod", "ChangeEdgeMethod"], [{
      face,
      tolerance: millimetersToMeters(toleranceMm),
    }]);
    return await this.state();
  }

  async matchFaces(
    faces: FaceReference[],
    replacement: FaceReference,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (faces.length === 0) throw new Error("At least one source face is required for face matching");
    requireTopologySelection(state, [...faces, replacement], "face");
    const invalidBodies = [...new Set([...faces, replacement].map((reference) => reference.bodyId))].filter((bodyId) => {
      const type = state.bodies.find((body) => body.id === bodyId)?.type;
      return type !== "Solid" && type !== "Sheet";
    });
    if (invalidBodies.length > 0) {
      throw new Error(`Face matching requires current Solid or Sheet bodies: ${invalidBodies.join(", ")}`);
    }
    await this.runtime.mutate(`async function (Factory, Command, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const face = reference => {
        const view = find(reference.bodyId);
        if (view?.constructor?.name !== 'Solid' && view?.constructor?.name !== 'Sheet') {
          throw new Error('Face matching input is no longer a Solid or Sheet');
        }
        const index = view.high.faces.versionIds.indexOf(reference.faceId);
        if (index < 0) throw new Error('Stale or unknown matching face: ' + reference.bodyId + ':' + reference.faceId);
        return view.high.faces.get(index);
      };
      const sourceShells = Array.from(new Set(args.faces.map(reference => find(reference.bodyId))));
      const sourceFaces = args.faces.map(face);
      const replacementFace = face(args.replacement);
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.shells = sourceShells;
          factory.faces = sourceFaces;
          factory.replacement = replacementFace;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["MatchFaceFactory", "MatchFaceCommand"], [{ faces, replacement }]);
    return await this.state();
  }

  async untrimFaces(faces: FaceReference[], revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, faces, "face");
    const invalidBodies = [...new Set(faces.map((reference) => reference.bodyId))].filter((bodyId) => {
      const type = state.bodies.find((body) => body.id === bodyId)?.type;
      return type !== "Solid" && type !== "Sheet";
    });
    if (invalidBodies.length > 0) throw new Error(`Surface untrim requires current Solid or Sheet bodies: ${invalidBodies.join(", ")}`);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findFaceViews}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new this.commands.UntrimCommand(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.faces = selectedFaces;
          factory.keepEdges = false;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["UntrimFactory"], [{ faces }]);
    return await this.state();
  }

  async sweepRegions(
    regionIds: string[],
    spineId: number,
    options: {
      alignment?: "normal" | "parallel" | "transport";
      corner?: "miter" | "round";
      twistDegrees?: number;
      scale?: number;
      simplify?: boolean;
    },
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (regionIds.length === 0) throw new Error("At least one Region ID is required");
    const uniqueIds = [...new Set(regionIds)];
    if (uniqueIds.length !== regionIds.length) throw new Error("Region IDs must be unique");
    const selected = uniqueIds.map((id) => state.regions.find((region) => region.id === id));
    const missing = uniqueIds.filter((_id, index) => !selected[index]);
    if (missing.length > 0) throw new Error(`Stale or unknown regions: ${missing.join(", ")}`);
    const spine = state.bodies.find((body) => body.id === spineId);
    if (!spine || spine.type !== "Wire") throw new Error(`Sweep requires a current Wire spine: ${spineId}`);
    if (selected.some((region) => region!.sketchWireIds.includes(spineId))) {
      throw new Error("Sweep spine must not be one of the Region profile curves");
    }
    const scale = options.scale ?? 1;
    if (!Number.isFinite(scale) || scale <= 0) throw new Error("Sweep scale must be positive");
    const twistDegrees = options.twistDegrees ?? 0;
    if (!Number.isFinite(twistDegrees)) throw new Error("Sweep twist must be finite");
    const alignmentName = ({ normal: "Normal", parallel: "Parallel", transport: "Transport" } as const)[options.alignment ?? "normal"];
    const cornerName = ({ miter: "Mitre", round: "Round" } as const)[options.corner ?? "miter"];
    await this.runtime.mutate(`async function (Factory, SweepAlignmentType, SweepCornerType, args) {
      ${commandStart("SweepCommand")}
      const wanted = new Set(args.regionIds);
      const regions = [];
      let spine;
      for (const [versionId, item] of editor.geo.geometryModel) {
        if (editor.db.lookupStableId(versionId) === args.spineId) spine = item.view;
        if (!editor.geo.automatics.has(versionId) || item.view?.constructor?.name !== 'SketchIsland') continue;
        for (let index = 0; index < (item.view.regions?.length ?? 0); index += 1) {
          const region = item.view.regions.get(index);
          if (region && wanted.has(String(region.versionId))) regions.push(region);
        }
      }
      if (!spine || spine.constructor.name !== 'Wire') throw new Error('Stale or unknown sweep spine');
      const found = new Set(regions.map(region => String(region.versionId)));
      const missing = args.regionIds.filter(id => !found.has(id));
      if (missing.length > 0) throw new Error('Stale or unknown regions: ' + missing.join(', '));
      factory.regions = regions;
      factory.spine = spine;
      factory.alignment = SweepAlignmentType[args.alignmentName];
      factory.cornerType = SweepCornerType[args.cornerName];
      factory.twistDegrees = args.twistDegrees;
      factory.scale = args.scale;
      factory.simplify = args.simplify;
      ${commandEnd}
    }`, ["SweepFactory", "SweepAlignmentType", "SweepCornerType"], [{
      regionIds: uniqueIds,
      spineId,
      alignmentName,
      cornerName,
      twistDegrees,
      scale,
      simplify: options.simplify ?? false,
    }]);
    return await this.state();
  }

  async loftRegions(
    regionIds: string[],
    options: { closed?: boolean; simplify?: boolean; guideIds?: number[]; trimGuides?: boolean },
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (regionIds.length < 2) throw new Error("Loft requires at least two Region profiles");
    const uniqueIds = [...new Set(regionIds)];
    if (uniqueIds.length !== regionIds.length) throw new Error("Loft Region IDs must be unique");
    if (options.closed && uniqueIds.length < 3) throw new Error("Closed loft requires at least three Region profiles");
    const selected = uniqueIds.map((id) => state.regions.find((region) => region.id === id));
    const missing = uniqueIds.filter((_id, index) => !selected[index]);
    if (missing.length > 0) throw new Error(`Stale or unknown regions: ${missing.join(", ")}`);
    if (new Set(selected.map((region) => region!.islandVersionId)).size !== selected.length) {
      throw new Error("Loft profiles must come from different sketch islands");
    }
    const guideIds = options.guideIds ?? [];
    if (new Set(guideIds).size !== guideIds.length) throw new Error("Loft guide IDs must be unique");
    const invalidGuides = guideIds.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalidGuides.length > 0) throw new Error(`Loft guides must be current Wire bodies: ${invalidGuides.join(", ")}`);
    const profileWireIds = new Set(selected.flatMap((region) => region!.sketchWireIds));
    const profileGuides = guideIds.filter((id) => profileWireIds.has(id));
    if (profileGuides.length > 0) throw new Error(`Loft guide must not reuse a profile Wire: ${profileGuides.join(", ")}`);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("LoftCommand")}
      const available = new Map();
      for (const [versionId, item] of editor.geo.geometryModel) {
        if (!editor.geo.automatics.has(versionId) || item.view?.constructor?.name !== 'SketchIsland') continue;
        for (let index = 0; index < (item.view.regions?.length ?? 0); index += 1) {
          const region = item.view.regions.get(index);
          if (region) available.set(String(region.versionId), region);
        }
      }
      factory.regions = args.regionIds.map(id => {
        const region = available.get(id);
        if (!region) throw new Error('Stale or unknown Region: ' + id);
        return region;
      });
      if (args.guideIds.length > 0) {
        factory.guides = args.guideIds.map(id => {
          const guide = find(id);
          if (guide.constructor.name !== 'Wire') throw new Error('Loft guides must be Wire bodies');
          return guide;
        });
      }
      factory.trimGuides = args.trimGuides;
      factory.closed = args.closed;
      factory.simplify = args.simplify;
      ${commandEnd}
    }`, ["RegionLoftFactory"], [{
      regionIds: uniqueIds,
      guideIds,
      trimGuides: options.trimGuides ?? true,
      closed: options.closed ?? false,
      simplify: options.simplify ?? true,
    }]);
    return await this.state();
  }

  async loftCurves(
    profileIds: number[],
    options: {
      guideIds?: number[];
      trimGuides?: boolean;
      trimProfiles?: boolean;
      closed?: boolean;
      simplify?: boolean;
      curvature?: "natural" | "unconstrained" | "clamped";
      startMagnitude?: number;
      endMagnitude?: number;
    },
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (profileIds.length < 2) throw new Error("Curve loft requires at least two ordered Wire profiles");
    if (new Set(profileIds).size !== profileIds.length) throw new Error("Curve loft profile IDs must be unique");
    if (options.closed && profileIds.length < 3) throw new Error("Closed curve loft requires at least three Wire profiles");
    const invalidProfiles = profileIds.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalidProfiles.length > 0) throw new Error(`Curve loft profiles must be current Wire bodies: ${invalidProfiles.join(", ")}`);
    const guideIds = options.guideIds ?? [];
    if (new Set(guideIds).size !== guideIds.length) throw new Error("Curve loft guide IDs must be unique");
    const invalidGuides = guideIds.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalidGuides.length > 0) throw new Error(`Curve loft guides must be current Wire bodies: ${invalidGuides.join(", ")}`);
    const profileSet = new Set(profileIds);
    const profileGuides = guideIds.filter((id) => profileSet.has(id));
    if (profileGuides.length > 0) throw new Error(`Curve loft guide must not reuse a profile Wire: ${profileGuides.join(", ")}`);
    const startMagnitude = options.startMagnitude ?? 1;
    const endMagnitude = options.endMagnitude ?? 1;
    if (!Number.isFinite(startMagnitude) || startMagnitude <= 0 || !Number.isFinite(endMagnitude) || endMagnitude <= 0) {
      throw new Error("Curve loft start and end magnitudes must be finite and positive");
    }
    const curvature = ({ natural: "Natural", unconstrained: "Unconstrained", clamped: "Clamped" } as const)[options.curvature ?? "unconstrained"];

    await this.runtime.mutate(`async function (Factory, Command, Curvature, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      editor.selection.selected.removeAll();
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.profiles = args.profileIds.map(find);
          if (args.guideIds.length > 0) factory.guides = args.guideIds.map(find);
          factory.trimGuides = args.trimGuides;
          factory.trimProfiles = args.trimProfiles;
          factory.closed = args.closed;
          factory.simplify = args.simplify;
          factory.curvature = Curvature[args.curvature];
          factory.startMagnitude = args.startMagnitude;
          factory.endMagnitude = args.endMagnitude;
          factory.join = false;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["CurveLoftFactory", "LoftEdgeCommand", "LoftCurvatureType"], [{
      profileIds,
      guideIds,
      trimGuides: options.trimGuides ?? true,
      trimProfiles: options.trimProfiles ?? true,
      closed: options.closed ?? false,
      simplify: options.simplify ?? true,
      curvature,
      startMagnitude,
      endMagnitude,
    }]);
    return await this.state();
  }

  async loftFaces(
    faces: FaceReference[],
    options: {
      guideIds?: number[];
      trimGuides?: boolean;
      simplify?: boolean;
      startCondition?: "natural" | "unconstrained" | "clamped";
      endCondition?: "natural" | "unconstrained" | "clamped";
      startMagnitude?: number;
      endMagnitude?: number;
    },
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (faces.length < 2) throw new Error("Face loft requires at least two ordered planar faces");
    const keys = faces.map((face) => `${face.bodyId}:${face.faceId}`);
    if (new Set(keys).size !== keys.length) throw new Error("Face loft references must be unique");
    if (new Set(faces.map((face) => face.bodyId)).size !== faces.length) {
      throw new Error("Face loft profiles must come from different source bodies");
    }
    requireTopologySelection(state, faces, "face");
    const bodies = new Map(state.bodies.map((body) => [body.id, body]));
    const invalidBodies = faces.filter((face) => !["Solid", "Sheet"].includes(bodies.get(face.bodyId)!.type));
    if (invalidBodies.length > 0) {
      throw new Error(`Face loft profiles must belong to current Solid or Sheet bodies: ${invalidBodies.map((face) => face.bodyId).join(", ")}`);
    }
    const nonPlanar = faces.filter((reference) => !bodies.get(reference.bodyId)!.faces.find((face) => face.id === reference.faceId)!.planar);
    if (nonPlanar.length > 0) {
      throw new Error(`Face loft currently requires planar profile faces: ${nonPlanar.map((face) => `${face.bodyId}:${face.faceId}`).join(", ")}`);
    }
    const guideIds = options.guideIds ?? [];
    if (new Set(guideIds).size !== guideIds.length) throw new Error("Face loft guide IDs must be unique");
    const invalidGuides = guideIds.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalidGuides.length > 0) throw new Error(`Face loft guides must be current Wire bodies: ${invalidGuides.join(", ")}`);
    const startMagnitude = options.startMagnitude ?? 1;
    const endMagnitude = options.endMagnitude ?? 1;
    if (!Number.isFinite(startMagnitude) || startMagnitude <= 0 || !Number.isFinite(endMagnitude) || endMagnitude <= 0) {
      throw new Error("Face loft start and end magnitudes must be finite and positive");
    }
    const conditionNames = { natural: "Natural", unconstrained: "Unconstrained", clamped: "Clamped" } as const;
    const startCondition = conditionNames[options.startCondition ?? "unconstrained"];
    const endCondition = conditionNames[options.endCondition ?? "unconstrained"];

    await this.runtime.mutate(`async function (Factory, Command, Curvature, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const face = reference => {
        const view = find(reference.bodyId);
        if (view?.constructor?.name !== 'Solid' && view?.constructor?.name !== 'Sheet') {
          throw new Error('Face loft profile is no longer a Solid or Sheet');
        }
        const index = view.high.faces.versionIds.indexOf(reference.faceId);
        if (index < 0) throw new Error('Stale or unknown Face loft profile: ' + reference.bodyId + ':' + reference.faceId);
        return view.high.faces.get(index);
      };
      editor.selection.selected.removeAll();
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.faces = args.faces.map(face);
          if (args.guideIds.length > 0) {
            factory.guides = args.guideIds.map(id => {
              const guide = find(id);
              if (guide?.constructor?.name !== 'Wire') throw new Error('Face loft guide is no longer a Wire');
              return guide;
            });
          }
          factory.trimGuides = args.trimGuides;
          factory.closed = false;
          factory.simplify = args.simplify;
          factory.startCurvature = Curvature[args.startCondition];
          factory.endCurvature = Curvature[args.endCondition];
          factory.startMagnitude = args.startMagnitude;
          factory.endMagnitude = args.endMagnitude;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["FaceLoftFactory", "LoftSurfaceCommand", "LoftCurvatureType"], [{
      faces,
      guideIds,
      trimGuides: options.trimGuides ?? true,
      simplify: options.simplify ?? true,
      startCondition,
      endCondition,
      startMagnitude,
      endMagnitude,
    }]);
    return await this.state();
  }

  async patchRegions(regionIds: string[], revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (regionIds.length === 0) throw new Error("At least one Region ID is required");
    const uniqueIds = [...new Set(regionIds)];
    if (uniqueIds.length !== regionIds.length) throw new Error("Region IDs must be unique");
    const availableIds = new Set(state.regions.map((region) => region.id));
    const missing = uniqueIds.filter((id) => !availableIds.has(id));
    if (missing.length > 0) throw new Error(`Stale or unknown regions: ${missing.join(", ")}`);
    await this.runtime.mutate(`async function (Factory, args) {
      ${commandStart("PatchCommand")}
      const wanted = new Set(args.regionIds);
      const regions = [];
      for (const [versionId, item] of editor.geo.geometryModel) {
        if (!editor.geo.automatics.has(versionId) || item.view?.constructor?.name !== 'SketchIsland') continue;
        for (let index = 0; index < (item.view.regions?.length ?? 0); index += 1) {
          const region = item.view.regions.get(index);
          if (region && wanted.has(String(region.versionId))) regions.push(region);
        }
      }
      const found = new Set(regions.map(region => String(region.versionId)));
      const missing = args.regionIds.filter(id => !found.has(id));
      if (missing.length > 0) throw new Error('Stale or unknown regions: ' + missing.join(', '));
      factory.regions = regions;
      ${commandEnd}
    }`, ["PatchRegionFactory"], [{ regionIds: uniqueIds }]);
    return await this.state();
  }

  async patchClosedWires(ids: number[], revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (ids.length === 0 || new Set(ids).size !== ids.length) {
      throw new Error("Closed-Wire patch IDs must be a nonempty unique list");
    }
    const current = new Map(state.bodies.map((body) => [body.id, body]));
    const missing = ids.filter((id) => !current.has(id));
    if (missing.length > 0) throw new Error(`Unknown current closed-Wire patch body IDs: ${missing.join(", ")}`);
    const invalid = ids.filter((id) => current.get(id)!.type !== "Wire");
    if (invalid.length > 0) throw new Error(`Closed-Wire patching requires current Wire bodies: ${invalid.join(", ")}`);
    const closure = await this.runtime.read<Array<{ id: number; closed: boolean }>>(`function (ids) {
      const wanted = new Set(ids);
      const result = [];
      for (const [versionId, item] of this.geo.geometryModel) {
        const id = this.db.lookupStableId(versionId);
        if (!wanted.has(id)) continue;
        if (item.view?.constructor?.name !== 'Wire') throw new Error('Closed-Wire patch source is no longer a Wire: ' + id);
        result.push({ id, closed: Boolean(item.model?.IsClosed?.()) });
      }
      return result;
    }`, [ids]);
    await this.assertRevision(revision);
    const closureById = new Map(closure.map((item) => [item.id, item.closed]));
    const unresolved = ids.filter((id) => !closureById.has(id));
    if (unresolved.length > 0) throw new Error(`Closed-Wire patch sources changed while being inspected: ${unresolved.join(", ")}`);
    const open = ids.filter((id) => closureById.get(id) !== true);
    if (open.length > 0) throw new Error(`Surface patching requires closed Wire bodies: ${open.join(", ")}`);
    await this.runtime.mutate(`async function (Factory, Command, args) {
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const findWire = id => {
        for (const [versionId, item] of editor.geo.geometryModel) {
          if (editor.db.lookupStableId(versionId) !== id) continue;
          if (item.view?.constructor?.name !== 'Wire' || !item.model?.IsClosed?.()) {
            throw new Error('Surface patch source must remain a closed Wire: ' + id);
          }
          return item.view;
        }
        throw new Error('Surface patch source is missing: ' + id);
      };
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const curves = args.ids.map(findWire);
          const factory = new Factory(editor).resource(this);
          factory.curves = curves;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["PatchHoleInWireFactory", "PatchHoleInCurveCommand"], [{ ids }]);
    return await this.state();
  }

  async bridgeSurface(
    first: { bodyId: number; faceId: string; pickPointMm: Vector3 },
    second: { bodyId: number; faceId: string; pickPointMm: Vector3 },
    widthMm: number,
    softness: number,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (!Number.isFinite(widthMm) || widthMm <= 0) throw new Error("Surface Bridge width must be positive");
    if (!Number.isFinite(softness) || softness <= 0) throw new Error("Surface Bridge softness must be positive");
    if ([...first.pickPointMm, ...second.pickPointMm].some((value) => !Number.isFinite(value))) {
      throw new Error("Surface Bridge pick points must contain finite coordinates");
    }
    if (first.bodyId === second.bodyId) throw new Error("Surface Bridge requires faces from two different Sheet bodies");
    const references = [first, second];
    const invalid = references.filter((reference) => {
      const body = state.bodies.find((candidate) => candidate.id === reference.bodyId);
      return body?.type !== "Sheet" || !body.faceIds.includes(reference.faceId);
    });
    if (invalid.length > 0) {
      throw new Error(`Surface Bridge requires current Sheet faces; stale or unknown: ${invalid.map((reference) => `${reference.bodyId}:${reference.faceId}`).join(", ")}`);
    }
    await this.runtime.mutate(`async function (Factory, Vector, BlendShape, BlendTrim, args) {
      ${findView}
      ${commandStart("BridgeSurfaceCommand")}
      const face = ref => {
        const view = find(ref.bodyId);
        if (view.constructor.name !== 'Sheet') throw new Error('Surface Bridge inputs must be Sheet bodies');
        const index = view.high.faces.versionIds.indexOf(ref.faceId);
        if (index < 0) throw new Error('Stale or unknown Sheet face: ' + ref.faceId);
        return view.high.faces.get(index);
      };
      factory.shape = BlendShape.G2;
      factory.trimBlend = BlendTrim.Both;
      factory.trimWalls = true;
      factory.propagate = true;
      factory.width = args.width;
      factory.softness = args.softness;
      factory.push(face(args.faces[0]), false, new Vector(...args.pickPoints[0]));
      factory.push(face(args.faces[1]), false, new Vector(...args.pickPoints[1]));
      ${commandEnd}
    }`, ["BridgeSurfaceWithPreviewFactory", "Vector3", "BlendShape", "BlendTrim"], [{
      faces: references.map(({ bodyId, faceId }) => ({ bodyId, faceId })),
      pickPoints: references.map(({ pickPointMm }) => toMeters(pickPointMm)),
      width: millimetersToMeters(widthMm),
      softness,
    }]);
    return await this.state();
  }

  async joinSheets(ids: number[], revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (ids.length < 2) throw new Error("At least two Sheet IDs are required");
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) throw new Error("Sheet IDs must be unique");
    const invalid = uniqueIds.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Sheet");
    if (invalid.length > 0) throw new Error(`Join requires current Sheet bodies: ${invalid.join(", ")}`);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("JoinSheetsCommand")}
      factory.sheets = args.ids.map(id => {
        const sheet = find(id);
        if (sheet.constructor.name !== 'Sheet') throw new Error('Join inputs must be Sheet bodies');
        return sheet;
      });
      ${commandEnd}
    }`, ["JoinSheetsFactory"], [{ ids: uniqueIds }]);
    return await this.state();
  }

  async createConstrainedSurface(
    pointsMm: Vector3[],
    normals: Vector3[],
    options: {
      toleranceMm?: number;
      angularToleranceDegrees?: number;
      optimization?: "performance" | "smoothness";
    },
    revision: string,
  ): Promise<RuntimeState> {
    await this.assertRevision(revision);
    if (pointsMm.length < 4) throw new Error("Constrained surface requires at least four points");
    if (normals.length !== pointsMm.length) throw new Error("Constrained surface requires one normal per point");
    if (new Set(pointsMm.map((point) => point.join(","))).size < 4) {
      throw new Error("Constrained surface requires at least four distinct points");
    }
    const normalizedNormals = normals.map((normal) => {
      const length = Math.hypot(...normal);
      if (!Number.isFinite(length) || length === 0) throw new Error("Each constrained-surface normal must be nonzero");
      return normal.map((value) => value / length) as Vector3;
    });
    const toleranceMm = options.toleranceMm ?? 0.01;
    if (!Number.isFinite(toleranceMm) || toleranceMm <= 0) throw new Error("Constrained-surface tolerance must be positive");
    const angularToleranceDegrees = options.angularToleranceDegrees ?? 5;
    if (!Number.isFinite(angularToleranceDegrees) || angularToleranceDegrees <= 0 || angularToleranceDegrees > 90) {
      throw new Error("Constrained-surface angular tolerance must be greater than zero and at most 90 degrees");
    }
    const optimizationName = options.optimization === "smoothness" ? "Smoothness" : "Performance";
    await this.runtime.mutate(`async function (Factory, Vector, ConstrainedSurfaceOptimizationType, args) {
      ${commandStart("ConstrainedSurfaceCommand")}
      factory.points = args.points.map(point => new Vector(...point));
      factory.normals = args.normals.map(normal => new Vector(...normal));
      factory.tolerance = args.tolerance;
      factory.angularToleranceDegrees = args.angularToleranceDegrees;
      factory.optimize = ConstrainedSurfaceOptimizationType[args.optimizationName];
      ${commandEnd}
    }`, ["ConstrainedSurfaceFactory", "Vector3", "ConstrainedSurfaceOptimizationType"], [{
      points: pointsMm.map(toMeters),
      normals: normalizedNormals,
      tolerance: millimetersToMeters(toleranceMm),
      angularToleranceDegrees,
      optimizationName,
    }]);
    return await this.state();
  }

  async deformBodiesBetweenFaces(
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
      throw new Error("Deformation body IDs must be a nonempty unique list");
    }
    const current = new Map(state.bodies.map((body) => [body.id, body]));
    const missing = ids.filter((id) => !current.has(id));
    if (missing.length > 0) throw new Error(`Unknown current deformation body IDs: ${missing.join(", ")}`);
    const invalid = ids.filter((id) => !["Solid", "Sheet"].includes(current.get(id)!.type));
    if (invalid.length > 0) throw new Error(`Face deformation requires current Solid or Sheet bodies: ${invalid.join(", ")}`);
    if (sourceFace.bodyId === targetFace.bodyId && sourceFace.faceId === targetFace.faceId) {
      throw new Error("Source and target deformation faces must be different");
    }
    requireTopologySelection(state, [sourceFace, targetFace], "face");
    const referenceBodyIds = new Set([sourceFace.bodyId, targetFace.bodyId]);
    const overlapping = ids.filter((id) => referenceBodyIds.has(id));
    if (overlapping.length > 0) {
      throw new Error(`Deformation bodies must be separate from source and target face bodies: ${overlapping.join(", ")}`);
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
          factory.faces = args.ids.flatMap(id => {
            const view = find(id);
            if (view.constructor.name !== 'Solid' && view.constructor.name !== 'Sheet') {
              throw new Error('Face deformation inputs must remain Solid or Sheet bodies');
            }
            return Array.from({ length: view.high.faces.length }, (_, index) => view.high.faces.get(index));
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
    }`, ["DeformFaceFactory", "DeformFaceCommand"], [{ ids, sourceFace, targetFace, options }]);
    return await this.state();
  }
}

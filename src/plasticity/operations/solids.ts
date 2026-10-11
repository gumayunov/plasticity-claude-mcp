import { type RuntimeState } from "../runtime.ts";
import { add, frameFromOriginNormalX, scale } from "../construction.ts";
import { millimetersToMeters } from "../units.ts";
import { type Vector3 } from "./types.ts";
import { findView, commandStart, commandEnd } from "./native-snippets.ts";
import { toMeters } from "./helpers.ts";
import { OperationsBase } from "./base.ts";

export abstract class SolidsOperations extends OperationsBase {
  async createBox(originMm: Vector3, sizeMm: Vector3, name?: string, revision?: string): Promise<RuntimeState> {
    if (revision) await this.assertRevision(revision);
    const origin = toMeters(originMm);
    const size = toMeters(sizeMm);
    await this.runtime.mutate(`async function (Factory, Vector, args) {
      ${commandStart("ThreePointBoxCommand")}
      const [x, y, z] = args.origin;
      const [width, depth, height] = args.size;
      factory.p1 = new Vector(x, y, z);
      factory.p2 = new Vector(x + width, y, z);
      factory.p3 = new Vector(x + width, y + depth, z);
      factory.p4 = new Vector(x + width, y + depth, z + height);
      const created = await factory.commit();
      if (args.name && created) for (const view of (Array.isArray(created) ? created : [created])) editor.db.nodes.setName(editor.db.nodes.item2key(view), args.name);
      return created;
      } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["ThreePointBoxFactory", "Vector3"], [{ origin, size, name: name ?? null }]);
    return await this.state();
  }

  async createSphere(centerMm: Vector3, radiusMm: number, name?: string, revision?: string): Promise<RuntimeState> {
    if (revision) await this.assertRevision(revision);
    await this.runtime.mutate(`async function (Factory, args) {
      ${commandStart("SphereCommand")}
      factory.center.fromArray(args.center);
      factory.radius = args.radius;
      const created = await factory.commit();
      if (args.name && created) for (const view of (Array.isArray(created) ? created : [created])) editor.db.nodes.setName(editor.db.nodes.item2key(view), args.name);
      return created;
      } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["PossiblyBooleanSphereFactory"], [{ center: toMeters(centerMm), radius: millimetersToMeters(radiusMm), name: name ?? null }]);
    return await this.state();
  }

  async createCylinder(centerMm: Vector3, radiusMm: number, heightMm: number, name?: string, revision?: string, axis: Vector3 = [0, 0, 1]): Promise<RuntimeState> {
    if (revision) await this.assertRevision(revision);
    await this.runtime.mutate(`async function (Factory, Vector, Quaternion, args) {
      ${commandStart("CylinderCommand")}
      factory.center.fromArray(args.center);
      factory.orientation.copy(new Quaternion().setFromUnitVectors(new Vector(0, 0, 1), new Vector(...args.axis).normalize()));
      factory.radius = args.radius;
      factory.height = args.height;
      const created = await factory.commit();
      if (args.name && created) for (const view of (Array.isArray(created) ? created : [created])) editor.db.nodes.setName(editor.db.nodes.item2key(view), args.name);
      return created;
      } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["PossiblyBooleanCylinderFactory", "Vector3", "Quaternion"], [{ center: toMeters(centerMm), radius: millimetersToMeters(radiusMm), height: millimetersToMeters(heightMm), name: name ?? null, axis }]);
    return await this.state();
  }

  async createCone(
    bottomCenterMm: Vector3,
    bottomRadiusMm: number,
    topRadiusMm: number,
    heightMm: number,
    axis: Vector3,
    radialDirection: Vector3,
    name: string | undefined,
    revision: string,
  ): Promise<RuntimeState> {
    await this.assertRevision(revision);
    if (!Number.isFinite(bottomRadiusMm) || bottomRadiusMm <= 0) throw new Error("Cone bottom radius must be positive");
    if (!Number.isFinite(topRadiusMm) || topRadiusMm < 0) throw new Error("Cone top radius must be nonnegative");
    if (!Number.isFinite(heightMm) || heightMm <= 0) throw new Error("Cone height must be positive");
    if (Math.abs(bottomRadiusMm - topRadiusMm) <= 1e-9) {
      throw new Error("Cone and frustum require unequal radii; use a cylinder for equal radii");
    }
    const frame = frameFromOriginNormalX(bottomCenterMm, axis, radialDirection);
    const bottomOuterMm = add(frame.originMm, scale(frame.xDirection, bottomRadiusMm));
    const topCenterMm = add(frame.originMm, scale(frame.normal, heightMm));
    const profilePointsMm = topRadiusMm === 0
      ? [frame.originMm, bottomOuterMm, topCenterMm]
      : [frame.originMm, bottomOuterMm, add(topCenterMm, scale(frame.xDirection, topRadiusMm)), topCenterMm];
    await this.runtime.mutate(`async function (CurveFactory, RevolveFactory, Vector, CurveType, args) {
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new this.commands.RevolveCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const existingRegionIds = new Set();
          for (const [versionId, item] of editor.geo.geometryModel) {
            if (!editor.geo.automatics.has(versionId) || item.view?.constructor?.name !== 'SketchIsland') continue;
            for (let index = 0; index < (item.view.regions?.length ?? 0); index += 1) {
              const region = item.view.regions.get(index);
              if (region) existingRegionIds.add(String(region.versionId));
            }
          }
          const profile = new CurveFactory(editor).resource(this);
          profile.points = args.points.map(point => new Vector(...point));
          profile.type = CurveType.Polyline;
          profile.closed = true;
          let profiles = await profile.commit();
          profiles = Array.isArray(profiles) ? profiles : [profiles];
          const regions = [];
          for (const [versionId, item] of editor.geo.geometryModel) {
            if (!editor.geo.automatics.has(versionId) || item.view?.constructor?.name !== 'SketchIsland') continue;
            for (let index = 0; index < (item.view.regions?.length ?? 0); index += 1) {
              const region = item.view.regions.get(index);
              if (region && !existingRegionIds.has(String(region.versionId))) regions.push(region);
            }
          }
          if (regions.length !== 1) throw new Error('Cone profile did not create exactly one native Region');
          const revolve = new RevolveFactory(editor).resource(this);
          revolve.regions = regions;
          revolve.origin.fromArray(args.center);
          revolve.axis.fromArray(args.axis).normalize();
          revolve.degrees = 360;
          let created = await revolve.commit();
          created = Array.isArray(created) ? created : [created];
          if (args.name) {
            for (const view of profiles) editor.db.nodes.setName(editor.db.nodes.item2key(view), args.name + ' profile');
            for (const view of created) editor.db.nodes.setName(editor.db.nodes.item2key(view), args.name);
          }
          return created;
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["CurveFactory", "RevolveFactory", "Vector3", "CurveType"], [{
      points: profilePointsMm.map(toMeters),
      center: toMeters(frame.originMm),
      axis: frame.normal,
      name: name ?? null,
    }]);
    return await this.state();
  }

  async createTorus(
    centerMm: Vector3,
    majorRadiusMm: number,
    minorRadiusMm: number,
    axis: Vector3,
    radialDirection: Vector3,
    name: string | undefined,
    revision: string,
  ): Promise<RuntimeState> {
    await this.assertRevision(revision);
    if (!Number.isFinite(minorRadiusMm) || minorRadiusMm <= 0) throw new Error("Torus minor radius must be positive");
    if (!Number.isFinite(majorRadiusMm) || majorRadiusMm <= minorRadiusMm) {
      throw new Error("Ring-torus major radius must be greater than its minor radius");
    }
    const frame = frameFromOriginNormalX(centerMm, axis, radialDirection);
    const profileCenterMm = add(frame.originMm, scale(frame.xDirection, majorRadiusMm));
    await this.runtime.mutate(`async function (CircleFactory, RevolveFactory, Vector, Quaternion, args) {
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new this.commands.RevolveCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const profile = new CircleFactory(editor).resource(this);
          profile.center.fromArray(args.profileCenter);
          profile.orientation.copy(new Quaternion().setFromUnitVectors(
            new Vector(0, 0, 1),
            new Vector(...args.profileNormal).normalize(),
          ));
          profile.point.copy(profile.center).add(new Vector(args.minorRadius, 0, 0).applyQuaternion(profile.orientation));
          let profiles = await profile.commit();
          profiles = Array.isArray(profiles) ? profiles : [profiles];
          const revolve = new RevolveFactory(editor).resource(this);
          revolve.curves = profiles;
          revolve.origin.fromArray(args.center);
          revolve.axis.fromArray(args.axis).normalize();
          revolve.degrees = 360;
          let created = await revolve.commit();
          created = Array.isArray(created) ? created : [created];
          if (args.name) {
            for (const view of profiles) editor.db.nodes.setName(editor.db.nodes.item2key(view), args.name + ' profile');
            for (const view of created) editor.db.nodes.setName(editor.db.nodes.item2key(view), args.name);
          }
          return created;
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["CenterCircleFactory", "RevolveFactory", "Vector3", "Quaternion"], [{
      center: toMeters(frame.originMm),
      profileCenter: toMeters(profileCenterMm),
      profileNormal: frame.yDirection,
      axis: frame.normal,
      minorRadius: millimetersToMeters(minorRadiusMm),
      name: name ?? null,
    }]);
    return await this.state();
  }

  async boolean(targetIds: number[], toolIds: number[], operation: "union" | "difference" | "intersection", keepTools: boolean, revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    if (targetIds.some((id) => toolIds.includes(id))) throw new Error("Target and tool IDs must not overlap");
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("BooleanCommand")}
      factory.targets = args.targetIds.map(find);
      factory.tools = args.toolIds.map(find);
      factory.operationType = ({ union: 15903, difference: 15902, intersection: 15901 })[args.operation];
      factory.keepTools = args.keepTools;
      ${commandEnd}
    }`, ["BooleanFactory"], [{ targetIds, toolIds, operation, keepTools }]);
    return await this.state();
  }

  async cutWithFaces(
    targetIds: number[],
    cutterFaces: Array<{ bodyId: number; faceId: string }>,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (targetIds.length === 0) throw new Error("At least one cut target is required");
    const uniqueTargetIds = [...new Set(targetIds)];
    if (uniqueTargetIds.length !== targetIds.length) throw new Error("Cut target IDs must be unique");
    if (cutterFaces.length === 0) throw new Error("At least one cutter face is required");
    const cutterKeys = cutterFaces.map((face) => `${face.bodyId}:${face.faceId}`);
    if (new Set(cutterKeys).size !== cutterKeys.length) throw new Error("Cutter face references must be unique");
    const cutterBodyIds = new Set(cutterFaces.map((face) => face.bodyId));
    if (uniqueTargetIds.some((id) => cutterBodyIds.has(id))) {
      throw new Error("Cut targets and cutter-face bodies must not overlap");
    }
    const invalidTargets = uniqueTargetIds.filter((id) => {
      const type = state.bodies.find((body) => body.id === id)?.type;
      return type !== "Solid" && type !== "Sheet";
    });
    if (invalidTargets.length > 0) {
      throw new Error(`Cut targets must be current Solid or Sheet bodies: ${invalidTargets.join(", ")}`);
    }
    const invalidCutters = cutterFaces.filter((reference) => {
      const body = state.bodies.find((candidate) => candidate.id === reference.bodyId);
      if (body?.type !== "Solid" && body?.type !== "Sheet") return true;
      return body.faces.find((face) => face.id === reference.faceId)?.planar !== true;
    });
    if (invalidCutters.length > 0) {
      throw new Error(`Cut requires current planar cutter faces: ${invalidCutters.map((face) => `${face.bodyId}:${face.faceId}`).join(", ")}`);
    }
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("CutCommand")}
      factory.shells = args.targetIds.map(find);
      factory.faces = args.cutterFaces.map(ref => {
        const view = find(ref.bodyId);
        const index = view.high.faces.versionIds.indexOf(ref.faceId);
        if (index < 0) throw new Error('Stale or unknown cutter face: ' + ref.faceId);
        return view.high.faces.get(index);
      });
      ${commandEnd}
    }`, ["MultiCutFactory"], [{ targetIds: uniqueTargetIds, cutterFaces }]);
    return await this.state();
  }

  async fillet(id: number, edgeIds: string[], radiusMm: number, revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("FilletShellCommand")}
      const view = find(args.id);
      const edges = view.high.edges;
      factory.shell = view;
      factory.edges = args.edgeIds.map(id => {
        const index = edges.versionIds.indexOf(id);
        if (index < 0) throw new Error('Stale or unknown edge: ' + id);
        return edges.get(index);
      });
      factory.distance = args.radius;
      ${commandEnd}
    }`, ["FilletShellFactory"], [{ id, edgeIds, radius: millimetersToMeters(radiusMm) }]);
    return await this.state();
  }

  async chamfer(id: number, edgeIds: string[], distanceMm: number, revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("FilletShellCommand")}
      const view = find(args.id);
      const edges = view.high.edges;
      factory.shell = view;
      factory.edges = args.edgeIds.map(id => {
        const index = edges.versionIds.indexOf(id);
        if (index < 0) throw new Error('Stale or unknown edge: ' + id);
        return edges.get(index);
      });
      factory.distance = args.distance;
      ${commandEnd}
    }`, ["FilletShellFactory"], [{ id, edgeIds, distance: -millimetersToMeters(distanceMm) }]);
    return await this.state();
  }

  async removeFillets(ids: number[], revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (ids.length === 0) throw new Error("At least one Solid or Sheet ID is required");
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) throw new Error("Shell body IDs must be unique");
    const invalid = uniqueIds.filter((id) => {
      const type = state.bodies.find((body) => body.id === id)?.type;
      return type !== "Solid" && type !== "Sheet";
    });
    if (invalid.length > 0) throw new Error(`Fillet removal requires current Solid or Sheet bodies: ${invalid.join(", ")}`);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("RemoveFilletsFromShellCommand")}
      factory.shells = args.ids.map(find);
      factory.radius = 0;
      ${commandEnd}
    }`, ["RemoveFilletsFromShellFactory"], [{ ids: uniqueIds }]);
    return await this.state();
  }

  async refilletFaces(faces: Array<{ bodyId: number; faceId: string }>, deltaMm: number, revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (faces.length === 0) throw new Error("At least one recognized fillet face is required");
    const keys = faces.map((face) => `${face.bodyId}:${face.faceId}`);
    if (new Set(keys).size !== keys.length) throw new Error("Fillet face references must be unique");
    if (!Number.isFinite(deltaMm) || deltaMm === 0) throw new Error("Refillet delta must be finite and nonzero");
    const selected = faces.map((reference) =>
      state.bodies.find((body) => body.id === reference.bodyId)?.faces.find((face) => face.id === reference.faceId));
    const missing = faces.filter((_reference, index) => !selected[index]);
    if (missing.length > 0) {
      throw new Error(`Stale or unknown faces: ${missing.map((face) => `${face.bodyId}:${face.faceId}`).join(", ")}`);
    }
    const unrecognized = faces.filter((_reference, index) => selected[index]!.blendRadiusMm === null);
    if (unrecognized.length > 0) {
      throw new Error(`Refillet requires recognized fillet faces: ${unrecognized.map((face) => `${face.bodyId}:${face.faceId}`).join(", ")}`);
    }
    const nonpositive = faces.filter((_reference, index) => selected[index]!.blendRadiusMm! + deltaMm <= 0);
    if (nonpositive.length > 0) throw new Error("Refillet delta must leave every selected face with a positive radius");
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
          const shells = new Set(args.faces.map(ref => find(ref.bodyId)));
          factory.shells = Array.from(shells);
          factory.faces = args.faces.map(ref => {
            const view = find(ref.bodyId);
            const index = view.high.faces.versionIds.indexOf(ref.faceId);
            if (index < 0) throw new Error('Stale or unknown fillet face: ' + ref.faceId);
            return view.high.faces.get(index);
          });
          factory.distance = args.distance;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["RefilletFaceCommand", "RefilletFaceFactory"], [{ faces, distance: millimetersToMeters(deltaMm) }]);
    return await this.state();
  }

  async extrudeFaces(id: number, faceIds: string[], distanceMm: number, revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("ExtrudeCommand")}
      const view = find(args.id);
      const faces = view.high.faces;
      factory.faces = args.faceIds.map(id => {
        const index = faces.versionIds.indexOf(id);
        if (index < 0) throw new Error('Stale or unknown face: ' + id);
        return faces.get(index);
      });
      factory.distance1 = args.distance;
      ${commandEnd}
    }`, ["ExtrudeFactory"], [{ id, faceIds, distance: millimetersToMeters(distanceMm) }]);
    return await this.state();
  }

  async extrudeProfile(id: number, distanceMm: number, revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("ExtrudeCommand")}
      const view = find(args.id);
      if (view.constructor.name !== 'Wire') throw new Error('Profile must be a Wire');
      const profileItem = Array.from(editor.geo.geometryModel.values()).find(item => item.view === view);
      if (!profileItem?.model?.IsClosed?.()) throw new Error('Profile must be a closed Wire');
      let basis;
      try { basis = editor.curves.lookup(view); } catch { throw new Error('Profile is not planar'); }
      const sketchEntry = Array.from(editor.curves.read.sketch2basis ?? [])
        .find(([, candidateBasis]) => candidateBasis === basis);
      const sketchId = Number(sketchEntry?.[0]);
      if (!Number.isInteger(sketchId)) throw new Error('Profile sketch is unavailable');
      const regions = [];
      for (const [versionId, item] of editor.geo.geometryModel) {
        if (!editor.geo.automatics.has(versionId) || item.view?.constructor?.name !== 'SketchIsland') continue;
        let candidateSketchId;
        try { candidateSketchId = Number(editor.sketches.getSketchId(item.view)); } catch { continue; }
        if (candidateSketchId !== sketchId) continue;
        for (let index = 0; index < (item.view.regions?.length ?? 0); index += 1) {
          const region = item.view.regions.get(index);
          if (region) regions.push(region);
        }
      }
      if (regions.length === 0) throw new Error('Profile is open or has no native region');
      if (regions.length > 1) throw new Error('Profile is ambiguous; use plasticity_list_regions and plasticity_extrude_regions');
      factory.regions = regions;
      factory.distance1 = args.distance;
      ${commandEnd}
    }`, ["ExtrudeFactory"], [{ id, distance: millimetersToMeters(distanceMm) }]);
    return await this.state();
  }

  async extrudeRegions(regionIds: string[], distanceMm: number, revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    if (regionIds.length === 0) throw new Error("At least one Region ID is required");
    const uniqueIds = [...new Set(regionIds)];
    if (uniqueIds.length !== regionIds.length) throw new Error("Region IDs must be unique");
    await this.runtime.mutate(`async function (Factory, args) {
      ${commandStart("ExtrudeCommand")}
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
      factory.distance1 = args.distance;
      ${commandEnd}
    }`, ["ExtrudeFactory"], [{ regionIds: uniqueIds, distance: millimetersToMeters(distanceMm) }]);
    return await this.state();
  }

  async imprintCurvesOnBody(
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
    if (uniqueIds.includes(targetId)) throw new Error("Imprint curves must not include the target body");
    const length = Math.hypot(...direction);
    if (!Number.isFinite(length) || length === 0) throw new Error("Imprint direction must be nonzero");
    const normalizedDirection = direction.map((value) => value / length) as Vector3;
    const completion = options.completion ?? "none";
    const completionName = ({ none: "None", edge: "Edge", "face-set": "FaceSet" } as const)[completion];
    if (!completionName) throw new Error(`Unsupported imprint completion: ${completion}`);
    await this.runtime.mutate(`async function (Factory, Vector, ProjectionMethod, ProjectionCompletionType, args) {
      ${findView}
      ${commandStart("ImprintCurveBodyCommand")}
      const target = find(args.targetId);
      if (target.constructor.name === 'Wire') throw new Error('Imprint target must be a surface body');
      const curves = args.curveIds.map(id => {
        const curve = find(id);
        if (curve.constructor.name !== 'Wire') throw new Error('Imprint inputs must be Wire bodies');
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
    }`, ["ImprintCurveBodyFactory", "Vector3", "ProjectionMethod", "ProjectionCompletionType"], [{
      targetId,
      curveIds: uniqueIds,
      direction: normalizedDirection,
      bidirectional: options.bidirectional ?? false,
      occlude: options.occlude ?? true,
      completionName,
    }]);
    return await this.state();
  }

  async imprintBodies(targetId: number, toolIds: number[], revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (toolIds.length === 0) throw new Error("At least one imprint tool body is required");
    const uniqueIds = [...new Set(toolIds)];
    if (uniqueIds.length !== toolIds.length) throw new Error("Imprint tool body IDs must be unique");
    if (uniqueIds.includes(targetId)) throw new Error("The imprint target cannot also be a tool body");
    const targetType = state.bodies.find((body) => body.id === targetId)?.type;
    if (targetType !== "Solid" && targetType !== "Sheet") {
      throw new Error(`Body imprint target must be a current Solid or Sheet: ${targetId}`);
    }
    const invalid = uniqueIds.filter((id) => {
      const type = state.bodies.find((body) => body.id === id)?.type;
      return type !== "Solid" && type !== "Sheet";
    });
    if (invalid.length > 0) throw new Error(`Body imprint tools must be current Solid or Sheet bodies: ${invalid.join(", ")}`);
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
          factory.target = find(args.targetId);
          factory.tools = args.toolIds.map(find);
          factory.imprintTool = false;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["ImprintBodyBodyCommand", "ImprintBodyBodyFactory"], [{ targetId, toolIds: uniqueIds }]);
    return await this.state();
  }

  async createPipes(spineIds: number[], diameterMm: number, wallThicknessMm: number, revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (spineIds.length === 0) throw new Error("At least one Wire spine ID is required");
    const uniqueIds = [...new Set(spineIds)];
    if (uniqueIds.length !== spineIds.length) throw new Error("Wire spine IDs must be unique");
    if (!Number.isFinite(diameterMm) || diameterMm <= 0) throw new Error("Pipe diameter must be positive");
    if (!Number.isFinite(wallThicknessMm) || wallThicknessMm < 0) throw new Error("Pipe wall thickness must be nonnegative");
    const invalid = uniqueIds.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalid.length > 0) throw new Error(`Pipe requires current Wire spines: ${invalid.join(", ")}`);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("PipeCommand")}
      const spines = args.spineIds.map(id => {
        const spine = find(id);
        if (spine.constructor.name !== 'Wire') throw new Error('Pipe inputs must be Wire bodies');
        return spine;
      });
      factory.spines = spines;
      factory.diameter = args.diameter;
      factory.thickness = args.thickness;
      ${commandEnd}
    }`, ["PipeFactory"], [{
      spineIds: uniqueIds,
      diameter: millimetersToMeters(diameterMm),
      thickness: millimetersToMeters(wallThicknessMm),
    }]);
    return await this.state();
  }

  async revolveProfile(
    id: number,
    axisOriginMm: Vector3,
    axis: Vector3,
    angleDegrees: number,
    revision: string,
  ): Promise<RuntimeState> {
    await this.assertRevision(revision);
    try {
      await this.runtime.mutate(`async function (Factory, args) {
        ${findView}
        ${commandStart("RevolveCommand")}
        const view = find(args.id);
        if (view.constructor.name !== 'Wire') throw new Error('Profile must be a Wire');
        factory.curves = [view];
        factory.origin.fromArray(args.axisOrigin);
        factory.axis.fromArray(args.axis).normalize();
        factory.degrees = args.angleDegrees;
        ${commandEnd}
      }`, ["RevolveFactory"], [{
        id,
        axisOrigin: toMeters(axisOriginMm),
        axis,
        angleDegrees,
      }]);
    } catch (error) {
      // Parasolid cannot spin a Wire edge that lies on the axis: it would sweep a surface of zero area.
      if (error instanceof Error && /PK_ERROR_impossible_spin/.test(error.message)) {
        throw new Error(`${error.message}. A profile edge lies on the revolve axis or the profile crosses it. For a solid of revolution, omit the edge on the axis and revolve an open Wire whose two endpoints lie on the axis; keep the whole profile on one side of the axis.`);
      }
      throw error;
    }
    return await this.state();
  }

  async hollowFaces(
    id: number,
    faceIds: string[],
    wallThicknessMm: number,
    direction: "inward" | "outward",
    revision: string,
  ): Promise<RuntimeState> {
    await this.assertRevision(revision);
    const signedThickness = direction === "inward" ? -wallThicknessMm : wallThicknessMm;
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("HollowFacesCommand")}
      const view = find(args.id);
      const faces = view.high.faces;
      factory.faces = args.faceIds.map(id => {
        const index = faces.versionIds.indexOf(id);
        if (index < 0) throw new Error('Stale or unknown face: ' + id);
        return faces.get(index);
      });
      factory.thickness = args.thickness;
      ${commandEnd}
    }`, ["HollowFacesFactory"], [{ id, faceIds, thickness: millimetersToMeters(signedThickness) }]);
    return await this.state();
  }

  async hollowSolids(
    ids: number[],
    wallThicknessMm: number,
    direction: "inward" | "outward",
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (ids.length === 0) throw new Error("At least one Solid is required for closed hollowing");
    if (new Set(ids).size !== ids.length) throw new Error("Closed-hollow Solid IDs must be unique");
    if (!Number.isFinite(wallThicknessMm) || wallThicknessMm <= 0) {
      throw new Error("Closed-hollow wall thickness must be positive");
    }
    if (direction !== "inward" && direction !== "outward") {
      throw new Error(`Unsupported closed-hollow direction: ${String(direction)}`);
    }
    const currentSolids = new Set(state.bodies.filter((body) => body.type === "Solid").map((body) => body.id));
    const invalid = ids.filter((id) => !currentSolids.has(id));
    if (invalid.length > 0) throw new Error(`Closed hollowing requires current Solids: ${invalid.join(", ")}`);
    const signedThickness = direction === "inward" ? -wallThicknessMm : wallThicknessMm;
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("HollowSolidsCommand")}
      const solids = args.ids.map(find);
      for (const view of solids) {
        if (view.constructor.name !== 'Solid') throw new Error('Closed hollowing inputs must be Solids');
      }
      factory.solids = solids;
      factory.thickness = args.thickness;
      factory.local = false;
      ${commandEnd}
    }`, ["HollowSolidsFactory"], [{ ids, thickness: millimetersToMeters(signedThickness) }]);
    return await this.state();
  }
}

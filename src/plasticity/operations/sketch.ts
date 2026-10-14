import { resolve } from "node:path";
import { type RuntimeState } from "../runtime.ts";
import { add, dot, frameFromOriginNormalX, localPointToWorld, normalize, scale, subtract } from "../construction.ts";
import { type ReferenceIdentity } from "../references.ts";
import { degreesToRadians, millimetersToMeters } from "../units.ts";
import { type Vector3, type Vector2, type CurveSegmentReference, type CurveSegmentEndpointReference, type VertexReference, type CreateTextInput } from "./types.ts";
import { findView, commandStart, commandEnd } from "./native-snippets.ts";
import { toMeters, threePointCircleGeometry, vectorsNear } from "./helpers.ts";
import { OperationsBase } from "./base.ts";
import type { ConstructionOperations } from "./construction.ts";
import type { CurveQueryOperations } from "./curve-query.ts";

export abstract class SketchOperations extends OperationsBase {
  declare listCurveDirections: CurveQueryOperations["listCurveDirections"];
  declare listCurveVertices: CurveQueryOperations["listCurveVertices"];
  declare resolveCurrentPlane: ConstructionOperations["resolveCurrentPlane"];
  async createPolyline(
    pointsMm: Vector3[] | Vector2[],
    closed: boolean,
    revision?: string,
    plane?: ReferenceIdentity,
  ): Promise<RuntimeState> {
    let worldPoints: Vector3[];
    if (plane) {
      const resolvedPlane = await this.resolveCurrentPlane(plane, revision);
      worldPoints = pointsMm.map((point) => {
        if (point.length !== 2) throw new Error("Plane-local polyline points must contain two coordinates");
        return localPointToWorld(resolvedPlane, point);
      });
    } else {
      if (pointsMm.some((point) => point.length !== 3)) throw new Error("World-space polyline points must contain three coordinates");
      if (revision) await this.assertRevision(revision);
      worldPoints = pointsMm as Vector3[];
    }
    await this.runtime.mutate(`async function (Factory, Vector, CurveType, args) {
      ${commandStart("CurveCommand")}
      factory.points = args.points.map(point => new Vector(...point));
      factory.type = CurveType.Polyline;
      factory.closed = args.closed;
      ${commandEnd}
    }`, ["CurveFactory", "Vector3", "CurveType"], [{ points: worldPoints.map(toMeters), closed }]);
    return await this.state();
  }

  async createNurbsCurve(pointsMm: Vector3[], closed: boolean, revision?: string): Promise<RuntimeState> {
    if (pointsMm.length < 3) throw new Error("NURBS curve requires at least three interpolation points");
    if (revision) await this.assertRevision(revision);
    await this.runtime.mutate(`async function (Factory, Vector, CurveType, args) {
      ${commandStart("CurveCommand")}
      factory.points = args.points.map(point => new Vector(...point));
      factory.type = CurveType.NURBS;
      factory.closed = args.closed;
      ${commandEnd}
    }`, ["CurveFactory", "Vector3", "CurveType"], [{ points: pointsMm.map(toMeters), closed }]);
    return await this.state();
  }

  async createHelix(
    axisStartMm: Vector3,
    axisEndMm: Vector3,
    radiusMm: number,
    turns: number,
    radialDirection: Vector3,
    handedness: "right" | "left",
    revision?: string,
  ): Promise<RuntimeState> {
    if (revision) await this.assertRevision(revision);
    if (!Number.isFinite(radiusMm) || radiusMm <= 0) throw new Error("Helix radius must be positive");
    if (!Number.isFinite(turns) || turns <= 0) throw new Error("Helix turns must be positive");
    const axis = axisEndMm.map((value, index) => value - axisStartMm[index]!) as Vector3;
    const axisLength = Math.hypot(...axis);
    if (!(axisLength > 1e-9)) throw new Error("Helix axis must have nonzero length");
    const axisUnit = axis.map((value) => value / axisLength) as Vector3;
    const projection = radialDirection.reduce((sum, value, index) => sum + value * axisUnit[index]!, 0);
    const radial = radialDirection.map((value, index) => value - projection * axisUnit[index]!) as Vector3;
    const radialLength = Math.hypot(...radial);
    if (!(radialLength > 1e-9)) throw new Error("Helix radial direction must not be parallel to its axis");
    const radiusPointMm = axisEndMm.map((value, index) => value + radial[index]! / radialLength * radiusMm) as Vector3;
    await this.runtime.mutate(`async function (Factory, Vector, args) {
      ${commandStart("SpiralCommand")}
      factory.p1 = new Vector(...args.axisStart);
      factory.p2 = new Vector(...args.axisEnd);
      factory.p3 = new Vector(...args.radiusPoint);
      factory.radius = args.radius;
      factory.turns = args.turns;
      factory.spiralPitch = 0;
      factory.handedness = args.handedness;
      ${commandEnd}
    }`, ["SpiralFactory", "Vector3"], [{
      axisStart: toMeters(axisStartMm),
      axisEnd: toMeters(axisEndMm),
      radiusPoint: toMeters(radiusPointMm),
      radius: millimetersToMeters(radiusMm),
      turns,
      handedness: handedness === "right",
    }]);
    return await this.state();
  }

  async createCircle(
    centerMm: Vector3 | Vector2,
    radiusMm: number,
    revision?: string,
    normal: Vector3 = [0, 0, 1],
    plane?: ReferenceIdentity,
  ): Promise<RuntimeState> {
    let worldCenter: Vector3;
    let worldNormal = normal;
    if (plane) {
      if (centerMm.length !== 2) throw new Error("Plane-local circle centers must contain two coordinates");
      const resolvedPlane = await this.resolveCurrentPlane(plane, revision);
      worldCenter = localPointToWorld(resolvedPlane, centerMm);
      worldNormal = resolvedPlane.normal;
    } else {
      if (centerMm.length !== 3) throw new Error("World-space circle centers must contain three coordinates");
      if (revision) await this.assertRevision(revision);
      worldCenter = centerMm;
    }
    await this.runtime.mutate(`async function (Factory, Vector, Quaternion, args) {
      ${commandStart("CenterCircleCommand")}
      factory.center.fromArray(args.center);
      factory.orientation.copy(new Quaternion().setFromUnitVectors(new Vector(0, 0, 1), new Vector(...args.normal).normalize()));
      factory.point.copy(factory.center).add(new Vector(args.radius, 0, 0).applyQuaternion(factory.orientation));
      ${commandEnd}
    }`, ["CenterCircleFactory", "Vector3", "Quaternion"], [{ center: toMeters(worldCenter), radius: millimetersToMeters(radiusMm), normal: worldNormal }]);
    return await this.state();
  }

  async createTwoPointCircle(
    diameterStartMm: Vector3 | Vector2,
    diameterEndMm: Vector3 | Vector2,
    revision?: string,
    normal: Vector3 = [0, 0, 1],
    plane?: ReferenceIdentity,
  ): Promise<RuntimeState> {
    let diameterStart: Vector3;
    let diameterEnd: Vector3;
    let worldNormal: Vector3;
    if (plane) {
      if (diameterStartMm.length !== 2 || diameterEndMm.length !== 2) {
        throw new Error("Plane-local two-point circle endpoints must contain two coordinates");
      }
      const resolvedPlane = await this.resolveCurrentPlane(plane, revision);
      diameterStart = localPointToWorld(resolvedPlane, diameterStartMm);
      diameterEnd = localPointToWorld(resolvedPlane, diameterEndMm);
      worldNormal = normalize(resolvedPlane.normal, "Two-point circle plane normal");
    } else {
      if (diameterStartMm.length !== 3 || diameterEndMm.length !== 3) {
        throw new Error("World-space two-point circle endpoints must contain three coordinates");
      }
      if (revision) await this.assertRevision(revision);
      diameterStart = diameterStartMm;
      diameterEnd = diameterEndMm;
      worldNormal = normalize(normal, "Two-point circle plane normal");
    }
    const diameter = subtract(diameterEnd, diameterStart);
    const diameterLength = Math.hypot(...diameter);
    if (diameterLength <= 1e-9) throw new Error("Two-point circle diameter endpoints must be distinct");
    if (Math.abs(dot(diameter, worldNormal)) > diameterLength * 1e-9) {
      throw new Error("Two-point circle plane normal must be perpendicular to its diameter");
    }
    await this.runtime.mutate(`async function (Factory, Vector, Quaternion, args) {
      ${commandStart("TwoPointCircleCommand")}
      factory.isKnife = false;
      factory.orientation.copy(new Quaternion().setFromUnitVectors(new Vector(0, 0, 1), new Vector(...args.normal).normalize()));
      factory.p1.fromArray(args.diameterStart);
      factory.p2.fromArray(args.diameterEnd);
      ${commandEnd}
    }`, ["KnifeTwoPointCircleFactory", "Vector3", "Quaternion"], [{
      diameterStart: toMeters(diameterStart),
      diameterEnd: toMeters(diameterEnd),
      normal: worldNormal,
    }]);
    return await this.state();
  }

  async createThreePointCircle(
    firstMm: Vector3 | Vector2,
    secondMm: Vector3 | Vector2,
    thirdMm: Vector3 | Vector2,
    revision?: string,
    plane?: ReferenceIdentity,
  ): Promise<RuntimeState> {
    let first: Vector3;
    let second: Vector3;
    let third: Vector3;
    if (plane) {
      if (firstMm.length !== 2 || secondMm.length !== 2 || thirdMm.length !== 2) {
        throw new Error("Plane-local three-point circle points must contain two coordinates");
      }
      const resolvedPlane = await this.resolveCurrentPlane(plane, revision);
      first = localPointToWorld(resolvedPlane, firstMm);
      second = localPointToWorld(resolvedPlane, secondMm);
      third = localPointToWorld(resolvedPlane, thirdMm);
    } else {
      if (firstMm.length !== 3 || secondMm.length !== 3 || thirdMm.length !== 3) {
        throw new Error("World-space three-point circle points must contain three coordinates");
      }
      if (revision) await this.assertRevision(revision);
      first = firstMm;
      second = secondMm;
      third = thirdMm;
    }
    threePointCircleGeometry(first, second, third, "Three-point circle");
    await this.runtime.mutate(`async function (Factory, args) {
      ${commandStart("ThreePointCircleCommand")}
      factory.isKnife = false;
      factory.p1.fromArray(args.first);
      factory.p2.fromArray(args.second);
      factory.p3.fromArray(args.third);
      ${commandEnd}
    }`, ["KnifeThreePointCircleFactory"], [{
      first: toMeters(first),
      second: toMeters(second),
      third: toMeters(third),
    }]);
    return await this.state();
  }

  async createCenterArc(
    centerMm: Vector3 | Vector2,
    radiusMm: number,
    startAngleDegrees: number,
    sweepAngleDegrees: number,
    revision?: string,
    normal: Vector3 = [0, 0, 1],
    xDirection: Vector3 = [1, 0, 0],
    plane?: ReferenceIdentity,
  ): Promise<RuntimeState> {
    if (!Number.isFinite(radiusMm) || radiusMm <= 0) throw new Error("Arc radius must be positive");
    if (!Number.isFinite(startAngleDegrees)) throw new Error("Arc start angle must be finite");
    if (!Number.isFinite(sweepAngleDegrees) || sweepAngleDegrees === 0 || Math.abs(sweepAngleDegrees) >= 360) {
      throw new Error("Arc sweep angle must be nonzero and have magnitude less than 360 degrees");
    }
    let worldCenter: Vector3;
    let baseX: Vector3;
    let baseY: Vector3;
    let worldNormal: Vector3;
    if (plane) {
      if (centerMm.length !== 2) throw new Error("Plane-local arc centers must contain two coordinates");
      const resolvedPlane = await this.resolveCurrentPlane(plane, revision);
      worldCenter = localPointToWorld(resolvedPlane, centerMm);
      baseX = resolvedPlane.xDirection;
      baseY = resolvedPlane.yDirection;
      worldNormal = resolvedPlane.normal;
    } else {
      if (centerMm.length !== 3) throw new Error("World-space arc centers must contain three coordinates");
      if (revision) await this.assertRevision(revision);
      const frame = frameFromOriginNormalX(centerMm, normal, xDirection);
      worldCenter = frame.originMm;
      baseX = frame.xDirection;
      baseY = frame.yDirection;
      worldNormal = frame.normal;
    }
    const pointAt = (degrees: number): Vector3 => {
      const radians = degreesToRadians(degrees);
      return add(worldCenter, scale(add(scale(baseX, Math.cos(radians)), scale(baseY, Math.sin(radians))), radiusMm));
    };
    const start = pointAt(startAngleDegrees);
    const end = pointAt(startAngleDegrees + sweepAngleDegrees);
    await this.runtime.mutate(`async function (Factory, Vector, Quaternion, args) {
      ${commandStart("CenterPointArcCommand")}
      factory.isKnife = false;
      factory.center.fromArray(args.center);
      factory.orientation.copy(new Quaternion().setFromUnitVectors(new Vector(0, 0, 1), new Vector(...args.normal).normalize()));
      factory.p2.fromArray(args.start);
      factory.p3.fromArray(args.end);
      factory.lastSense = true;
      ${commandEnd}
    }`, ["KnifeCenterPointArcFactory", "Vector3", "Quaternion"], [{
      center: toMeters(worldCenter),
      start: toMeters(start),
      end: toMeters(end),
      normal: sweepAngleDegrees > 0 ? worldNormal : scale(worldNormal, -1),
    }]);
    return await this.state();
  }

  async createThreePointArc(
    startMm: Vector3 | Vector2,
    throughMm: Vector3 | Vector2,
    endMm: Vector3 | Vector2,
    revision?: string,
    plane?: ReferenceIdentity,
  ): Promise<RuntimeState> {
    let start: Vector3;
    let through: Vector3;
    let end: Vector3;
    if (plane) {
      if (startMm.length !== 2 || throughMm.length !== 2 || endMm.length !== 2) {
        throw new Error("Plane-local three-point arc points must contain two coordinates");
      }
      const resolvedPlane = await this.resolveCurrentPlane(plane, revision);
      start = localPointToWorld(resolvedPlane, startMm);
      through = localPointToWorld(resolvedPlane, throughMm);
      end = localPointToWorld(resolvedPlane, endMm);
    } else {
      if (startMm.length !== 3 || throughMm.length !== 3 || endMm.length !== 3) {
        throw new Error("World-space three-point arc points must contain three coordinates");
      }
      if (revision) await this.assertRevision(revision);
      start = startMm;
      through = throughMm;
      end = endMm;
    }
    const { center, normal } = threePointCircleGeometry(start, through, end, "Three-point arc");
    await this.runtime.mutate(`async function (Factory, Vector, Quaternion, args) {
      ${commandStart("ThreePointArcCommand")}
      factory.isKnife = false;
      factory.center.fromArray(args.center);
      factory.orientation.copy(new Quaternion().setFromUnitVectors(new Vector(0, 0, 1), new Vector(...args.normal).normalize()));
      factory.p2.fromArray(args.start);
      factory.p3.fromArray(args.end);
      factory.lastSense = true;
      ${commandEnd}
    }`, ["KnifeCenterPointArcFactory", "Vector3", "Quaternion"], [{
      center: toMeters(center),
      start: toMeters(start),
      end: toMeters(end),
      normal,
    }]);
    return await this.state();
  }

  async createTangentArc(
    bodyId: number,
    segmentEntityId: number,
    startAt: "start" | "end",
    endMm: Vector3 | Vector2,
    flipTangent: boolean,
    revision: string,
    plane?: ReferenceIdentity,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (state.bodies.find((body) => body.id === bodyId)?.type !== "Wire") {
      throw new Error(`Tangent arc requires a current Wire body: ${bodyId}`);
    }
    if (!Number.isInteger(segmentEntityId) || segmentEntityId <= 0) {
      throw new Error("Tangent arc segment entity ID must be a positive integer");
    }
    let worldEnd: Vector3;
    if (plane) {
      if (endMm.length !== 2) throw new Error("Plane-local tangent arc end must contain two coordinates");
      const resolvedPlane = await this.resolveCurrentPlane(plane, revision);
      worldEnd = localPointToWorld(resolvedPlane, endMm);
    } else {
      if (endMm.length !== 3) throw new Error("World-space tangent arc end must contain three coordinates");
      worldEnd = endMm;
    }
    await this.runtime.mutate(`async function (Factory, Vector, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const wire = find(args.bodyId);
      if (wire?.constructor?.name !== 'Wire') throw new Error('Tangent arc source is no longer a Wire');
      let segment;
      let edge;
      for (const candidate of Array.from(wire.segments ?? [])) {
        const model = editor.db.lookupTopologyItem(candidate);
        if (Number(model?.Id?.()) !== args.segmentEntityId) continue;
        segment = candidate;
        edge = model;
        break;
      }
      if (!segment || !edge) throw new Error('Stale or unknown tangent arc segment: ' + args.segmentEntityId);
      const parameter = args.startAt === 'start' ? 0 : 1;
      const anchor = edge.GetPointAndTangent(parameter);
      const endpoint = new Vector(...args.end);
      const dx = endpoint.x - anchor.position.x;
      const dy = endpoint.y - anchor.position.y;
      const dz = endpoint.z - anchor.position.z;
      const distanceSquared = dx * dx + dy * dy + dz * dz;
      if (distanceSquared <= 1e-24) throw new Error('Tangent arc end must differ from its source endpoint');
      const tangent = anchor.tangent;
      const cx = tangent.y * dz - tangent.z * dy;
      const cy = tangent.z * dx - tangent.x * dz;
      const cz = tangent.x * dy - tangent.y * dx;
      if (cx * cx + cy * cy + cz * cz <= 1e-24 * distanceSquared) {
        throw new Error('Tangent arc end must not lie on the source tangent line');
      }
      let failure;
      const command = new editor.commands.TangentArcCommand(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.segment = segment;
          factory.point1.copy(anchor.position);
          factory.point2.copy(endpoint);
          factory.flipTangent = args.flipTangent;
          return await factory.commit();
        } catch (error) {
          failure = error;
          throw error;
        }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["TangentArcFactory", "Vector3"], [{
      bodyId,
      segmentEntityId,
      startAt,
      end: toMeters(worldEnd),
      flipTangent,
    }]);
    return await this.state();
  }

  async createTangentCircle(
    first: CurveSegmentReference,
    second: CurveSegmentReference,
    solutionPointMm: Vector3 | Vector2,
    radiusMm: number,
    revision: string,
    normal: Vector3 = [0, 0, 1],
    plane?: ReferenceIdentity,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (first.bodyId === second.bodyId && first.segmentEntityId === second.segmentEntityId) {
      throw new Error("Tangent-circle segment references must be different");
    }
    if (!Number.isFinite(radiusMm) || radiusMm <= 0) throw new Error("Tangent-circle radius must be positive");
    const invalidBodies = [first, second].filter((reference) =>
      state.bodies.find((body) => body.id === reference.bodyId)?.type !== "Wire");
    if (invalidBodies.length > 0) {
      throw new Error(`Tangent circle requires current Wire bodies: ${invalidBodies.map((reference) => reference.bodyId).join(", ")}`);
    }

    let worldSolutionPoint: Vector3;
    let worldNormal: Vector3;
    if (plane) {
      if (solutionPointMm.length !== 2) throw new Error("Plane-local tangent-circle solution points must contain two coordinates");
      const resolvedPlane = await this.resolveCurrentPlane(plane, revision);
      worldSolutionPoint = localPointToWorld(resolvedPlane, solutionPointMm);
      worldNormal = resolvedPlane.normal;
    } else {
      if (solutionPointMm.length !== 3) throw new Error("World-space tangent-circle solution points must contain three coordinates");
      worldSolutionPoint = solutionPointMm;
      worldNormal = normalize(normal, "Tangent-circle plane normal");
    }

    const report = await this.listCurveDirections();
    if (report.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${report.revision}`);
    }
    for (const reference of [first, second]) {
      const curve = report.curves.find((candidate) => candidate.id === reference.bodyId);
      if (!curve?.segments.some((segment) => segment.entityId === reference.segmentEntityId)) {
        throw new Error(`Stale or unknown tangent-circle segment: ${reference.bodyId}:${reference.segmentEntityId}`);
      }
    }

    await this.runtime.mutate(`async function (Factory, Command, Vector, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const segment = reference => {
        const wire = find(reference.bodyId);
        if (wire?.constructor?.name !== 'Wire') throw new Error('Tangent-circle source is no longer a Wire');
        for (const candidate of Array.from(wire.segments ?? [])) {
          const edge = editor.db.lookupTopologyItem(candidate);
          if (Number(edge?.Id?.()) === reference.segmentEntityId) return candidate;
        }
        throw new Error('Stale or unknown tangent-circle segment: ' + reference.bodyId + ':' + reference.segmentEntityId);
      };
      editor.selection.selected.removeAll();
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.segment1 = segment(args.first);
          factory.segment2 = segment(args.second);
          factory.point.copy(new Vector(...args.solutionPoint));
          factory.normal.copy(new Vector(...args.normal));
          factory.radius = args.radius;
          return await factory.commit();
        } catch (error) {
          failure = error;
          throw error;
        }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["TangentCircleFactory", "TangentCircleCommand", "Vector3"], [{
      first,
      second,
      solutionPoint: toMeters(worldSolutionPoint),
      normal: worldNormal,
      radius: millimetersToMeters(radiusMm),
    }]);
    return await this.state();
  }

  async bridgeCurves(
    first: CurveSegmentEndpointReference,
    second: CurveSegmentEndpointReference,
    startContinuity: "G0" | "G1" | "G2" | "G3",
    endContinuity: "G0" | "G1" | "G2" | "G3",
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    const references = [first, second];
    const invalidBodies = references.filter((reference) =>
      state.bodies.find((body) => body.id === reference.bodyId)?.type !== "Wire");
    if (invalidBodies.length > 0) {
      throw new Error(`Curve Bridge requires current Wire bodies: ${invalidBodies.map((reference) => reference.bodyId).join(", ")}`);
    }
    if (first.bodyId === second.bodyId && first.segmentEntityId === second.segmentEntityId && first.at === second.at) {
      throw new Error("Curve Bridge endpoint references must be different");
    }
    const report = await this.listCurveDirections();
    if (report.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${report.revision}`);
    }
    const resolve = (reference: CurveSegmentEndpointReference): Vector3 => {
      const curve = report.curves.find((candidate) => candidate.id === reference.bodyId);
      const segment = curve?.segments.find((candidate) => candidate.entityId === reference.segmentEntityId);
      if (!segment) throw new Error(`Stale or unknown Curve Bridge segment: ${reference.bodyId}:${reference.segmentEntityId}`);
      return reference.at === "start" ? segment.startMm : segment.endMm;
    };
    const firstPoint = resolve(first);
    const secondPoint = resolve(second);
    if (dot(subtract(secondPoint, firstPoint), subtract(secondPoint, firstPoint)) <= 1e-18) {
      throw new Error("Curve Bridge endpoints must be distinct");
    }
    await this.runtime.mutate(`async function (Factory, Continuity, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const segment = reference => {
        const wire = find(reference.bodyId);
        if (wire?.constructor?.name !== 'Wire') throw new Error('Curve Bridge source is no longer a Wire');
        for (const candidate of Array.from(wire.segments ?? [])) {
          const edge = editor.db.lookupTopologyItem(candidate);
          if (Number(edge?.Id?.()) === reference.segmentEntityId) return candidate;
        }
        throw new Error('Stale or unknown Curve Bridge segment: ' + reference.bodyId + ':' + reference.segmentEntityId);
      };
      let failure;
      const command = new editor.commands.BridgeCurveCommand(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.start = segment(args.first);
          factory.t1 = args.first.at === 'start' ? 0 : 1;
          factory.end = segment(args.second);
          factory.t2 = args.second.at === 'start' ? 0 : 1;
          factory.startCurvature = Continuity[args.startContinuity];
          factory.endCurvature = Continuity[args.endContinuity];
          factory.trim = false;
          factory.pickClosestSenses();
          return await factory.commit();
        } catch (error) {
          failure = error;
          throw error;
        }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["BridgeCurveFactory", "ContinuityType"], [{
      first,
      second,
      startContinuity,
      endContinuity,
    }]);
    return await this.state();
  }

  async bridgeCurveVertices(
    first: VertexReference,
    second: VertexReference,
    startContinuity: "G0" | "G1" | "G2" | "G3",
    endContinuity: "G0" | "G1" | "G2" | "G3",
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (first.bodyId === second.bodyId && first.vertexId === second.vertexId) {
      throw new Error("Curve Vertex Bridge endpoint references must be different");
    }
    const bodies = new Map(state.bodies.map((body) => [body.id, body]));
    const references = [first, second];
    const missingBodies = references.filter((reference) => !bodies.has(reference.bodyId));
    if (missingBodies.length > 0) {
      throw new Error(`Unknown current Curve Vertex Bridge body IDs: ${missingBodies.map((reference) => reference.bodyId).join(", ")}`);
    }
    const invalidBodies = references.filter((reference) => bodies.get(reference.bodyId)!.type !== "Wire");
    if (invalidBodies.length > 0) {
      throw new Error(`Curve Vertex Bridge requires current Wire bodies: ${invalidBodies.map((reference) => reference.bodyId).join(", ")}`);
    }
    const inventory = await this.listCurveVertices();
    if (inventory.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${inventory.revision}`);
    }
    const resolved = references.map((reference) => {
      const vertex = inventory.vertices.find((candidate) =>
        candidate.bodyId === reference.bodyId && candidate.vertexId === reference.vertexId);
      if (!vertex) {
        throw new Error(`Stale or unknown Curve Vertex Bridge vertex: ${reference.bodyId}:${reference.vertexId}`);
      }
      if (!vertex.endpoint) {
        throw new Error(`Curve Vertex Bridge requires an open Wire endpoint: ${reference.bodyId}:${reference.vertexId}`);
      }
      return vertex;
    });
    const delta = subtract(resolved[1]!.positionMm, resolved[0]!.positionMm);
    if (dot(delta, delta) <= 1e-18) throw new Error("Curve Vertex Bridge endpoints must be distinct");

    await this.runtime.mutate(`async function (Factory, Command, Continuity, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const vertex = reference => {
        const wire = find(reference.bodyId);
        if (wire?.constructor?.name !== 'Wire') throw new Error('Curve Vertex Bridge source is no longer a Wire');
        for (const candidate of Array.from(wire.vertices ?? [])) {
          const model = editor.db.lookupTopologyItem(candidate);
          if (Number(model?.Id?.()) === reference.vertexId) return candidate;
        }
        throw new Error('Stale or unknown Curve Vertex Bridge vertex: ' + reference.bodyId + ':' + reference.vertexId);
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
          factory.vertex1 = vertex(args.first);
          factory.vertex2 = vertex(args.second);
          if (!matches(factory.startPosition, args.firstPosition) || !matches(factory.endPosition, args.secondPosition)) {
            throw new Error('Requested Curve Vertex Bridge endpoints are unavailable');
          }
          factory.startCurvature = Continuity[args.startContinuity];
          factory.endCurvature = Continuity[args.endContinuity];
          factory.lockDistances = true;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["BridgeVertexFactory", "BridgeVertexCommand", "ContinuityType"], [{
      first,
      second,
      firstPosition: toMeters(resolved[0]!.positionMm),
      secondPosition: toMeters(resolved[1]!.positionMm),
      startContinuity,
      endContinuity,
    }]);
    return await this.state();
  }

  async createEllipse(
    centerMm: Vector3 | Vector2,
    majorRadiusMm: number,
    minorRadiusMm: number,
    revision?: string,
    normal: Vector3 = [0, 0, 1],
    xDirection: Vector3 = [1, 0, 0],
    plane?: ReferenceIdentity,
    angleDegrees = 0,
  ): Promise<RuntimeState> {
    if (!Number.isFinite(majorRadiusMm) || majorRadiusMm <= 0) throw new Error("Ellipse major radius must be positive");
    if (!Number.isFinite(minorRadiusMm) || minorRadiusMm <= 0) throw new Error("Ellipse minor radius must be positive");
    if (minorRadiusMm > majorRadiusMm) throw new Error("Ellipse minor radius must not exceed its major radius");
    if (!Number.isFinite(angleDegrees)) throw new Error("Ellipse angle must be finite");
    let worldCenter: Vector3;
    let baseX: Vector3;
    let baseY: Vector3;
    let worldNormal: Vector3;
    if (plane) {
      if (centerMm.length !== 2) throw new Error("Plane-local ellipse centers must contain two coordinates");
      const resolvedPlane = await this.resolveCurrentPlane(plane, revision);
      worldCenter = localPointToWorld(resolvedPlane, centerMm);
      baseX = resolvedPlane.xDirection;
      baseY = resolvedPlane.yDirection;
      worldNormal = resolvedPlane.normal;
    } else {
      if (centerMm.length !== 3) throw new Error("World-space ellipse centers must contain three coordinates");
      if (revision) await this.assertRevision(revision);
      const frame = frameFromOriginNormalX(centerMm, normal, xDirection);
      worldCenter = frame.originMm;
      baseX = frame.xDirection;
      baseY = frame.yDirection;
      worldNormal = frame.normal;
    }
    const radians = degreesToRadians(angleDegrees);
    const majorDirection = add(scale(baseX, Math.cos(radians)), scale(baseY, Math.sin(radians)));
    const minorDirection = add(scale(baseY, Math.cos(radians)), scale(baseX, -Math.sin(radians)));
    const majorPoint = add(worldCenter, scale(majorDirection, majorRadiusMm));
    const minorPoint = add(worldCenter, scale(minorDirection, minorRadiusMm));
    await this.runtime.mutate(`async function (Factory, Vector, Quaternion, args) {
      ${commandStart("EllipseCommand")}
      factory.isKnife = false;
      factory.center.fromArray(args.center);
      factory.orientation.copy(new Quaternion().setFromUnitVectors(new Vector(0, 0, 1), new Vector(...args.normal).normalize()));
      factory.point1.fromArray(args.majorPoint);
      factory.point2.fromArray(args.minorPoint);
      ${commandEnd}
    }`, ["KnifeEllipseFactory", "Vector3", "Quaternion"], [{
      center: toMeters(worldCenter),
      majorPoint: toMeters(majorPoint),
      minorPoint: toMeters(minorPoint),
      normal: worldNormal,
    }]);
    return await this.state();
  }

  async createRegularPolygon(
    centerMm: Vector3 | Vector2,
    radiusMm: number,
    radiusMode: "circumradius" | "inradius",
    vertexCount: number,
    revision?: string,
    normal: Vector3 = [0, 0, 1],
    xDirection: Vector3 = [1, 0, 0],
    plane?: ReferenceIdentity,
    angleDegrees = 0,
  ): Promise<RuntimeState> {
    if (!Number.isFinite(radiusMm) || radiusMm <= 0) throw new Error("Polygon radius must be positive");
    if (!Number.isInteger(vertexCount) || vertexCount < 3 || vertexCount > 256) throw new Error("Polygon vertex count must be an integer from 3 to 256");
    if (radiusMode !== "circumradius" && radiusMode !== "inradius") throw new Error(`Unsupported polygon radius mode: ${String(radiusMode)}`);
    if (!Number.isFinite(angleDegrees)) throw new Error("Polygon angle must be finite");
    let worldCenter: Vector3;
    let baseX: Vector3;
    let baseY: Vector3;
    let worldNormal: Vector3;
    if (plane) {
      if (centerMm.length !== 2) throw new Error("Plane-local polygon centers must contain two coordinates");
      const resolvedPlane = await this.resolveCurrentPlane(plane, revision);
      worldCenter = localPointToWorld(resolvedPlane, centerMm);
      baseX = resolvedPlane.xDirection;
      baseY = resolvedPlane.yDirection;
      worldNormal = resolvedPlane.normal;
    } else {
      if (centerMm.length !== 3) throw new Error("World-space polygon centers must contain three coordinates");
      if (revision) await this.assertRevision(revision);
      const frame = frameFromOriginNormalX(centerMm, normal, xDirection);
      worldCenter = frame.originMm;
      baseX = frame.xDirection;
      baseY = frame.yDirection;
      worldNormal = frame.normal;
    }
    const radians = degreesToRadians(angleDegrees);
    const radialDirection = add(scale(baseX, Math.cos(radians)), scale(baseY, Math.sin(radians)));
    const point = add(worldCenter, scale(radialDirection, radiusMm));
    await this.runtime.mutate(`async function (Factory, Vector, Quaternion, args) {
      ${commandStart("PolygonCommand")}
      factory.isKnife = false;
      factory.center.fromArray(args.center);
      factory.orientation.copy(new Quaternion().setFromUnitVectors(new Vector(0, 0, 1), new Vector(...args.normal).normalize()));
      factory.circumscribedOrInscribed = args.radiusMode === 'circumradius' ? 'inscribed' : 'circumscribed';
      factory.point.fromArray(args.point);
      factory.vertexCount = args.vertexCount;
      ${commandEnd}
    }`, ["KnifePolygonFactory", "Vector3", "Quaternion"], [{
      center: toMeters(worldCenter),
      point: toMeters(point),
      normal: worldNormal,
      radiusMode,
      vertexCount,
    }]);
    return await this.state();
  }

  async createRectangle(
    centerMm: Vector3 | Vector2,
    widthMm: number,
    heightMm: number,
    revision?: string,
    normal: Vector3 = [0, 0, 1],
    xDirection: Vector3 = [1, 0, 0],
    plane?: ReferenceIdentity,
    angleDegrees = 0,
  ): Promise<RuntimeState> {
    if (!Number.isFinite(widthMm) || widthMm <= 0) throw new Error("Rectangle width must be positive");
    if (!Number.isFinite(heightMm) || heightMm <= 0) throw new Error("Rectangle height must be positive");
    const radians = degreesToRadians(angleDegrees);
    let worldCenter: Vector3;
    let baseX: Vector3;
    let baseY: Vector3;
    if (plane) {
      if (centerMm.length !== 2) throw new Error("Plane-local rectangle centers must contain two coordinates");
      const resolvedPlane = await this.resolveCurrentPlane(plane, revision);
      worldCenter = localPointToWorld(resolvedPlane, centerMm);
      baseX = resolvedPlane.xDirection;
      baseY = resolvedPlane.yDirection;
    } else {
      if (centerMm.length !== 3) throw new Error("World-space rectangle centers must contain three coordinates");
      if (revision) await this.assertRevision(revision);
      const frame = frameFromOriginNormalX(centerMm, normal, xDirection);
      worldCenter = frame.originMm;
      baseX = frame.xDirection;
      baseY = frame.yDirection;
    }
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const rectangleX = add(scale(baseX, cosine), scale(baseY, sine));
    const rectangleY = add(scale(baseY, cosine), scale(baseX, -sine));
    const halfWidth = scale(rectangleX, widthMm / 2);
    const halfHeight = scale(rectangleY, heightMm / 2);
    const p1 = subtract(subtract(worldCenter, halfWidth), halfHeight);
    const p2 = add(subtract(worldCenter, halfHeight), halfWidth);
    const p3 = add(add(worldCenter, halfWidth), halfHeight);
    await this.runtime.mutate(`async function (Factory, Vector, args) {
      ${commandStart("ThreePointRectangleCommand")}
      factory.p1 = new Vector(...args.p1);
      factory.p2 = new Vector(...args.p2);
      factory.p3 = new Vector(...args.p3);
      ${commandEnd}
    }`, ["ThreePointRectangleFactory", "Vector3"], [{ p1: toMeters(p1), p2: toMeters(p2), p3: toMeters(p3) }]);
    return await this.state();
  }

  async createText(input: CreateTextInput): Promise<RuntimeState> {
    if (input.text.trim().length === 0) throw new Error("Text must be nonempty");
    if (!Number.isFinite(input.fontSizeMm) || input.fontSizeMm <= 0) throw new Error("Text font size must be positive");
    const font = input.font ?? "inter";
    if (font !== "inter") throw new Error(`Unsupported Plasticity text font: ${font}`);
    const radians = degreesToRadians(input.angleDegrees ?? 0);
    let worldOrigin: Vector3;
    let baseX: Vector3;
    let baseY: Vector3;
    let planeNormal: Vector3;
    if (input.plane) {
      if (input.originMm.length !== 2) throw new Error("Plane-local text origins must contain two coordinates");
      const resolvedPlane = await this.resolveCurrentPlane(input.plane, input.revision);
      worldOrigin = localPointToWorld(resolvedPlane, input.originMm);
      baseX = resolvedPlane.xDirection;
      baseY = resolvedPlane.yDirection;
      planeNormal = resolvedPlane.normal;
    } else {
      if (input.originMm.length !== 3) throw new Error("World-space text origins must contain three coordinates");
      if (input.revision) await this.assertRevision(input.revision);
      const frame = frameFromOriginNormalX(input.originMm, input.normal ?? [0, 0, 1], input.xDirection ?? [1, 0, 0]);
      worldOrigin = frame.originMm;
      baseX = frame.xDirection;
      baseY = frame.yDirection;
      planeNormal = frame.normal;
    }
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const textX = add(scale(baseX, cosine), scale(baseY, sine));
    const textY = add(scale(baseY, cosine), scale(baseX, -sine));
    const rotate = !vectorsNear(textX, [1, 0, 0]) || !vectorsNear(textY, [0, 1, 0]) || !vectorsNear(planeNormal, [0, 0, 1]);
    const move = Math.hypot(...worldOrigin) > 1e-12;
    await this.runtime.mutate(`async function (TextFactory, RotateFactory, MoveFactory, Vector, Matrix, Quaternion, args) {
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new this.commands.CurveCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const text = new TextFactory(editor).resource(this);
          text.text = args.text;
          text.font = args.font;
          text.size = args.size;
          let views = await text.commit();
          views = Array.isArray(views) ? views : [views];
          if (args.rotate) {
            const rotate = new RotateFactory(editor).resource(this);
            rotate.items = views;
            rotate.pivot.fromArray([0, 0, 0]);
            rotate.rotation.copy(new Quaternion().setFromRotationMatrix(
              new Matrix().makeBasis(new Vector(...args.x), new Vector(...args.y), new Vector(...args.z)),
            ));
            const rotated = await rotate.commit();
            views = Array.isArray(rotated) ? rotated : [rotated];
          }
          if (args.move) {
            const move = new MoveFactory(editor).resource(this);
            move.items = views;
            move.move.fromArray(args.origin);
            const moved = await move.commit();
            views = Array.isArray(moved) ? moved : [moved];
          }
          if (args.name) views.forEach((view, index) => editor.db.nodes.setName(
            editor.db.nodes.item2key(view),
            views.length === 1 ? args.name : args.name + ' ' + (index + 1),
          ));
          return views;
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["TextFactory", "RotateItemAndEmptyFactory", "MoveItemAndEmptyFactory", "Vector3", "Matrix4", "Quaternion"], [{
      text: input.text,
      font,
      size: millimetersToMeters(input.fontSizeMm),
      origin: toMeters(worldOrigin),
      x: textX,
      y: textY,
      z: planeNormal,
      rotate,
      move,
      name: input.name ?? null,
    }]);
    return await this.state();
  }

  async createSlotProfiles(ids: number[], widthMm: number, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (!Number.isFinite(widthMm) || widthMm <= 0) throw new Error("Slot profile width must be positive");
    if (ids.length === 0) throw new Error("At least one Wire ID is required");
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) throw new Error("Wire IDs must be unique");
    const invalid = uniqueIds.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Wire");
    if (invalid.length > 0) throw new Error(`Slot profiles require current Wire bodies: ${invalid.join(", ")}`);
    await this.runtime.mutate(`async function (Factory, Command, args) {
      ${findView}
      const wires = args.ids.map(id => {
        const view = find(id);
        if (view?.constructor?.name !== 'Wire') throw new Error('Slot profile source is no longer a Wire: ' + id);
        return view;
      });
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.curves = wires;
          factory.width = args.width;
          return await factory.commit();
        } catch (error) {
          failure = error;
          throw error;
        }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["SlotFactory", "SlotCommand"], [{ ids: uniqueIds, width: millimetersToMeters(widthMm) }]);
    return await this.state();
  }
}

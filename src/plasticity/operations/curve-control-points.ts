import { type RuntimeState } from "../runtime.ts";
import { normalize } from "../construction.ts";
import { degreesToRadians, millimetersToMeters } from "../units.ts";
import { type Vector3, type CurveControlPointReference, type VertexReference } from "./types.ts";
import { findCurveControlPoints } from "./native-snippets.ts";
import { toMeters } from "./helpers.ts";
import { OperationsBase } from "./base.ts";
import type { CurveQueryOperations } from "./curve-query.ts";

export abstract class CurveControlPointsOperations extends OperationsBase {
  declare assertCurveControlPointReferences: CurveQueryOperations["assertCurveControlPointReferences"];
  declare listCurveVertices: CurveQueryOperations["listCurveVertices"];
  async convertCurveVerticesToControlPoints(vertices: VertexReference[], revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (vertices.length === 0) throw new Error("At least one curve vertex is required");
    const keys = vertices.map(({ bodyId, vertexId }) => `${bodyId}:${vertexId}`);
    if (new Set(keys).size !== keys.length) throw new Error("Curve vertex references must be unique");
    const invalidBodies = [...new Set(vertices.map(({ bodyId }) => bodyId))]
      .filter((bodyId) => state.bodies.find((body) => body.id === bodyId)?.type !== "Wire");
    if (invalidBodies.length > 0) {
      throw new Error(`Curve vertex conversion requires current Wire bodies: ${invalidBodies.join(", ")}`);
    }
    const listed = await this.listCurveVertices();
    if (listed.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${listed.revision}`);
    }
    const byKey = new Map(listed.vertices.map((vertex) => [vertex.id, vertex]));
    const missing = keys.filter((key) => !byKey.has(key));
    if (missing.length > 0) throw new Error(`Stale or unknown curve vertices: ${missing.join(", ")}`);
    const endpoints = keys.filter((key) => byKey.get(key)?.endpoint);
    if (endpoints.length > 0) {
      throw new Error(`Curve vertex conversion requires interior or closed Wire vertices: ${endpoints.join(", ")}`);
    }
    const invalidDegree = keys.filter((key) => byKey.get(key)?.adjacentEdgeEntityIds.length !== 2);
    if (invalidDegree.length > 0) {
      throw new Error(`Curve vertex conversion requires exactly two adjacent segments: ${invalidDegree.join(", ")}`);
    }
    await this.runtime.mutate(`async function (Factory, Command, args) {
      const editor = this;
      if (editor.executor.isBusy) throw new Error('Plasticity is busy');
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const wanted = new Set(args.vertices.map(reference => reference.bodyId + ':' + reference.vertexId));
          const selected = [];
          const found = new Set();
          for (const [versionId, item] of editor.geo.geometryModel) {
            if (item.view?.constructor?.name !== 'Wire') continue;
            const bodyId = editor.db.lookupStableId(versionId);
            if (!Number.isInteger(bodyId)) continue;
            for (const view of Array.from(item.view.vertices ?? [])) {
              const vertex = editor.db.lookupTopologyItem(view);
              const key = bodyId + ':' + vertex.Id();
              if (!wanted.has(key)) continue;
              if (vertex.IsSpur()) throw new Error('Cannot convert endpoint vertex: ' + key);
              selected.push(view);
              found.add(key);
            }
          }
          const missing = Array.from(wanted).filter(key => !found.has(key));
          if (missing.length > 0) throw new Error('Stale or unknown curve vertices: ' + missing.join(', '));
          const factory = new Factory(editor).resource(this);
          factory.vertices = selected;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["ConvertVertexFactory", "ConvertCommand"], [{ vertices }]);
    return await this.state();
  }

  async moveCurveControlPoints(
    points: CurveControlPointReference[],
    deltaMm: Vector3,
    revision: string,
  ): Promise<RuntimeState> {
    await this.assertCurveControlPointReferences(points, revision);
    if (deltaMm.some((value) => !Number.isFinite(value)) || Math.hypot(...deltaMm) === 0) {
      throw new Error("Curve control point move delta must be a finite nonzero vector");
    }
    await this.runtime.mutate(`async function (Factory, Command, args) {
      ${findCurveControlPoints}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          if (vertices.length > 0) factory.vertices = vertices;
          if (cvs.length > 0) factory.cvs = cvs;
          factory.move.fromArray(args.delta);
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["MultiMoveControlPointFactory", "MoveControlPointCommand"], [{ points, delta: toMeters(deltaMm) }]);
    return await this.state();
  }

  async slideCurveControlPoints(
    points: CurveControlPointReference[],
    direction: "positive-u" | "negative-u",
    distanceMm: number,
    revision: string,
  ): Promise<RuntimeState> {
    const inventory = await this.assertCurveControlPointReferences(points, revision);
    if (!Number.isFinite(distanceMm) || distanceMm <= 0) {
      throw new Error("Curve control point slide distance must be finite and positive");
    }
    const nativeDirection = direction === "positive-u" ? "posU" : direction === "negative-u" ? "negU" : undefined;
    if (!nativeDirection) throw new Error(`Unsupported curve control point slide direction: ${String(direction)}`);
    const slideable = new Set(inventory.curves.flatMap((curve) => [
      ...curve.boundaryVertices.filter((point) => point.slideDirections).map((point) => `${curve.id}:vertex:${point.reference.pointId}`),
      ...curve.interiorControlPoints.filter((point) => point.slideDirections).map((point) => `${curve.id}:control-point:${point.reference.pointId}`),
    ]));
    const unsupported = points.filter((point) => !slideable.has(`${point.bodyId}:${point.kind}:${point.pointId}`));
    if (unsupported.length > 0) {
      throw new Error(`Native slide directions are unavailable for curve control points: ${unsupported.map((point) => `${point.bodyId}:${point.kind}:${point.pointId}`).join(", ")}`);
    }
    await this.runtime.mutate(`async function (Factory, Command, args) {
      ${findCurveControlPoints}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          if (vertices.length > 0) factory.vertices = vertices;
          if (cvs.length > 0) factory.cvs = cvs;
          factory.direction = args.direction;
          factory.distance = args.distance;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["MultiSlideControlPointFactory", "MoveControlPointCommand"], [{
      points,
      direction: nativeDirection,
      distance: millimetersToMeters(distanceMm),
    }]);
    return await this.state();
  }

  async rotateCurveControlPoints(
    points: CurveControlPointReference[],
    pivotMm: Vector3,
    axis: Vector3,
    degrees: number,
    revision: string,
  ): Promise<RuntimeState> {
    await this.assertCurveControlPointReferences(points, revision);
    if (!Number.isFinite(degrees) || degrees === 0) throw new Error("Curve control point rotation angle must be finite and nonzero");
    const unitAxis = normalize(axis);
    await this.runtime.mutate(`async function (Factory, Command, Vector, Quaternion, args) {
      ${findCurveControlPoints}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          if (vertices.length > 0) factory.vertices = vertices;
          if (cvs.length > 0) factory.cvs = cvs;
          factory.pivot.fromArray(args.pivot);
          factory.rotation.copy(new Quaternion().setFromAxisAngle(new Vector(...args.axis), args.radians));
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["MultiRotateControlPointFactory", "RotateControlPointCommand", "Vector3", "Quaternion"], [{
      points,
      pivot: toMeters(pivotMm),
      axis: unitAxis,
      radians: degreesToRadians(degrees),
    }]);
    return await this.state();
  }

  async scaleCurveControlPoints(
    points: CurveControlPointReference[],
    pivotMm: Vector3,
    factors: Vector3,
    revision: string,
  ): Promise<RuntimeState> {
    await this.assertCurveControlPointReferences(points, revision);
    if (factors.some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new Error("Curve control point scale factors must be finite and positive");
    }
    if (factors.every((value) => value === 1)) throw new Error("Curve control point scale must change at least one factor");
    await this.runtime.mutate(`async function (Factory, Command, args) {
      ${findCurveControlPoints}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          if (vertices.length > 0) factory.vertices = vertices;
          if (cvs.length > 0) factory.cvs = cvs;
          factory.pivot.fromArray(args.pivot);
          factory.scale.fromArray(args.factors);
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["MultiScaleControlPointFactory", "ScaleControlPointCommand"], [{ points, pivot: toMeters(pivotMm), factors }]);
    return await this.state();
  }

  async deleteCurveControlPoints(points: CurveControlPointReference[], revision: string): Promise<RuntimeState> {
    await this.assertCurveControlPointReferences(points, revision);
    if (points.some((point) => point.kind !== "control-point")) {
      throw new Error("Only interior B-Spline control points can be deleted");
    }
    const bodyIds = new Set(points.map((point) => point.bodyId));
    if (bodyIds.size !== 1) throw new Error("Deleted curve control points must belong to one Wire");
    await this.runtime.mutate(`async function (Factory, Command, args) {
      ${findCurveControlPoints}
      if (vertices.length > 0 || cvs.length !== args.points.length) throw new Error('Only interior B-Spline control points can be deleted');
      const view = views.get(args.points[0].bodyId);
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.curve = view;
          factory.cvs = cvs;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["DeleteControlPointFactory", "DeleteControlPointCommand"], [{ points }]);
    return await this.state();
  }
}

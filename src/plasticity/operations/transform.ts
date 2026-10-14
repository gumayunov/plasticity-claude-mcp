import { type RuntimeState } from "../runtime.ts";
import { add, dot, normalize, scale, subtract } from "../construction.ts";
import { degreesToRadians, millimetersToMeters } from "../units.ts";
import { quaternionFromXyzDegrees, type QuaternionXyzw } from "../print-orientation.ts";
import { type EdgeReference, type FaceReference } from "../measurements.ts";
import { type Vector3, type VertexReference } from "./types.ts";
import { findView, commandStart, commandEnd } from "./native-snippets.ts";
import { toMeters, requireVertexReference, nearlyParallel } from "./helpers.ts";
import { OperationsBase } from "./base.ts";

export abstract class TransformOperations extends OperationsBase {
  async alignPlanarFaces(
    ids: number[],
    sourceReference: FaceReference,
    targetReference: FaceReference,
    relation: "opposed" | "same",
    gapMm: number,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (ids.length === 0) throw new Error("At least one moving body ID is required");
    if (new Set(ids).size !== ids.length) throw new Error("Moving body IDs must be unique");
    const currentBodyIds = new Set(state.bodies.map((body) => body.id));
    const missingIds = ids.filter((id) => !currentBodyIds.has(id));
    if (missingIds.length > 0) throw new Error(`Unknown current moving body IDs: ${missingIds.join(", ")}`);
    if (!ids.includes(sourceReference.bodyId)) throw new Error("The source face must belong to a moving body");
    if (ids.includes(targetReference.bodyId)) throw new Error("The target face must remain fixed during alignment");
    if (relation !== "opposed" && relation !== "same") throw new Error(`Unsupported planar-face relation: ${String(relation)}`);
    if (!Number.isFinite(gapMm)) throw new Error("Planar-face alignment gap must be finite");

    const sourceBody = state.bodies.find((body) => body.id === sourceReference.bodyId)!;
    const targetBody = state.bodies.find((body) => body.id === targetReference.bodyId);
    const sourceFace = sourceBody.faces.find((face) => face.id === sourceReference.faceId);
    const targetFace = targetBody?.faces.find((face) => face.id === targetReference.faceId);
    if (!sourceFace) throw new Error(`Unknown current source face: ${sourceReference.bodyId}:${sourceReference.faceId}`);
    if (!targetFace) throw new Error(`Unknown current target face: ${targetReference.bodyId}:${targetReference.faceId}`);
    if (!sourceFace.planar) throw new Error("The source face must be planar");
    if (!targetFace.planar) throw new Error("The target face must be planar");

    const sourceNormal = normalize(sourceFace.normal, "Source face normal");
    const fixedNormal = normalize(targetFace.normal, "Target face normal");
    const targetNormal = relation === "opposed" ? scale(fixedNormal, -1) : fixedNormal;
    const destinationMm = add(targetFace.centerMm, scale(fixedNormal, gapMm));
    const deltaMm = subtract(destinationMm, sourceFace.centerMm);
    await this.runtime.mutate(`async function (RotateFactory, MoveFactory, Vector, Quaternion, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const items = args.ids.map(find);
      this.selection.selected.removeAll();
      let failure;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const sourceNormal = new Vector(...args.sourceNormal).normalize();
          const targetNormal = new Vector(...args.targetNormal).normalize();
          if (sourceNormal.dot(targetNormal) < 1 - 1e-12) {
            const rotate = new RotateFactory(editor).resource(this);
            rotate.items = items;
            rotate.pivot.fromArray(args.pivot);
            rotate.rotation.copy(new Quaternion().setFromUnitVectors(sourceNormal, targetNormal));
            await rotate.commit();
          }
          if (args.delta.some(value => Math.abs(value) > 1e-12)) {
            const move = new MoveFactory(editor).resource(this);
            move.items = args.ids.map(find);
            move.move.fromArray(args.delta);
            await move.commit();
          }
          return args.ids.map(find);
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["RotateItemAndEmptyFactory", "MoveItemAndEmptyFactory", "Vector3", "Quaternion"], [{
      ids,
      pivot: toMeters(sourceFace.centerMm),
      sourceNormal,
      targetNormal,
      delta: toMeters(deltaMm),
    }]);
    return await this.state();
  }

  async alignCylindricalFaces(
    ids: number[],
    sourceReference: FaceReference,
    targetReference: FaceReference,
    relation: "opposed" | "same",
    axialMode: "preserve" | "anchor",
    axialOffsetMm: number,
    rotationAroundAxisDeg: number,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (ids.length === 0) throw new Error("At least one moving body ID is required");
    if (new Set(ids).size !== ids.length) throw new Error("Moving body IDs must be unique");
    const currentBodyIds = new Set(state.bodies.map((body) => body.id));
    const missingIds = ids.filter((id) => !currentBodyIds.has(id));
    if (missingIds.length > 0) throw new Error(`Unknown current moving body IDs: ${missingIds.join(", ")}`);
    if (!ids.includes(sourceReference.bodyId)) throw new Error("The source face must belong to a moving body");
    if (ids.includes(targetReference.bodyId)) throw new Error("The target face must remain fixed during alignment");
    if (relation !== "opposed" && relation !== "same") throw new Error(`Unsupported cylindrical-axis relation: ${String(relation)}`);
    if (axialMode !== "preserve" && axialMode !== "anchor") throw new Error(`Unsupported cylindrical axial mode: ${String(axialMode)}`);
    if (!Number.isFinite(axialOffsetMm)) throw new Error("Cylindrical axial offset must be finite");
    if (axialMode === "preserve" && axialOffsetMm !== 0) throw new Error("Cylindrical axial offset is available only in anchor mode");
    if (!Number.isFinite(rotationAroundAxisDeg)) throw new Error("Cylindrical rotation around axis must be finite");

    const sourceBody = state.bodies.find((body) => body.id === sourceReference.bodyId)!;
    const targetBody = state.bodies.find((body) => body.id === targetReference.bodyId);
    const sourceFace = sourceBody.faces.find((face) => face.id === sourceReference.faceId);
    const targetFace = targetBody?.faces.find((face) => face.id === targetReference.faceId);
    if (!sourceFace) throw new Error(`Unknown current source face: ${sourceReference.bodyId}:${sourceReference.faceId}`);
    if (!targetFace) throw new Error(`Unknown current target face: ${targetReference.bodyId}:${targetReference.faceId}`);
    if (sourceFace.surfaceType !== "Cylinder" || !sourceFace.axisOriginMm || !sourceFace.axisDirection) {
      throw new Error("The source face must be cylindrical with an exact native axis");
    }
    if (targetFace.surfaceType !== "Cylinder" || !targetFace.axisOriginMm || !targetFace.axisDirection) {
      throw new Error("The target face must be cylindrical with an exact native axis");
    }

    const sourceAxis = normalize(sourceFace.axisDirection, "Source cylinder axis");
    const fixedAxis = normalize(targetFace.axisDirection, "Target cylinder axis");
    const targetAxis = relation === "opposed" ? scale(fixedAxis, -1) : fixedAxis;
    const betweenOrigins = subtract(targetFace.axisOriginMm, sourceFace.axisOriginMm);
    const deltaMm = axialMode === "anchor"
      ? subtract(add(targetFace.axisOriginMm, scale(fixedAxis, axialOffsetMm)), sourceFace.axisOriginMm)
      : subtract(betweenOrigins, scale(fixedAxis, betweenOrigins.reduce((sum, value, index) => sum + value * fixedAxis[index]!, 0)));
    await this.runtime.mutate(`async function (RotateFactory, MoveFactory, Vector, Quaternion, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const items = args.ids.map(find);
      this.selection.selected.removeAll();
      let failure;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const sourceAxis = new Vector(...args.sourceAxis).normalize();
          const targetAxis = new Vector(...args.targetAxis).normalize();
          if (sourceAxis.dot(targetAxis) < 1 - 1e-12) {
            const rotate = new RotateFactory(editor).resource(this);
            rotate.items = items;
            rotate.pivot.fromArray(args.pivot);
            rotate.rotation.copy(new Quaternion().setFromUnitVectors(sourceAxis, targetAxis));
            await rotate.commit();
          }
          if (args.delta.some(value => Math.abs(value) > 1e-12)) {
            const move = new MoveFactory(editor).resource(this);
            move.items = args.ids.map(find);
            move.move.fromArray(args.delta);
            await move.commit();
          }
          if (Math.abs(args.rollRadians) > 1e-12) {
            const roll = new RotateFactory(editor).resource(this);
            roll.items = args.ids.map(find);
            roll.pivot.fromArray(args.targetOrigin);
            roll.rotation.copy(new Quaternion().setFromAxisAngle(new Vector(...args.fixedAxis).normalize(), args.rollRadians));
            await roll.commit();
          }
          return args.ids.map(find);
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["RotateItemAndEmptyFactory", "MoveItemAndEmptyFactory", "Vector3", "Quaternion"], [{
      ids,
      pivot: toMeters(sourceFace.axisOriginMm),
      sourceAxis,
      targetAxis,
      fixedAxis,
      delta: toMeters(deltaMm),
      targetOrigin: toMeters(targetFace.axisOriginMm),
      rollRadians: degreesToRadians(rotationAroundAxisDeg),
    }]);
    return await this.state();
  }

  async alignVertices(
    ids: number[],
    sourceReference: VertexReference,
    targetReference: VertexReference,
    offsetMm: Vector3,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (ids.length === 0) throw new Error("At least one moving body ID is required");
    if (new Set(ids).size !== ids.length) throw new Error("Moving body IDs must be unique");
    const currentBodyIds = new Set(state.bodies.map((body) => body.id));
    const missingIds = ids.filter((id) => !currentBodyIds.has(id));
    if (missingIds.length > 0) throw new Error(`Unknown current moving body IDs: ${missingIds.join(", ")}`);
    if (!ids.includes(sourceReference.bodyId)) throw new Error("The source vertex must belong to a moving body");
    if (ids.includes(targetReference.bodyId)) throw new Error("The target vertex must remain fixed during alignment");
    if (offsetMm.some((value) => !Number.isFinite(value))) throw new Error("Vertex alignment offset must be finite");
    requireVertexReference(state, sourceReference, "Source vertex");
    requireVertexReference(state, targetReference, "Target vertex");
    const sourceVertex = state.bodies.find((body) => body.id === sourceReference.bodyId)!.vertices!
      .find((vertex) => vertex.id === sourceReference.vertexId)!;
    const targetVertex = state.bodies.find((body) => body.id === targetReference.bodyId)!.vertices!
      .find((vertex) => vertex.id === targetReference.vertexId)!;
    const destinationMm = add(targetVertex.positionMm, offsetMm);
    const deltaMm = subtract(destinationMm, sourceVertex.positionMm);
    if (!deltaMm.some((value) => Math.abs(value) > 1e-12)) {
      throw new Error("Vertex alignment would not move the selected bodies");
    }

    await this.runtime.mutate(`async function (MoveFactory, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const items = args.ids.map(find);
      this.selection.selected.removeAll();
      let failure;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const move = new MoveFactory(editor).resource(this);
          move.items = items;
          move.move.fromArray(args.delta);
          await move.commit();
          return args.ids.map(find);
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["MoveItemAndEmptyFactory"], [{ ids, delta: toMeters(deltaMm) }]);
    return await this.state();
  }

  async alignLinearEdges(
    ids: number[],
    sourceReference: EdgeReference,
    targetReference: EdgeReference,
    relation: "opposed" | "same",
    axialOffsetMm: number,
    rotationAroundAxisDeg: number,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (ids.length === 0) throw new Error("At least one moving body ID is required");
    if (new Set(ids).size !== ids.length) throw new Error("Moving body IDs must be unique");
    const currentBodyIds = new Set(state.bodies.map((body) => body.id));
    const missingIds = ids.filter((id) => !currentBodyIds.has(id));
    if (missingIds.length > 0) throw new Error(`Unknown current moving body IDs: ${missingIds.join(", ")}`);
    if (!ids.includes(sourceReference.bodyId)) throw new Error("The source edge must belong to a moving body");
    if (ids.includes(targetReference.bodyId)) throw new Error("The target edge must remain fixed during alignment");
    if (relation !== "opposed" && relation !== "same") throw new Error(`Unsupported linear-edge relation: ${String(relation)}`);
    if (!Number.isFinite(axialOffsetMm)) throw new Error("Linear-edge axial offset must be finite");
    if (!Number.isFinite(rotationAroundAxisDeg)) throw new Error("Linear-edge rotation around axis must be finite");

    const sourceBody = state.bodies.find((body) => body.id === sourceReference.bodyId)!;
    const targetBody = state.bodies.find((body) => body.id === targetReference.bodyId);
    const sourceEdge = sourceBody.edges.find((edge) => edge.id === sourceReference.edgeId);
    const targetEdge = targetBody?.edges.find((edge) => edge.id === targetReference.edgeId);
    if (!sourceEdge) throw new Error(`Unknown current source edge: ${sourceReference.bodyId}:${sourceReference.edgeId}`);
    if (!targetEdge) throw new Error(`Unknown current target edge: ${targetReference.bodyId}:${targetReference.edgeId}`);
    if (!sourceEdge.line) throw new Error("The source edge must be an exact native Line");
    if (!targetEdge.line) throw new Error("The target edge must be an exact native Line");

    const sourceDirection = normalize(sourceEdge.tangent, "Source edge tangent");
    const fixedDirection = normalize(targetEdge.tangent, "Target edge tangent");
    const targetDirection = relation === "opposed" ? scale(fixedDirection, -1) : fixedDirection;
    const destinationMm = add(targetEdge.centerMm, scale(fixedDirection, axialOffsetMm));
    const deltaMm = subtract(destinationMm, sourceEdge.centerMm);
    const directionAlreadyAligned = dot(sourceDirection, targetDirection) >= 1 - 1e-12;
    const translationRequired = deltaMm.some((value) => Math.abs(value) > 1e-12);
    if (directionAlreadyAligned && !translationRequired && Math.abs(rotationAroundAxisDeg) <= 1e-12) {
      throw new Error("Linear-edge alignment would not transform the selected bodies");
    }

    await this.runtime.mutate(`async function (RotateFactory, MoveFactory, Vector, Quaternion, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const items = args.ids.map(find);
      this.selection.selected.removeAll();
      let failure;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const sourceDirection = new Vector(...args.sourceDirection).normalize();
          const targetDirection = new Vector(...args.targetDirection).normalize();
          if (sourceDirection.dot(targetDirection) < 1 - 1e-12) {
            const rotate = new RotateFactory(editor).resource(this);
            rotate.items = items;
            rotate.pivot.fromArray(args.sourcePivot);
            rotate.rotation.copy(new Quaternion().setFromUnitVectors(sourceDirection, targetDirection));
            await rotate.commit();
          }
          if (args.delta.some(value => Math.abs(value) > 1e-12)) {
            const move = new MoveFactory(editor).resource(this);
            move.items = args.ids.map(find);
            move.move.fromArray(args.delta);
            await move.commit();
          }
          if (Math.abs(args.rollRadians) > 1e-12) {
            const roll = new RotateFactory(editor).resource(this);
            roll.items = args.ids.map(find);
            roll.pivot.fromArray(args.targetPivot);
            roll.rotation.copy(new Quaternion().setFromAxisAngle(new Vector(...args.fixedDirection).normalize(), args.rollRadians));
            await roll.commit();
          }
          return args.ids.map(find);
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["RotateItemAndEmptyFactory", "MoveItemAndEmptyFactory", "Vector3", "Quaternion"], [{
      ids,
      sourcePivot: toMeters(sourceEdge.centerMm),
      targetPivot: toMeters(destinationMm),
      sourceDirection,
      targetDirection,
      fixedDirection,
      delta: toMeters(deltaMm),
      rollRadians: degreesToRadians(rotationAroundAxisDeg),
    }]);
    return await this.state();
  }

  async move(ids: number[], deltaMm: Vector3, revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("MoveItemCommand")}
      factory.items = args.ids.map(find);
      factory.move.fromArray(args.delta);
      ${commandEnd}
    }`, ["MoveItemAndEmptyFactory"], [{ ids, delta: toMeters(deltaMm) }]);
    return await this.state();
  }

  async rotate(ids: number[], pivotMm: Vector3, axis: Vector3, degrees: number, revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    await this.runtime.mutate(`async function (Factory, Vector, Quaternion, args) {
      ${findView}
      ${commandStart("RotateItemCommand")}
      factory.items = args.ids.map(find);
      factory.pivot.fromArray(args.pivot);
      factory.rotation.copy(new Quaternion().setFromAxisAngle(new Vector(...args.axis).normalize(), args.radians));
      ${commandEnd}
    }`, ["RotateItemAndEmptyFactory", "Vector3", "Quaternion"], [{ ids, pivot: toMeters(pivotMm), axis, radians: degreesToRadians(degrees) }]);
    return await this.state();
  }

  async rotateBodiesByXyz(ids: number[], pivotMm: Vector3, rotationDeg: Vector3, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (ids.length === 0 || new Set(ids).size !== ids.length) throw new Error("At least one unique body ID is required for print orientation");
    for (const id of ids) {
      const body = state.bodies.find((candidate) => candidate.id === id);
      if (!body || body.type !== "Solid" || !body.boundsMm) throw new Error(`Print orientation requires a current bounded native Solid: ${id}`);
    }
    const quaternion: QuaternionXyzw = quaternionFromXyzDegrees(rotationDeg);
    if (Math.hypot(quaternion[0], quaternion[1], quaternion[2]) < 1e-12) throw new Error("Print orientation is zero; no CAD mutation is required");
    await this.runtime.mutate(`async function (Factory, Vector, Quaternion, args) {
      ${findView}
      ${commandStart("RotateItemCommand")}
      factory.items = args.ids.map(find);
      factory.pivot.fromArray(args.pivot);
      factory.rotation.set(args.quaternion[0], args.quaternion[1], args.quaternion[2], args.quaternion[3]);
      ${commandEnd}
    }`, ["RotateItemAndEmptyFactory", "Vector3", "Quaternion"], [{ ids, pivot: toMeters(pivotMm), quaternion }]);
    return await this.state();
  }

  async scale(ids: number[], pivotMm: Vector3, factors: Vector3, revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("ScaleItemCommand")}
      factory.items = args.ids.map(find);
      factory.pivot.fromArray(args.pivot);
      factory.scale.fromArray(args.factors);
      ${commandEnd}
    }`, ["ProjectingScaleItemAndEmptyFactory"], [{ ids, pivot: toMeters(pivotMm), factors }]);
    return await this.state();
  }

  async setBlockDimensions(
    id: number,
    widthMm: number,
    lengthMm: number,
    heightMm: number,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    const body = state.bodies.find((candidate) => candidate.id === id);
    if (body?.type !== "Solid") throw new Error(`Block dimension target must be one current Solid: ${id}`);
    for (const [name, value] of [["widthMm", widthMm], ["lengthMm", lengthMm], ["heightMm", heightMm]] as const) {
      if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number`);
    }
    await this.runtime.mutate(`async function (Command, Factory, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const view = find(args.id);
      this.selection.selected.removeAll();
      this.selection.selected.add(view);

      let collection = null;
      const base = Object.getPrototypeOf(Factory.prototype);
      const descriptor = Object.getOwnPropertyDescriptor(base, 'collection');
      if (!descriptor?.set) throw new Error('Plasticity block dimension collection is unavailable');
      const marker = '__PLASTICITY_MCP_DIMENSION_COLLECTION__';
      Object.defineProperty(base, 'collection', {
        ...descriptor,
        set(value) { collection = value; throw new Error(marker); },
      });
      const probe = new Command(editor);
      try {
        await probe.execute();
      } catch (error) {
        if (String(error?.message ?? error) !== marker) throw error;
      } finally {
        Object.defineProperty(base, 'collection', descriptor);
        try { probe.cancel(); } catch {}
      }
      if (!collection?.HasBlock?.()) throw new Error('Selected Solid is not recognized by Plasticity as a dimensionable block');

      let failure;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.collection = collection;
          factory.width = args.width;
          factory.length = args.length;
          factory.height = args.height;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["DimensionBlockCommand", "DimensionBlockFactory"], [{
      id,
      width: millimetersToMeters(widthMm),
      length: millimetersToMeters(lengthMm),
      height: millimetersToMeters(heightMm),
    }]);
    return await this.state();
  }

  async setRadiusDimension(
    face: { bodyId: number; faceId: string },
    radiusMm: number,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    const currentFace = state.bodies.find((body) => body.id === face.bodyId)?.faces.find((candidate) => candidate.id === face.faceId);
    if (currentFace?.surfaceType !== "Cylinder" || currentFace.radiusMm === null) {
      throw new Error(`Radius dimension target must be one current cylindrical face: ${face.bodyId}:${face.faceId}`);
    }
    if (!Number.isFinite(radiusMm) || radiusMm <= 0) throw new Error("radiusMm must be a positive finite number");
    await this.runtime.mutate(`async function (Command, Factory, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const view = find(args.face.bodyId);
      const index = view.high.faces.versionIds.indexOf(args.face.faceId);
      if (index < 0) throw new Error('Stale or unknown face: ' + args.face.faceId);
      this.selection.selected.removeAll();
      this.selection.selected.addFace(view.high.faces.get(index));

      let collection = null;
      const base = Object.getPrototypeOf(Factory.prototype);
      const descriptor = Object.getOwnPropertyDescriptor(base, 'collection');
      if (!descriptor?.set) throw new Error('Plasticity radius dimension collection is unavailable');
      const marker = '__PLASTICITY_MCP_DIMENSION_COLLECTION__';
      Object.defineProperty(base, 'collection', {
        ...descriptor,
        set(value) { collection = value; throw new Error(marker); },
      });
      const probe = new Command(editor);
      try {
        await probe.execute();
      } catch (error) {
        if (String(error?.message ?? error) !== marker) throw error;
      } finally {
        Object.defineProperty(base, 'collection', descriptor);
        try { probe.cancel(); } catch {}
      }
      if (!collection?.HasRadius?.()) throw new Error('Selected face is not recognized by Plasticity as radius-dimensionable');

      let failure;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.collection = collection;
          factory.radius = args.radius;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["DimensionRadiusCommand", "DimensionRadiusFactory"], [{
      face,
      radius: millimetersToMeters(radiusMm),
    }]);
    return await this.state();
  }

  async setRectangleDimensions(
    id: number,
    widthMm: number,
    lengthMm: number,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    const body = state.bodies.find((candidate) => candidate.id === id);
    if (body?.type !== "Wire" || !state.regions.some((region) => region.sketchWireIds.includes(id))) {
      throw new Error(`Rectangle dimension target must be one current closed planar Wire: ${id}`);
    }
    for (const [name, value] of [["widthMm", widthMm], ["lengthMm", lengthMm]] as const) {
      if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive finite number`);
    }
    await this.runtime.mutate(`async function (Command, Factory, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const view = find(args.id);
      this.selection.selected.removeAll();
      this.selection.selected.add(view);

      let collection = null;
      const base = Object.getPrototypeOf(Factory.prototype);
      const descriptor = Object.getOwnPropertyDescriptor(base, 'collection');
      if (!descriptor?.set) throw new Error('Plasticity rectangle dimension collection is unavailable');
      const marker = '__PLASTICITY_MCP_DIMENSION_COLLECTION__';
      Object.defineProperty(base, 'collection', {
        ...descriptor,
        set(value) { collection = value; throw new Error(marker); },
      });
      const probe = new Command(editor);
      try {
        await probe.execute();
      } catch (error) {
        if (String(error?.message ?? error) !== marker) throw error;
      } finally {
        Object.defineProperty(base, 'collection', descriptor);
        try { probe.cancel(); } catch {}
      }
      if (!collection?.HasRectangle?.()) throw new Error('Selected Wire is not recognized by Plasticity as a dimensionable rectangle');

      let failure;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.collection = collection;
          factory.width = args.width;
          factory.length = args.length;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["DimensionRectangleCommand", "DimensionRectangleFactory"], [{
      id,
      width: millimetersToMeters(widthMm),
      length: millimetersToMeters(lengthMm),
    }]);
    return await this.state();
  }

  async mirror(
    ids: number[],
    planeOriginMm: Vector3,
    planeNormal: Vector3,
    keepOriginal: boolean,
    revision: string,
  ): Promise<RuntimeState> {
    await this.assertRevision(revision);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("MirrorCommand")}
      factory.shells = args.ids.map(find);
      factory.origin.fromArray(args.origin);
      factory.normal.fromArray(args.normal);
      factory.move = !args.keepOriginal;
      ${commandEnd}
    }`, ["MirrorFactory"], [{ ids, origin: toMeters(planeOriginMm), normal: planeNormal, keepOriginal }]);
    return await this.state();
  }

  async rectangularPattern(
    ids: number[],
    direction1: Vector3,
    count1: number,
    spacing1Mm: number,
    direction2: Vector3,
    count2: number,
    spacing2Mm: number,
    revision: string,
  ): Promise<RuntimeState> {
    await this.assertRevision(revision);
    if (count2 > 1 && nearlyParallel(direction1, direction2)) throw new Error("Rectangular pattern directions must not be parallel");
    await this.runtime.mutate(`async function (Factory, Vector, args) {
      ${findView}
      ${commandStart("RectangularArrayCommand")}
      factory.items = args.ids.map(find);
      factory.dir1 = new Vector(...args.direction1).normalize();
      factory.dir2 = new Vector(...args.direction2).normalize();
      factory.mode = 'spacing';
      factory.num1 = args.count1;
      factory.num2 = args.count2;
      factory.distance1 = args.spacing1;
      factory.distance2 = args.spacing2;
      ${commandEnd}
    }`, ["RectangularArrayFactory", "Vector3"], [{
      ids,
      direction1,
      count1,
      spacing1: millimetersToMeters(spacing1Mm),
      direction2,
      count2,
      spacing2: millimetersToMeters(spacing2Mm),
    }]);
    return await this.state();
  }

  async radialPattern(
    ids: number[],
    centerMm: Vector3,
    axis: Vector3,
    count: number,
    sweepDegrees: number,
    revision: string,
  ): Promise<RuntimeState> {
    await this.assertRevision(revision);
    await this.runtime.mutate(`async function (Factory, Vector, args) {
      ${findView}
      ${commandStart("RadialArrayCommand")}
      const axis = new Vector(...args.axis).normalize();
      const reference = Math.abs(axis.z) < 0.9 ? new Vector(0, 0, 1) : new Vector(0, 1, 0);
      factory.items = args.ids.map(find);
      factory.center = new Vector(...args.center);
      factory.dir1 = reference.cross(axis).normalize();
      factory.dir2 = axis;
      factory.mode = 'total';
      factory.num1 = 1;
      factory.num2 = args.count;
      factory.angle = args.radians;
      ${commandEnd}
    }`, ["RadialArrayFactory", "Vector3"], [{
      ids,
      center: toMeters(centerMm),
      axis,
      count,
      radians: degreesToRadians(sweepDegrees),
    }]);
    return await this.state();
  }
}

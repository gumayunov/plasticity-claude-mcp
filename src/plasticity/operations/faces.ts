import { type RuntimeState } from "../runtime.ts";
import { normalize } from "../construction.ts";
import { degreesToRadians, millimetersToMeters } from "../units.ts";
import { type EdgeReference, type FaceReference } from "../measurements.ts";
import { type Vector3, type VertexReference } from "./types.ts";
import { findView, findFaceViews, findEdgeViews, commandStart, commandEnd } from "./native-snippets.ts";
import { toMeters, requireVertexReference, requireTopologySelection, requireSingleTopologyBody, nearlyParallel } from "./helpers.ts";
import { OperationsBase } from "./base.ts";

export abstract class FacesOperations extends OperationsBase {
  async insertIsoparamEdges(
    face: { bodyId: number; faceId: string },
    direction: "u" | "v",
    count: number,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    const body = state.bodies.find((candidate) => candidate.id === face.bodyId);
    if ((body?.type !== "Solid" && body?.type !== "Sheet") || !body.faceIds.includes(face.faceId)) {
      throw new Error(`Isoparam insertion requires a current Solid or Sheet face: ${face.bodyId}:${face.faceId}`);
    }
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      throw new Error("Isoparam count must be an integer between 1 and 1000");
    }
    await this.runtime.mutate(`async function (Factory, args) {
      ${findFaceViews}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new this.commands.IsoparamCommand(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.shell = find(args.faces[0].bodyId);
          factory.face = selectedFaces[0];
          factory.count = args.count;
          if (factory.uOrV !== args.uOrV) factory.toggleUV();
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["IsoparamFactory"], [{ faces: [face], count, uOrV: direction === "u" }]);
    return await this.state();
  }

  async extractFaces(faces: Array<{ bodyId: number; faceId: string }>, revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (faces.length === 0) throw new Error("At least one face reference is required");
    const keys = faces.map((face) => `${face.bodyId}:${face.faceId}`);
    if (new Set(keys).size !== keys.length) throw new Error("Face references must be unique");
    const invalid = faces.filter((reference) =>
      !state.bodies.find((body) => body.id === reference.bodyId)?.faceIds.includes(reference.faceId));
    if (invalid.length > 0) {
      throw new Error(`Stale or unknown faces: ${invalid.map((face) => `${face.bodyId}:${face.faceId}`).join(", ")}`);
    }
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("CreateSolidFromFacesCommand")}
      factory.faces = args.faces.map(ref => {
        const view = find(ref.bodyId);
        const index = view.high.faces.versionIds.indexOf(ref.faceId);
        if (index < 0) throw new Error('Stale or unknown face: ' + ref.faceId);
        return view.high.faces.get(index);
      });
      ${commandEnd}
    }`, ["CreateSheetFromFacesFactory"], [{ faces }]);
    return await this.state();
  }

  async extractEdges(edges: Array<{ bodyId: number; edgeId: string }>, revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (edges.length === 0) throw new Error("At least one edge reference is required");
    const keys = edges.map((edge) => `${edge.bodyId}:${edge.edgeId}`);
    if (new Set(keys).size !== keys.length) throw new Error("Edge references must be unique");
    const invalid = edges.filter((reference) =>
      !state.bodies.find((body) => body.id === reference.bodyId)?.edgeIds.includes(reference.edgeId));
    if (invalid.length > 0) {
      throw new Error(`Stale or unknown edges: ${invalid.map((edge) => `${edge.bodyId}:${edge.edgeId}`).join(", ")}`);
    }
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("DuplicateEdgeAndProjectCommand")}
      factory.edges = args.edges.map(ref => {
        const view = find(ref.bodyId);
        const index = view.high.edges.versionIds.indexOf(ref.edgeId);
        if (index < 0) throw new Error('Stale or unknown edge: ' + ref.edgeId);
        return view.high.edges.get(index);
      });
      ${commandEnd}
    }`, ["CreateCurveFromEdgesFactory"], [{ edges }]);
    return await this.state();
  }

  async unjoinFaces(faces: Array<{ bodyId: number; faceId: string }>, revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (faces.length === 0) throw new Error("At least one face reference is required");
    const keys = faces.map((face) => `${face.bodyId}:${face.faceId}`);
    if (new Set(keys).size !== keys.length) throw new Error("Face references must be unique");
    const invalid = faces.filter((reference) =>
      !state.bodies.find((body) => body.id === reference.bodyId)?.faceIds.includes(reference.faceId));
    if (invalid.length > 0) {
      throw new Error(`Stale or unknown faces: ${invalid.map((face) => `${face.bodyId}:${face.faceId}`).join(", ")}`);
    }
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("UnjoinFacesCommand")}
      factory.faces = args.faces.map(ref => {
        const view = find(ref.bodyId);
        const index = view.high.faces.versionIds.indexOf(ref.faceId);
        if (index < 0) throw new Error('Stale or unknown face: ' + ref.faceId);
        return view.high.faces.get(index);
      });
      ${commandEnd}
    }`, ["UnjoinFacesFactory"], [{ faces }]);
    return await this.state();
  }

  async deleteFaces(faces: Array<{ bodyId: number; faceId: string }>, revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (faces.length === 0) throw new Error("At least one face reference is required");
    const keys = faces.map((face) => `${face.bodyId}:${face.faceId}`);
    if (new Set(keys).size !== keys.length) throw new Error("Face references must be unique");
    const invalid = faces.filter((reference) =>
      !state.bodies.find((body) => body.id === reference.bodyId)?.faceIds.includes(reference.faceId));
    if (invalid.length > 0) {
      throw new Error(`Stale or unknown faces: ${invalid.map((face) => `${face.bodyId}:${face.faceId}`).join(", ")}`);
    }
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
          factory.faces = args.faces.map(ref => {
            const view = find(ref.bodyId);
            const index = view.high.faces.versionIds.indexOf(ref.faceId);
            if (index < 0) throw new Error('Stale or unknown face: ' + ref.faceId);
            return view.high.faces.get(index);
          });
          return await factory.commit();
        } catch (error) {
          failure = error;
          throw error;
        }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["DeleteFaceCommand", "DeleteFaceFactory"], [{ faces }]);
    return await this.state();
  }

  async dissolveFaces(faces: Array<{ bodyId: number; faceId: string }>, revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (faces.length === 0) throw new Error("At least one face reference is required");
    const keys = faces.map((face) => `${face.bodyId}:${face.faceId}`);
    if (new Set(keys).size !== keys.length) throw new Error("Face references must be unique");
    const invalid = faces.filter((reference) =>
      !state.bodies.find((body) => body.id === reference.bodyId)?.faceIds.includes(reference.faceId));
    if (invalid.length > 0) {
      throw new Error(`Stale or unknown faces: ${invalid.map((face) => `${face.bodyId}:${face.faceId}`).join(", ")}`);
    }
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
          factory.faces = args.faces.map(ref => {
            const view = find(ref.bodyId);
            const index = view.high.faces.versionIds.indexOf(ref.faceId);
            if (index < 0) throw new Error('Stale or unknown face: ' + ref.faceId);
            return view.high.faces.get(index);
          });
          return await factory.commit();
        } catch (error) {
          failure = error;
          throw error;
        }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["DissolveFaceCommand", "DissolveFaceFactory"], [{ faces }]);
    return await this.state();
  }

  async draftFaces(
    id: number,
    faceIds: string[],
    referenceFace: { bodyId: number; faceId: string },
    angleDegrees: number,
    revision: string,
  ): Promise<RuntimeState> {
    await this.assertRevision(revision);
    if (referenceFace.bodyId === id && faceIds.includes(referenceFace.faceId)) {
      throw new Error("Draft faces must not include the neutral reference face");
    }
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("DraftFaceCommand")}
      const view = find(args.id);
      const faces = view.high.faces;
      factory.faces = args.faceIds.map(id => {
        const index = faces.versionIds.indexOf(id);
        if (index < 0) throw new Error('Stale or unknown draft face: ' + id);
        return faces.get(index);
      });
      const referenceView = find(args.referenceFace.bodyId);
      const referenceFaces = referenceView.high.faces;
      const referenceIndex = referenceFaces.versionIds.indexOf(args.referenceFace.faceId);
      if (referenceIndex < 0) throw new Error('Stale or unknown neutral reference face: ' + args.referenceFace.faceId);
      factory.reference = referenceFaces.get(referenceIndex);
      factory.degrees = args.angleDegrees;
      ${commandEnd}
    }`, ["DraftFaceFactory"], [{ id, faceIds, referenceFace, angleDegrees }]);
    return await this.state();
  }

  async offsetFaces(id: number, faceIds: string[], distanceMm: number, revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("OffsetFaceCommand")}
      const view = find(args.id);
      const faces = view.high.faces;
      factory.faces = args.faceIds.map(id => {
        const index = faces.versionIds.indexOf(id);
        if (index < 0) throw new Error('Stale or unknown face: ' + id);
        return faces.get(index);
      });
      factory.distance = args.distance;
      ${commandEnd}
    }`, ["OffsetFaceFactory"], [{ id, faceIds, distance: millimetersToMeters(distanceMm) }]);
    return await this.state();
  }

  async moveFaces(references: FaceReference[], deltaMm: Vector3, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, references, "face");
    if (deltaMm.some((value) => !Number.isFinite(value)) || Math.hypot(...deltaMm) === 0) {
      throw new Error("Face move delta must be a finite nonzero vector");
    }
    await this.runtime.mutate(`async function (Factory, args) {
      ${findFaceViews}
      ${commandStart("MoveFaceCommand")}
      factory.faces = selectedFaces;
      factory.move.fromArray(args.delta);
      ${commandEnd}
    }`, ["MultiMoveFaceFactory"], [{ faces: references, delta: toMeters(deltaMm) }]);
    return await this.state();
  }

  async rotateFaces(
    references: FaceReference[],
    pivotMm: Vector3,
    axis: Vector3,
    degrees: number,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, references, "face");
    if (pivotMm.some((value) => !Number.isFinite(value))) throw new Error("Face rotation pivot must be finite");
    if (!Number.isFinite(degrees) || degrees === 0) throw new Error("Face rotation angle must be finite and nonzero");
    const unitAxis = normalize(axis, "Face rotation axis");
    await this.runtime.mutate(`async function (Factory, Vector, Quaternion, args) {
      ${findFaceViews}
      ${commandStart("RotateFaceCommand")}
      factory.faces = selectedFaces;
      factory.pivot.fromArray(args.pivot);
      factory.rotation.copy(new Quaternion().setFromAxisAngle(new Vector(...args.axis), args.radians));
      ${commandEnd}
    }`, ["MultiRotateFaceFactory", "Vector3", "Quaternion"], [{
      faces: references,
      pivot: toMeters(pivotMm),
      axis: unitAxis,
      radians: degreesToRadians(degrees),
    }]);
    return await this.state();
  }

  async scaleFaces(
    references: FaceReference[],
    pivotMm: Vector3,
    factors: Vector3,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, references, "face");
    if (pivotMm.some((value) => !Number.isFinite(value))) throw new Error("Face scale pivot must be finite");
    if (factors.some((value) => !Number.isFinite(value) || value <= 0)) {
      throw new Error("Face scale factors must be finite and positive");
    }
    if (factors.every((value) => value === 1)) throw new Error("Face scale must change at least one factor");
    await this.runtime.mutate(`async function (Factory, args) {
      ${findFaceViews}
      ${commandStart("ScaleFaceCommand")}
      factory.faces = selectedFaces;
      factory.pivot.fromArray(args.pivot);
      factory.scale.fromArray(args.factors);
      ${commandEnd}
    }`, ["MultiPlanarizingBasicScaleFaceFactory"], [{ faces: references, pivot: toMeters(pivotMm), factors }]);
    return await this.state();
  }

  async thickenFaces(
    references: FaceReference[],
    frontMm: number,
    backMm: number,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, references, "face");
    requireSingleTopologyBody(references, "Thickened faces");
    const body = state.bodies.find((candidate) => candidate.id === references[0]!.bodyId)!;
    if (body.type !== "Solid" && body.type !== "Sheet") throw new Error("Native face thickening requires a Solid or Sheet body");
    if (!Number.isFinite(frontMm) || frontMm < 0 || !Number.isFinite(backMm) || backMm < 0) {
      throw new Error("Face-thickening front and back distances must be finite and nonnegative");
    }
    if (frontMm === 0 && backMm === 0) throw new Error("Face thickening requires a positive front or back distance");
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
          factory.front = args.front;
          factory.back = args.back;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["ThickenFaceFactory", "ThickenFaceCommand"], [{
      faces: references,
      front: millimetersToMeters(frontMm),
      back: millimetersToMeters(backMm),
    }]);
    return await this.state();
  }

  async offsetFaceLoops(
    references: FaceReference[],
    distanceMm: number,
    individual: boolean,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, references, "face");
    requireSingleTopologyBody(references, "Offset face loops");
    const body = state.bodies.find((candidate) => candidate.id === references[0]!.bodyId)!;
    if (body.type !== "Solid" && body.type !== "Sheet") throw new Error("Native face-loop offset requires a Solid or Sheet body");
    if (!Number.isFinite(distanceMm) || distanceMm === 0) throw new Error("Face-loop offset distance must be finite and nonzero");
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
          factory.distance = args.distance;
          factory.isIndividual = args.individual;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["OffsetFaceLoopFactory", "OffsetFaceLoopCommand"], [{
      faces: references,
      distance: millimetersToMeters(distanceMm),
      individual,
    }]);
    return await this.state();
  }

  async patchSolidEdgeLoops(references: EdgeReference[], revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, references, "edge");
    requireSingleTopologyBody(references, "Patched Solid edge loops");
    const body = state.bodies.find((candidate) => candidate.id === references[0]!.bodyId)!;
    if (body.type !== "Solid") throw new Error("Native Solid edge-loop patching requires a Solid body");
    await this.runtime.mutate(`async function (Factory, Command, args) {
      ${findEdgeViews}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.edges = selectedEdges;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["PatchHoleInSolidFactory", "PatchHoleInSolidCommand"], [{ edges: references }]);
    return await this.state();
  }

  async moveEdges(references: EdgeReference[], deltaMm: Vector3, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, references, "edge");
    requireSingleTopologyBody(references, "Moved edges");
    if (deltaMm.some((value) => !Number.isFinite(value)) || Math.hypot(...deltaMm) === 0) {
      throw new Error("Edge move delta must be a finite nonzero vector");
    }
    await this.runtime.mutate(`async function (Factory, Command, args) {
      ${findEdgeViews}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.shell = view;
          factory.edges = selectedEdges;
          factory.move.fromArray(args.delta);
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["MoveEdgeFactory", "MoveEdgeCommand"], [{ edges: references, delta: toMeters(deltaMm) }]);
    return await this.state();
  }

  async offsetEdges(references: EdgeReference[], distanceMm: number, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, references, "edge");
    requireSingleTopologyBody(references, "Offset edges");
    if (!Number.isFinite(distanceMm) || distanceMm === 0) throw new Error("Edge offset distance must be finite and nonzero");
    await this.runtime.mutate(`async function (Factory, Command, args) {
      ${findEdgeViews}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.shell = view;
          factory.edges = selectedEdges;
          factory.distance = args.distance;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["OffsetEdgeFactory", "OffsetEdgeCommand"], [{ edges: references, distance: millimetersToMeters(distanceMm) }]);
    return await this.state();
  }

  async deleteEdges(references: EdgeReference[], revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, references, "edge");
    requireSingleTopologyBody(references, "Deleted edges");
    await this.runtime.mutate(`async function (Factory, Command, args) {
      ${findEdgeViews}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.shell = view;
          factory.edges = selectedEdges;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["DeleteEdgeFactory", "DeleteEdgeCommand"], [{ edges: references }]);
    return await this.state();
  }

  async offsetVertices(references: VertexReference[], distanceMm: number, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (references.length === 0) throw new Error("At least one shell vertex reference is required");
    const keys = references.map(({ bodyId, vertexId }) => `${bodyId}:${vertexId}`);
    if (new Set(keys).size !== keys.length) throw new Error("Shell vertex references must be unique");
    if (new Set(references.map(({ bodyId }) => bodyId)).size !== 1) {
      throw new Error("Offset shell vertices must belong to one body");
    }
    for (const [index, reference] of references.entries()) requireVertexReference(state, reference, `vertices[${index}]`);
    const body = state.bodies.find((candidate) => candidate.id === references[0]!.bodyId)!;
    if (body.type !== "Solid" && body.type !== "Sheet") {
      throw new Error("Native shell-vertex offset requires a Solid or Sheet body");
    }
    if (!Number.isFinite(distanceMm) || distanceMm <= 0) {
      throw new Error("Shell-vertex offset distance must be finite and positive");
    }
    await this.runtime.mutate(`async function (Factory, Command, args) {
      const wanted = new Set(args.vertices.map(reference => reference.bodyId + ':' + reference.vertexId));
      const selectedByKey = new Map();
      for (const entry of this.snaps.cache.entries ?? []) {
        for (let index = 0; index < (entry.positions?.length ?? 0) / 3; index += 1) {
          const snap = entry.lookup(index);
          if (snap?.constructor?.name !== 'Snaps_ShellVertexSnap') continue;
          const bodyId = this.db.lookupStableId(snap.item?.versionId);
          const vertexId = snap.model?.Id?.();
          const key = bodyId + ':' + vertexId;
          if (wanted.has(key)) selectedByKey.set(key, snap);
        }
      }
      const missing = Array.from(wanted).filter(key => !selectedByKey.has(key));
      if (missing.length > 0) throw new Error('Stale or unavailable shell vertices: ' + missing.join(', '));
      const selectedSnaps = args.vertices.map(reference => selectedByKey.get(reference.bodyId + ':' + reference.vertexId));
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.vertices = selectedSnaps.map(snap => snap.model);
          if (!factory._vertices || !Array.isArray(factory._vertices.views)) {
            throw new Error('Shell-vertex ownership bridge is unavailable in this Plasticity version');
          }
          factory._vertices.views = selectedSnaps.map(snap => ({ parentItem: snap.item, position: snap.position }));
          factory.distance = args.distance;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["OffsetVertexFactory", "OffsetVertexCommand"], [{ vertices: references, distance: millimetersToMeters(distanceMm) }]);
    return await this.state();
  }

  async rectangularFacePattern(
    references: FaceReference[],
    direction1: Vector3,
    count1: number,
    spacing1Mm: number,
    direction2: Vector3,
    count2: number,
    spacing2Mm: number,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, references, "face");
    requireSingleTopologyBody(references, "Patterned faces");
    const body = state.bodies.find((candidate) => candidate.id === references[0]!.bodyId)!;
    if (body.type !== "Solid" && body.type !== "Sheet") throw new Error("Native face patterns require a Solid or Sheet body");
    const unitDirection1 = normalize(direction1, "Rectangular face pattern direction1");
    const unitDirection2 = normalize(direction2, "Rectangular face pattern direction2");
    if (!Number.isInteger(count1) || count1 < 2 || count1 > 1000) throw new Error("Rectangular face pattern count1 must be an integer between 2 and 1000");
    if (!Number.isInteger(count2) || count2 < 1 || count2 > 1000) throw new Error("Rectangular face pattern count2 must be an integer between 1 and 1000");
    if (!Number.isFinite(spacing1Mm) || spacing1Mm <= 0) throw new Error("Rectangular face pattern spacing1 must be positive");
    if (!Number.isFinite(spacing2Mm) || spacing2Mm < 0 || (count2 > 1 && spacing2Mm === 0)) throw new Error("Rectangular face pattern spacing2 must be positive when count2 is greater than one");
    if (count2 > 1 && nearlyParallel(unitDirection1, unitDirection2)) throw new Error("Rectangular face pattern directions must not be parallel");
    await this.runtime.mutate(`async function (Factory, Command, Vector, args) {
      ${findFaceViews}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const view = find(args.faces[0].bodyId);
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.shell = view;
          factory.faces = selectedFaces;
          factory.dir1 = new Vector(...args.direction1);
          factory.dir2 = new Vector(...args.direction2);
          factory.mode = 'spacing';
          factory.num1 = args.count1;
          factory.num2 = args.count2;
          factory.distance1 = args.spacing1;
          factory.distance2 = args.spacing2;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["RectangularArrayFacesFactory", "RectangularArrayFacesCommand", "Vector3"], [{
      faces: references,
      direction1: unitDirection1,
      count1,
      spacing1: millimetersToMeters(spacing1Mm),
      direction2: unitDirection2,
      count2,
      spacing2: millimetersToMeters(spacing2Mm),
    }]);
    return await this.state();
  }

  async radialFacePattern(
    references: FaceReference[],
    centerMm: Vector3,
    axis: Vector3,
    count: number,
    sweepDegrees: number,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, references, "face");
    requireSingleTopologyBody(references, "Patterned faces");
    const body = state.bodies.find((candidate) => candidate.id === references[0]!.bodyId)!;
    if (body.type !== "Solid" && body.type !== "Sheet") throw new Error("Native face patterns require a Solid or Sheet body");
    if (centerMm.some((value) => !Number.isFinite(value))) throw new Error("Radial face pattern center must be finite");
    const unitAxis = normalize(axis, "Radial face pattern axis");
    if (!Number.isInteger(count) || count < 2 || count > 1000) throw new Error("Radial face pattern count must be an integer between 2 and 1000");
    if (!Number.isFinite(sweepDegrees) || sweepDegrees <= 0 || sweepDegrees > 360) throw new Error("Radial face pattern sweep must be greater than zero and at most 360 degrees");
    await this.runtime.mutate(`async function (Factory, Command, Vector, args) {
      ${findFaceViews}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const view = find(args.faces[0].bodyId);
      const axis = new Vector(...args.axis);
      const reference = Math.abs(axis.z) < 0.9 ? new Vector(0, 0, 1) : new Vector(0, 1, 0);
      let failure;
      const command = new Command(editor);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.shell = view;
          factory.faces = selectedFaces;
          factory.center = new Vector(...args.center);
          factory.dir1 = reference.cross(axis).normalize();
          factory.dir2 = axis;
          factory.mode = 'total';
          factory.num1 = 1;
          factory.num2 = args.count;
          factory.angle = args.radians;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["RadialArrayFacesFactory", "RadialArrayFacesCommand", "Vector3"], [{
      faces: references,
      center: toMeters(centerMm),
      axis: unitAxis,
      count,
      radians: degreesToRadians(sweepDegrees),
    }]);
    return await this.state();
  }
}

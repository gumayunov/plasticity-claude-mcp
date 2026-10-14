import { type RuntimeState } from "../runtime.ts";
import { millimetersToMeters } from "../units.ts";
import { calculateConeDevelopment, planConeDevelopmentCurves } from "../cone-development.ts";
import { type FaceReference } from "../measurements.ts";
import { type Vector3, type BodyValidationDescriptor } from "./types.ts";
import { findView, commandStart, commandEnd } from "./native-snippets.ts";
import { requireTopologySelection } from "./helpers.ts";
import { OperationsBase } from "./base.ts";
import type { CurveEditOperations } from "./curve-edit.ts";
import type { MeasureOperations } from "./measure.ts";
import type { SketchOperations } from "./sketch.ts";
import type { SurfacesOperations } from "./surfaces.ts";

export abstract class SheetsOperations extends OperationsBase {
  declare createCenterArc: SketchOperations["createCenterArc"];
  declare createPolyline: SketchOperations["createPolyline"];
  declare joinCurves: CurveEditOperations["joinCurves"];
  declare measureFaceProperties: MeasureOperations["measureFaceProperties"];
  declare patchClosedWires: SurfacesOperations["patchClosedWires"];
  declare validateBodies: MeasureOperations["validateBodies"];
  async reverseSheets(ids: number[], revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (ids.length === 0) throw new Error("At least one Sheet ID is required");
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) throw new Error("Sheet IDs must be unique");
    const invalid = uniqueIds.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Sheet");
    if (invalid.length > 0) throw new Error(`Sheet reversal requires current Sheet bodies: ${invalid.join(", ")}`);
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
          factory.sheets = args.ids.map(find);
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["ReverseSheetCommand", "ReverseSheetFactory"], [{ ids: uniqueIds }]);
    return await this.state();
  }

  async unwrapFace(face: FaceReference, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, [face], "face");
    const descriptor = state.bodies.find((body) => body.id === face.bodyId)!.faces.find((candidate) => candidate.id === face.faceId)!;
    if (descriptor.surfaceType !== "Cylinder") {
      throw new Error(`Exact face unwrapping requires an analytic Cylinder face: ${face.bodyId}:${face.faceId}`);
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
          const view = find(args.face.bodyId);
          const index = view.high.faces.versionIds.indexOf(args.face.faceId);
          if (index < 0) throw new Error('Stale or unknown face: ' + args.face.faceId);
          const selectedFaces = [view.high.faces.get(index)];
          const factory = new Factory(editor).resource(this);
          factory.faces = selectedFaces;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["UnwrapFactory"], [{ face }]);
    return await this.state();
  }

  async analyzeConeDevelopment(face: FaceReference, revision: string): Promise<{
    documentToken: string;
    revision: string;
    measurementSource: "native-brep";
    bodyId: number;
    faceId: string;
    boundaryRadiusMm: [number, number];
    development: ReturnType<typeof calculateConeDevelopment>;
  }> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, [face], "face");
    const body = state.bodies.find((candidate) => candidate.id === face.bodyId)!;
    if (body.type !== "Solid" && body.type !== "Sheet") {
      throw new Error(`Cone development requires a current Solid or Sheet body: ${face.bodyId}`);
    }
    const descriptor = body.faces.find((candidate) => candidate.id === face.faceId)!;
    if (descriptor.surfaceType !== "Cone") {
      throw new Error(`Cone development requires a current native Cone face: ${face.bodyId}:${face.faceId}`);
    }
    if (descriptor.axisOriginMm === null || descriptor.axisDirection === null || descriptor.coneBasisRadiusMm === undefined || descriptor.coneSemiAngleRad === undefined) {
      throw new Error(`Cone face is missing exact native basis parameters: ${face.bodyId}:${face.faceId}`);
    }

    const boundaryEdges = body.edges.filter((edge) => descriptor.edgeIds.includes(edge.id) && edge.faceIds.includes(face.faceId));
    const circularEdges = boundaryEdges.filter((edge) => edge.circle && edge.curveType === "Circle");
    const seamEdges = boundaryEdges.filter((edge) => edge.line && edge.curveType === "Line");
    if (boundaryEdges.length !== 3 || circularEdges.length !== 2 || seamEdges.length !== 1) {
      throw new Error("Cone development currently requires one complete frustum face bounded by two full circles and one straight seam");
    }

    const development = calculateConeDevelopment({
      basisRadiusMm: descriptor.coneBasisRadiusMm,
      semiAngleRad: descriptor.coneSemiAngleRad,
      axisOriginMm: descriptor.axisOriginMm,
      axisDirection: descriptor.axisDirection,
      circularBoundaries: circularEdges.map((edge) => ({ pointOnCircleMm: edge.centerMm, circumferenceMm: edge.lengthMm })),
    });
    const seamSlantLengthMm = seamEdges[0]!.lengthMm;
    if (Math.abs(seamSlantLengthMm - development.slantLengthMm) > 0.01) {
      throw new Error("Cone development seam length does not match the exact frustum slant length");
    }

    return {
      documentToken: state.documentToken,
      revision: state.revision,
      measurementSource: "native-brep",
      bodyId: face.bodyId,
      faceId: face.faceId,
      boundaryRadiusMm: circularEdges.map((edge) => edge.lengthMm / (2 * Math.PI)).sort((first, second) => first - second) as [number, number],
      development,
    };
  }

  async createConeDevelopment(face: FaceReference, originMm: Vector3, revision: string): Promise<{
    documentToken: string;
    revision: string;
    measurementSource: "native-brep";
    sourceFace: FaceReference;
    profileWireId: number;
    sheetBodyId: number;
    originMm: Vector3;
    boundaryRadiusMm: [number, number];
    development: ReturnType<typeof calculateConeDevelopment>;
    sourceAreaMm2: number;
    sheetAreaMm2: number;
    sheetBoundaryLengthsMm: number[];
    validation: BodyValidationDescriptor;
    historySteps: number;
  }> {
    if (originMm.some((value) => !Number.isFinite(value))) throw new Error("Cone development placement origin must be finite");
    const initial = await this.assertRevision(revision);
    const analysis = await this.analyzeConeDevelopment(face, revision);
    const descriptor = initial.bodies.find((body) => body.id === face.bodyId)!.faces.find((candidate) => candidate.id === face.faceId)!;
    const plan = planConeDevelopmentCurves(originMm, analysis.development);
    const sourceProperties = await this.measureFaceProperties([face], revision);
    const sourceAreaMm2 = sourceProperties.faces[0]!.areaMm2;
    const expectedAreaMm2 = Math.PI * (analysis.boundaryRadiusMm[0] + analysis.boundaryRadiusMm[1]) * analysis.development.slantLengthMm;
    if (Math.abs(sourceAreaMm2 - expectedAreaMm2) > Math.max(0.01, expectedAreaMm2 * 1e-6)) {
      throw new Error("Native cone face area does not match the full-frustum lateral area; no development geometry was created");
    }

    const originalBodies = new Map(initial.bodies.map((body) => [body.id, JSON.stringify(body)]));
    let state = initial;
    const createdWireIds: number[] = [];
    const assertOriginalBodiesUnchanged = (next: RuntimeState): void => {
      if (next.documentToken !== initial.documentToken) throw new Error("Plasticity document changed during cone development; inspect the partial result before continuing");
      for (const [id, snapshot] of originalBodies) {
        const current = next.bodies.find((body) => body.id === id);
        if (!current || JSON.stringify(current) !== snapshot) {
          throw new Error(`An original CAD body changed during cone development: ${id}; inspect the partial result before continuing`);
        }
      }
    };
    const createCurve = async (operation: Promise<RuntimeState>): Promise<number> => {
      const before = state;
      const next = await operation;
      assertOriginalBodiesUnchanged(next);
      if (next.undoDepth !== before.undoDepth + 1) {
        throw new Error("Cone development curve did not create exactly one history step; inspect the partial result before continuing");
      }
      const beforeIds = new Set(before.bodies.map((body) => body.id));
      const additions = next.bodies.filter((body) => !beforeIds.has(body.id));
      if (additions.length !== 1 || additions[0]!.type !== "Wire") {
        throw new Error("Cone development expected one new native Wire per curve; inspect the partial result before continuing");
      }
      if (createdWireIds.some((id) => !next.bodies.some((body) => body.id === id))) {
        throw new Error("A previously created cone development curve disappeared; inspect the partial result before continuing");
      }
      createdWireIds.push(additions[0]!.id);
      state = next;
      return additions[0]!.id;
    };

    for (const arc of plan.arcs) {
      await createCurve(this.createCenterArc(arc.centerMm, arc.radiusMm, arc.startAngleDegrees, arc.sweepAngleDegrees, state.revision, plan.normal, plan.xDirection));
    }
    for (const [start, end] of plan.radialSegments) {
      await createCurve(this.createPolyline([start, end], false, state.revision));
    }

    const beforeJoin = state;
    const joined = await this.joinCurves(createdWireIds, beforeJoin.revision);
    assertOriginalBodiesUnchanged(joined);
    if (joined.undoDepth !== beforeJoin.undoDepth + 1) throw new Error("Cone development join did not create exactly one history step; inspect the partial result before continuing");
    const joinedWires = joined.bodies.filter((body) => !originalBodies.has(body.id));
    if (joinedWires.length !== 1 || joinedWires[0]!.type !== "Wire") {
      throw new Error("Native curve join did not produce exactly one development Wire; inspect the partial result before continuing");
    }
    const profileWireId = joinedWires[0]!.id;
    state = joined;

    const beforePatch = state;
    const patched = await this.patchClosedWires([profileWireId], beforePatch.revision);
    assertOriginalBodiesUnchanged(patched);
    if (patched.undoDepth !== beforePatch.undoDepth + 1) throw new Error("Cone development patch did not create exactly one history step; inspect the partial result before continuing");
    const developmentBodies = patched.bodies.filter((body) => !originalBodies.has(body.id));
    const retainedWire = developmentBodies.find((body) => body.id === profileWireId && body.type === "Wire");
    const sheet = developmentBodies.filter((body) => body.type === "Sheet");
    if (!retainedWire || sheet.length !== 1) throw new Error("Native Wire patch did not preserve one profile and create exactly one Sheet; inspect the partial result before continuing");
    const sheetBody = sheet[0]!;
    if (sheetBody.faces.length !== 1 || !sheetBody.faces[0]!.planar || sheetBody.faces[0]!.edgeIds.length !== 4) {
      throw new Error("Cone development Sheet is not one planar four-edge face; inspect the partial result before continuing");
    }
    const sheetEdges = sheetBody.edges.filter((edge) => sheetBody.faces[0]!.edgeIds.includes(edge.id));
    const circularLengths = sheetEdges.filter((edge) => edge.circle).map((edge) => edge.lengthMm).sort((first, second) => first - second);
    const lineLengths = sheetEdges.filter((edge) => edge.line).map((edge) => edge.lengthMm).sort((first, second) => first - second);
    const expectedCircularLengths = [
      analysis.development.innerRadiusMm * analysis.development.includedAngleRad,
      analysis.development.outerRadiusMm * analysis.development.includedAngleRad,
    ].sort((first, second) => first - second);
    if (sheetEdges.length !== 4 || circularLengths.length !== 2 || lineLengths.length !== 2 ||
        circularLengths.some((length, index) => Math.abs(length - expectedCircularLengths[index]!) > 0.01) ||
        lineLengths.some((length) => Math.abs(length - analysis.development.slantLengthMm) > 0.01)) {
      throw new Error("Cone development Sheet boundaries do not match the exact annular-sector profile; inspect the partial result before continuing");
    }

    const validation = await this.validateBodies([sheetBody.id], patched.revision);
    if (!validation.bodies[0]!.nativeValid) throw new Error("Cone development Sheet failed Plasticity native validation; inspect the result before continuing");
    const sheetProperties = await this.measureFaceProperties([{ bodyId: sheetBody.id, faceId: sheetBody.faces[0]!.id }], patched.revision);
    const sheetAreaMm2 = sheetProperties.faces[0]!.areaMm2;
    if (Math.abs(sheetAreaMm2 - expectedAreaMm2) > Math.max(0.01, expectedAreaMm2 * 1e-6)) {
      throw new Error("Developed Sheet area does not match the source conical face; inspect the result before continuing");
    }
    const finalState = await this.assertRevision(patched.revision);
    assertOriginalBodiesUnchanged(finalState);
    if (JSON.stringify(finalState.bodies.find((body) => body.id === sheetBody.id)) !== JSON.stringify(sheetBody)) {
      throw new Error("Development Sheet changed during validation; inspect the result before continuing");
    }

    return {
      documentToken: finalState.documentToken,
      revision: finalState.revision,
      measurementSource: "native-brep",
      sourceFace: face,
      profileWireId,
      sheetBodyId: sheetBody.id,
      originMm,
      boundaryRadiusMm: analysis.boundaryRadiusMm,
      development: analysis.development,
      sourceAreaMm2,
      sheetAreaMm2,
      sheetBoundaryLengthsMm: sheetEdges.map((edge) => edge.lengthMm).sort((first, second) => first - second),
      validation: validation.bodies[0]!,
      historySteps: finalState.undoDepth - initial.undoDepth,
    };
  }

  async insertSheet(targetSheetId: number, edgeIds: string[], fillSheetId: number, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (targetSheetId === fillSheetId) throw new Error("Sheet insertion requires two different Sheet bodies");
    const target = state.bodies.find((body) => body.id === targetSheetId);
    const fill = state.bodies.find((body) => body.id === fillSheetId);
    if (target?.type !== "Sheet") throw new Error(`Sheet insertion requires a current target Sheet body: ${targetSheetId}`);
    if (fill?.type !== "Sheet") throw new Error(`Sheet insertion requires a current fill Sheet body: ${fillSheetId}`);
    if (edgeIds.length === 0) throw new Error("Sheet insertion requires at least one target boundary edge");
    const uniqueIds = [...new Set(edgeIds)];
    if (uniqueIds.length !== edgeIds.length) throw new Error("Sheet insertion edge IDs must be unique");
    const selected = uniqueIds.map((edgeId) => target.edges.find((edge) => edge.id === edgeId));
    const missing = uniqueIds.filter((_edgeId, index) => !selected[index]);
    if (missing.length > 0) throw new Error(`Stale or unknown target Sheet edges: ${missing.join(", ")}`);
    const nonBoundary = selected.filter((edge) => edge!.faceIds.length !== 1).map((edge) => edge!.id);
    if (nonBoundary.length > 0) throw new Error(`Sheet insertion requires target boundary edges: ${nonBoundary.join(", ")}`);
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
          const target = find(args.targetSheetId);
          const fill = find(args.fillSheetId);
          if (target.constructor.name !== 'Sheet' || fill.constructor.name !== 'Sheet') {
            throw new Error('Sheet insertion inputs must remain Sheet bodies');
          }
          factory.sheet = target;
          factory.edges = args.edgeIds.map(id => {
            const index = target.high.edges.versionIds.indexOf(id);
            if (index < 0) throw new Error('Stale or unknown target Sheet edge: ' + id);
            return target.high.edges.get(index);
          });
          factory.fillSheet = fill;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await editor.exec(command);
      if (failure) throw failure;
    }`, ["InsertSheetFactory", "InsertSheetCommand"], [{ targetSheetId, edgeIds: uniqueIds, fillSheetId }]);
    return await this.state();
  }

  async unjoinShells(ids: number[], revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (ids.length === 0 || new Set(ids).size !== ids.length) {
      throw new Error("Shell body IDs must be a nonempty unique list");
    }
    const current = new Map(state.bodies.map((body) => [body.id, body]));
    const missing = ids.filter((id) => !current.has(id));
    if (missing.length > 0) throw new Error(`Unknown current body IDs: ${missing.join(", ")}`);
    const invalid = ids.filter((id) => !["Solid", "Sheet"].includes(current.get(id)!.type));
    if (invalid.length > 0) throw new Error(`Shell unjoin requires current Solid or Sheet bodies: ${invalid.join(", ")}`);
    const singleFace = ids.filter((id) => current.get(id)!.faceIds.length < 2);
    if (singleFace.length > 0) throw new Error(`Shell unjoin requires bodies with at least two faces: ${singleFace.join(", ")}`);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("UnjoinShellsCommand")}
      factory.shells = args.ids.map(find);
      ${commandEnd}
    }`, ["UnjoinShellsFactory"], [{ ids }]);
    return await this.state();
  }

  async createSolidFromSheet(id: number, revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (state.bodies.find((body) => body.id === id)?.type !== "Sheet") {
      throw new Error(`Solid creation requires a current Sheet body: ${id}`);
    }
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("CreateSolidFromFacesCommand")}
      const view = find(args.id);
      if (view.constructor.name !== 'Sheet') throw new Error('Solid creation input must be a Sheet body');
      factory.shell = view;
      factory.faces = Array.from({ length: view.high.faces.length }, (_, index) => view.high.faces.get(index));
      ${commandEnd}
    }`, ["CreateSolidFromFacesFactory"], [{ id }]);
    return await this.state();
  }

  async patchSheetHole(id: number, edgeIds: string[], revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    const sheet = state.bodies.find((body) => body.id === id);
    if (sheet?.type !== "Sheet") throw new Error(`Hole patch requires a current Sheet body: ${id}`);
    if (edgeIds.length < 3) throw new Error("Sheet-hole patch requires at least three boundary edges");
    const uniqueIds = [...new Set(edgeIds)];
    if (uniqueIds.length !== edgeIds.length) throw new Error("Sheet-hole edge IDs must be unique");
    const selected = uniqueIds.map((edgeId) => sheet.edges.find((edge) => edge.id === edgeId));
    const missing = uniqueIds.filter((_edgeId, index) => !selected[index]);
    if (missing.length > 0) throw new Error(`Stale or unknown Sheet edges: ${missing.join(", ")}`);
    const nonBoundary = selected.filter((edge) => edge!.faceIds.length !== 1).map((edge) => edge!.id);
    if (nonBoundary.length > 0) throw new Error(`Hole patch requires boundary edges: ${nonBoundary.join(", ")}`);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("PatchCommand")}
      const view = find(args.id);
      if (view.constructor.name !== 'Sheet') throw new Error('Hole patch input must be a Sheet body');
      factory.sheet = view;
      factory.edges = args.edgeIds.map(id => {
        const index = view.high.edges.versionIds.indexOf(id);
        if (index < 0) throw new Error('Stale or unknown Sheet edge: ' + id);
        return view.high.edges.get(index);
      });
      ${commandEnd}
    }`, ["PatchHoleInSheetFactory"], [{ id, edgeIds: uniqueIds }]);
    return await this.state();
  }

  async capSheetHoles(ids: number[], revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (ids.length === 0) throw new Error("At least one Sheet ID is required");
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) throw new Error("Sheet IDs must be unique");
    const invalid = uniqueIds.filter((id) => state.bodies.find((body) => body.id === id)?.type !== "Sheet");
    if (invalid.length > 0) throw new Error(`Hole capping requires current Sheet bodies: ${invalid.join(", ")}`);
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
          factory.sheets = args.ids.map(find);
          return await factory.commit();
        } catch (error) {
          failure = error;
          throw error;
        }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["PatchHolesInSheetCommand", "CapHolesInSheetFactory"], [{ ids: uniqueIds }]);
    return await this.state();
  }

  async extendSheetEdges(id: number, edgeIds: string[], distanceMm: number, revision: string): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    const sheet = state.bodies.find((body) => body.id === id);
    if (sheet?.type !== "Sheet") throw new Error(`Sheet extension requires a current Sheet body: ${id}`);
    if (edgeIds.length === 0) throw new Error("Sheet extension requires at least one boundary edge");
    const uniqueIds = [...new Set(edgeIds)];
    if (uniqueIds.length !== edgeIds.length) throw new Error("Sheet extension edge IDs must be unique");
    if (!Number.isFinite(distanceMm) || distanceMm <= 0) throw new Error("Sheet extension distance must be positive");
    const selected = uniqueIds.map((edgeId) => sheet.edges.find((edge) => edge.id === edgeId));
    const missing = uniqueIds.filter((_edgeId, index) => !selected[index]);
    if (missing.length > 0) throw new Error(`Stale or unknown Sheet edges: ${missing.join(", ")}`);
    const nonBoundary = selected.filter((edge) => edge!.faceIds.length !== 1).map((edge) => edge!.id);
    if (nonBoundary.length > 0) throw new Error(`Sheet extension requires boundary edges: ${nonBoundary.join(", ")}`);
    await this.runtime.mutate(`async function (Factory, ExtensionShape, BodyExtensionType, ExtensionLimit, args) {
      ${findView}
      ${commandStart("ExtendSheetCommand")}
      const view = find(args.id);
      if (view.constructor.name !== 'Sheet') throw new Error('Sheet extension input must be a Sheet body');
      factory.edges = args.edgeIds.map(id => {
        const index = view.high.edges.versionIds.indexOf(id);
        if (index < 0) throw new Error('Stale or unknown Sheet edge: ' + id);
        return view.high.edges.get(index);
      });
      factory.distance = args.distance;
      factory.shape = ExtensionShape.Linear;
      factory.type = BodyExtensionType.Distance;
      factory.limit = ExtensionLimit.Minimal;
      factory.modify = true;
      ${commandEnd}
    }`, ["ExtendSheetFactory", "ExtensionShape", "BodyExtensionType", "ExtensionLimit"], [{
      id,
      edgeIds: uniqueIds,
      distance: millimetersToMeters(distanceMm),
    }]);
    return await this.state();
  }

  async thickenSheets(
    ids: number[],
    frontMm: number,
    backMm: number,
    revision: string,
  ): Promise<RuntimeState> {
    await this.assertRevision(revision);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findView}
      ${commandStart("ThickenSheetCommand")}
      const sheets = args.ids.map(find);
      for (const view of sheets) {
        if (view.constructor.name !== 'Sheet') throw new Error('Thicken inputs must be Sheets');
      }
      factory.sheets = sheets;
      factory.front = args.front;
      factory.back = args.back;
      ${commandEnd}
    }`, ["ThickenSheetFactory"], [{
      ids,
      front: millimetersToMeters(frontMm),
      back: millimetersToMeters(backMm),
    }]);
    return await this.state();
  }
}

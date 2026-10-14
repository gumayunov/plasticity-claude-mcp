import { type RuntimeState } from "../runtime.ts";
import { ConstructionGeometry } from "../construction.ts";
import { type AxisDefinition, type DatumAxisRef, type DatumPointRef, type PlaneDefinition, type ReferenceIdentity, type ConstructionPlaneRef, type PointDefinition } from "../references.ts";
import { resolveAxis, resolvePlaneFrame, resolvePoint } from "../semantic.ts";
import { requireResolution, assertRefreshIdentity } from "./helpers.ts";
import { OperationsBase } from "./base.ts";

export abstract class ConstructionOperations extends OperationsBase {
  constructionCapabilities(): ReturnType<ConstructionGeometry["capabilities"]> {
    return this.constructionGeometry.capabilities();
  }

  async defineDatumPoint(definition: PointDefinition, revision: string): Promise<DatumPointRef> {
    const state = await this.syncConstructionState(revision);
    return this.datumRegistry.addPoint(definition, requireResolution(resolvePoint(state, definition)));
  }

  async defineDatumAxis(definition: AxisDefinition, revision: string): Promise<DatumAxisRef> {
    const state = await this.syncConstructionState(revision);
    return this.datumRegistry.addAxis(definition, requireResolution(resolveAxis(state, definition, this.datumRegistry)));
  }

  async createConstructionPlane(
    definition: PlaneDefinition,
    name: string | undefined,
    revision: string,
  ): Promise<ConstructionPlaneRef> {
    const state = await this.syncConstructionState(revision);
    const frame = requireResolution(resolvePlaneFrame(state, definition, this.datumRegistry));
    const created = await this.constructionGeometry.createPlane(frame, name, revision);
    this.syncRegistry(created.state);
    return this.datumRegistry.putPlane(created.plane, definition);
  }

  async listConstructionGeometry(): Promise<{
    points: DatumPointRef[];
    axes: DatumAxisRef[];
    planes: ConstructionPlaneRef[];
    activePlaneId: string | null;
    activePlane: ConstructionPlaneRef | null;
  }> {
    const state = await this.state();
    this.syncRegistry(state);
    const activePlane = state.construction.activePlaneId === null
      ? null
      : this.datumRegistry.listPlanes().find((plane) => plane.id === state.construction.activePlaneId) ?? null;
    return {
      points: this.datumRegistry.listPoints(),
      axes: this.datumRegistry.listAxes(),
      planes: this.datumRegistry.listPlanes(),
      activePlaneId: state.construction.activePlaneId,
      activePlane,
    };
  }

  async setConstructionWorkplane(identity: ReferenceIdentity): Promise<RuntimeState> {
    const state = await this.syncConstructionState(identity.revision);
    const plane = this.datumRegistry.requireCurrentPlane(identity, state.documentToken, state.revision);
    const after = await this.constructionGeometry.setWorkplane(plane);
    this.syncRegistry(after);
    return after;
  }

  async removeConstructionPlane(identity: ReferenceIdentity): Promise<RuntimeState> {
    const state = await this.syncConstructionState(identity.revision);
    const plane = this.datumRegistry.requireCurrentPlane(identity, state.documentToken, state.revision);
    if (plane.source === "standard") throw new Error("Standard construction planes cannot be removed");
    const after = await this.constructionGeometry.removePlane(plane.nativeId, state.revision);
    this.datumRegistry.deletePlane(plane.id);
    this.syncRegistry(after);
    return after;
  }

  async refreshDatum(identity: ReferenceIdentity): Promise<DatumPointRef | DatumAxisRef> {
    const state = await this.state();
    this.syncRegistry(state);
    const prior = this.datumRegistry.get(identity.id);
    assertRefreshIdentity(prior, identity, this.datumRegistry.sessionId, state.documentToken);
    if (prior.kind === "datum-point") {
      return this.datumRegistry.refreshPoint(prior.id, requireResolution(resolvePoint(state, prior.definition)));
    }
    if (prior.kind === "datum-axis") {
      return this.datumRegistry.refreshAxis(prior.id, requireResolution(resolveAxis(state, prior.definition, this.datumRegistry, true)));
    }
    throw new Error("Construction planes are synchronized from Plasticity and cannot be refreshed as datums");
  }

  async syncConstructionState(expectedRevision?: string): Promise<RuntimeState> {
    const state = await this.state();
    if (expectedRevision !== undefined && state.revision !== expectedRevision) {
      throw new Error(`Stale reference: expected revision ${expectedRevision}, current revision is ${state.revision}`);
    }
    this.syncRegistry(state);
    return state;
  }

  syncRegistry(state: RuntimeState): void {
    this.datumRegistry.sync(state);
    this.datumRegistry.syncPlanes(state.construction.planes);
  }

  async resolveCurrentPlane(identity: ReferenceIdentity, revision?: string): Promise<ConstructionPlaneRef> {
    const state = await this.syncConstructionState(revision ?? identity.revision);
    return this.datumRegistry.requireCurrentPlane(identity, state.documentToken, state.revision);
  }
}

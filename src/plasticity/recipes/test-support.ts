import { PlasticityRecipes } from "../recipes.ts";
import type { RuntimeState } from "../runtime.ts";

export type RecipeOperations = ConstructorParameters<typeof PlasticityRecipes>[0];

export function counterboreOperations(failAtCall?: number): { operations: RecipeOperations; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  const target = body(7, "Solid");
  let state = scene("r1", [target]);
  let nextBodyId = 8;
  const maybeFail = () => {
    if (calls.length === failAtCall) throw new Error("native step failed");
  };
  const operations: RecipeOperations = {
    async state() { return state; },
    async createPolyline() { throw new Error("unexpected polyline"); },
    async extrudeRegions() { throw new Error("unexpected extrusion"); },
    async rectangularPattern() { throw new Error("unexpected pattern"); },
    async createPipes() { throw new Error("unexpected pipe"); },
    async fillet() { throw new Error("unexpected fillet"); },
    async createBox() { throw new Error("unexpected box"); },
    async createCylinder(centerMm, radiusMm, heightMm, _name, revision, axis) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, axis, revision });
      maybeFail();
      const id = nextBodyId++;
      state = scene(`r${Number(state.revision.slice(1)) + 1}`, [...state.bodies, body(id, "Solid")]);
      return state;
    },
    async boolean(targetIds, toolIds, kind, keepTools, revision) {
      calls.push({ operation: "boolean", targetIds, toolIds, kind, keepTools, revision });
      maybeFail();
      state = scene(`r${Number(state.revision.slice(1)) + 1}`, state.bodies.filter((candidate) => !toolIds.includes(candidate.id)));
      return state;
    },
  };
  return { operations, calls };
}

export function slottedHolePatternOperations(failAtCall?: number): { operations: RecipeOperations; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  const target = body(7, "Solid");
  let state = scene("r1", [target]);
  let nextBodyId = 8;
  let revision = 1;
  const maybeFail = () => {
    if (calls.length === failAtCall) throw new Error("native slot pattern step failed");
  };
  const advance = (added: ReturnType<typeof body>[], removedIds: number[] = []) => {
    revision += 1;
    state = { ...state, revision: `r${revision}`, bodies: [...state.bodies.filter((candidate) => !removedIds.includes(candidate.id)), ...added] };
    return state;
  };
  const operations: RecipeOperations = {
    async state() { return state; },
    async createPolyline(pointsMm, closed, currentRevision) {
      calls.push({ operation: "createPolyline", pointsMm, closed, revision: currentRevision });
      maybeFail();
      const id = nextBodyId++;
      const bounds = {
        min: [0, 1, 2].map((axis) => Math.min(...pointsMm.map((point) => point[axis]!))) as [number, number, number],
        max: [0, 1, 2].map((axis) => Math.max(...pointsMm.map((point) => point[axis]!))) as [number, number, number],
      };
      advance([body(id, "Wire")]);
      state = { ...state, regions: [...state.regions, {
        id: `region-${id}`, entityId: id * 10, islandVersionId: id * 10 + 1, sketchId: id * 10 + 2,
        sketchWireIds: [id], measurementSource: "render-mesh" as const, displayBoundsMm: bounds,
      }] };
      return state;
    },
    async extrudeRegions(regionIds, distanceMm, currentRevision) {
      calls.push({ operation: "extrudeRegions", regionIds, distanceMm, revision: currentRevision });
      maybeFail();
      return advance([body(nextBodyId++, "Solid")]);
    },
    async createCylinder(centerMm, radiusMm, heightMm, _name, currentRevision, axis) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, axis, revision: currentRevision });
      maybeFail();
      return advance([body(nextBodyId++, "Solid")]);
    },
    async boolean(targetIds, toolIds, kind, keepTools, currentRevision) {
      calls.push({ operation: "boolean", targetIds, toolIds, kind, keepTools, revision: currentRevision });
      maybeFail();
      return advance([], toolIds);
    },
    async rectangularPattern() { throw new Error("unexpected pattern"); },
    async createPipes() { throw new Error("unexpected pipe"); },
    async fillet() { throw new Error("unexpected fillet"); },
    async createBox() { throw new Error("unexpected box"); },
  };
  return { operations, calls };
}

export function scene(revision: string, bodies: RuntimeState["bodies"]): RuntimeState {
  return {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "doc-1", revision,
    dbVersion: Number(revision.slice(1)), undoDepth: Number(revision.slice(1)) - 1, redoDepth: 0,
    construction: { planes: [], activePlaneId: null, planeStateToken: "p0", viewStateToken: "v0" },
    regions: [], bodies,
  };
}

export function body(id: number, type: string): RuntimeState["bodies"][number] {
  return { id, versionId: id, type, name: null, boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] };
}

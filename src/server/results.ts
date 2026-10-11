import { type SceneDiff, type TrackedDatum } from "../plasticity/change-tracker.ts";
import { type ConstructionHistoryEntry } from "../plasticity/construction-history.ts";
import { type RuntimeState } from "../plasticity/runtime.ts";

export function compactStatusSummary(state: RuntimeState, bodyOffset: number, bodyLimit: number) {
  const totalBodies = state.bodies.length;
  const bodies = state.bodies.slice(bodyOffset, bodyOffset + bodyLimit);
  return {
    ...state,
    bodies: bodies.map((body) => {
      const summary: Partial<RuntimeState["bodies"][number]> = { ...body };
      delete summary.faceIds;
      delete summary.edgeIds;
      delete summary.faces;
      delete summary.edges;
      delete summary.vertices;
      return {
        ...summary,
        faceCount: body.faces.length,
        edgeCount: body.edges.length,
        vertexCount: body.vertices?.length ?? null,
      };
    }),
    bodyPagination: {
      offset: bodyOffset,
      limit: bodyLimit,
      total: totalBodies,
      nextOffset: bodyOffset + bodies.length < totalBodies ? bodyOffset + bodies.length : null,
    },
  };
}

export function isRuntimeState(value: unknown): value is RuntimeState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.targetId === "string"
    && typeof candidate.title === "string"
    && typeof candidate.documentToken === "string"
    && typeof candidate.revision === "string"
    && Array.isArray(candidate.bodies)
    && candidate.bodies.every((body) => typeof body === "object" && body !== null
      && Array.isArray((body as Record<string, unknown>).faces)
      && Array.isArray((body as Record<string, unknown>).edges));
}

export function compactChangedBody(body: RuntimeState["bodies"][number]) {
  return {
    id: body.id,
    versionId: body.versionId,
    type: body.type,
    name: body.name,
    boundsMm: body.boundsMm,
    faceCount: body.faces.length,
    edgeCount: body.edges.length,
    vertexCount: body.vertices?.length ?? null,
  };
}

export function compactMutationResult<T>(value: RuntimeState, change: SceneDiff): T {
  return {
    ...compactStatusSummary(value, 0, 20),
    change: {
      sceneChanged: change.sceneChanged,
      revisionChanged: change.revisionChanged,
      changed: change.changed,
      documentChanged: change.documentChanged,
      added: change.added.map(compactChangedBody),
      removed: change.removed.map(compactChangedBody),
      modified: change.modified.map((item) => ({
        id: item.id,
        renamed: item.renamed,
        geometryChanged: item.geometryChanged,
        appearanceChanged: item.appearanceChanged,
        visibilityChanged: item.visibilityChanged,
        before: compactChangedBody(item.before),
        after: compactChangedBody(item.after),
      })),
      regionsAdded: change.regionsAdded.map(({ id, displayBoundsMm }) => ({ id, displayBoundsMm })),
      regionsRemoved: change.regionsRemoved.map(({ id, displayBoundsMm }) => ({ id, displayBoundsMm })),
      regionsModified: change.regionsModified.map(({ id, before, after }) => ({
        id,
        before: { displayBoundsMm: before.displayBoundsMm },
        after: { displayBoundsMm: after.displayBoundsMm },
      })),
      constructionPlanesAdded: change.constructionPlanesAdded.map((plane) => ({ nativeId: plane.nativeId, name: plane.name })),
      constructionPlanesRemoved: change.constructionPlanesRemoved.map((plane) => ({ nativeId: plane.nativeId, name: plane.name })),
      constructionPlanesModified: change.constructionPlanesModified.map(({ nativeId, before, after }) => ({
        nativeId,
        before: { name: before.name },
        after: { name: after.name },
      })),
      activeWorkplaneChanged: change.activeWorkplaneChanged,
      materialsChanged: change.materialsChanged,
      measurementsChanged: change.measurementsChanged,
      sectionAnalysesChanged: change.sectionAnalysesChanged,
      instancesChanged: change.instancesChanged,
      referenceMeshesChanged: change.referenceMeshesChanged,
      groupsChanged: change.groupsChanged,
    },
  } as T;
}

/**
 * A mutation answers with what it changed, not with the whole scene: parts
 * that stayed the same are reduced to counts and tokens, changed parts are
 * returned in full. plasticity_status still reads the complete summary.
 * Selected with mutationResponses: "changes"; the default keeps the summary
 * shape that the live acceptance scripts read.
 */
export function changesOnlyMutationResult<T>(value: RuntimeState, change: SceneDiff): T {
  const planesChanged = change.constructionPlanesAdded.length > 0
    || change.constructionPlanesRemoved.length > 0
    || change.constructionPlanesModified.length > 0
    || change.activeWorkplaneChanged !== null;
  const regionsChanged = change.regionsAdded.length > 0 || change.regionsRemoved.length > 0 || change.regionsModified.length > 0;
  const { planes, ...planeState } = value.construction;
  const changedBodies = {
    ...(change.added.length > 0 ? { added: change.added.map(compactChangedBody) } : {}),
    ...(change.removed.length > 0 ? { removed: change.removed.map(compactChangedBody) } : {}),
    ...(change.modified.length > 0 ? {
      modified: change.modified.map((item) => ({
        id: item.id,
        renamed: item.renamed,
        geometryChanged: item.geometryChanged,
        appearanceChanged: item.appearanceChanged,
        visibilityChanged: item.visibilityChanged,
        before: compactChangedBody(item.before),
        after: compactChangedBody(item.after),
      })),
    } : {}),
  };
  const changedRegions = {
    ...(change.regionsAdded.length > 0 ? { regionsAdded: change.regionsAdded.map(({ id, displayBoundsMm }) => ({ id, displayBoundsMm })) } : {}),
    ...(change.regionsRemoved.length > 0 ? { regionsRemoved: change.regionsRemoved.map(({ id, displayBoundsMm }) => ({ id, displayBoundsMm })) } : {}),
    ...(change.regionsModified.length > 0 ? {
      regionsModified: change.regionsModified.map(({ id, before, after }) => ({
        id,
        before: { displayBoundsMm: before.displayBoundsMm },
        after: { displayBoundsMm: after.displayBoundsMm },
      })),
    } : {}),
  };
  const changedPlanes = {
    ...(change.constructionPlanesAdded.length > 0 ? { constructionPlanesAdded: change.constructionPlanesAdded.map((plane) => ({ nativeId: plane.nativeId, name: plane.name })) } : {}),
    ...(change.constructionPlanesRemoved.length > 0 ? { constructionPlanesRemoved: change.constructionPlanesRemoved.map((plane) => ({ nativeId: plane.nativeId, name: plane.name })) } : {}),
    ...(change.constructionPlanesModified.length > 0 ? {
      constructionPlanesModified: change.constructionPlanesModified.map(({ nativeId, before, after }) => ({
        nativeId,
        before: { name: before.name },
        after: { name: after.name },
      })),
    } : {}),
    ...(change.activeWorkplaneChanged !== null ? { activeWorkplaneChanged: change.activeWorkplaneChanged } : {}),
  };
  const changedFlags = Object.fromEntries(([
    "materialsChanged", "measurementsChanged", "sectionAnalysesChanged", "instancesChanged", "referenceMeshesChanged", "groupsChanged",
  ] as const).filter((flag) => change[flag]).map((flag) => [flag, true]));
  return {
    targetId: value.targetId,
    title: value.title,
    documentToken: value.documentToken,
    revision: value.revision,
    dbVersion: value.dbVersion,
    undoDepth: value.undoDepth,
    redoDepth: value.redoDepth,
    bodyCount: value.bodies.length,
    ...(value.activeGroupId === undefined ? {} : { activeGroupId: value.activeGroupId }),
    construction: planesChanged ? value.construction : { ...planeState, planeIds: planes.map((plane) => plane.id) },
    ...(regionsChanged ? { regions: value.regions } : { regionCount: value.regions.length }),
    ...(change.materialsChanged && value.materials ? { materials: value.materials } : {}),
    ...(change.measurementsChanged && value.measurements ? { measurements: value.measurements } : {}),
    ...(change.sectionAnalysesChanged && value.sectionAnalyses ? { sectionAnalyses: value.sectionAnalyses } : {}),
    ...(change.instancesChanged && value.instances ? { instances: value.instances } : {}),
    ...(change.referenceMeshesChanged && value.referenceMeshes ? { referenceMeshes: value.referenceMeshes } : {}),
    ...(change.groupsChanged && value.groups ? { groups: value.groups } : {}),
    change: {
      sceneChanged: change.sceneChanged,
      revisionChanged: change.revisionChanged,
      changed: change.changed,
      documentChanged: change.documentChanged,
      ...changedBodies,
      ...changedRegions,
      ...changedPlanes,
      ...changedFlags,
    },
  } as T;
}

export type SceneChangeResult = {
  snapshotId: string;
  label: string | null;
  capturedAt: string;
  diff: SceneDiff;
  selection: unknown;
  current: RuntimeState;
  timedOut?: boolean;
};

export type SceneSnapshotResult = {
  snapshotId: string;
  label: string | null;
  capturedAt: string;
  state: RuntimeState;
  datums: TrackedDatum[];
};

export function isSceneSnapshotResult(value: unknown): value is SceneSnapshotResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const state = candidate.state;
  if (typeof state !== "object" || state === null) return false;
  const stateRecord = state as Record<string, unknown>;
  return typeof candidate.snapshotId === "string"
    && typeof candidate.capturedAt === "string"
    && Array.isArray(candidate.datums)
    && typeof stateRecord.documentToken === "string"
    && typeof stateRecord.revision === "string"
    && Array.isArray(stateRecord.bodies);
}

export function compactSceneSnapshot(rawSnapshot: unknown) {
  if (!isSceneSnapshotResult(rawSnapshot)) throw new Error("Plasticity returned an invalid scene snapshot");
  const { snapshotId, label, capturedAt, state, datums } = rawSnapshot;
  return {
    snapshotId,
    label,
    capturedAt,
    documentToken: state.documentToken,
    revision: state.revision,
    targetId: state.targetId,
    title: state.title,
    bodyCount: state.bodies.length,
    regionCount: state.regions.length,
    constructionPlaneCount: state.construction.planes.length,
    trackedDatumCount: datums.length,
  };
}

export function isSceneChangeResult(value: unknown): value is SceneChangeResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const diff = candidate.diff;
  const current = candidate.current;
  if (typeof diff !== "object" || diff === null || typeof current !== "object" || current === null) return false;
  const diffRecord = diff as Record<string, unknown>;
  const currentRecord = current as Record<string, unknown>;
  return typeof candidate.snapshotId === "string"
    && typeof candidate.capturedAt === "string"
    && Array.isArray(diffRecord.added)
    && Array.isArray(diffRecord.removed)
    && Array.isArray(diffRecord.modified)
    && typeof currentRecord.documentToken === "string"
    && typeof currentRecord.revision === "string"
    && Array.isArray(currentRecord.bodies);
}

export function compactSceneChanges(
  rawResult: unknown,
  bodyOffset: number,
  bodyLimit: number,
  expectedRevision?: string,
) {
  if (!isSceneChangeResult(rawResult)) throw new Error("Plasticity returned an invalid scene change response");
  const result = rawResult;
  if (expectedRevision !== undefined && expectedRevision !== result.current.revision) {
    throw new Error("CAD revision changed between scene-change pages; restart pagination from bodyOffset 0");
  }
  const allBodyChanges = [
    ...result.diff.added.map((body) => ({ kind: "added" as const, body })),
    ...result.diff.removed.map((body) => ({ kind: "removed" as const, body })),
    ...result.diff.modified.map((change) => ({ kind: "modified" as const, change })),
  ];
  const page = allBodyChanges.slice(bodyOffset, bodyOffset + bodyLimit);
  const current = result.current;
  const { timedOut, ...metadata } = result;
  return {
    ...metadata,
    ...(timedOut === undefined ? {} : { timedOut }),
    current: {
      targetId: current.targetId,
      title: current.title,
      documentToken: current.documentToken,
      revision: current.revision,
      dbVersion: current.dbVersion,
      undoDepth: current.undoDepth,
      redoDepth: current.redoDepth,
      bodyCount: current.bodies.length,
      regionCount: current.regions.length,
    },
    diff: {
      ...result.diff,
      added: page.filter((item) => item.kind === "added").map((item) => compactChangedBody(item.body)),
      removed: page.filter((item) => item.kind === "removed").map((item) => compactChangedBody(item.body)),
      modified: page.filter((item) => item.kind === "modified").map(({ change }) => ({
        id: change.id,
        renamed: change.renamed,
        geometryChanged: change.geometryChanged,
        appearanceChanged: change.appearanceChanged,
        visibilityChanged: change.visibilityChanged,
        before: compactChangedBody(change.before),
        after: compactChangedBody(change.after),
      })),
    },
    bodyPagination: {
      offset: bodyOffset,
      limit: bodyLimit,
      total: allBodyChanges.length,
      nextOffset: bodyOffset + page.length < allBodyChanges.length ? bodyOffset + page.length : null,
    },
  };
}

export function compactJournalChange(diff: SceneDiff | null): ConstructionHistoryEntry["change"] {
  const summarizeBody = (body: RuntimeState["bodies"][number]) => ({
    id: body.id,
    type: body.type,
    name: body.name,
    boundsMm: body.boundsMm,
    faceCount: body.faces.length,
    edgeCount: body.edges.length,
  });
  return {
    changed: diff?.changed ?? false,
    documentChanged: diff?.documentChanged ?? false,
    added: diff?.added.map(summarizeBody) ?? [],
    removed: diff?.removed.map(summarizeBody) ?? [],
    modified: diff?.modified.map(({ id, renamed, geometryChanged, appearanceChanged, visibilityChanged, after }) => ({
      id, renamed, geometryChanged, appearanceChanged, visibilityChanged, body: summarizeBody(after),
    })) ?? [],
    addedConstructionPlaneIds: diff?.constructionPlanesAdded.map((plane) => plane.nativeId) ?? [],
    removedConstructionPlaneIds: diff?.constructionPlanesRemoved.map((plane) => plane.nativeId) ?? [],
    modifiedConstructionPlaneIds: diff?.constructionPlanesModified.map((plane) => plane.nativeId) ?? [],
    activeWorkplaneChanged: diff?.activeWorkplaneChanged !== null && diff?.activeWorkplaneChanged !== undefined,
    materialsChanged: diff?.materialsChanged ?? false,
    measurementsChanged: diff?.measurementsChanged ?? false,
    sectionAnalysesChanged: diff?.sectionAnalysesChanged ?? false,
    instancesChanged: diff?.instancesChanged ?? false,
    referenceMeshesChanged: diff?.referenceMeshesChanged ?? false,
    groupsChanged: diff?.groupsChanged ?? false,
    staleDatumCount: diff?.staleDatums.length ?? 0,
  };
}

export function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

export type McpContentItem = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
export interface McpContentValue { __mcpContent: McpContentItem[] }

export function mcpContent(content: McpContentItem[]): McpContentValue {
  return { __mcpContent: content };
}

export function isMcpContent(value: unknown): value is McpContentValue {
  return typeof value === "object" && value !== null && Array.isArray((value as { __mcpContent?: unknown }).__mcpContent);
}

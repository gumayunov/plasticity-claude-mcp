import type { RuntimeState } from "./runtime.ts";
import type { ReferenceIdentity } from "./references.ts";

type Body = RuntimeState["bodies"][number];
type ConstructionPlane = RuntimeState["construction"]["planes"][number];
type Region = RuntimeState["regions"][number];
type Group = NonNullable<RuntimeState["groups"]>[number];
export interface GroupChange {
  id: number;
  name: string | null;
  change: "added" | "removed" | "modified";
  bodyIdsAdded?: number[];
  bodyIdsRemoved?: number[];
  childGroupIdsAdded?: number[];
  childGroupIdsRemoved?: number[];
  /** Fields other than the member lists that changed (name, parentId, visible, hidden, locked, instance or mesh members). */
  otherChanges?: string[];
}
export type TrackedDatum = ReferenceIdentity & { kind: "datum-point" | "datum-axis" };

export interface SceneDiff {
  fromRevision: string;
  toRevision: string;
  revisionChanged: boolean;
  sceneChanged: boolean;
  changed: boolean;
  documentChanged: boolean;
  added: Body[];
  removed: Body[];
  regionsAdded: Region[];
  regionsRemoved: Region[];
  regionsModified: Array<{ id: string; before: Region; after: Region }>;
  modified: Array<{
    id: number;
    renamed: boolean;
    geometryChanged: boolean;
    appearanceChanged: boolean;
    visibilityChanged: boolean;
    before: Body;
    after: Body;
  }>;
  constructionPlanesAdded: ConstructionPlane[];
  constructionPlanesRemoved: ConstructionPlane[];
  constructionPlanesModified: Array<{
    nativeId: string;
    before: ConstructionPlane;
    after: ConstructionPlane;
  }>;
  activeWorkplaneChanged: { before: string | null; after: string | null } | null;
  materialsChanged: boolean;
  measurementsChanged: boolean;
  sectionAnalysesChanged: boolean;
  instancesChanged: boolean;
  referenceMeshesChanged: boolean;
  groupsChanged: boolean;
  /** Per-group member deltas, so callers need not resend the whole group tree after every edit. */
  groupChanges: GroupChange[];
  staleDatums: Array<TrackedDatum & { reason: "document-changed" | "revision-changed" }>;
}

export function diffScenes(
  previous: RuntimeState,
  current: RuntimeState,
  trackedDatums: readonly TrackedDatum[] = [],
): SceneDiff {
  const documentChanged = previous.documentToken !== current.documentToken;
  const before = new Map(previous.bodies.map((body) => [body.id, body]));
  const after = new Map(current.bodies.map((body) => [body.id, body]));
  // Native body IDs are scoped to their document and may be reused after a
  // document switch. Never match bodies across that boundary.
  const added = current.bodies.filter((body) => documentChanged || !before.has(body.id));
  const removed = previous.bodies.filter((body) => documentChanged || !after.has(body.id));
  const modified: SceneDiff["modified"] = [];
  const beforeRegions = new Map(previous.regions.map((region) => [region.id, region]));
  const afterRegions = new Map(current.regions.map((region) => [region.id, region]));
  const regionsAdded = documentChanged
    ? current.regions
    : current.regions.filter((region) => !beforeRegions.has(region.id));
  const regionsRemoved = documentChanged
    ? previous.regions
    : previous.regions.filter((region) => !afterRegions.has(region.id));
  const regionsModified: SceneDiff["regionsModified"] = [];
  if (!documentChanged) {
    for (const region of current.regions) {
      const prior = beforeRegions.get(region.id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(region)) {
        regionsModified.push({ id: region.id, before: prior, after: region });
      }
    }
  }

  for (const body of documentChanged ? [] : current.bodies) {
    const old = before.get(body.id);
    if (!old) continue;
    const renamed = old.name !== body.name;
    const appearanceChanged = (old.materialId ?? 0) !== (body.materialId ?? 0);
    const visibilityChanged = old.visible !== body.visible || old.hidden !== body.hidden || old.locked !== body.locked;
    const geometryChanged =
      old.versionId !== body.versionId ||
      JSON.stringify(old.boundsMm) !== JSON.stringify(body.boundsMm) ||
      JSON.stringify(old.faceIds) !== JSON.stringify(body.faceIds) ||
      JSON.stringify(old.edgeIds) !== JSON.stringify(body.edgeIds) ||
      JSON.stringify(old.faces) !== JSON.stringify(body.faces) ||
      JSON.stringify(old.edges) !== JSON.stringify(body.edges) ||
      JSON.stringify(old.vertices) !== JSON.stringify(body.vertices);
    if (renamed || geometryChanged || appearanceChanged || visibilityChanged || old.type !== body.type) {
      modified.push({ id: body.id, renamed, geometryChanged, appearanceChanged, visibilityChanged, before: old, after: body });
    }
  }

  const previousPlanes = previous.construction.planes;
  const currentPlanes = current.construction.planes;
  const beforePlanes = new Map(previousPlanes.map((plane) => [planeKey(plane), plane]));
  const afterPlanes = new Map(currentPlanes.map((plane) => [planeKey(plane), plane]));
  const constructionPlanesAdded = documentChanged
    ? currentPlanes.filter((plane) => plane.source === "saved")
    : currentPlanes.filter((plane) => !beforePlanes.has(planeKey(plane)));
  const constructionPlanesRemoved = documentChanged
    ? previousPlanes.filter((plane) => plane.source === "saved")
    : previousPlanes.filter((plane) => !afterPlanes.has(planeKey(plane)));
  const constructionPlanesModified: SceneDiff["constructionPlanesModified"] = [];
  if (!documentChanged) {
    for (const plane of currentPlanes) {
      const prior = beforePlanes.get(planeKey(plane));
      if (prior && JSON.stringify(prior) !== JSON.stringify(plane)) {
        constructionPlanesModified.push({ nativeId: plane.nativeId, before: prior, after: plane });
      }
    }
  }
  const activeWorkplaneChanged = previous.construction.viewStateToken === current.construction.viewStateToken
    ? null
    : { before: previous.construction.activePlaneId, after: current.construction.activePlaneId };
  const materialsChanged = JSON.stringify(previous.materials ?? []) !== JSON.stringify(current.materials ?? []);
  const measurementsChanged = JSON.stringify(previous.measurements ?? []) !== JSON.stringify(current.measurements ?? []);
  const sectionAnalysesChanged = JSON.stringify(previous.sectionAnalyses ?? []) !== JSON.stringify(current.sectionAnalyses ?? []);
  const instancesChanged = JSON.stringify(previous.instances ?? []) !== JSON.stringify(current.instances ?? []);
  const referenceMeshesChanged = JSON.stringify(previous.referenceMeshes ?? []) !== JSON.stringify(current.referenceMeshes ?? []);
  const groupsChanged = previous.activeGroupId !== current.activeGroupId || JSON.stringify(previous.groups ?? []) !== JSON.stringify(current.groups ?? []);
  const groupChanges = groupsChanged ? diffGroups(documentChanged ? [] : previous.groups ?? [], current.groups ?? []) : [];
  const staleDatums: SceneDiff["staleDatums"] = [];
  for (const datum of trackedDatums) {
    if (datum.documentToken !== previous.documentToken || datum.revision !== previous.revision) continue;
    if (datum.documentToken !== current.documentToken) staleDatums.push({ ...datum, reason: "document-changed" });
    else if (datum.revision !== current.revision) staleDatums.push({ ...datum, reason: "revision-changed" });
  }
  const revisionChanged = previous.revision !== current.revision;
  const sceneChanged =
    documentChanged ||
    added.length > 0 || removed.length > 0 ||
    regionsAdded.length > 0 || regionsRemoved.length > 0 || regionsModified.length > 0 ||
    modified.length > 0 ||
    constructionPlanesAdded.length > 0 || constructionPlanesRemoved.length > 0 || constructionPlanesModified.length > 0 ||
    activeWorkplaneChanged !== null || materialsChanged || measurementsChanged || sectionAnalysesChanged ||
    instancesChanged || referenceMeshesChanged || groupsChanged;
  return {
    fromRevision: previous.revision,
    toRevision: current.revision,
    revisionChanged,
    sceneChanged,
    changed: sceneChanged || revisionChanged || staleDatums.length > 0,
    documentChanged,
    added,
    removed,
    regionsAdded,
    regionsRemoved,
    regionsModified,
    modified,
    constructionPlanesAdded,
    constructionPlanesRemoved,
    constructionPlanesModified,
    activeWorkplaneChanged,
    materialsChanged,
    measurementsChanged,
    sectionAnalysesChanged,
    instancesChanged,
    referenceMeshesChanged,
    groupsChanged,
    groupChanges,
    staleDatums,
  };
}

function diffGroups(previous: readonly Group[], current: readonly Group[]): GroupChange[] {
  const before = new Map(previous.map((group) => [group.id, group]));
  const after = new Map(current.map((group) => [group.id, group]));
  const changes: GroupChange[] = [];
  for (const group of current) {
    const old = before.get(group.id);
    if (!old) {
      changes.push({ id: group.id, name: group.name, change: "added", ...nonEmpty("bodyIdsAdded", group.bodyIds), ...nonEmpty("childGroupIdsAdded", group.childGroupIds) });
      continue;
    }
    if (JSON.stringify(old) === JSON.stringify(group)) continue;
    const otherChanges = (["name", "parentId", "visible", "hidden", "locked", "instanceIds", "referenceMeshIds", "otherNodeKeys"] as const)
      .filter((key) => JSON.stringify(old[key]) !== JSON.stringify(group[key]));
    changes.push({
      id: group.id,
      name: group.name,
      change: "modified",
      ...nonEmpty("bodyIdsAdded", group.bodyIds.filter((id) => !old.bodyIds.includes(id))),
      ...nonEmpty("bodyIdsRemoved", old.bodyIds.filter((id) => !group.bodyIds.includes(id))),
      ...nonEmpty("childGroupIdsAdded", group.childGroupIds.filter((id) => !old.childGroupIds.includes(id))),
      ...nonEmpty("childGroupIdsRemoved", old.childGroupIds.filter((id) => !group.childGroupIds.includes(id))),
      ...(otherChanges.length > 0 ? { otherChanges } : {}),
    });
  }
  for (const group of previous) {
    if (!after.has(group.id)) changes.push({ id: group.id, name: group.name, change: "removed" });
  }
  return changes;
}

function nonEmpty<K extends string>(key: K, values: readonly number[]): Partial<Record<K, number[]>> {
  return values.length > 0 ? { [key]: [...values] } as Record<K, number[]> : {};
}

function planeKey(plane: ConstructionPlane): string {
  return plane.source === "standard" ? plane.id : plane.nativeId;
}

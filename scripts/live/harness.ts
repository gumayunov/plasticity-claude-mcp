import type { McpCaller } from "./types.ts";

export const SMOKE_INTENT = "Live harness smoke check";

export class CheckFailure extends Error {
  override name = "CheckFailure";
}

export class ToolError extends Error {
  override name = "ToolError";
  readonly tool: string;

  constructor(tool: string, message: string) {
    super(`${tool}: ${message}`);
    this.tool = tool;
  }
}

export type Vec3 = [number, number, number];
export interface BoundsMm { min: Vec3; max: Vec3 }

export interface BodySummary {
  id: number;
  type: string;
  name: string | null;
  boundsMm: BoundsMm | null;
  faceCount: number;
  edgeCount: number;
}

export interface RegionSummary {
  id: string;
  displayBoundsMm: BoundsMm;
}

export interface DocumentSnapshot {
  revision: string;
  undoDepth: number;
  redoDepth: number;
  bodies: BodySummary[];
  regions: RegionSummary[];
  bodyTotal: number;
  instanceCount: number;
  nonRootGroupCount: number;
}

export interface MutationOutcome {
  result: any;
  before: DocumentSnapshot;
  after: DocumentSnapshot;
  added: BodySummary[];
  removed: BodySummary[];
  regionsAdded: RegionSummary[];
}

export function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CheckFailure(message);
}

export function expectClose(actual: number, expected: number, label: string, tolerance = 0.01): void {
  requireCondition(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, got ${actual}`,
  );
}

export function expectBounds(bounds: BoundsMm | null | undefined, min: Vec3, max: Vec3, label: string, tolerance = 0.01): void {
  requireCondition(bounds, `${label}: bounds are missing`);
  for (let axis = 0; axis < 3; axis += 1) {
    expectClose(bounds.min[axis]!, min[axis]!, `${label}.min[${axis}]`, tolerance);
    expectClose(bounds.max[axis]!, max[axis]!, `${label}.max[${axis}]`, tolerance);
  }
}

export function extentMm(bounds: BoundsMm | null | undefined, axis: 0 | 1 | 2, label: string): number {
  requireCondition(bounds, `${label}: bounds are missing`);
  return bounds.max[axis] - bounds.min[axis];
}

export function unionBounds(bodies: BodySummary[]): BoundsMm | null {
  const boxes = bodies.flatMap((body) => body.boundsMm ? [body.boundsMm] : []);
  if (boxes.length === 0) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const box of boxes) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, box.min[axis]!);
      max[axis] = Math.max(max[axis]!, box.max[axis]!);
    }
  }
  return { min, max };
}

export function parseToolResult(tool: string, response: unknown): any {
  if (typeof response !== "object" || response === null || !("content" in response) || !Array.isArray(response.content)) {
    throw new ToolError(tool, "returned no content");
  }
  const item = response.content.find((entry) =>
    typeof entry === "object" && entry !== null && entry.type === "text" && typeof entry.text === "string");
  if (!item) throw new ToolError(tool, "returned no text content");
  const text = item.text as string;
  if ("isError" in response && response.isError) throw new ToolError(tool, text.slice(0, 4000));
  try {
    return JSON.parse(text);
  } catch {
    throw new ToolError(tool, `returned non-JSON text: ${text.slice(0, 200)}`);
  }
}

export function toSnapshot(status: any): DocumentSnapshot {
  requireCondition(typeof status?.revision === "string", "Status has no revision");
  const bodies: BodySummary[] = Array.isArray(status.bodies) ? status.bodies : [];
  const total = typeof status.bodyPagination?.total === "number" ? status.bodyPagination.total : bodies.length;
  requireCondition(total === bodies.length, `Status is paginated (${bodies.length} of ${total} bodies); live checks expect small documents`);
  return {
    revision: status.revision,
    undoDepth: status.undoDepth,
    redoDepth: status.redoDepth,
    bodies,
    regions: Array.isArray(status.regions) ? status.regions : [],
    bodyTotal: total,
    instanceCount: Array.isArray(status.instances) ? status.instances.length : 0,
    nonRootGroupCount: Array.isArray(status.groups) ? status.groups.filter((group: { id: number }) => group.id !== 0).length : 0,
  };
}

export async function snapshot(mcp: McpCaller): Promise<DocumentSnapshot> {
  return toSnapshot(await mcp.call("plasticity_status", { bodyLimit: 200 }));
}

export function assertEmptyDocument(state: DocumentSnapshot): void {
  requireCondition(
    state.bodyTotal === 0 && state.regions.length === 0 && state.instanceCount === 0 && state.nonRootGroupCount === 0,
    `Document is not empty: bodies=${state.bodyTotal}, regions=${state.regions.length}, instances=${state.instanceCount}, groups=${state.nonRootGroupCount}`,
  );
}

export function diffSnapshots(before: DocumentSnapshot, after: DocumentSnapshot): Pick<MutationOutcome, "added" | "removed" | "regionsAdded"> {
  const beforeIds = new Set(before.bodies.map((body) => body.id));
  const afterIds = new Set(after.bodies.map((body) => body.id));
  const beforeRegions = new Set(before.regions.map((region) => region.id));
  return {
    added: after.bodies.filter((body) => !beforeIds.has(body.id)),
    removed: before.bodies.filter((body) => !afterIds.has(body.id)),
    regionsAdded: after.regions.filter((region) => !beforeRegions.has(region.id)),
  };
}

// Calls a revision-bound mutating tool with the current revision and reports what changed.
export async function mutate(mcp: McpCaller, tool: string, args: Record<string, unknown>): Promise<MutationOutcome> {
  const before = await snapshot(mcp);
  const result = await mcp.call(tool, { ...args, revision: before.revision });
  const after = await snapshot(mcp);
  return { result, before, after, ...diffSnapshots(before, after) };
}

export function onlyBody(bodies: BodySummary[], type: string, label: string): BodySummary {
  const matching = bodies.filter((body) => body.type === type);
  requireCondition(
    matching.length === 1,
    `${label}: expected exactly one ${type}, got ${bodies.map((body) => body.type).join(", ") || "none"}`,
  );
  return matching[0]!;
}

export function onlyRegion(regions: RegionSummary[], label: string): RegionSummary {
  requireCondition(regions.length === 1, `${label}: expected exactly one region, got ${regions.length}`);
  return regions[0]!;
}

export function readBinaryStlBounds(data: Uint8Array): { triangleCount: number; boundsMm: BoundsMm } {
  requireCondition(data.length >= 84, "STL is shorter than its header");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const triangleCount = view.getUint32(80, true);
  requireCondition(triangleCount > 0 && data.length === 84 + triangleCount * 50, `STL size ${data.length} does not match ${triangleCount} triangles`);
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const base = 84 + triangle * 50 + 12;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = view.getFloat32(base + vertex * 12 + axis * 4, true);
        min[axis] = Math.min(min[axis]!, value);
        max[axis] = Math.max(max[axis]!, value);
      }
    }
  }
  return { triangleCount, boundsMm: { min, max } };
}

export function hasSceneContentChanges(diff: {
  documentChanged: boolean;
  added: unknown[];
  removed: unknown[];
  modified: unknown[];
  constructionPlanesAdded: unknown[];
  constructionPlanesRemoved: unknown[];
  constructionPlanesModified: unknown[];
  activeWorkplaneChanged: unknown | null;
  materialsChanged?: boolean;
  measurementsChanged?: boolean;
  instancesChanged?: boolean;
  referenceMeshesChanged?: boolean;
  groupsChanged?: boolean;
}): boolean {
  return diff.documentChanged
    || diff.added.length > 0
    || diff.removed.length > 0
    || diff.modified.length > 0
    || diff.constructionPlanesAdded.length > 0
    || diff.constructionPlanesRemoved.length > 0
    || diff.constructionPlanesModified.length > 0
    || diff.activeWorkplaneChanged !== null
    || diff.materialsChanged === true
    || diff.measurementsChanged === true
    || diff.instancesChanged === true
    || diff.referenceMeshesChanged === true
    || diff.groupsChanged === true;
}

export function sanitizeEvidence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeEvidence(item));
  if (typeof value !== "object" || value === null) return value;
  const forbidden = new Set(["password", "secret", "credential", "accessCode", "prompt", "fullPrompt", "nativeDump", "nativeObject", "rawNative"]);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !forbidden.has(key))
    .map(([key, entry]) => [key, sanitizeEvidence(entry)]));
}

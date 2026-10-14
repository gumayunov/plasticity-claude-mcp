import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { type RuntimeState } from "../runtime.ts";
import { add, cross, dot, normalize, scale, subtract } from "../construction.ts";
import { type DatumReference, type ReferenceIdentity } from "../references.ts";
import { type Resolution } from "../semantic.ts";
import { millimetersToMeters } from "../units.ts";
import { type EdgeReference, type FaceReference } from "../measurements.ts";
import { type Vector3, type NativeFaceDraftSamples, type FaceDraftAnalysis, type FaceDraftClassification, type VertexReference } from "./types.ts";

export function toMeters(vector: Vector3): Vector3 {
  return vector.map(millimetersToMeters) as Vector3;
}

export function requirePositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive finite number`);
}

export function threePointCircleGeometry(
  first: Vector3,
  second: Vector3,
  third: Vector3,
  label: string,
): { center: Vector3; normal: Vector3 } {
  const firstToSecond = subtract(second, first);
  const firstToThird = subtract(third, first);
  const firstSquared = dot(firstToSecond, firstToSecond);
  const secondSquared = dot(firstToThird, firstToThird);
  if (firstSquared <= 1e-18 || secondSquared <= 1e-18 || dot(subtract(third, second), subtract(third, second)) <= 1e-18) {
    throw new Error(`${label} points must be distinct`);
  }
  const planeVector = cross(firstToSecond, firstToThird);
  const planeSquared = dot(planeVector, planeVector);
  if (Math.sqrt(planeSquared) <= 1e-9) throw new Error(`${label} points are collinear or too close to collinear`);
  const centerOffset = scale(add(
    scale(cross(firstToThird, planeVector), firstSquared),
    scale(cross(planeVector, firstToSecond), secondSquared),
  ), 1 / (2 * planeSquared));
  const center = add(first, centerOffset);
  return {
    center,
    normal: normalize(planeVector, `${label} plane normal`),
  };
}

export function requireResolution<T>(resolution: Resolution<T>): T {
  if (resolution.status === "resolved") return resolution.value;
  if (resolution.status === "ambiguous") throw new Error(`Geometry reference is ambiguous: ${resolution.matches} matches`);
  throw new Error(resolution.reason);
}

export function summarizeFaceDraftSamples(
  entry: NativeFaceDraftSamples,
  pullDirection: Vector3,
  minimumDraftDeg: number,
): FaceDraftAnalysis {
  if (entry.samples.length === 0) throw new Error(`Native face draft samples are empty for ${entry.face.bodyId}:${entry.face.faceId}`);
  const classified = entry.samples.map((sample) => {
    if (sample.positionMm.length !== 3 || !sample.positionMm.every(Number.isFinite)) {
      throw new Error(`Native face draft position is invalid for ${entry.face.bodyId}:${entry.face.faceId}`);
    }
    const normal = normalize(sample.normal, "Native face draft normal");
    const signedDraftDeg = Math.asin(Math.max(-1, Math.min(1, dot(normal, pullDirection)))) * 180 / Math.PI;
    const classification: Exclude<FaceDraftClassification, "mixed"> = signedDraftDeg >= minimumDraftDeg
      ? "positive"
      : signedDraftDeg <= -minimumDraftDeg
        ? "negative"
        : "neutral";
    return { positionMm: sample.positionMm, normal, signedDraftDeg, classification };
  });
  let minimum = classified[0]!;
  let maximum = classified[0]!;
  let minimumAbsoluteDraftDeg = Math.abs(classified[0]!.signedDraftDeg);
  let maximumAbsoluteDraftDeg = minimumAbsoluteDraftDeg;
  const sampleCounts = { positive: 0, negative: 0, neutral: 0 };
  for (const sample of classified) {
    if (sample.signedDraftDeg < minimum.signedDraftDeg) minimum = sample;
    if (sample.signedDraftDeg > maximum.signedDraftDeg) maximum = sample;
    minimumAbsoluteDraftDeg = Math.min(minimumAbsoluteDraftDeg, Math.abs(sample.signedDraftDeg));
    maximumAbsoluteDraftDeg = Math.max(maximumAbsoluteDraftDeg, Math.abs(sample.signedDraftDeg));
    sampleCounts[sample.classification] += 1;
  }
  const occupied = (Object.keys(sampleCounts) as Array<keyof typeof sampleCounts>).filter((key) => sampleCounts[key] > 0);
  const classification: FaceDraftClassification = occupied.length === 1 ? occupied[0]! : "mixed";
  return {
    face: entry.face,
    bodyVersionId: entry.bodyVersionId,
    surfaceType: entry.surfaceType,
    measurementSource: "native-brep-face-normal-grid",
    classification,
    sampleCount: classified.length,
    sampleCounts,
    minimumSignedDraft: { valueDeg: minimum.signedDraftDeg, positionMm: minimum.positionMm, normal: minimum.normal },
    maximumSignedDraft: { valueDeg: maximum.signedDraftDeg, positionMm: maximum.positionMm, normal: maximum.normal },
    minimumAbsoluteDraftDeg,
    maximumAbsoluteDraftDeg,
  };
}

export function leastParallelWorldAxis(normal: Vector3): Vector3 {
  const axes: Vector3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  return axes.reduce((best, candidate) => Math.abs(dot(candidate, normal)) < Math.abs(dot(best, normal)) ? candidate : best);
}

export function requireVertexReference(state: RuntimeState, reference: VertexReference, name: string): void {
  const body = state.bodies.find((candidate) => candidate.id === reference.bodyId);
  if (!body?.vertices?.some((vertex) => vertex.id === reference.vertexId)) {
    throw new Error(`${name} must reference a current native B-Rep vertex`);
  }
}

export function requireInstanceIds(state: RuntimeState, ids: number[]): void {
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new Error("Instance IDs must be a nonempty unique list");
  }
  const current = new Set((state.instances ?? []).map((instance) => instance.id));
  const missing = ids.filter((id) => !current.has(id));
  if (missing.length > 0) throw new Error(`Unknown current native instance IDs: ${missing.join(", ")}`);
}

export function requireReferenceMeshIds(state: RuntimeState, ids: number[]): void {
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new Error("Reference mesh IDs must be a nonempty unique list");
  }
  const current = new Set((state.referenceMeshes ?? []).map((mesh) => mesh.id));
  const missing = ids.filter((id) => !current.has(id));
  if (missing.length > 0) throw new Error(`Unknown current reference mesh IDs: ${missing.join(", ")}`);
}

export function requireGroupIds(state: RuntimeState, ids: number[], allowRoot: boolean): void {
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new Error("Group IDs must be a nonempty unique list");
  }
  if (!allowRoot && ids.includes(0)) throw new Error("The root Scene group is protected");
  const current = new Set((state.groups ?? []).map((group) => group.id));
  const missing = ids.filter((id) => !current.has(id));
  if (missing.length > 0) throw new Error(`Unknown current group IDs: ${missing.join(", ")}`);
}

export function requireGroupSelection(
  state: RuntimeState,
  bodyIds: number[],
  instanceIds: number[],
  referenceMeshIds: number[],
  groupIds: number[],
  allowRoot = false,
): void {
  if (bodyIds.length + instanceIds.length + referenceMeshIds.length + groupIds.length === 0) {
    throw new Error("A group operation requires at least one body, instance, reference mesh, or group ID");
  }
  if (new Set(bodyIds).size !== bodyIds.length) throw new Error("Body IDs must be unique");
  if (new Set(instanceIds).size !== instanceIds.length) throw new Error("Instance IDs must be unique");
  if (new Set(referenceMeshIds).size !== referenceMeshIds.length) throw new Error("Reference mesh IDs must be unique");
  if (new Set(groupIds).size !== groupIds.length) throw new Error("Group IDs must be unique");
  const currentBodies = new Set(state.bodies.map((body) => body.id));
  const missingBodies = bodyIds.filter((id) => !currentBodies.has(id));
  if (missingBodies.length > 0) throw new Error(`Unknown current body IDs: ${missingBodies.join(", ")}`);
  if (instanceIds.length > 0) requireInstanceIds(state, instanceIds);
  if (referenceMeshIds.length > 0) requireReferenceMeshIds(state, referenceMeshIds);
  if (groupIds.length > 0) requireGroupIds(state, groupIds, allowRoot);
}

export function requireMeshExportBodies(state: RuntimeState, ids: number[], format = "3MF"): void {
  if (ids.length === 0 || new Set(ids).size !== ids.length) throw new Error(`${format} body IDs must be a nonempty unique list`);
  const bodies = new Map(state.bodies.map((body) => [body.id, body]));
  const missing = ids.filter((id) => !bodies.has(id));
  if (missing.length > 0) throw new Error(`Unknown current body IDs: ${missing.join(", ")}`);
  const invalid = ids.filter((id) => {
    const type = bodies.get(id)!.type;
    return type !== "Solid" && type !== "Sheet";
  });
  if (invalid.length > 0) throw new Error(`${format} export requires current Solid or Sheet bodies: ${invalid.join(", ")}`);
}

export function formatSvgNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("SVG coordinates must be finite");
  const rounded = Number(value.toFixed(12));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function escapeSvgAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&apos;");
}

export function requireWireBodyIds(state: RuntimeState, ids: number[]): void {
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new Error("Wire IDs must be a nonempty unique list");
  }
  const bodies = new Map(state.bodies.map((body) => [body.id, body]));
  const missing = ids.filter((id) => !bodies.has(id));
  if (missing.length > 0) throw new Error(`Unknown current Wire ID: ${missing.join(", ")}`);
  const invalid = ids.filter((id) => bodies.get(id)!.type !== "Wire");
  if (invalid.length > 0) throw new Error(`Curve selection accepts current Wire IDs only: ${invalid.join(", ")}`);
}

export function requireHiddenLineBodies(state: RuntimeState, ids: number[]): void {
  if (ids.length === 0 || ids.length > 128 || new Set(ids).size !== ids.length) {
    throw new Error("Hidden-line body IDs must be a nonempty unique list of at most 128 bodies");
  }
  const bodies = new Map(state.bodies.map((body) => [body.id, body]));
  const missing = ids.filter((id) => !bodies.has(id));
  if (missing.length > 0) throw new Error(`Unknown current body IDs: ${missing.join(", ")}`);
  const invalid = ids.filter((id) => bodies.get(id)!.type !== "Solid");
  if (invalid.length > 0) throw new Error(`Hidden-line export requires current native Solid bodies: ${invalid.join(", ")}`);
}

export function requireCadExportBodies(state: RuntimeState, ids: number[], format: string): void {
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new Error(`${format} body IDs must be a nonempty unique list`);
  }
  const current = new Set(state.bodies.map((body) => body.id));
  const missing = ids.filter((id) => !current.has(id));
  if (missing.length > 0) throw new Error(`Unknown current body IDs: ${missing.join(", ")}`);
}

export async function validateParasolidPath(path: string, label: string): Promise<number> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const file = await handle.stat();
    if (!file.isFile()) throw new Error(`${label} must be a regular file`);
    const bytes = Buffer.alloc(Math.min(file.size, 512));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const header = bytes.subarray(0, bytesRead).toString("latin1");
    if (file.size < 96 || !header.startsWith("**") || !header.includes("PARASOLID")) {
      throw new Error("Plasticity produced or received an invalid Parasolid file");
    }
    return file.size;
  } finally {
    await handle.close();
  }
}

export function groupContains(state: RuntimeState, ancestorId: number, candidateId: number): boolean {
  const groups = new Map((state.groups ?? []).map((group) => [group.id, group]));
  const pending = [...(groups.get(ancestorId)?.childGroupIds ?? [])];
  const visited = new Set<number>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === candidateId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(groups.get(current)?.childGroupIds ?? []));
  }
  return false;
}

export function requireTopologySelection(
  state: RuntimeState,
  references: FaceReference[] | EdgeReference[],
  kind: "face" | "edge",
): void {
  if (references.length === 0) throw new Error(`At least one ${kind} reference is required`);
  const keys = references.map((reference) => `${reference.bodyId}:${kind === "face" ? (reference as FaceReference).faceId : (reference as EdgeReference).edgeId}`);
  if (new Set(keys).size !== keys.length) throw new Error(`${kind === "face" ? "Face" : "Edge"} references must be unique`);
  const missing = references.filter((reference) => {
    const body = state.bodies.find((candidate) => candidate.id === reference.bodyId);
    const id = kind === "face" ? (reference as FaceReference).faceId : (reference as EdgeReference).edgeId;
    return !body || !(kind === "face" ? body.faceIds : body.edgeIds).includes(id);
  });
  if (missing.length > 0) throw new Error(`Unknown current ${kind} references: ${missing.map((reference) => reference.bodyId).join(", ")}`);
}

export function requireSingleTopologyBody(references: FaceReference[] | EdgeReference[], label: string): void {
  if (new Set(references.map((reference) => reference.bodyId)).size !== 1) {
    throw new Error(`${label} must belong to one body`);
  }
}

export function assertRefreshIdentity(
  record: DatumReference,
  supplied: ReferenceIdentity,
  sessionId: string,
  documentToken: string,
): void {
  if (supplied.sessionId !== sessionId || record.sessionId !== supplied.sessionId) {
    throw new Error("Datum reference belongs to another MCP session");
  }
  if (supplied.documentToken !== documentToken || record.documentToken !== supplied.documentToken) {
    throw new Error("Datum reference belongs to another Plasticity document");
  }
  if (record.id !== supplied.id || record.revision !== supplied.revision) {
    throw new Error(`Stale datum reference identity: ${supplied.id}`);
  }
}

export function nearlyParallel(left: Vector3, right: Vector3): boolean {
  const leftLength = Math.hypot(...left);
  const rightLength = Math.hypot(...right);
  const cosine = Math.abs(left.reduce((sum, value, index) => sum + value * right[index]!, 0) / (leftLength * rightLength));
  return cosine > 0.999_999;
}

export function vectorsNear(left: Vector3, right: Vector3, tolerance = 1e-12): boolean {
  return left.every((value, index) => Math.abs(value - right[index]!) <= tolerance);
}

export async function assertAbsent(path: string): Promise<void> {
  try {
    await stat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Refusing to overwrite existing file: ${path}`);
}

// Resolves symlinks when the file exists, so /tmp and /private/tmp compare equal.
export async function canonicalPath(path: string): Promise<string> {
  const absolute = resolve(path);
  try {
    return await realpath(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return absolute;
    throw error;
  }
}

export function validateBinaryStl(data: Buffer): number {
  if (data.length < 84) throw new Error("Plasticity produced an invalid binary STL file");
  const triangles = data.readUInt32LE(80);
  if (data.length !== 84 + triangles * 50) throw new Error("Plasticity produced a truncated or malformed binary STL file");
  return triangles;
}

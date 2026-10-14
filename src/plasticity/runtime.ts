import { CdpClient, type ScreenshotOptions } from "../cdp/client.ts";
import type { PlasticityTarget } from "../cdp/discovery.ts";
import type { ConstructionPlaneDescriptor } from "./construction.ts";
import { discoverNativeReferences } from "./compat/discovery.ts";
import { CompatibilityError } from "./compat/errors.ts";
import { resolveProfile } from "./compat/profiles/index.ts";
import type { CompatProfile, ResolvedProfile } from "./compat/types.ts";
import { detectPlasticityVersion } from "./compat/version.ts";
import { MISSING_EDITOR_PATHS_PREFIX, withEditorCompat } from "./compat/editor-paths.ts";
import { STATE_READ_FUNCTION } from "./state-read-function.ts";

export const NATIVE_STATE_READ_TIMEOUT_MS = 300_000;
export const LONG_NATIVE_IMPORT_TIMEOUT_MS = 300_000;
// UTF-16 code units per slice; at most 3 UTF-8 bytes each keeps a slice far below the 128 MiB frame limit.
export const CHUNKED_READ_SLICE_CHARS = 16 * 1024 * 1024;

interface RemoteObject {
  objectId?: string;
  value?: unknown;
  description?: string;
}

interface PropertyDescriptor {
  name: string;
  value?: RemoteObject;
}

interface CallResult {
  result?: RemoteObject;
  exceptionDetails?: { text?: string; exception?: RemoteObject };
}

export function mutationOutcomeIsUncertain(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /^(?:CDP request timed out:|CDP connection (?:is closed|closed before the request completed))/i.test(error.message);
}

export interface RuntimeState {
  targetId: string;
  title: string;
  documentToken: string;
  revision: string;
  dbVersion: number | null;
  undoDepth: number;
  redoDepth: number;
  materials?: Array<{
    id: number;
    name: string;
    colorHex: string | null;
    roughness: number | null;
    metalness: number | null;
    opacity: number | null;
  }>;
  measurements?: Array<{
    id: number;
    versionId: number;
    type: string;
    name: string | null;
    measurementSource: "native-brep";
    first: { bodyId: number | null; topologyId: number; landmark: number; topologyType?: "vertex" | "edge" | "face" | null; topologyRefId?: number | string | null; positionMm: [number, number, number] | null } | null;
    second: { bodyId: number | null; topologyId: number; landmark: number; topologyType?: "vertex" | "edge" | "face" | null; topologyRefId?: number | string | null; positionMm: [number, number, number] | null } | null;
    distanceMm: number | null;
    direction: [number, number, number] | null;
    normal: [number, number, number] | null;
    offsetMm: number[];
    radiusMm?: number | null;
    diameterMm?: number | null;
  }>;
  sectionAnalyses?: Array<{
    id: number;
    versionId: number;
    name: string | null;
    originMm: [number, number, number];
    normal: [number, number, number];
    visible: boolean;
    registeredViewportCount: number;
  }>;
  instances?: Array<{
    id: number;
    type: "Instance";
    targetKey: number;
    targetName: string | null;
    sourceBodyIds: number[];
    translationMm: [number, number, number];
    rotationQuaternion: [number, number, number, number];
    scale: [number, number, number];
    matrixWorldMm: number[];
    visible: boolean;
    hidden: boolean;
    locked: boolean;
  }>;
  referenceMeshes?: Array<{
    id: number;
    type: "ReferenceMesh";
    name: string | null;
    sourcePath: string;
    sourceFormat: "stl" | "obj" | "3mf" | "unknown";
    measurementSource: "reference-mesh";
    boundsMm: { min: [number, number, number]; max: [number, number, number] } | null;
    translationMm: [number, number, number];
    rotationQuaternion: [number, number, number, number];
    sceneScaleToMeters: [number, number, number];
    vertexEntries: number;
    triangles: number;
    visible: boolean;
    hidden: boolean;
    locked: boolean;
  }>;
  activeGroupId?: number;
  groups?: Array<{
    id: number;
    name: string | null;
    parentId: number | null;
    childGroupIds: number[];
    bodyIds: number[];
    instanceIds: number[];
    referenceMeshIds: number[];
    otherNodeKeys: number[];
    visible: boolean;
    hidden: boolean;
    locked: boolean;
  }>;
  construction: {
    planes: ConstructionPlaneDescriptor[];
    activePlaneId: string | null;
    planeStateToken: string;
    viewStateToken: string;
  };
  regions: Array<{
    id: string;
    entityId: number;
    islandVersionId: number;
    sketchId: number;
    sketchWireIds: number[];
    measurementSource: "render-mesh";
    displayBoundsMm: { min: [number, number, number]; max: [number, number, number] };
  }>;
  bodies: Array<{
    id: number;
    versionId: number;
    type: string;
    name: string | null;
    materialId?: number;
    visible?: boolean;
    hidden?: boolean;
    locked?: boolean;
    boundsMm: { min: [number, number, number]; max: [number, number, number] } | null;
    faceIds: string[];
    edgeIds: string[];
    faces: Array<{
      id: string;
      surfaceType: string;
      planar: boolean;
      centerMm: [number, number, number];
      normal: [number, number, number];
      radiusMm: number | null;
      blendRadiusMm: number | null;
      axisOriginMm: [number, number, number] | null;
      axisDirection: [number, number, number] | null;
      coneBasisRadiusMm?: number;
      coneSemiAngleRad?: number;
      boundsMm: { min: [number, number, number]; max: [number, number, number] };
      edgeIds: string[];
    }>;
    edges: Array<{
      id: string;
      curveType: string;
      line: boolean;
      circle: boolean;
      lengthMm: number;
      centerMm: [number, number, number];
      tangent: [number, number, number];
      boundsMm: { min: [number, number, number]; max: [number, number, number] };
      faceIds: string[];
      vertexIds: number[];
      circleGeometry?: {
        centerMm: [number, number, number];
        radiusMm: number;
        normal: [number, number, number];
        reference: [number, number, number];
        startMm: [number, number, number];
        midpointMm: [number, number, number];
        endMm: [number, number, number];
      };
    }>;
    vertices?: Array<{
      id: number;
      positionMm: [number, number, number];
      edgeIds: string[];
      faceIds: string[];
    }>;
  }>;
}

export interface RuntimeCompatibility {
  version: string | null;
  status: "supported" | "untested";
  profile: string;
  discoveryStrategy: string;
  warnings: string[];
}

export interface CompatibilityProbe {
  compatibility: RuntimeCompatibility;
  bindings: string[];
  commands: string[];
  missingPaths: string[];
}

export class PlasticityRuntime {
  private client: CdpClient;
  private readonly target: PlasticityTarget;
  private editorId: string;
  private readonly bindings = new Map<string, string>();
  private discoveryStrategy = "";
  private resolved: ResolvedProfile = resolveProfile("26.1.3");
  private version: string | null = null;
  private versionWarnings: string[] = [];
  private operationTail: Promise<void> = Promise.resolve();
  private uncertain = false;
  private readonly connectClient: (url: string) => Promise<CdpClient>;

  private readonly chunkedReadSliceChars: number = CHUNKED_READ_SLICE_CHARS;

  private constructor(client: CdpClient, target: PlasticityTarget, editorId: string, connectClient = CdpClient.connect) {
    this.client = client;
    this.target = target;
    this.editorId = editorId;
    this.connectClient = connectClient;
  }

  static async connect(target: PlasticityTarget, options: { applicationPath?: string } = {}): Promise<PlasticityRuntime> {
    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    const runtime = new PlasticityRuntime(client, target, "", CdpClient.connect);
    try {
      await client.send("Runtime.enable");
      const agent = await client.send("Runtime.evaluate", { expression: "navigator.userAgent", returnByValue: true }) as { result?: { value?: unknown } };
      const detected = await detectPlasticityVersion({
        applicationPath: options.applicationPath ?? process.env.PLASTICITY_APP_PATH ?? "/Applications/Plasticity.app",
        userAgent: typeof agent.result?.value === "string" ? agent.result.value : null,
      });
      runtime.version = detected.version;
      runtime.versionWarnings = detected.warnings;
      runtime.resolved = resolveProfile(detected.version);
      await runtime.refreshNativeReferences();
      return runtime;
    } catch (error) {
      runtime.close();
      throw error;
    }
  }


  getProfile(): CompatProfile {
    return this.resolved.profile;
  }

  getCompatibility(): RuntimeCompatibility {
    const warnings = [...this.versionWarnings];
    if (this.resolved.status === "untested") {
      warnings.push(`Plasticity ${this.version ?? "(unknown version)"} is not verified; using profile ${this.resolved.profile.version}. Run plasticity_compatibility_report`);
    }
    return { version: this.version, status: this.resolved.status, profile: this.resolved.profile.version, discoveryStrategy: this.discoveryStrategy, warnings };
  }

  async probeCompatibility(): Promise<CompatibilityProbe> {
    const result = await this.read<{ commands: string[]; missingPaths: string[] }>(`function (paths) {
      const missingPaths = [];
      for (const [name, declared] of Object.entries(paths)) {
        if (declared.startsWith("?")) continue;
        let value = this;
        for (const key of declared.split(".")) value = value === null || value === undefined ? undefined : value[key];
        if (value === undefined) missingPaths.push(name);
      }
      const commands = this.commands ? Object.getOwnPropertyNames(this.commands) : [];
      return { commands, missingPaths };
    }`, [this.resolved.profile.editorPaths]);
    return { compatibility: this.getCompatibility(), bindings: this.getCapabilities(), commands: result.commands.sort(), missingPaths: result.missingPaths };
  }

  getCapabilities(): string[] {
    return [...this.bindings.keys()].sort();
  }

  isUncertain(): boolean {
    return this.uncertain;
  }

  markUncertain(): void {
    this.uncertain = true;
  }

  async reconnect(): Promise<void> {
    await this.enqueue(async () => {
      if (this.uncertain) throw new Error("Previous mutation outcome is uncertain; reconcile before reconnecting");
      const replacement = await this.connectClient(this.target.webSocketDebuggerUrl);
      const previousClient = this.client;
      const previousEditorId = this.editorId;
      const previousBindings = new Map(this.bindings);
      try {
        await replacement.send("Runtime.enable");
        this.client = replacement;
        this.editorId = "";
        this.bindings.clear();
        await this.refreshNativeReferences();
        previousClient.close();
      } catch (error) {
        if (this.client === replacement) {
          this.client = previousClient;
          this.editorId = previousEditorId;
          this.bindings.clear();
          for (const [name, objectId] of previousBindings) this.bindings.set(name, objectId);
        }
        replacement.close();
        throw error;
      }
    });
  }

  async read<T>(functionDeclaration: string, values: unknown[] = [], timeoutMs?: number): Promise<T> {
    return await this.enqueue(() => this.call<T>(functionDeclaration, [], values, timeoutMs));
  }

  async readNative<T>(
    functionDeclaration: string,
    bindingNames: string[],
    values: unknown[] = [],
    timeoutMs?: number,
  ): Promise<T> {
    return await this.enqueue(() => this.call<T>(functionDeclaration, bindingNames, values, timeoutMs));
  }

  // Like readNative, but for results that can exceed the WebSocket message limit (Node's WebSocket
  // drops frames above 128 MiB). The renderer serializes the result once and Node fetches it in slices.
  async readNativeChunked<T>(
    functionDeclaration: string,
    bindingNames: string[],
    values: unknown[] = [],
    timeoutMs?: number,
  ): Promise<T> {
    return await this.enqueue(async () => {
      const staged = await this.call<{ key: string; length: number }>(`function (...args) {
        const read = (${functionDeclaration});
        const stage = (value) => {
          const text = JSON.stringify(value === undefined ? null : value);
          const key = '__plasticityMcpChunked_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
          Object.defineProperty(globalThis, key, { value: text, configurable: true, writable: true });
          return { key, length: text.length };
        };
        const value = read.apply(this, args);
        return value && typeof value.then === 'function' ? value.then(stage) : stage(value);
      }`, bindingNames, values, timeoutMs);
      try {
        const parts: string[] = [];
        for (let start = 0; start < staged.length; start += this.chunkedReadSliceChars) {
          parts.push(await this.call<string>(
            "function (key, start, end) { return globalThis[key].slice(start, end); }",
            [],
            [staged.key, start, start + this.chunkedReadSliceChars],
            timeoutMs,
          ));
        }
        return JSON.parse(parts.join("")) as T;
      } finally {
        await this.call("function (key) { delete globalThis[key]; }", [], [staged.key], timeoutMs).catch(() => undefined);
      }
    });
  }

  async mutate<T>(
    functionDeclaration: string,
    bindingNames: string[],
    values: unknown[] = [],
    timeoutMs?: number,
  ): Promise<T> {
    return await this.enqueue(async () => {
      if (this.uncertain) throw new Error("Previous mutation outcome is uncertain; call reconcile before another mutation");
      try {
        return await this.call<T>(functionDeclaration, bindingNames, values, timeoutMs);
      } catch (error) {
        if (mutationOutcomeIsUncertain(error)) this.uncertain = true;
        throw error;
      }
    });
  }

  async reconcile(timeoutMs = NATIVE_STATE_READ_TIMEOUT_MS): Promise<RuntimeState> {
    const state = await this.getState(timeoutMs);
    this.uncertain = false;
    return state;
  }

  async getState(timeoutMs = NATIVE_STATE_READ_TIMEOUT_MS): Promise<RuntimeState> {
    let result: Omit<RuntimeState, "targetId" | "title">;
    try {
      result = await this.readNativeChunked<Omit<RuntimeState, "targetId" | "title">>(
        withEditorCompat(STATE_READ_FUNCTION, this.resolved.profile.editorPaths),
        ["ConstructionPlaneDatabase", "Vector3", "Quaternion"],
        [],
        timeoutMs,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const index = message.indexOf(MISSING_EDITOR_PATHS_PREFIX);
      if (index < 0) throw error;
      const missingPaths = message.slice(index + MISSING_EDITOR_PATHS_PREFIX.length).split(", ").map((entry) => entry.split("=")[0]!);
      throw new CompatibilityError({ version: this.version, profile: this.resolved.profile.version, missingPaths });
    }
    return { targetId: this.target.id, title: this.target.title, ...result };
  }

  close(): void {
    this.client.close();
  }

  async cdp(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return await this.enqueue(() => this.client.send(method, params));
  }

  async captureScreenshot(options: ScreenshotOptions = {}): Promise<string> {
    return await this.enqueue(() => this.client.captureScreenshot(undefined, options));
  }

  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const prior = this.operationTail;
    let release: (() => void) | undefined;
    this.operationTail = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    try {
      return await operation();
    } finally {
      release?.();
    }
  }

  private async refreshNativeReferences(): Promise<void> {
    const discovered = await discoverNativeReferences(this.client);
    const retained = new Set([discovered.editorId, ...discovered.bindings.values()]);
    const previous = new Set([this.editorId, ...this.bindings.values()].filter(Boolean));
    this.editorId = discovered.editorId;
    this.discoveryStrategy = discovered.strategy;
    this.bindings.clear();
    for (const [name, objectId] of discovered.bindings) this.bindings.set(name, objectId);
    await this.releaseObjects([...previous, ...discovered.temporaryObjectIds], retained);
  }

  private async releaseObjects(objectIds: readonly string[], retained: ReadonlySet<string>): Promise<void> {
    await Promise.all([...new Set(objectIds)].filter((id) => id && !retained.has(id)).map(async (objectId) => {
      await this.client.send("Runtime.releaseObject", { objectId }).catch(() => undefined);
    }));
  }

  private async call<T>(functionDeclaration: string, bindingNames: string[], values: unknown[], timeoutMs?: number): Promise<T> {
    const args: Array<{ objectId?: string; value?: unknown }> = [];
    for (const name of bindingNames) {
      const resolvedName = this.resolved.profile.bindingAliases[name] ?? name;
      const objectId = this.bindings.get(resolvedName);
      if (!objectId) throw new CompatibilityError({ version: this.version, profile: this.resolved.profile.version, missingBinding: name });
      args.push({ objectId });
    }
    for (const value of values) args.push({ value });
    const response = await this.client.send("Runtime.callFunctionOn", {
      objectId: this.editorId,
      functionDeclaration,
      arguments: args,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    }, timeoutMs) as CallResult;
    if (response.exceptionDetails) {
      const detail = response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? "unknown renderer error";
      throw new Error(`Plasticity command failed: ${detail}`);
    }
    return response.result?.value as T;
  }
}

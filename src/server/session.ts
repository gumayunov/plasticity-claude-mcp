import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { discoverPlasticityTargets } from "../cdp/discovery.ts";
import { diffScenes, type TrackedDatum } from "../plasticity/change-tracker.ts";
import { PlasticityOperations } from "../plasticity/operations/index.ts";
import { acquireWindowOwnership, type WindowOwnership } from "../plasticity/ownership.ts";
import { connectSessionWindow, type SessionConnection } from "../plasticity/session-lifecycle.ts";
import { PlasticityRuntime, type RuntimeState } from "../plasticity/runtime.ts";
import type { AnalysisClient } from "../codex/analysis-client.ts";
import type { ReferenceSearchClient } from "../codex/reference-search-client.ts";
import type { CadBinding } from "../strength/contracts.ts";
import { type StrengthDependencies } from "../strength/mcp.ts";
import { StrengthStore } from "../strength/store.ts";
import { FemReportStore } from "../strength/fem/fem-report-store.ts";
import { CohesiveReportStore } from "../strength/fem/cohesive-report-store.ts";
import { analyzeStaticSolid } from "../strength/fem/analyze-static.ts";
import { analyzeCohesiveInterface, type CohesiveAnalysisRequest } from "../strength/fem/cohesive-analysis.ts";
import { result } from "./results.ts";

export class PlasticitySession {
  private runtime: PlasticityRuntime | undefined;
  private operations: PlasticityOperations | undefined;
  private ownership: WindowOwnership | undefined;
  private targetId: string | undefined;
  private readonly snapshots = new Map<string, {
    label: string | null;
    capturedAt: string;
    state: Awaited<ReturnType<PlasticityOperations["state"]>>;
    datums: TrackedDatum[];
  }>();

  async windows() {
    return await discoverPlasticityTargets(process.env.PLASTICITY_CDP_URL ?? "http://127.0.0.1:9223");
  }

  async connect(targetId: string) {
    const target = (await this.windows()).find((candidate) => candidate.id === targetId);
    if (!target) throw new Error(`Plasticity window not found: ${targetId}`);
    const current: SessionConnection<RuntimeState, PlasticityRuntime, PlasticityOperations, WindowOwnership> | undefined =
      this.runtime && this.operations && this.ownership && this.targetId
        ? { targetId: this.targetId, runtime: this.runtime, operations: this.operations, ownership: this.ownership }
        : undefined;
    const result = await connectSessionWindow({
      targetId,
      target,
      current,
      acquireOwnership: acquireWindowOwnership,
      connectRuntime: (selectedTarget) => PlasticityRuntime.connect(selectedTarget),
      createOperations: (runtime) => new PlasticityOperations(runtime),
    });
    this.runtime = result.connection.runtime;
    this.operations = result.connection.operations;
    this.ownership = result.connection.ownership;
    this.targetId = result.connection.targetId;
    if (current !== result.connection) this.snapshots.clear();
    return result.state;
  }

  get(): PlasticityOperations {
    if (!this.operations) throw new Error("Connect to an explicit Plasticity window first");
    return this.operations;
  }

  capabilities(): {
    bindings: string[];
    operations: ReturnType<PlasticityOperations["constructionCapabilities"]>;
  } {
    if (!this.runtime) throw new Error("Connect to an explicit Plasticity window first");
    return { bindings: this.runtime.getCapabilities(), operations: this.get().constructionCapabilities() };
  }

  async captureSnapshot(label?: string) {
    if (!this.runtime) throw new Error("Connect to an explicit Plasticity window first");
    await this.runtime.reconnect();
    const state = await this.get().state();
    const construction = await this.get().listConstructionGeometry();
    const datums: TrackedDatum[] = [...construction.points, ...construction.axes]
      .filter((datum) => datum.documentToken === state.documentToken && datum.revision === state.revision)
      .map((datum) => ({ ...datum.identity, kind: datum.kind }));
    const snapshotId = randomUUID();
    const snapshot = { label: label ?? null, capturedAt: new Date().toISOString(), state, datums };
    this.snapshots.set(snapshotId, snapshot);
    while (this.snapshots.size > 32) {
      const oldest = this.snapshots.keys().next().value as string | undefined;
      if (!oldest) break;
      this.snapshots.delete(oldest);
    }
    return { snapshotId, ...snapshot };
  }

  async changesSince(snapshotId: string) {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) throw new Error(`Unknown or expired scene snapshot: ${snapshotId}`);
    if (!this.runtime) throw new Error("Connect to an explicit Plasticity window first");
    await this.runtime.reconnect();
    const current = await this.get().state();
    return {
      snapshotId,
      label: snapshot.label,
      capturedAt: snapshot.capturedAt,
      diff: diffScenes(snapshot.state, current, snapshot.datums),
      selection: await this.get().selection(),
      current,
    };
  }

  async waitForChange(snapshotId: string, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    do {
      const result = await this.changesSince(snapshotId);
      if (result.diff.sceneChanged) return { timedOut: false, ...result };
      if (Date.now() >= deadline) return { timedOut: true, ...result };
      await new Promise((resolve) => setTimeout(resolve, Math.min(750, deadline - Date.now())));
    } while (true);
  }

  async close(): Promise<void> {
    this.runtime?.close();
    await this.ownership?.release();
    this.runtime = undefined;
    this.operations = undefined;
    this.ownership = undefined;
    this.targetId = undefined;
    this.snapshots.clear();
  }
}

export interface SessionLike {
  windows(): Promise<Array<{ id: string; title: string; url: string }>>;
  connect(targetId: string): Promise<unknown>;
  get(): PlasticityOperations;
  capabilities(): {
    bindings: string[];
    operations: ReturnType<PlasticityOperations["constructionCapabilities"]>;
  };
  captureSnapshot(label?: string): Promise<unknown>;
  changesSince(snapshotId: string): Promise<unknown>;
  waitForChange(snapshotId: string, timeoutMs: number): Promise<unknown>;
  close?(): void | Promise<void>;
}

export function strengthDependenciesForSession(
  session: SessionLike,
  options: {
    store?: StrengthStore;
    femReports?: FemReportStore;
    cohesiveReports?: CohesiveReportStore;
    analysis?: AnalysisClient | null;
    analysisUnavailableReason?: string;
    analysisProvider?: string;
    referenceSearch?: ReferenceSearchClient | null;
    referenceSearchUnavailableReason?: string;
    referenceSearchTransport?: string;
  } = {},
): StrengthDependencies {
  const store = options.store ?? new StrengthStore();
  const femReports = options.femReports ?? new FemReportStore();
  const cohesiveReports = options.cohesiveReports ?? new CohesiveReportStore();
  return {
    store,
    femReports,
    cohesiveReports,
    analysis: options.analysis ?? null,
    ...(options.analysisUnavailableReason === undefined ? {} : { analysisUnavailableReason: options.analysisUnavailableReason }),
    referenceSearch: options.referenceSearch ?? null,
    ...(options.referenceSearchUnavailableReason === undefined ? {} : { referenceSearchUnavailableReason: options.referenceSearchUnavailableReason }),
    ...(options.analysisProvider === undefined ? {} : { analysisProvider: options.analysisProvider }),
    ...(options.referenceSearchTransport === undefined ? {} : { referenceSearchTransport: options.referenceSearchTransport }),
    async inspectMember(request) {
      return await session.get().inspectRectangularMember(request);
    },
    async inspectIntegralPlate(request) {
      return await session.get().inspectIntegralRectangularPlate(request);
    },
    async inspectSection(request) {
      return await session.get().inspectPlanarSection(request);
    },
    async inspectArbitrarySection(request) {
      return await session.get().inspectArbitrarySection(request);
    },
    async inspectFastenerPlate(request) {
      return await session.get().inspectSingleFastenerPlate(request);
    },
    async readCadBinding(bodyId): Promise<CadBinding> {
      const operations = session.get();
      const state = await operations.state();
      if (!state.bodies.some((body) => body.id === bodyId)) throw new Error(`Unknown body ID: ${bodyId}`);
      return {
        sessionId: operations.datumRegistry.sessionId,
        documentToken: state.documentToken,
        revision: state.revision,
        bodyId,
      };
    },
    async readSectionBinding(request) {
      const operations = session.get();
      const state = await operations.state();
      const evidence = await operations.inspectPlanarSection({ ...request, revision: state.revision });
      return evidence.binding;
    },
    async readFastenerBinding(request) {
      const operations = session.get();
      const state = await operations.state();
      const evidence = await operations.inspectSingleFastenerPlate({ ...request, revision: state.revision });
      return evidence.binding;
    },
    async inspectFastenerGroup(request) {
      return await session.get().inspectFastenerGroup(request);
    },
    async inspectFastenerGroupLayout(request) {
      return await session.get().inspectFastenerGroupLayout(request);
    },
    async readFastenerGroupBinding(request) {
      const operations = session.get();
      const state = await operations.state();
      const evidence = await operations.inspectFastenerGroup({ ...request, revision: state.revision });
      return evidence.binding;
    },
    async analyzeStaticFem(input, workspace, signal) {
      return await analyzeStaticSolid(session.get(), input, workspace, signal);
    },
    async analyzeCohesive(input: CohesiveAnalysisRequest, workspace, signal) {
      return await analyzeCohesiveInterface(session.get(), input, workspace, {
        interfaceTests: store.materialInterfaceTests,
        coupons: store.materialQualifications,
      }, signal);
    },
  };
}

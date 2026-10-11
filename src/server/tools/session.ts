import { z } from "zod";
import { ConstructionHistoryStore } from "../../plasticity/construction-history.ts";
import { compactStatusSummary, isRuntimeState, compactSceneSnapshot, compactSceneChanges } from "../results.ts";
import type { ToolContext } from "../context.ts";
import { PROFILES } from "../../plasticity/compat/profiles/index.ts";
import { probeWindow } from "../../plasticity/compat/probe-window.ts";
import { buildCompatibilityReport, renderCompatibilityMarkdown } from "../../plasticity/compat/report.ts";
import type { RequirementsManifest } from "../../plasticity/compat/requirements.ts";
import requirements from "../../plasticity/compat/requirements.generated.json" with { type: "json" };
import type { PlasticityOperations } from "../../plasticity/operations/index.ts";
import type { PlasticityRuntime } from "../../plasticity/runtime.ts";

export function registerSessionTools(ctx: ToolContext): void {
  const { session, constructionHistory, journal, journalPersistenceWarnings, tool, sceneChangeInput } = ctx;
  const connectedRuntime = (): PlasticityRuntime | undefined => {
    try {
      const runtime = (session.get() as Partial<PlasticityOperations>).runtime as Partial<PlasticityRuntime> | undefined;
      return typeof runtime?.getCompatibility === "function" ? runtime as PlasticityRuntime : undefined;
    } catch {
      return undefined;
    }
  };
  tool("plasticity_list_windows", "List Plasticity document windows exposed on loopback CDP.", z.object({}), async () =>
    (await session.windows()).map(({ id, title, url }) => ({ targetId: id, title, url })), true);
  tool("plasticity_diagnose", "Report MCP runtime and reachable Plasticity windows without changing a document.", z.object({}), async () =>
    ({ node: process.version, platform: process.platform, architecture: process.arch, plasticity: connectedRuntime()?.getCompatibility() ?? { connected: false, supportedProfiles: PROFILES.filter((profile) => profile.status === "supported").map((profile) => profile.version) }, endpoint: process.env.PLASTICITY_CDP_URL ?? "http://127.0.0.1:9223", windows: await session.windows() }), true);
  tool("plasticity_connect", "Connect this MCP process to one explicit Plasticity window and return its compact initial scene summary. Body bounds/counts are paginated; use plasticity_body_info for exact topology of a selected body.", z.object({ targetId: z.string().min(1) }), async ({ targetId }) => {
    const state = await session.connect(targetId);
    if (!isRuntimeState(state)) throw new Error("Plasticity returned an invalid connected document state");
    const runtime = connectedRuntime();
    return { ...compactStatusSummary(state, 0, 50), ...(runtime ? { plasticity: runtime.getCompatibility() } : {}) };
  });
  tool("plasticity_compatibility_report", "Check whether the Plasticity version provides every native factory, command and editor path this MCP server uses, and list the tools affected by anything missing. Uses the connected window, or probes a window directly when plasticity_connect failed (pass targetId if several windows are open). Read-only.", z.object({
    targetId: z.string().trim().min(1).optional(),
  }).strict(), async ({ targetId }) => {
    const runtime = connectedRuntime();
    const { probe, profile } = runtime
      ? { probe: await runtime.probeCompatibility(), profile: runtime.getProfile() }
      : await probeWindow(targetId, process.env.PLASTICITY_CDP_URL ?? "http://127.0.0.1:9223");
    const report = buildCompatibilityReport(probe, requirements as RequirementsManifest, profile);
    return { ...report, markdown: renderCompatibilityMarkdown(report) };
  }, true);
  tool("plasticity_status", "Read a compact document summary with identity, revision, exact body bounds, topology counts, and Undo/Redo state. Body summaries are paginated with bodyOffset/bodyLimit (default 0/50, maximum 200); follow bodyPagination.nextOffset and pass the prior page's revision as expectedRevision so scene edits cannot mix pages. Use plasticity_body_info for exact face/edge/vertex geometry of one body, or plasticity_list_bodies for paginated topology details.", z.object({
    bodyOffset: z.number().int().min(0).max(1_000_000).default(0),
    bodyLimit: z.number().int().min(1).max(200).default(50),
    expectedRevision: z.string().min(1).optional(),
  }).strict(), async ({ bodyOffset, bodyLimit, expectedRevision }) => {
    const state = await session.get().state();
    if (expectedRevision !== undefined && expectedRevision !== state.revision) {
      throw new Error("CAD revision changed between status pages; restart pagination from bodyOffset 0");
    }
    return compactStatusSummary(state, bodyOffset, bodyLimit);
  }, true);
  tool("plasticity_capture_snapshot", "Capture an in-memory scene baseline before manual edits. Returns only the snapshot ID, document/revision identity and object counts; use that ID with plasticity_changes_since or plasticity_wait_for_change.", z.object({ label: z.string().trim().min(1).max(120).optional() }), async ({ label }) =>
    compactSceneSnapshot(await session.captureSnapshot(label)), true);
  tool("plasticity_changes_since", "Return a structured diff from a captured scene baseline. Exact changed-body B-Rep descriptors are summarized and paginated (bodyOffset default 0, bodyLimit default 20, maximum 100); follow bodyPagination.nextOffset with expectedRevision set to current.revision. Use plasticity_body_info for detailed topology of selected bodies. The diff also reports sketch Regions, construction planes, materials, visibility, instances, groups, and selection. Check sceneChanged for a reportable scene edit; revisionChanged can be true without a reportable scene diff.", sceneChangeInput, async ({ snapshotId, bodyOffset, bodyLimit, expectedRevision }) =>
    compactSceneChanges(await session.changesSince(snapshotId), bodyOffset, bodyLimit, expectedRevision), true);
  tool("plasticity_wait_for_change", "Wait for a reportable scene edit, then return a compact paginated diff. Revision-only advances do not end the wait. Follow bodyPagination.nextOffset with expectedRevision set to current.revision; use plasticity_body_info for detailed topology of selected bodies.", sceneChangeInput.extend({ timeoutMs: z.number().int().min(0).max(30_000).default(5_000) }), async ({ snapshotId, bodyOffset, bodyLimit, expectedRevision, timeoutMs }) =>
    compactSceneChanges(await session.waitForChange(snapshotId, timeoutMs), bodyOffset, bodyLimit, expectedRevision), true);
  tool("plasticity_construction_history", "Read the private local construction-event history, including operation inputs, outcomes and compact added/removed/modified B-Rep measurements. History survives MCP restarts and does not require a connected Plasticity window. Use offset/limit for paging; records are historical and never authorize replay.", z.object({ offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(20) }).strict(), async ({ offset, limit }) => constructionHistory
    ? await constructionHistory.list(offset, limit)
    : { total: 0, offset, limit, entries: [] }, true);
  tool("plasticity_construction_journal", "Read current-process MCP mutation inputs and compact B-Rep change measurements in pages. This does not replay commands. The response also detects document changes made outside the journal and compares the live document against the last durable construction event.", z.object({ offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(20) }).strict(), async ({ offset, limit }) => {
    const current = await session.get().state();
    const completed = journal.filter((entry) => entry.status === "completed");
    const head = completed.at(-1);
    const syncStatus = !head
      ? "empty"
        : (head.afterDocumentToken ?? head.documentToken) !== current.documentToken
        ? "document-changed"
        : head.afterRevision === current.revision
          ? "in-sync"
          : "manual-edit-detected";
    let historyReadError: string | undefined;
    let history: Awaited<ReturnType<ConstructionHistoryStore["list"]>> = { total: 0, offset: 0, limit: 1, entries: [] };
    try {
      if (constructionHistory) history = await constructionHistory.list(0, 1);
    } catch (error) {
      historyReadError = (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
    }
    const latestDurable = history.entries[0];
    const durableSyncStatus = historyReadError
      ? "history-unavailable"
      : !latestDurable
      ? "empty"
      : latestDurable.status === "unknown"
        || latestDurable.afterDocumentToken === null
        || latestDurable.afterRevision === null
        || (latestDurable.status === "failed" && latestDurable.change.changed)
        ? "unknown-outcome-requires-inspection"
        : latestDurable.afterDocumentToken !== null && latestDurable.afterDocumentToken !== current.documentToken
          ? "document-changed"
          : latestDurable.afterRevision === current.revision
            ? "in-sync"
            : "manual-edit-detected";
    return {
      documentToken: current.documentToken,
      revision: current.revision,
      syncStatus,
      durableSyncStatus,
      latestDurableEvent: latestDurable ?? null,
      journalPersistenceWarnings: [
        ...journalPersistenceWarnings,
        ...(historyReadError ? [{ id: "history-read", error: historyReadError }] : []),
      ],
      entries: journal.slice(offset, offset + limit),
      journalPagination: {
        offset,
        limit,
        total: journal.length,
        nextOffset: offset + limit < journal.length ? offset + limit : null,
      },
    };
  }, true);
  tool("plasticity_capabilities", "Page through native renderer bindings found in the connected Plasticity. Defaults to 100 bindings per page; filter by case-insensitive substring with query. Returns total and matching counts plus nextOffset so large binding lists do not flood MCP context.", z.object({
    query: z.string().trim().min(1).max(200).optional(),
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(250).default(100),
  }).strict(), async ({ query, offset, limit }) => {
    const capabilities = session.capabilities();
    const normalizedQuery = query?.toLowerCase();
    const filtered = normalizedQuery
      ? capabilities.bindings.filter((binding) => binding.toLowerCase().includes(normalizedQuery))
      : capabilities.bindings;
    const bindings = filtered.slice(offset, offset + limit);
    const nextOffset = offset + bindings.length < filtered.length ? offset + bindings.length : null;
    return {
      totalBindings: capabilities.bindings.length,
      matchingBindings: filtered.length,
      offset,
      limit,
      bindings,
      nextOffset,
      operations: capabilities.operations,
    };
  }, true);
  tool("plasticity_reconcile", "Read the document after a timeout or disconnect and allow later mutations without retrying the uncertain command.", z.object({}), async () =>
    await session.get().runtime.reconcile(), true);
}

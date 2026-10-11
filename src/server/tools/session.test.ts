import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AnalysisClient } from "../../codex/analysis-client.ts";
import { createCompactServer, strengthDependenciesForSession, type SessionLike } from "../../server.ts";
import { diffScenes } from "../../plasticity/change-tracker.ts";
import { PlasticityOperations } from "../../plasticity/operations.ts";
import type { RuntimeState } from "../../plasticity/runtime.ts";
import { StrengthStore } from "../../strength/store.ts";
import { FemReportStore } from "../../strength/fem/fem-report-store.ts";
import { createServer, emptyState, parseToolJson, unavailableConstruction } from "../test-support.ts";

test("compact catalog exposes core tools while routing hidden operations through their original handlers", async () => {
  let state: RuntimeState = emptyState();
  let createBoxCalls = 0;
  const operations = {
    async state() { return state; },
    async createBox() { createBoxCalls += 1; state = { ...state, revision: "r2" }; return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createCompactServer(fake, undefined, undefined, undefined, null);
  const client = new Client({ name: "compact-tool-catalog-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const listed = await client.listTools();
  assert.deepEqual(new Set(listed.tools.map((tool) => tool.name)), new Set([
    "plasticity_call", "plasticity_list_windows", "plasticity_connect", "plasticity_status",
    "plasticity_current_selection", "plasticity_list_bodies", "plasticity_body_info",
    "plasticity_capture_snapshot", "plasticity_changes_since", "plasticity_reconcile",
    "plasticity_screenshot",
  ]));
  assert.equal(listed.tools[0]?.name, "plasticity_call");

  const catalogResponse = await client.callTool({ name: "plasticity_call", arguments: {
    toolName: "catalog", query: "plasticity_create_box",
  } });
  assert.equal(catalogResponse.isError, undefined);
  const catalog = parseToolJson(catalogResponse);
  assert.equal(catalog.total, 1);
  assert.equal(catalog.tools[0]?.name, "plasticity_create_box");

  const invalid = await client.callTool({ name: "plasticity_call", arguments: {
    toolName: "plasticity_create_box",
    arguments: { originMm: [0, 0, 0], sizeMm: [0, 20, 30], revision: "r1" },
  } });
  assert.equal(invalid.isError, true);
  assert.equal(createBoxCalls, 0);
  const valid = await client.callTool({ name: "plasticity_call", arguments: {
    toolName: "plasticity_create_box",
    arguments: { originMm: [0, 0, 0], sizeMm: [10, 20, 30], revision: "r1" },
  } });
  assert.equal(valid.isError, undefined);
  assert.equal(createBoxCalls, 1);

  await client.close(); await server.close();
});

test("plasticity_status returns compact body summaries while exact topology stays in list_bodies", async () => {
  const body: RuntimeState["bodies"][number] = {
    id: 7,
    versionId: 70,
    type: "Solid",
    name: "Bracket",
    boundsMm: { min: [0, 0, 0], max: [20, 10, 5] },
    faceIds: ["f1"],
    edgeIds: ["e1"],
    faces: [{
      id: "f1", surfaceType: "Plane", planar: true, centerMm: [10, 5, 5], normal: [0, 0, 1],
      radiusMm: null, blendRadiusMm: null, axisOriginMm: null, axisDirection: null,
      boundsMm: { min: [0, 0, 5], max: [20, 10, 5] }, edgeIds: ["e1", "e2"],
    }],
    edges: [{
      id: "e1", curveType: "Line", line: true, circle: false, lengthMm: 20,
      centerMm: [10, 0, 0], tangent: [1, 0, 0], boundsMm: { min: [0, 0, 0], max: [20, 0, 0] },
      faceIds: ["f1"], vertexIds: [1, 2],
    }],
    vertices: [{ id: 1, positionMm: [0, 0, 0], edgeIds: ["e1"], faceIds: ["f1"] }],
  };
  let state = { ...emptyState(), bodies: [body, { ...body, id: 8, versionId: 80, name: "Second body" }] };
  const beforeState = { ...emptyState(), revision: "r0", bodies: [
    { ...body, id: 8, versionId: 79, name: "Old second body" },
    { ...body, id: 9, versionId: 90, name: "Removed body" },
  ] };
  const sceneDiff = diffScenes(beforeState, state);
  const operations = { async state() { return state; } } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot(label?: string) { return { snapshotId: "00000000-0000-4000-8000-000000000001", label: label ?? null, capturedAt: "2026-09-26T00:00:00.000Z", state, datums: [] }; }, async changesSince() { return { snapshotId: "00000000-0000-4000-8000-000000000001", label: null, capturedAt: "2026-09-26T00:00:00.000Z", diff: sceneDiff, selection: [], current: state }; }, async waitForChange() { return { timedOut: false, snapshotId: "00000000-0000-4000-8000-000000000001", label: null, capturedAt: "2026-09-26T00:00:00.000Z", diff: sceneDiff, selection: [], current: state }; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "compact-status-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const tools = await client.listTools();
  const connectTool = tools.tools.find((tool) => tool.name === "plasticity_connect");
  assert.match(connectTool?.description ?? "", /compact initial scene summary/i);
  const statusTool = tools.tools.find((tool) => tool.name === "plasticity_status");
  assert.match(statusTool?.description ?? "", /compact document summary/i);
  assert.match(statusTool?.description ?? "", /plasticity_body_info.*plasticity_list_bodies/i);
  assert.match(statusTool?.description ?? "", /expectedRevision/);
  assert(tools.tools.some((tool) => tool.name === "plasticity_body_info"));
  const connectResponse = await client.callTool({ name: "plasticity_connect", arguments: { targetId: "window-1" } });
  const connected = JSON.parse((connectResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "null");
  assert.equal(connected.revision, "r1");
  assert.deepEqual(connected.bodyPagination, { offset: 0, limit: 50, total: 2, nextOffset: null });
  assert.equal("faces" in connected.bodies[0], false, "Connect response must not include full body topology");
  assert.equal("edges" in connected.bodies[0], false);
  const response = await client.callTool({ name: "plasticity_status", arguments: {} });
  assert.equal(response.isError, undefined);
  const result = JSON.parse((response.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "null");
  assert.equal(result.documentToken, "doc-1");
  assert.equal(result.revision, "r1");
  assert.deepEqual(result.bodyPagination, { offset: 0, limit: 50, total: 2, nextOffset: null });
  assert.deepEqual(result.bodies, [{
    id: 7, versionId: 70, type: "Solid", name: "Bracket", boundsMm: body.boundsMm,
    faceCount: 1, edgeCount: 1, vertexCount: 1,
  }, {
    id: 8, versionId: 80, type: "Solid", name: "Second body", boundsMm: body.boundsMm,
    faceCount: 1, edgeCount: 1, vertexCount: 1,
  }]);
  assert.equal("faces" in result.bodies[0], false);
  assert.equal("edges" in result.bodies[0], false);
  assert.equal("vertices" in result.bodies[0], false);
  assert.equal(result.undoDepth, 0);
  assert.equal(result.redoDepth, 0);

  const snapshotResponse = await client.callTool({ name: "plasticity_capture_snapshot", arguments: { label: "pre-edit" } });
  const snapshot = JSON.parse((snapshotResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "null");
  assert.equal(snapshot.revision, "r1");
  assert.equal(snapshot.bodyCount, 2);
  assert.equal(snapshot.trackedDatumCount, 0);
  assert.equal("state" in snapshot, false);

  const firstPageResponse = await client.callTool({ name: "plasticity_status", arguments: { bodyOffset: 0, bodyLimit: 1 } });
  const firstPage = JSON.parse((firstPageResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "null");
  assert.deepEqual(firstPage.bodyPagination, { offset: 0, limit: 1, total: 2, nextOffset: 1 });
  assert.deepEqual(firstPage.bodies.map((item: { id: number }) => item.id), [7]);
  const secondPageResponse = await client.callTool({ name: "plasticity_status", arguments: { bodyOffset: 1, bodyLimit: 1, expectedRevision: firstPage.revision } });
  const secondPage = JSON.parse((secondPageResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "null");
  assert.deepEqual(secondPage.bodyPagination, { offset: 1, limit: 1, total: 2, nextOffset: null });
  assert.deepEqual(secondPage.bodies.map((item: { id: number }) => item.id), [8]);
  const stalePageResponse = await client.callTool({ name: "plasticity_status", arguments: { bodyOffset: 1, bodyLimit: 1, expectedRevision: "stale-revision" } });
  assert.equal(stalePageResponse.isError, true);
  assert.match(JSON.stringify(stalePageResponse.content), /CAD revision changed between status pages/i);

  const detailedResponse = await client.callTool({ name: "plasticity_list_bodies", arguments: {} });
  const detailed = JSON.parse((detailedResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "null");
  assert.equal(detailed.revision, "r1");
  assert.deepEqual(detailed.bodyPagination, { offset: 0, limit: 10, total: 2, nextOffset: null });
  assert.equal(detailed.bodies.length, 2);
  assert.equal(detailed.bodies[0].faces.length, 1);
  assert.equal(detailed.bodies[0].edges.length, 1);
  assert.equal(detailed.bodies[0].vertices.length, 1);
  const detailedFirstPageResponse = await client.callTool({ name: "plasticity_list_bodies", arguments: { bodyOffset: 0, bodyLimit: 1 } });
  const detailedFirstPage = JSON.parse((detailedFirstPageResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "null");
  assert.deepEqual(detailedFirstPage.bodyPagination, { offset: 0, limit: 1, total: 2, nextOffset: 1 });
  assert.deepEqual(detailedFirstPage.bodies.map((item: { id: number }) => item.id), [7]);
  const detailedSecondPageResponse = await client.callTool({ name: "plasticity_list_bodies", arguments: { bodyOffset: 1, bodyLimit: 1, expectedRevision: detailedFirstPage.revision } });
  const detailedSecondPage = JSON.parse((detailedSecondPageResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "null");
  assert.deepEqual(detailedSecondPage.bodyPagination, { offset: 1, limit: 1, total: 2, nextOffset: null });
  assert.deepEqual(detailedSecondPage.bodies.map((item: { id: number }) => item.id), [8]);
  const staleDetailedPageResponse = await client.callTool({ name: "plasticity_list_bodies", arguments: { bodyOffset: 1, bodyLimit: 1, expectedRevision: "stale-revision" } });
  assert.equal(staleDetailedPageResponse.isError, true);
  assert.match(JSON.stringify(staleDetailedPageResponse.content), /CAD revision changed between body pages/i);
  state = { ...state, revision: `revision-${"x".repeat(240)}` };
  const longRevisionPageResponse = await client.callTool({ name: "plasticity_list_bodies", arguments: { bodyOffset: 1, bodyLimit: 1, expectedRevision: state.revision } });
  assert.equal(longRevisionPageResponse.isError, undefined, "Plasticity's composite revision token can exceed ordinary identifier lengths");
  state = { ...state, revision: "r1" };

  const changesTool = tools.tools.find((tool) => tool.name === "plasticity_changes_since");
  assert.match(changesTool?.description ?? "", /changed-body B-Rep descriptors are summarized and paginated/i);
  const changesResponse = await client.callTool({ name: "plasticity_changes_since", arguments: { snapshotId: "00000000-0000-4000-8000-000000000001", bodyOffset: 0, bodyLimit: 1 } });
  const changes = JSON.parse((changesResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "null");
  assert.equal(changes.diff.sceneChanged, true);
  assert.deepEqual(changes.bodyPagination, { offset: 0, limit: 1, total: 3, nextOffset: 1 });
  assert.deepEqual(changes.diff.added.map((item: { id: number }) => item.id), [7]);
  assert.equal(changes.diff.added[0].faceCount, 1);
  assert.equal("faces" in changes.diff.added[0], false);
  assert.equal("bodies" in changes.current, false);
  const nextChangesResponse = await client.callTool({ name: "plasticity_changes_since", arguments: { snapshotId: "00000000-0000-4000-8000-000000000001", bodyOffset: 1, bodyLimit: 1, expectedRevision: "r1" } });
  const nextChanges = JSON.parse((nextChangesResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "null");
  assert.deepEqual(nextChanges.diff.removed.map((item: { id: number }) => item.id), [9]);
  const finalChangesResponse = await client.callTool({ name: "plasticity_changes_since", arguments: { snapshotId: "00000000-0000-4000-8000-000000000001", bodyOffset: 2, bodyLimit: 1, expectedRevision: "r1" } });
  const finalChanges = JSON.parse((finalChangesResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "null");
  assert.deepEqual(finalChanges.diff.modified.map((item: { id: number }) => item.id), [8]);
  assert.equal(finalChanges.diff.modified[0].geometryChanged, true);
  assert.equal("faces" in finalChanges.diff.modified[0].before, false);
  const staleChangesResponse = await client.callTool({ name: "plasticity_changes_since", arguments: { snapshotId: "00000000-0000-4000-8000-000000000001", bodyOffset: 1, bodyLimit: 1, expectedRevision: "stale-revision" } });
  assert.equal(staleChangesResponse.isError, true);
  const waitedChangesResponse = await client.callTool({ name: "plasticity_wait_for_change", arguments: { snapshotId: "00000000-0000-4000-8000-000000000001", bodyOffset: 0, bodyLimit: 1 } });
  const waitedChanges = JSON.parse((waitedChangesResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "null");
  assert.equal(waitedChanges.timedOut, false);
  assert.deepEqual(waitedChanges.bodyPagination, { offset: 0, limit: 1, total: 3, nextOffset: 1 });
  assert.deepEqual(waitedChanges.diff.added.map((item: { id: number }) => item.id), [7]);

  await client.close(); await server.close();
});

test("a pending Codex analysis does not block other MCP tools", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-mcp-analysis-concurrency-"));
  context.after(async () => await rm(root, { recursive: true, force: true }));
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  let completeAnalysis!: (result: {
    observations: [];
    proposedMethod: null;
    questions: [];
    unsupportedConditions: [];
    designInterpretation: null;
  }) => void;
  const analysisResult = new Promise<{
    observations: [];
    proposedMethod: null;
    questions: [];
    unsupportedConditions: [];
    designInterpretation: null;
  }>((resolve) => { completeAnalysis = resolve; });
  const fake = {
    async windows() { return [{ id: "window-1", title: "Untitled - Plasticity", url: "file:///app_window/index.html" }]; },
    async connect() { return {}; },
    get() { throw new Error("not connected"); },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; },
    async changesSince() { return {}; },
    async waitForChange() { return {}; },
  } satisfies SessionLike;
  const store = new StrengthStore(join(root, "strength"));
  const analysis: AnalysisClient = {
    async fingerprintImages() { return []; },
    async run(_input, options) {
      markStarted();
      return await Promise.race([
        analysisResult,
        new Promise<never>((_, reject) => options.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })),
      ]);
    },
    async close() {},
  };
  const server = createServer(fake, strengthDependenciesForSession(fake, {
    analysis,
    store,
    femReports: new FemReportStore(join(root, "fem")),
  }));
  const client = new Client({ name: "analysis-concurrency-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const runningAnalysis = client.callTool({
      name: "plasticity_analyze_strength_task",
      arguments: { requestId: "pending-analysis", prompt: "Inspect the evidence", imagePaths: [], evidence: [], answers: [] },
    });
    let startTimer: NodeJS.Timeout | undefined;
    await Promise.race([
      started,
      new Promise<never>((_, reject) => { startTimer = setTimeout(() => reject(new Error("Codex analysis did not start")), 1_000); }),
    ]).finally(() => { if (startTimer) clearTimeout(startTimer); });
    const listWindows = client.callTool({ name: "plasticity_list_windows", arguments: {} });
    let timer: NodeJS.Timeout | undefined;
    const response = await Promise.race([
      listWindows,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("MCP tools were blocked by the pending analysis")), 1_000); }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
    assert.equal(response.isError, undefined);
    const content = (response as { content?: unknown }).content;
    assert.ok(Array.isArray(content));
    const textContent = content.find((item: unknown): item is { type: string; text?: string } =>
      typeof item === "object" && item !== null && "type" in item && item.type === "text");
    const windows = JSON.parse(textContent?.text ?? "[]") as Array<{ targetId: string }>;
    assert.deepEqual(windows.map((window) => window.targetId), ["window-1"]);

    completeAnalysis({ observations: [], proposedMethod: null, questions: [], unsupportedConditions: [], designInterpretation: null });
    const completed = await runningAnalysis;
    assert.equal(completed.isError, undefined);
  } finally {
    completeAnalysis({ observations: [], proposedMethod: null, questions: [], unsupportedConditions: [], designInterpretation: null });
    await client.close();
    await server.close();
  }
});

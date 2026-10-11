import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type SessionLike } from "../index.ts";
import { frameFromOriginNormalX } from "../../plasticity/construction.ts";
import { PlasticityOperations } from "../../plasticity/operations/index.ts";
import type { PlasticityRuntime, RuntimeState } from "../../plasticity/runtime.ts";
import { createServer, emptyState, parseToolJson, unavailableConstruction } from "../test-support.ts";

test("construction tools validate strict definitions and protect standard planes before mutation", async () => {
  let mutated = false;
  const nativeBindings = Array.from({ length: 250 }, (_, index) => `ExtrudeFactory${index}`);
  const top = {
    id: "standard:top",
    nativeId: "top",
    name: "Top",
    source: "standard" as const,
    ...frameFromOriginNormalX([0, 0, 0], [0, 0, 1], [1, 0, 0]),
  };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "doc-1", revision: "r1",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [],
    construction: { planes: [top], activePlaneId: top.id, planeStateToken: "p1", viewStateToken: "v1" }, bodies: [],
  };
  const runtime = {
    getCapabilities() { return []; },
    async getState() { return state; },
    async mutate() { mutated = true; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime, "session-1");
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: nativeBindings, operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const invalidCalls = [
    client.callTool({ name: "plasticity_define_datum_axis", arguments: { revision: "r1", definition: { type: "origin-direction", originMm: [0, 0, 0], direction: [0, 0, 0] } } }),
    client.callTool({ name: "plasticity_define_datum_axis", arguments: { revision: "r1", definition: { type: "two-points", firstId: "p", secondId: "p" } } }),
    client.callTool({ name: "plasticity_set_workplane", arguments: { plane: { id: "standard:top" } } }),
    client.callTool({ name: "plasticity_create_construction_plane", arguments: { revision: "r1", definition: { type: "unknown" } } }),
    client.callTool({ name: "plasticity_remove_construction_plane", arguments: { plane: { id: "standard:top", sessionId: "session-1", documentToken: "doc-1", revision: "r1" } } }),
  ];
  for (const call of invalidCalls) assert.equal((await call).isError, true);
  assert.equal(mutated, false);

  const capabilities = parseToolJson(await client.callTool({ name: "plasticity_capabilities", arguments: { limit: 50 } })) as {
    totalBindings: number; matchingBindings: number; offset: number; limit: number; nextOffset: number | null;
    bindings: string[]; operations: Record<string, unknown>;
  };
  assert.equal(capabilities.totalBindings, 250);
  assert.equal(capabilities.matchingBindings, 250);
  assert.equal(capabilities.offset, 0);
  assert.equal(capabilities.limit, 50);
  assert.equal(capabilities.bindings.length, 50);
  assert.equal(capabilities.nextOffset, 50);
  assert.ok(capabilities.operations.constructionPlanes);
  const defaultCapabilities = parseToolJson(await client.callTool({ name: "plasticity_capabilities", arguments: {} })) as {
    limit: number; bindings: string[]; nextOffset: number | null;
  };
  assert.equal(defaultCapabilities.limit, 100);
  assert.equal(defaultCapabilities.bindings.length, 100);
  assert.equal(defaultCapabilities.nextOffset, 100);
  const filteredCapabilities = parseToolJson(await client.callTool({
    name: "plasticity_capabilities", arguments: { query: "Factory24", limit: 25, offset: 0 },
  })) as { matchingBindings: number; bindings: string[]; nextOffset: number | null };
  assert.equal(filteredCapabilities.matchingBindings, 11);
  assert.ok(filteredCapabilities.bindings.every((binding) => binding.includes("Factory24")));
  assert.equal(filteredCapabilities.nextOffset, null);
  await client.close(); await server.close();
});

test("records uncertain construction outcomes and reconciles without resubmitting", async () => {
  const state = emptyState();
  let submissions = 0;
  let reconciliations = 0;
  const operations = {
    runtime: { async reconcile() { reconciliations += 1; return state; } },
    async state() { return state; },
    async createConstructionPlane() {
      submissions += 1;
      throw new Error(submissions === 1
        ? "CDP request timed out after dispatch"
        : "Curve vertex conversion requires interior or closed Wire vertices: 7:42");
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const failed = await client.callTool({ name: "plasticity_create_construction_plane", arguments: {
    revision: "r1", name: " uncertain ",
    definition: { type: "explicit", originMm: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0] },
  } });
  assert.equal(failed.isError, true);
  const journal = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journalText = (journal.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const journalValue = JSON.parse(journalText ?? "null");
  assert.equal(journalValue.entries[0].status, "unknown");
  assert.equal(journalValue.entries[0].afterRevision, "r1");
  assert.equal(journalValue.entries[0].diff.changed, false);
  const rejected = await client.callTool({ name: "plasticity_create_construction_plane", arguments: {
    revision: "r1", name: "rejected",
    definition: { type: "explicit", originMm: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0] },
  } });
  assert.equal(rejected.isError, true);
  const journalAfterRejection = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journalAfterRejectionText = (journalAfterRejection.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const journalAfterRejectionValue = JSON.parse(journalAfterRejectionText ?? "null");
  assert.equal(journalAfterRejectionValue.entries[1].status, "failed");
  const reconciled = await client.callTool({ name: "plasticity_reconcile", arguments: {} });
  assert.equal(reconciled.isError, undefined);
  assert.equal(submissions, 2);
  assert.equal(reconciliations, 1);
  await client.close(); await server.close();
});

test("serializes plane-local circle, rectangle, and text inputs and rejects mixed coordinate forms", async () => {
  let nativeArguments: unknown[] | undefined;
  const plane = {
    id: "plane:7", nativeId: "7", name: "Local", source: "saved" as const,
    ...frameFromOriginNormalX([10, 20, 30], [1, 0, 0], [0, 1, 0]),
  };
  const state = emptyState();
  state.construction = { planes: [plane], activePlaneId: plane.id, planeStateToken: "p1", viewStateToken: "v1" };
  state.bodies = [
    { id: 7, versionId: 17, type: "Wire", name: "Guide", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
    { id: 8, versionId: 18, type: "Wire", name: "Second guide", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [] },
  ];
  const directions = [
    { id: 7, versionId: 17, measurementSource: "native-brep" as const, closed: false, segments: [{ entityId: 99, startMm: [0, 0, 0], endMm: [10, 0, 0], startTangent: [1, 0, 0], endTangent: [1, 0, 0], lengthMm: 10 }] },
    { id: 8, versionId: 18, measurementSource: "native-brep" as const, closed: false, segments: [{ entityId: 100, startMm: [0, 0, 0], endMm: [0, 10, 0], startTangent: [0, 1, 0], endTangent: [0, 1, 0], lengthMm: 10 }] },
  ];
  const runtime = {
    getCapabilities() { return []; }, async getState() { return state; },
    async readNative() { return directions; },
    async mutate(_source: string, _bindings: string[], values: unknown[]) { nativeArguments = values; return {}; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime, "session-1");
  const identity = (await operations.listConstructionGeometry()).planes[0]!.identity;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const listed = await client.callTool({ name: "plasticity_list_construction_geometry", arguments: {} });
  const listedText = (listed.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  assert.equal(JSON.parse(listedText ?? "null").activePlaneId, "plane:7");
  const created = await client.callTool({ name: "plasticity_create_circle", arguments: { centerMm: [5, 7], radiusMm: 2, plane: identity, revision: "r1" } });
  assert.equal(created.isError, undefined);
  assert.deepEqual(nativeArguments, [{ center: [0.01, 0.025, 0.037], radius: 0.002, normal: [1, 0, 0] }]);
  const mixed = await client.callTool({ name: "plasticity_create_circle", arguments: { centerMm: [10, 25, 37], radiusMm: 2, normal: [1, 0, 0], plane: identity, revision: "r1" } });
  assert.equal(mixed.isError, true);
  const arc = await client.callTool({ name: "plasticity_create_center_arc", arguments: {
    centerMm: [5, 7], radiusMm: 4, startAngleDegrees: 0, sweepAngleDegrees: 90, plane: identity, revision: "r1",
  } });
  assert.equal(arc.isError, undefined);
  assert.deepEqual(nativeArguments, [{
    center: [0.01, 0.025, 0.037], start: [0.01, 0.029, 0.037], end: [0.01, 0.025, 0.041],
    normal: [1, 0, 0],
  }]);
  const fullArc = await client.callTool({ name: "plasticity_create_center_arc", arguments: {
    centerMm: [5, 7], radiusMm: 4, sweepAngleDegrees: 360, plane: identity, revision: "r1",
  } });
  assert.equal(fullArc.isError, true);
  const threePointArc = await client.callTool({ name: "plasticity_create_three_point_arc", arguments: {
    startMm: [4, 0], throughMm: [0, 4], endMm: [-4, 0], plane: identity, revision: "r1",
  } });
  assert.equal(threePointArc.isError, undefined);
  assert.deepEqual(nativeArguments, [{
    center: [0.01, 0.02, 0.03], start: [0.01, 0.024, 0.03], end: [0.01, 0.016, 0.03], normal: [1, 0, 0],
  }]);
  const mixedThreePointArc = await client.callTool({ name: "plasticity_create_three_point_arc", arguments: {
    startMm: [10, 24, 30], throughMm: [10, 20, 34], endMm: [10, 16, 30], plane: identity, revision: "r1",
  } });
  assert.equal(mixedThreePointArc.isError, true);
  const tangentArc = await client.callTool({ name: "plasticity_create_tangent_arc", arguments: {
    bodyId: 7, segmentEntityId: 99, startAt: "end", endMm: [5, 7], plane: identity, revision: "r1",
  } });
  assert.equal(tangentArc.isError, undefined);
  assert.deepEqual(nativeArguments, [{
    bodyId: 7, segmentEntityId: 99, startAt: "end", end: [0.01, 0.025, 0.037], flipTangent: false,
  }]);
  const mixedTangentArc = await client.callTool({ name: "plasticity_create_tangent_arc", arguments: {
    bodyId: 7, segmentEntityId: 99, startAt: "end", endMm: [10, 25, 37], plane: identity, revision: "r1",
  } });
  assert.equal(mixedTangentArc.isError, true);
  const tangentCircle = await client.callTool({ name: "plasticity_create_tangent_circle", arguments: {
    first: { bodyId: 7, segmentEntityId: 99 }, second: { bodyId: 8, segmentEntityId: 100 },
    solutionPointMm: [5, 7], radiusMm: 2, plane: identity, revision: "r1",
  } });
  assert.equal(tangentCircle.isError, undefined);
  assert.deepEqual(nativeArguments, [{
    first: { bodyId: 7, segmentEntityId: 99 }, second: { bodyId: 8, segmentEntityId: 100 },
    solutionPoint: [0.01, 0.025, 0.037], normal: [1, 0, 0], radius: 0.002,
  }]);
  const duplicateTangentCircle = await client.callTool({ name: "plasticity_create_tangent_circle", arguments: {
    first: { bodyId: 7, segmentEntityId: 99 }, second: { bodyId: 7, segmentEntityId: 99 },
    solutionPointMm: [5, 7], radiusMm: 2, plane: identity, revision: "r1",
  } });
  assert.equal(duplicateTangentCircle.isError, true);
  const mixedTangentCircle = await client.callTool({ name: "plasticity_create_tangent_circle", arguments: {
    first: { bodyId: 7, segmentEntityId: 99 }, second: { bodyId: 8, segmentEntityId: 100 },
    solutionPointMm: [10, 25, 37], radiusMm: 2, plane: identity, revision: "r1",
  } });
  assert.equal(mixedTangentCircle.isError, true);
  const ellipse = await client.callTool({ name: "plasticity_create_ellipse", arguments: {
    centerMm: [5, 7], majorRadiusMm: 4, minorRadiusMm: 2, plane: identity, revision: "r1",
  } });
  assert.equal(ellipse.isError, undefined);
  assert.deepEqual(nativeArguments, [{
    center: [0.01, 0.025, 0.037], majorPoint: [0.01, 0.029, 0.037], minorPoint: [0.01, 0.025, 0.039], normal: [1, 0, 0],
  }]);
  const polygon = await client.callTool({ name: "plasticity_create_regular_polygon", arguments: {
    centerMm: [5, 7], radiusMm: 4, radiusMode: "inradius", vertexCount: 6, plane: identity, revision: "r1",
  } });
  assert.equal(polygon.isError, undefined);
  assert.deepEqual(nativeArguments, [{
    center: [0.01, 0.025, 0.037], point: [0.01, 0.029, 0.037], normal: [1, 0, 0], radiusMode: "inradius", vertexCount: 6,
  }]);
  const rectangle = await client.callTool({ name: "plasticity_create_rectangle", arguments: {
    centerMm: [5, 7], widthMm: 4, heightMm: 2, plane: identity, revision: "r1",
  } });
  assert.equal(rectangle.isError, undefined);
  assert.deepEqual(nativeArguments, [{ p1: [0.01, 0.023, 0.036], p2: [0.01, 0.027, 0.036], p3: [0.01, 0.027, 0.038] }]);
  const mixedRectangle = await client.callTool({ name: "plasticity_create_rectangle", arguments: {
    centerMm: [10, 25, 37], widthMm: 4, heightMm: 2, normal: [1, 0, 0], xDirection: [0, 1, 0], plane: identity, revision: "r1",
  } });
  assert.equal(mixedRectangle.isError, true);
  const text = await client.callTool({ name: "plasticity_create_text", arguments: {
    text: "M5", fontSizeMm: 10, originMm: [5, 7], plane: identity, name: "Fastener label", revision: "r1",
  } });
  assert.equal(text.isError, undefined);
  assert.deepEqual(nativeArguments, [{
    text: "M5", font: "inter", size: 0.01, origin: [0.01, 0.025, 0.037],
    x: [0, 1, 0], y: [0, 0, 1], z: [1, 0, 0], rotate: true, move: true, name: "Fastener label",
  }]);
  const mixedText = await client.callTool({ name: "plasticity_create_text", arguments: {
    text: "M5", fontSizeMm: 10, originMm: [10, 25, 37], normal: [1, 0, 0], plane: identity, revision: "r1",
  } });
  assert.equal(mixedText.isError, true);
  await client.close(); await server.close();
});

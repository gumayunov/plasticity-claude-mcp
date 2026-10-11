import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type SessionLike } from "../../server.ts";
import { PlasticityOperations } from "../../plasticity/operations.ts";
import { createServer, emptyState, parseToolJson, unavailableConstruction } from "../test-support.ts";

test("MCP validates and forwards native Sheet insertion", async () => {
  const calls: unknown[][] = [];
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async insertSheet(...arguments_: unknown[]) { calls.push(arguments_); return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "sheet-insertion-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const response = await client.callTool({ name: "plasticity_insert_sheet", arguments: {
    targetSheetId: 7, edgeIds: ["e1", "e2", "e3", "e4"], fillSheetId: 8,
    intent: "Close the open enclosure with its fitted cover", revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.deepEqual(calls, [[7, ["e1", "e2", "e3", "e4"], 8, "r1"]]);

  const sameBody = await client.callTool({ name: "plasticity_insert_sheet", arguments: {
    targetSheetId: 7, edgeIds: ["e1"], fillSheetId: 7, revision: "r1",
  } });
  const duplicateEdges = await client.callTool({ name: "plasticity_insert_sheet", arguments: {
    targetSheetId: 7, edgeIds: ["e1", "e1"], fillSheetId: 8, revision: "r1",
  } });
  assert.equal(sameBody.isError, true);
  assert.equal(duplicateEdges.isError, true);
  assert.equal(calls.length, 1);
  await client.close(); await server.close();
});

test("MCP exposes revision-bound exact cone development analysis", async () => {
  const state = emptyState();
  const expected = {
    documentToken: state.documentToken, revision: state.revision, measurementSource: "native-brep",
    bodyId: 8, faceId: "cone-face", boundaryRadiusMm: [6, 12],
    development: { axialHeightMm: 18, innerRadiusMm: 18.973665961010276, outerRadiusMm: 37.94733192202055, includedAngleRad: 1.98691765315922, slantLengthMm: 18.973665961010276 },
  };
  let received: unknown;
  let created: unknown;
  const createdResult = {
    documentToken: state.documentToken, revision: "r2", measurementSource: "native-brep", sourceFace: { bodyId: 8, faceId: "cone-face" },
    profileWireId: 12, sheetBodyId: 13, originMm: [100, 200, 30], boundaryRadiusMm: [6, 12],
    development: expected.development, sourceAreaMm2: 1072.14, sheetAreaMm2: 1072.14,
    sheetBoundaryLengthsMm: [12, 12, 24, 24], validation: { bodyId: 13, nativeValid: true }, historySteps: 6,
  };
  const operations = {
    async state() { return state; },
    async analyzeConeDevelopment(face: unknown, revision: string) {
      received = { face, revision };
      return expected;
    },
    async createConeDevelopment(face: unknown, originMm: unknown, revision: string) {
      created = { face, originMm, revision };
      return createdResult;
    },
  } as unknown as PlasticityOperations;
  const session = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(session);
  const client = new Client({ name: "cone-development-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const result = await client.callTool({
    name: "plasticity_analyze_cone_development",
    arguments: { face: { bodyId: 8, faceId: "cone-face" }, intent: "Flatten this conical frustum", revision: state.revision },
  });
  const text = (result.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  assert.equal(result.isError, undefined);
  assert.deepEqual(JSON.parse(text ?? "{}"), expected);
  assert.deepEqual(received, { face: { bodyId: 8, faceId: "cone-face" }, revision: state.revision });

  const generated = await client.callTool({
    name: "plasticity_create_cone_development",
    arguments: { face: { bodyId: 8, faceId: "cone-face" }, originMm: [100, 200, 30], intent: "Create a planar development", revision: state.revision },
  });
  assert.equal(generated.isError, undefined);
  assert.deepEqual(parseToolJson(generated), createdResult);
  assert.deepEqual(created, { face: { bodyId: 8, faceId: "cone-face" }, originMm: [100, 200, 30], revision: state.revision });
  const invalidOrigin = await client.callTool({
    name: "plasticity_create_cone_development",
    arguments: { face: { bodyId: 8, faceId: "cone-face" }, originMm: [100, Number.NaN, 30], intent: "Create a planar development", revision: state.revision },
  });
  assert.equal(invalidOrigin.isError, true);

  await client.close(); await server.close();
});

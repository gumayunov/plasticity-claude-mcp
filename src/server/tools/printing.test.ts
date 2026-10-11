import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type SessionLike } from "../../server.ts";
import { PlasticityOperations } from "../../plasticity/operations.ts";
import type { RuntimeState } from "../../plasticity/runtime.ts";
import { PrintedThreadQualificationStore } from "../../printing/thread-qualification.ts";
import { createServer, emptyState, parseToolJson, unavailableConstruction } from "../test-support.ts";

test("MCP persists and exactly matches physical printed-thread qualifications without a Plasticity connection", async () => {
  const fake = {
    async windows() { return []; },
    async connect() { return {}; },
    get() { throw new Error("not connected"); },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const root = await mkdtemp(join(tmpdir(), "plasticity-thread-qualification-mcp-"));
  const server = createServer(fake, undefined, new PrintedThreadQualificationStore(root));
  const client = new Client({ name: "thread-qualification-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  const input = {
    process: {
      printerId: "creality-k1c-0.4", materialId: "generic-pla-k1c-0.4", slicingProfileId: "creality-print-k1c-0.20-standard",
      nozzleDiameterMm: 0.4, layerHeightMm: 0.2, orientation: "thread axes vertical", clearanceBasis: "physical ladder 2026-09-23",
    },
    thread: { profile: "rounded-print-v1", nominalCrestDiameterMm: 5, pitchMm: 1.25, threadDepthMm: 0.6, handedness: "right" },
    selectedSampleId: "clearance-0.15", profileClearanceMm: 0.15, fitClass: "normal",
    testedEngagementLengthMm: 12, cyclesCompleted: 20, testedAt: "2026-09-23T10:00:00.000Z",
    source: "physical-calibration-specimen", confirmedPhysicalTest: true,
  };
  const refused = await client.callTool({ name: "plasticity_record_printed_thread_qualification", arguments: { ...input, confirmedPhysicalTest: false } });
  assert.equal(refused.isError, true);
  const recorded = parseToolJson(await client.callTool({ name: "plasticity_record_printed_thread_qualification", arguments: input }));
  assert.equal(recorded.alreadyExisted, false);
  const repeated = parseToolJson(await client.callTool({ name: "plasticity_record_printed_thread_qualification", arguments: input }));
  assert.equal(repeated.alreadyExisted, true);
  assert.equal(repeated.record.id, recorded.record.id);
  const matched = parseToolJson(await client.callTool({ name: "plasticity_match_printed_thread_qualification", arguments: {
    process: input.process, thread: input.thread, requiredEngagementLengthMm: 8, fitClass: "normal",
  } }));
  assert.equal(matched.status, "matched");
  assert.equal(matched.selected.profileClearanceMm, 0.15);
  const wrongNozzle = parseToolJson(await client.callTool({ name: "plasticity_match_printed_thread_qualification", arguments: {
    process: { ...input.process, nozzleDiameterMm: 0.6 }, thread: input.thread, requiredEngagementLengthMm: 8, fitClass: "normal",
  } }));
  assert.equal(wrongNozzle.status, "no-match");
  const listed = parseToolJson(await client.callTool({ name: "plasticity_list_printed_thread_qualifications", arguments: { printerId: input.process.printerId } }));
  assert.equal(listed.records.length, 1);
  const pairArguments = {
    designation: "печатная пара M5x10", pitchMm: 1.25, threadDepthMm: 0.6, profileClearanceMm: 0.2,
    screwAxisStartMm: [0, 0, 0], nutEntryCenterMm: [15, 0, 0], axis: [0, 0, 1], flatNormalDirection: [1, 0, 0],
    screwHeadAcrossFlatsMm: 9, screwHeadHeightMm: 3, screwJunctionOverlapMm: 0.2,
    nutAcrossFlatsMm: 9, nutThicknessMm: 8, nutMinimumWallThicknessMm: 1.5,
    process: input.process, sizingBasis: "physical qualification binding test", qualificationId: recorded.record.id, revision: "r1",
  };
  const wrongClearance = await client.callTool({ name: "plasticity_create_printed_hex_pair", arguments: pairArguments });
  assert.equal(wrongClearance.isError, true);
  assert.match(JSON.stringify(wrongClearance.content), /qualification clearance 0\.15 mm.*requested 0\.2 mm/i);
  const acceptedQualification = await client.callTool({ name: "plasticity_create_printed_hex_pair", arguments: { ...pairArguments, profileClearanceMm: 0.15 } });
  assert.equal(acceptedQualification.isError, true);
  assert.match(JSON.stringify(acceptedQualification.content), /not connected/i);
  assert.doesNotMatch(JSON.stringify(acceptedQualification.content), /qualification.*does not match/i);

  await client.close(); await server.close();
});

test("orients a rigid Solid group only when its union native bounds match the Workbench recommendation", async () => {
  const firstBody: RuntimeState["bodies"][number] = {
    id: 7, versionId: 70, type: "Solid", name: "Plate A", boundsMm: { min: [0, 0, 0], max: [20, 10, 5] },
    faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  const secondBody: RuntimeState["bodies"][number] = {
    id: 8, versionId: 80, type: "Solid", name: "Plate B", boundsMm: { min: [30, 0, 0], max: [40, 10, 5] },
    faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  let state: RuntimeState = { ...emptyState(), bodies: [firstBody, secondBody] };
  const calls: Array<{ ids: number[]; pivot: number[]; rotation: number[]; revision: string }> = [];
  const operations = {
    async state() { return state; },
    async rotateBodiesByXyz(ids: number[], pivot: number[], rotation: number[], revision: string) {
      calls.push({ ids, pivot, rotation, revision });
      state = {
        ...state,
        revision: "r2",
        bodies: [
          { ...firstBody, boundsMm: { min: [17.5, -15, -2.5], max: [22.5, 5, 7.5] } },
          { ...secondBody, boundsMm: { min: [17.5, 15, -2.5], max: [22.5, 25, 7.5] } },
        ],
      };
      return state;
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
  const call = async (expectedSizeMm: number[], bodyIds = [7, 8]) => client.callTool({ name: "plasticity_orient_bodies_for_print", arguments: {
    bodyIds, rotationDeg: [90, 0, 90], expectedSizeMm,
    intent: "Orient the disposable Solid group to match the printer-bed recommendation", revision: "r1",
  } });

  const mismatch = await call([40, 10, 5]);
  assert.equal(mismatch.isError, true);
  assert.equal(calls.length, 0, "a recommendation mismatch must be rejected before CAD mutation");
  const duplicateIds = await call([5, 40, 10], [7, 7]);
  assert.equal(duplicateIds.isError, true, "a body must not be rotated twice by one request");

  const applied = await call([5, 40, 10]);
  assert.equal(applied.isError, undefined, JSON.stringify(applied.content));
  const result = JSON.parse((applied.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "null");
  assert.equal(result.status, "verified");
  assert.equal(result.measurementSource, "native-brep");
  assert.equal(result.slicerFitVerified, false);
  assert.deepEqual(calls, [{ ids: [7, 8], pivot: [20, 5, 2.5], rotation: [90, 0, 90], revision: "r1" }]);
  await client.close(); await server.close();
});

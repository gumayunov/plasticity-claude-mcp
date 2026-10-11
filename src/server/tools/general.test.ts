import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AnalysisClient } from "../../codex/analysis-client.ts";
import { PlasticitySession, strengthDependenciesForSession, type SessionLike } from "../../server.ts";
import { StrengthStore } from "../../strength/store.ts";
import { type StoredCohesiveReport } from "../../strength/fem/cohesive-report-store.ts";
import { verifyCohesiveReportEvidence } from "../../strength/fem/cohesive-report-evidence.ts";
import type { InterfaceTestInput } from "../../strength/interface-test.ts";
import { cohesiveCouponInput, createServer, unavailableConstruction } from "../test-support.ts";

test("wait_for_change ignores revision-only wakes until the scene diff is reportable", async () => {
  const session = new PlasticitySession();
  let calls = 0;
  session.changesSince = async () => {
    calls += 1;
    const sceneChanged = calls > 1;
    return {
      timedOut: false,
      diff: { changed: true, revisionChanged: true, sceneChanged },
      current: {},
    } as unknown as Awaited<ReturnType<typeof session.changesSince>>;
  };

  const result = await session.waitForChange("test-snapshot", 2_000);

  assert.equal(calls, 2);
  assert.equal(result.timedOut, false);
  assert.equal(result.diff.sceneChanged, true);
});

test("cohesive report evidence freshness rechecks the immutable interface test and exact coupons", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-cohesive-freshness-"));
  context.after(async () => await rm(root, { recursive: true, force: true }));
  const store = new StrengthStore(root);
  const process = { printerId: "creality-k1c", materialId: "pla-layer-test", profileHash: "a".repeat(64), orientationDeg: [0, 0, 0] as [number, number, number], infillPercent: 100, infillPattern: "grid", wallLoops: 2, topShellLayers: 5, bottomShellLayers: 3, nozzleTemperatureC: 220, layerHeightMm: 0.2 };
  const interfaceInput: InterfaceTestInput = {
    interfaceKind: "same-material-layer", materialAProcess: process, materialBProcess: process,
    testMode: "normal-tension", fractureMethod: "dcb-mode-i", interfaceNormalGlobal: [0, 0, 1], loadDirectionGlobal: [0, 0, 1],
    testMethod: "ASTM D5528 DCB", testProtocolHash: "b".repeat(64),
    specimenDescription: "Same-material printed coupon separated at one layer interface.",
    fixtureDescription: "Axial grips pull the layers apart along the interface normal.", measuredPeakStrengthMPa: 2.4,
    tractionSeparationCurve: {
      sourceHash: "c".repeat(64), sourceLocator: "curve.csv!A2:B5",
      points: [{ separationMm: 0, tractionMPa: 0 }, { separationMm: 0.01, tractionMPa: 2.4 }, { separationMm: 0.04, tractionMPa: 1.2 }, { separationMm: 0.08, tractionMPa: 0 }],
    },
    failureLocation: "interface",
    evidence: [{ id: "interface-strength", label: "Measured layer-interface peak", status: "measured", value: 2.4, unit: "MPa", sourceHash: "d".repeat(64), sourceLocator: "test.pdf p.4", dependsOn: [] }],
    specimenCount: 5, testedAt: "2026-09-24T10:00:00.000Z", source: "physical-material-interface-test", callerConfirmsPhysicalTests: true,
  };
  const testRecord = await store.materialInterfaceTests.record(interfaceInput);
  const coupon = await store.materialQualifications.record(cohesiveCouponInput(process, 2000));
  const assignment = {
    testMaterial: "A" as const, process, couponRecordId: coupon.record.id, youngsModulusMPa: 2000, poissonRatio: 0.3,
    poissonRatioEvidence: { id: "nu", label: "Poisson ratio", status: "measured" as const, value: 0.3, unit: "ratio" as const, sourceUrl: "https://example.test/poisson", sourceHash: "e".repeat(64), sourceLocator: "p.2", dependsOn: [] },
  };
  const report = {
    input: { interfaceTestRecordId: testRecord.record.id },
    physicalTest: { recordId: testRecord.record.id, interfaceKind: testRecord.record.interfaceKind, materialAProcess: process, materialBProcess: process, curveSourceHash: "c".repeat(64), curveSourceLocator: "curve.csv!A2:B5", measuredCurveSummary: { peakStrengthMPa: 2.4, fractureEnergyNPerMm: 0.09 } },
    couponRecordIds: { materialA: coupon.record.id, materialB: coupon.record.id },
    materialAssignment: { negativeSide: assignment, positiveSide: { ...assignment, testMaterial: "B" as const } },
  } as unknown as StoredCohesiveReport;
  await verifyCohesiveReportEvidence(report, store.materialInterfaceTests, store.materialQualifications);

  await store.materialQualifications.record(cohesiveCouponInput(process, 2100));
  await assert.rejects(verifyCohesiveReportEvidence(report, store.materialInterfaceTests, store.materialQualifications), /missing, conflicting/);
  await store.materialInterfaceTests.record({
    ...interfaceInput,
    tractionSeparationCurve: {
      ...interfaceInput.tractionSeparationCurve!,
      points: [
        { separationMm: 0, tractionMPa: 0 }, { separationMm: 0.01, tractionMPa: 2.4 },
        { separationMm: 0.04, tractionMPa: 1 }, { separationMm: 0.08, tractionMPa: 0 },
      ],
    },
  });
  await assert.rejects(verifyCohesiveReportEvidence(report, store.materialInterfaceTests, store.materialQualifications), /unique exact match/);
});

test("server close releases the isolated analysis client", async () => {
  let analysisClosed = false;
  let sessionClosed = false;
  const fake = {
    async windows() { return []; },
    async connect() { return {}; },
    get() { throw new Error("not connected"); },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; },
    async changesSince() { return {}; },
    async waitForChange() { return {}; },
    async close() { sessionClosed = true; },
  } satisfies SessionLike;
  const analysis: AnalysisClient = {
    async fingerprintImages() { return []; },
    async run() { throw new Error("not called"); },
    async close() { analysisClosed = true; },
  };
  const server = createServer(fake, strengthDependenciesForSession(fake, { analysis }));
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  await server.close();

  assert.equal(analysisClosed, true);
  assert.equal(sessionClosed, true);
});

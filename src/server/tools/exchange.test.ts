import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer as createPlasticityServer, type SessionLike } from "../../server.ts";
import { PlasticityOperations } from "../../plasticity/operations.ts";
import type { RuntimeState } from "../../plasticity/runtime.ts";
import { StepImportReferenceStore } from "../../plasticity/import-reference-store.ts";
import { ConstructionHistoryStore } from "../../plasticity/construction-history.ts";
import { createServer, emptyState, unavailableConstruction } from "../test-support.ts";

test("MCP validates and forwards native 3MF export parameters", async () => {
  let received: unknown[] | undefined;
  const operations = {
    async export3mf(...args: unknown[]) {
      received = args;
      return { path: "/tmp/part.3mf", bytes: 1123, modelUnit: "meter", sourceUnits: "millimeter", objects: 1, buildItems: 1, vertices: 8, triangles: 12 };
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; },
    async connect() { return {}; },
    get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; },
    async changesSince() { return {}; },
    async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "3mf-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const response = await client.callTool({ name: "plasticity_export_3mf", arguments: {
      ids: [7], path: "/tmp/part.3mf", chordToleranceMm: 0.08, angleToleranceDegrees: 12, revision: "r1",
    } });
    assert.equal(response.isError, undefined);
    assert.deepEqual(received, [[7], "/tmp/part.3mf", "r1", 0.08, 12]);

    const invalid = await client.callTool({ name: "plasticity_export_3mf", arguments: {
      ids: [7], path: "/tmp/part.3mf", chordToleranceMm: 0, angleToleranceDegrees: 12, revision: "r1",
    } });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
  }
});

test("MCP validates and forwards native OBJ export parameters", async () => {
  let received: unknown[] | undefined;
  const operations = {
    async exportObj(...args: unknown[]) {
      received = args;
      return { path: "/tmp/part.obj", bytes: 762, sourceUnits: "millimeter", upAxis: "z", objects: 1, vertices: 8, faces: 12, triangles: 12 };
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "obj-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  try {
    const response = await client.callTool({ name: "plasticity_export_obj", arguments: {
      ids: [7], path: "/tmp/part.obj", chordToleranceMm: 0.08, angleToleranceDegrees: 12, revision: "r1",
    } });
    assert.equal(response.isError, undefined);
    assert.deepEqual(received, [[7], "/tmp/part.obj", "r1", 0.08, 12]);
    const invalid = await client.callTool({ name: "plasticity_export_obj", arguments: {
      ids: [7], path: "/tmp/part.obj", chordToleranceMm: 0, angleToleranceDegrees: 12, revision: "r1",
    } });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close(); await server.close();
  }
});

test("MCP validates and forwards planar native Wire SVG exports", async () => {
  let received: unknown[] | undefined;
  const operations = {
    async exportSvg(...args: unknown[]) {
      received = args;
      return { path: "/tmp/rectangle.svg", bytes: 496, bodies: 1, lineSegments: 4, sourceUnits: "millimeter", boundsMm: { min: [0, -10], max: [20, 0], size: [20, 10] }, pageSizeMm: [20.2, 10.2] };
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "svg-export-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  try {
    const response = await client.callTool({ name: "plasticity_export_svg", arguments: {
      ids: [7], path: "/tmp/rectangle.svg", revision: "r1",
    } });
    assert.equal(response.isError, undefined);
    assert.deepEqual(received, [[7], "/tmp/rectangle.svg", "r1", 0.05, 5]);
    const invalid = await client.callTool({ name: "plasticity_export_svg", arguments: {
      ids: [7, 7], path: "/tmp/rectangle.svg", revision: "r1",
    } });
    assert.equal(invalid.isError, true);
    const invalidTolerance = await client.callTool({ name: "plasticity_export_svg", arguments: {
      ids: [7], path: "/tmp/rectangle.svg", curveChordToleranceMm: 0, revision: "r1",
    } });
    assert.equal(invalidTolerance.isError, true);
  } finally {
    await client.close(); await server.close();
  }
});

test("MCP validates and forwards native hidden-line SVG export parameters", async () => {
  let received: unknown[] | undefined;
  const operations = {
    async exportHiddenLineSvg(...args: unknown[]) {
      received = args;
      return {
        path: "/tmp/plate-hiddenline.svg",
        bytes: 2_048,
        bodies: 1,
        segments: 12,
        visibleSegments: 10,
        hiddenSegments: 2,
        sourceUnits: "millimeter",
        projection: "native-orthographic",
        projectedBoundsMm: { min: [0, -40], max: [50, 0], size: [50, 40] },
        curveChordToleranceMm: 0.05,
        curveChordAngleDegrees: 5,
      };
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "hiddenline-svg-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  try {
    const response = await client.callTool({ name: "plasticity_export_hiddenline_svg", arguments: {
      ids: [7], path: "/tmp/plate-hiddenline.svg", revision: "r1",
    } });
    assert.equal(response.isError, undefined);
    assert.deepEqual(received, [[7], "/tmp/plate-hiddenline.svg", "r1", 0.05, 5, 1]);
    const invalid = await client.callTool({ name: "plasticity_export_hiddenline_svg", arguments: {
      ids: [7, 7], path: "/tmp/plate-hiddenline.svg", revision: "r1",
    } });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close(); await server.close();
  }
});

test("MCP validates and forwards native Parasolid export parameters", async () => {
  let received: unknown[] | undefined;
  const operations = {
    async exportParasolid(...args: unknown[]) {
      received = args;
      return { path: "/tmp/part.x_t", bytes: 4161, format: "parasolid-text" };
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; },
    async connect() { return {}; },
    get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; },
    async changesSince() { return {}; },
    async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "parasolid-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const response = await client.callTool({ name: "plasticity_export_parasolid", arguments: {
      ids: [7], path: "/tmp/part.x_t", revision: "r1",
    } });
    assert.equal(response.isError, undefined);
    assert.deepEqual(received, [[7], "/tmp/part.x_t", "r1"]);

    const invalid = await client.callTool({ name: "plasticity_export_parasolid", arguments: {
      ids: [], path: "/tmp/part.step", revision: "r1",
    } });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
  }
});

test("MCP validates and forwards native SVG import with explicit source units", async () => {
  let received: unknown[] | undefined;
  const state = emptyState();
  const operations = {
    async state() { return state; },
    async importSvg(...arguments_: unknown[]) { received = arguments_; return state; },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "svg-import-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const response = await client.callTool({ name: "plasticity_import_svg", arguments: {
    path: "/tmp/bracket.svg", sourceUnit: "millimeter", intent: "Import exact bracket profile", revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.deepEqual(received, ["/tmp/bracket.svg", "millimeter", "r1"]);
  const badUnit = await client.callTool({ name: "plasticity_import_svg", arguments: {
    path: "/tmp/bracket.svg", sourceUnit: "parsec", revision: "r1",
  } });
  const missingRevision = await client.callTool({ name: "plasticity_import_svg", arguments: {
    path: "/tmp/bracket.svg", sourceUnit: "millimeter",
  } });
  assert.equal(badUnit.isError, true);
  assert.equal(missingRevision.isError, true);
  await client.close(); await server.close();
});

test("STEP reference import hashes the exact local artifact and records source provenance", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-step-reference-mcp-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const path = join(root, "manufacturer-part.step");
  const nonStepPath = join(root, "not-a-step.txt");
  const changedDuringImportPath = join(root, "changing.step");
  const contents = "ISO-10303-21;\nsynthetic acceptance fixture\nEND-ISO-10303-21;\n";
  await writeFile(path, contents);
  await writeFile(nonStepPath, "not a STEP file");
  await writeFile(changedDuringImportPath, contents);
  const canonicalPath = await realpath(path);
  const canonicalChangedDuringImportPath = await realpath(changedDuringImportPath);
  let state = emptyState();
  const importedBody: RuntimeState["bodies"][number] = {
    id: 17, versionId: 170, type: "Solid", name: "Manufacturer bracket",
    boundsMm: { min: [0, 0, 0], max: [40, 20, 5] }, faceIds: ["f1"], edgeIds: ["e1"], faces: [], edges: [],
  };
  const imports: unknown[][] = [];
  const operations = {
    async state() { return state; },
    async importStep(...arguments_: unknown[]) {
      imports.push(arguments_);
      if (arguments_[0] === canonicalChangedDuringImportPath) await writeFile(changedDuringImportPath, `${contents}changed`);
      if (arguments_[0] === canonicalPath) state = { ...state, revision: "r2", bodies: [importedBody] };
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const references = new StepImportReferenceStore(join(root, "references"));
  const historyStore = new ConstructionHistoryStore(join(root, "history"));
  const server = createPlasticityServer(fake, undefined, undefined, references, historyStore);
  const client = new Client({ name: "step-reference-import-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  const source = {
    sourceKind: "official-manufacturer-cad",
    sourceUrl: "https://manufacturer.example/cad/part.step?token=local-secret",
    sourcePageUrl: "https://manufacturer.example/products/part?session=local-page-secret",
    license: "Test redistribution terms",
    confidence: "verified",
  };
  const response = await client.callTool({ name: "plasticity_import_step", arguments: {
    path, source, intent: "Load the verified manufacturer model as a design reference", revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  const importedText = (response.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const imported = JSON.parse(importedText ?? "{}");
  const expectedHash = createHash("sha256").update(contents).digest("hex");
  assert.deepEqual(imports, [[canonicalPath, "r1"]]);
  assert.equal(imported.targetId, state.targetId);
  assert.equal(imported.revision, "r2");
  assert.deepEqual(imported.importedBodyIds, [17]);
  assert.equal(imported.importedBodyCount, 1);
  assert.equal(imported.dbVersion, state.dbVersion);
  assert.equal("bodies" in imported, false, "Import responses must not include full scene B-Rep arrays");
  assert.equal("faces" in imported, false);
  assert.deepEqual(imported.sourceReference, {
    ...source,
    sourceUrl: "https://manufacturer.example/cad/part.step?token=%5Bredacted%5D",
    sourcePageUrl: "https://manufacturer.example/products/part?session=%5Bredacted%5D",
    artifactHash: expectedHash,
  });
  assert.equal(imported.provenancePersisted, true);
  assert.match(imported.referenceRecordId, /^[0-9a-f-]{36}$/);
  const persisted = await new StepImportReferenceStore(join(root, "references")).get(imported.referenceRecordId);
  assert.equal(persisted.artifactHash, expectedHash);
  assert.equal(persisted.sourceReference?.sourceUrl, "https://manufacturer.example/cad/part.step?token=%5Bredacted%5D");
  assert.equal(persisted.sourceReference?.sourcePageUrl, "https://manufacturer.example/products/part?session=%5Bredacted%5D");
  assert.equal(persisted.documentToken, "doc-1");
  assert.equal(persisted.revision, "r2");
  assert.deepEqual(persisted.bodies, [{
    id: 17, type: "Solid", name: "Manufacturer bracket", boundsMm: { min: [0, 0, 0], max: [40, 20, 5] }, faceCount: 0, edgeCount: 0,
  }]);
  const importList = await client.callTool({ name: "plasticity_list_step_imports", arguments: { limit: 10 } });
  const importListData = JSON.parse((importList.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  assert.equal(importListData.total, 1);
  assert.equal(importListData.records[0]?.historical, true);
  const importedRecord = await client.callTool({ name: "plasticity_get_step_import", arguments: { id: imported.referenceRecordId } });
  const importedRecordData = JSON.parse((importedRecord.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  assert.equal(importedRecordData.historical, true);
  assert.deepEqual(importedRecordData.bodies, persisted.bodies);
  const journalResponse = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journalText = (journalResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const journal = JSON.parse(journalText ?? "{}");
  assert.deepEqual(journal.journalPagination, { offset: 0, limit: 20, total: 1, nextOffset: null });
  assert.deepEqual(journal.entries.at(-1)?.input, {
    path: canonicalPath,
    format: "step",
    importedArtifactHash: expectedHash,
    sourceReference: {
      ...source,
      sourceUrl: "https://manufacturer.example/cad/part.step?token=%5Bredacted%5D",
      sourcePageUrl: "https://manufacturer.example/products/part?session=%5Bredacted%5D",
      artifactHash: expectedHash,
    },
  });
  assert.equal(journal.entries[0]?.diff.added[0]?.faceCount, 0);
  assert.equal("faces" in journal.entries[0]?.diff.added[0], false);
  assert.doesNotMatch(JSON.stringify(journal), /local-secret|local-page-secret/);
  const historyResponse = await client.callTool({ name: "plasticity_construction_history", arguments: { limit: 10 } });
  const historyText = (historyResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const history = JSON.parse(historyText ?? "{}");
  assert.equal(history.total, 1);
  assert.equal(history.entries[0]?.status, "completed");
  assert.equal(history.entries[0]?.change.added[0]?.boundsMm.max[0], 40);
  const httpSource = await client.callTool({ name: "plasticity_import_step", arguments: {
    path, source: { ...source, sourceUrl: "http://manufacturer.example/part.step" },
    intent: "reject non-HTTPS provenance", revision: "r1",
  } });
  assert.equal(httpSource.isError, true);
  assert.equal(imports.length, 1);
  const invalidPath = await client.callTool({ name: "plasticity_import_step", arguments: {
    path: nonStepPath, intent: "Reject non-STEP source before hashing", revision: "r1",
  } });
  assert.equal(invalidPath.isError, true);
  assert.equal(imports.length, 1);
  const unregisteredLocalFile = await client.callTool({ name: "plasticity_import_step", arguments: {
    path, intent: "Load a local STEP file without external source details", revision: "r1",
  } });
  const localImportText = (unregisteredLocalFile.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const localImport = JSON.parse(localImportText ?? "{}");
  assert.equal(localImport.importedArtifactHash, expectedHash);
  assert.equal(localImport.provenancePersisted, true);
  assert.equal(localImport.sourceReference, undefined);
  assert.equal(imports.length, 2);
  const changedFileResponse = await client.callTool({ name: "plasticity_import_step", arguments: {
    path: changedDuringImportPath, intent: "Test detection of changed STEP source", revision: "r1",
  } });
  assert.equal(changedFileResponse.isError, true);
  const changedJournalResponse = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const changedJournalText = (changedJournalResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const changedJournal = JSON.parse(changedJournalText ?? "{}");
  assert.equal(changedJournal.entries.at(-1)?.status, "unknown");
  assert.match(changedJournal.entries.at(-1)?.error ?? "", /source identity is uncertain/i);
  assert.equal(changedJournal.durableSyncStatus, "unknown-outcome-requires-inspection");
  await client.close(); await server.close();
});

test("download-and-import reference mesh uses explicit units, exact artifact identity, and durable sanitized journal data", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-reference-mesh-download-mcp-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const path = join(root, "downloaded.obj");
  const contents = "o phone\nv 0 0 0\nv 72.8 0 0\nv 0 158.4 0\nf 1 2 3\n";
  await writeFile(path, contents);
  let state: RuntimeState = { ...emptyState(), referenceMeshes: [] };
  let downloadCount = 0;
  let importCount = 0;
  let importedPath = "";
  let importedUnit = "";
  const mesh: NonNullable<RuntimeState["referenceMeshes"]>[number] = {
    id: 32, type: "ReferenceMesh", name: "Fold reference", sourcePath: path, sourceFormat: "obj",
    measurementSource: "reference-mesh", boundsMm: { min: [0, 0, 0], max: [72.8, 158.4, 0] },
    translationMm: [0, 0, 0], rotationQuaternion: [0, 0, 0, 1], sceneScaleToMeters: [0.001, 0.001, 0.001],
    vertexEntries: 3, triangles: 1, visible: true, hidden: false, locked: false,
  };
  const operations = {
    async state() { return state; },
    async importReferenceMesh(inputPath: string, sourceUnit: string, revision: string) {
      importCount += 1;
      importedPath = inputPath;
      importedUnit = sourceUnit;
      assert.equal(revision, "r1");
      state = { ...state, revision: "r2", referenceMeshes: [mesh] };
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const downloader = {
    async download() { throw new Error("wrong download path"); },
    async downloadParasolid() { throw new Error("wrong download path"); },
    async downloadReferenceMesh(url: string, format: "stl" | "obj") {
      downloadCount += 1;
      assert.equal(url, "https://community.example/files/fold.obj?token=download-secret");
      assert.equal(format, "obj");
      return {
        path, bytes: Buffer.byteLength(contents), sha256: createHash("sha256").update(contents).digest("hex"),
        sourceUrl: url, finalUrl: "https://cdn.example/files/fold.obj?sig=final-secret", format: "reference-mesh-obj" as const,
      };
    },
  };
  const server = createPlasticityServer(
    fake,
    undefined,
    undefined,
    new StepImportReferenceStore(join(root, "references")),
    new ConstructionHistoryStore(join(root, "history")),
    downloader,
  );
  const client = new Client({ name: "reference-mesh-download-mcp-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  const response = await client.callTool({
    name: "plasticity_download_and_import_reference_mesh",
    arguments: {
      source: {
        sourceKind: "verified-community-cad",
        sourceUrl: "https://community.example/files/fold.obj?token=download-secret",
        sourcePageUrl: "https://community.example/models/fold?session=page-secret",
        license: "CC BY 4.0",
        confidence: "approximate",
      },
      format: "obj", sourceUnit: "millimeter", intent: "Use the phone shell as an approximate fit reference", revision: "r1",
    },
  });
  assert.equal(response.isError, undefined);
  assert.equal(downloadCount, 1);
  assert.equal(importCount, 1);
  assert.equal(importedPath, path);
  assert.equal(importedUnit, "millimeter");
  const output = JSON.parse((response.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  assert.equal(output.referenceArtifactHash, createHash("sha256").update(contents).digest("hex"));
  assert.equal(output.sourceReference.sourceUrl, "https://community.example/files/fold.obj?token=%5Bredacted%5D");
  assert.equal(output.sourceReference.sourcePageUrl, "https://community.example/models/fold?session=%5Bredacted%5D");
  assert.equal(output.sourceReference.exactGeometry, false);
  assert.equal(output.acquisition.finalUrl, "https://cdn.example/files/fold.obj?sig=%5Bredacted%5D");
  assert.equal(output.approximateReference, true);
  assert.equal(output.importedMeshes[0].measurementSource, "reference-mesh");
  assert.deepEqual(output.importedMeshes[0].boundsMm.max, [72.8, 158.4, 0]);
  const historyResponse = await client.callTool({ name: "plasticity_construction_history", arguments: {} });
  const history = JSON.parse((historyResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  assert.equal(history.entries[0].operation, "download-and-import-reference-mesh");
  assert.equal(history.entries[0].input.sourceArtifactHash, output.referenceArtifactHash);
  assert.doesNotMatch(JSON.stringify(history), /download-secret|final-secret|page-secret/);
  const stale = await client.callTool({
    name: "plasticity_download_and_import_reference_mesh",
    arguments: { source: { sourceKind: "verified-community-cad", sourceUrl: "https://community.example/other.obj", confidence: "approximate" }, format: "obj", sourceUnit: "millimeter", revision: "r1" },
  });
  assert.equal(stale.isError, true);
  assert.equal(downloadCount, 1, "a stale Plasticity revision must be rejected before network access");
  await client.close(); await server.close();
});

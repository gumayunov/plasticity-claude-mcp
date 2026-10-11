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
import { emptyState, unavailableConstruction } from "../test-support.ts";

test("MCP imports a local 3MF as approximate reference geometry and journals redacted provenance", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-reference-3mf-mcp-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const path = join(root, "reference.3mf");
  await writeFile(path, "fixture 3MF payload");
  let state: RuntimeState = { ...emptyState(), referenceMeshes: [] };
  const importedMesh: NonNullable<RuntimeState["referenceMeshes"]>[number] = {
    id: 42, type: "ReferenceMesh", name: "Device reference", sourcePath: path, sourceFormat: "3mf",
    measurementSource: "reference-mesh", boundsMm: { min: [0, 0, 0], max: [10, 20, 3] },
    translationMm: [0, 0, 0], rotationQuaternion: [0, 0, 0, 1], sceneScaleToMeters: [0.001, 0.001, 0.001],
    vertexEntries: 8, triangles: 12, visible: true, hidden: false, locked: false,
  };
  const operations = {
    async state() { return state; },
    async importReference3mf(inputPath: string, revision: string) {
      assert.equal(inputPath, path);
      assert.equal(revision, "r1");
      state = { ...state, revision: "r2", referenceMeshes: [importedMesh] };
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const references = new StepImportReferenceStore(join(root, "references"));
  const server = createPlasticityServer(fake, undefined, undefined, references, new ConstructionHistoryStore(join(root, "history")));
  const client = new Client({ name: "reference-3mf-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const response = await client.callTool({
    name: "plasticity_import_reference_3mf",
    arguments: {
      path,
      source: {
        sourceKind: "official-manufacturer-cad", sourceUrl: "https://vendor.example/device.3mf?token=private",
        sourcePageUrl: "https://vendor.example/device?session=private", license: "CC BY 4.0", confidence: "verified",
      },
      intent: "Use as approximate envelope reference", revision: "r1",
    },
  });
  assert.equal(response.isError, undefined);
  const output = JSON.parse((response.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  assert.equal(output.approximateReference, true);
  assert.equal(output.measurementSource, "reference-mesh");
  assert.equal(output.referenceArtifactHash, createHash("sha256").update("fixture 3MF payload").digest("hex"));
  assert.equal(output.importedMeshes[0].sourceFormat, "3mf");
  assert.deepEqual(output.importedMeshes[0].boundsMm.max, [10, 20, 3]);
  assert.equal(output.sourceReference.unitSource, "embedded-3mf-model-metadata");
  assert.equal(output.provenancePersisted, true);
  assert.match(output.referenceRecordId, /^[0-9a-f-]{36}$/);
  assert.doesNotMatch(JSON.stringify(output), /token=private|session=private/);
  const persisted = await references.get(output.referenceRecordId);
  assert.equal(persisted.format, "3mf");
  assert.equal(persisted.documentToken, state.documentToken);
  assert.equal(persisted.revision, state.revision);
  assert.deepEqual(persisted.referenceMeshes?.map(({ id, boundsMm }) => ({ id, boundsMm })), [{ id: 42, boundsMm: importedMesh.boundsMm }]);
  await client.close();
  await server.close();
});

test("download-and-import 3MF checks identity before network, hashes the artifact, and keeps provenance approximate", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-reference-3mf-download-mcp-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const path = join(root, "downloaded.3mf");
  const contents = Buffer.from("validated 3MF fixture");
  await writeFile(path, contents);
  const expectedHash = createHash("sha256").update(contents).digest("hex");
  let state: RuntimeState = { ...emptyState(), referenceMeshes: [] };
  let downloadCount = 0;
  let importedPath = "";
  const mesh: NonNullable<RuntimeState["referenceMeshes"]>[number] = {
    id: 73, type: "ReferenceMesh", name: "Downloaded 3MF", sourcePath: path, sourceFormat: "3mf",
    measurementSource: "reference-mesh", boundsMm: { min: [0, 0, 0], max: [4, 4, 4] },
    translationMm: [0, 0, 0], rotationQuaternion: [0, 0, 0, 1], sceneScaleToMeters: [0.001, 0.001, 0.001],
    vertexEntries: 8, triangles: 12, visible: true, hidden: false, locked: false,
  };
  const operations = {
    async state() { return state; },
    async importReference3mf(inputPath: string, revision: string) {
      importedPath = inputPath;
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
    async download() { throw new Error("wrong download route"); },
    async downloadParasolid() { throw new Error("wrong download route"); },
    async downloadReferenceThreeMf(url: string) {
      downloadCount += 1;
      assert.equal(url, "https://vendor.example/device.3mf?token=source-secret");
      return { path, bytes: contents.length, sha256: expectedHash, sourceUrl: url, finalUrl: "https://cdn.example/device.3mf?sig=redirect-secret", format: "reference-mesh-3mf" as const };
    },
  };
  const server = createPlasticityServer(
    fake, undefined, undefined,
    new StepImportReferenceStore(join(root, "references")),
    new ConstructionHistoryStore(join(root, "history")),
    downloader,
  );
  const client = new Client({ name: "reference-3mf-download-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const response = await client.callTool({
    name: "plasticity_download_and_import_reference_3mf",
    arguments: {
      source: {
        sourceKind: "official-manufacturer-cad", sourceUrl: "https://vendor.example/device.3mf?token=source-secret",
        sourcePageUrl: "https://vendor.example/device?session=page-secret", license: "Commercial terms reviewed", confidence: "verified",
      },
      intent: "Use as an approximate fit reference", revision: "r1",
    },
  });
  assert.equal(response.isError, undefined);
  assert.equal(downloadCount, 1);
  assert.equal(importedPath, path);
  const output = JSON.parse((response.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  assert.equal(output.approximateReference, true);
  assert.equal(output.referenceArtifactHash, expectedHash);
  assert.equal(output.sourceReference.format, "3mf");
  assert.equal(output.sourceReference.unitSource, "embedded-3mf-model-metadata");
  assert.equal(output.acquisition.finalUrl, "https://cdn.example/device.3mf?sig=%5Bredacted%5D");
  assert.doesNotMatch(JSON.stringify(output), /source-secret|redirect-secret|page-secret/);
  assert.equal(output.provenancePersisted, true);
  assert.match(output.referenceRecordId, /^[0-9a-f-]{36}$/);
  const persisted = await new StepImportReferenceStore(join(root, "references")).get(output.referenceRecordId);
  assert.equal(persisted.format, "3mf");
  assert.equal(persisted.artifactHash, expectedHash);
  assert.equal(persisted.sourceReference?.sourceUrl, "https://vendor.example/device.3mf?token=%5Bredacted%5D");
  assert.equal(persisted.acquisition?.finalUrl, "https://cdn.example/device.3mf?sig=%5Bredacted%5D");
  assert.deepEqual(persisted.referenceMeshes?.map(({ id, boundsMm }) => ({ id, boundsMm })), [{ id: 73, boundsMm: mesh.boundsMm }]);
  const stale = await client.callTool({
    name: "plasticity_download_and_import_reference_3mf",
    arguments: { source: { sourceKind: "official-manufacturer-cad", sourceUrl: "https://vendor.example/other.3mf", confidence: "verified" }, intent: "Check stale guard", revision: "r1" },
  });
  assert.equal(stale.isError, true);
  assert.equal(downloadCount, 1, "a stale document revision must be rejected before network access");
  await client.close();
  await server.close();

  const restartedServer = createPlasticityServer(
    fake, undefined, undefined,
    new StepImportReferenceStore(join(root, "references")),
    new ConstructionHistoryStore(join(root, "history")),
    downloader,
  );
  const restartedClient = new Client({ name: "reference-3mf-restarted-test-client", version: "1.0.0" });
  const [restartedClientTransport, restartedServerTransport] = InMemoryTransport.createLinkedPair();
  await restartedServer.connect(restartedServerTransport);
  await restartedClient.connect(restartedClientTransport);
  const listed = await restartedClient.callTool({ name: "plasticity_list_cad_reference_imports", arguments: { limit: 10 } });
  const listedData = JSON.parse((listed.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  assert.equal(listedData.total, 1);
  assert.equal(listedData.records[0]?.format, "3mf");
  assert.equal(listedData.records[0]?.referenceMeshCount, 1);
  const recovered = await restartedClient.callTool({ name: "plasticity_get_cad_reference_import", arguments: { id: output.referenceRecordId } });
  const recoveredData = JSON.parse((recovered.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  assert.equal(recoveredData.format, "3mf");
  assert.equal(recoveredData.historical, true);
  assert.deepEqual(recoveredData.referenceMeshes, persisted.referenceMeshes);
  await restartedClient.close();
  await restartedServer.close();
});

test("selected-page reference asset discovery is a read-only MCP call with an explicit domain allowlist", async () => {
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { throw new Error("Plasticity must not be used for selected-page asset discovery"); },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  let request: { pageUrl: string; domains: string[] } | undefined;
  const downloader = {
    async download() { throw new Error("Asset discovery must not download a CAD file"); },
    async downloadParasolid() { throw new Error("Asset discovery must not download a CAD file"); },
    async listReferenceAssets(pageUrl: string, allowedDomains: string[]) {
      request = { pageUrl, domains: allowedDomains };
      return {
        assets: [{ url: "https://dl.radxa.com/zero3/model.step.zip", label: "Official 3D STEP archive", format: "step-archive", kind: "editable-cad" as const }],
        omittedQueryAssetCount: 1,
        truncated: false,
      };
    },
  };
  const server = createPlasticityServer(fake, undefined, undefined, undefined, null, downloader);
  const client = new Client({ name: "reference-asset-list-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const response = await client.callTool({ name: "plasticity_list_reference_assets", arguments: {
    sourcePageUrl: "https://docs.radxa.com/zero/zero3/download",
    allowedDomains: ["docs.radxa.com", "dl.radxa.com"],
  } });

  assert.equal(response.isError, undefined);
  assert.deepEqual(request, { pageUrl: "https://docs.radxa.com/zero/zero3/download", domains: ["docs.radxa.com", "dl.radxa.com"] });
  const result = JSON.parse((response.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  assert.equal(result.assets[0].url, "https://dl.radxa.com/zero3/model.step.zip");
  assert.equal(result.omittedQueryAssetCount, 1);
  assert.equal(result.truncated, false);
  await client.close();
  await server.close();
});

test("download-and-import step preserves sanitized source provenance and exact native measurements", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-step-download-mcp-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const path = join(root, "downloaded.step");
  const contents = "ISO-10303-21;\nsynthetic STEP fixture\nEND-ISO-10303-21;\n";
  await writeFile(path, contents);
  const stateBefore = emptyState();
  let state = stateBefore;
  const importedBody: RuntimeState["bodies"][number] = {
    id: 22, versionId: 220, type: "Solid", name: "Downloaded bracket",
    boundsMm: { min: [0, 0, 0], max: [45, 18, 6] }, faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  let downloadedUrl: string | undefined;
  let downloadCount = 0;
  let importCount = 0;
  let returnWrongHash = false;
  let importedPath: string | undefined;
  const operations = {
    async state() { return state; },
    async importStep(inputPath: string, revision: string) {
      importCount += 1;
      importedPath = inputPath;
      assert.equal(revision, "r1");
      state = { ...state, revision: "r2", bodies: [importedBody] };
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const references = new StepImportReferenceStore(join(root, "references"));
  const source = {
    sourceKind: "official-manufacturer-cad",
    sourceUrl: "https://manufacturer.example/cad/model.step.zip?token=secret-value",
    sourcePageUrl: "https://manufacturer.example/products/model?session=page-secret",
    license: "Test redistribution terms",
    confidence: "verified",
  };
  const downloader = {
    async download(url: string) {
      downloadCount += 1;
      downloadedUrl = url;
      return {
        path,
        bytes: Buffer.byteLength(contents),
        sha256: returnWrongHash ? "0".repeat(64) : createHash("sha256").update(contents).digest("hex"),
        sourceUrl: url,
        finalUrl: "https://cdn.example/model.step.zip?signature=hidden",
        format: "step" as const,
        sourceArchive: { sha256: "c".repeat(64), bytes: 3_284, memberPath: "Cad/model.step" },
      };
    },
    async downloadParasolid(url: string) {
      return { path, bytes: Buffer.byteLength(contents), sha256: createHash("sha256").update(contents).digest("hex"), sourceUrl: url, finalUrl: url, format: "parasolid-text" as const };
    },
  };
  const server = createPlasticityServer(fake, undefined, undefined, references, null, downloader);
  const client = new Client({ name: "step-download-mcp-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  const response = await client.callTool({ name: "plasticity_download_and_import_step", arguments: {
    source: {
      sourceKind: "official-manufacturer-cad",
      sourceUrl: "https://manufacturer.example/cad/model.step.zip?token=secret-value",
      sourcePageUrl: "https://manufacturer.example/products/model?session=page-secret",
      license: "Test redistribution terms",
      confidence: "verified",
    },
    intent: "Import the verified accessory STEP as a locked reference",
    revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.equal(downloadedUrl, "https://manufacturer.example/cad/model.step.zip?token=secret-value");
  assert.equal(importedPath, await realpath(path));
  const output = JSON.parse((response.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  const expectedHash = createHash("sha256").update(contents).digest("hex");
  assert.equal(output.importedArtifactHash, expectedHash);
  assert.equal(output.sourceReference.sourceUrl, "https://manufacturer.example/cad/model.step.zip?token=%5Bredacted%5D");
  assert.equal(output.sourceReference.sourcePageUrl, "https://manufacturer.example/products/model?session=%5Bredacted%5D");
  assert.equal(output.acquisition.finalUrl, "https://cdn.example/model.step.zip?signature=%5Bredacted%5D");
  assert.equal(output.acquisition.bytes, Buffer.byteLength(contents));
  assert.deepEqual(output.acquisition.sourceArchive, { sha256: "c".repeat(64), bytes: 3_284, memberPath: "Cad/model.step" });
  assert.equal(output.provenancePersisted, true);
  assert.deepEqual(output.importedBodyIds, [22]);
  assert.equal(output.importedBodyCount, 1);
  assert.equal("bodies" in output, false, "Downloaded import responses must stay compact too");
  assert.equal(state.revision, "r2");
  assert.deepEqual(state.bodies.map(({ id, boundsMm }) => ({ id, boundsMm })), [{ id: 22, boundsMm: importedBody.boundsMm }]);
  const persisted = await references.get(output.referenceRecordId as string);
  assert.equal(persisted.artifactHash, expectedHash);
  assert.deepEqual(persisted.sourceArchive, { sha256: "c".repeat(64), bytes: 3_284, memberPath: "Cad/model.step" });
  assert.equal(persisted.sourceReference?.sourceUrl, "https://manufacturer.example/cad/model.step.zip?token=%5Bredacted%5D");
  assert.equal(persisted.sourceReference?.sourcePageUrl, "https://manufacturer.example/products/model?session=%5Bredacted%5D");
  returnWrongHash = true;
  const changedArtifact = await client.callTool({ name: "plasticity_download_and_import_step", arguments: { source, revision: "r2" } });
  assert.equal(changedArtifact.isError, true);
  assert.equal(importCount, 1, "Changed or mismatched artifacts must be rejected before Plasticity import");
  assert.equal(state.revision, "r2");
  returnWrongHash = false;
  const staleRevision = await client.callTool({ name: "plasticity_download_and_import_step", arguments: {
    source: { ...source, sourceUrl: "https://manufacturer.example/cad/another.step?token=must-not-fetch" },
    revision: "r1",
  } });
  assert.equal(staleRevision.isError, true);
  assert.equal(downloadCount, 2, "Stale revision must be rejected before network download");
  const journalResponse = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journal = JSON.parse((journalResponse.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  assert.equal(journal.entries.at(-1)?.status, "completed");
  assert.equal(journal.entries.at(-1)?.diff.added[0].boundsMm.max[0], 45);
  assert.doesNotMatch(JSON.stringify(journal), /secret-value|signature=hidden/);
  await client.close(); await server.close();
});

test("download-and-import Parasolid verifies hash, revision, exact bodies, and durable provenance", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-parasolid-download-mcp-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const path = join(root, "downloaded.x_t");
  const contents = `**PARASOLID MODEL 1\n${"x".repeat(120)}`;
  await writeFile(path, contents);
  let state = emptyState();
  let importedPath: string | undefined;
  let downloadCount = 0;
  let importCount = 0;
  const importedBody: RuntimeState["bodies"][number] = {
    id: 32, versionId: 320, type: "Solid", name: "Downloaded reference",
    boundsMm: { min: [0, 0, 0], max: [30, 20, 8] }, faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  const operations = {
    async state() { return state; },
    async importParasolid(inputPath: string, revision: string) {
      importCount += 1;
      importedPath = inputPath;
      assert.equal(revision, "r1");
      state = { ...state, revision: "r2", bodies: [importedBody] };
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const references = new StepImportReferenceStore(join(root, "references"));
  const downloader = {
    async download(url: string) {
      return { path, bytes: Buffer.byteLength(contents), sha256: createHash("sha256").update(contents).digest("hex"), sourceUrl: url, finalUrl: url, format: "step" as const };
    },
    async downloadParasolid(url: string, representation: "x_t" | "x_b" | "xmt_txt" | "xmt_bin") {
      downloadCount += 1;
      return {
        path, bytes: Buffer.byteLength(contents), sha256: createHash("sha256").update(contents).digest("hex"),
        sourceUrl: url, finalUrl: "https://cdn.example/model.x_t?signature=hidden",
        format: representation === "x_t" || representation === "xmt_txt" ? "parasolid-text" as const : "parasolid-binary" as const,
      };
    },
  };
  const server = createPlasticityServer(fake, undefined, undefined, references, null, downloader);
  const client = new Client({ name: "parasolid-download-mcp-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  const source = {
    sourceKind: "official-manufacturer-cad",
    sourceUrl: "https://manufacturer.example/cad/model.xmt_txt?token=secret-value",
    sourcePageUrl: "https://manufacturer.example/products/model",
    license: "Test redistribution terms",
    confidence: "verified",
  };
  const response = await client.callTool({ name: "plasticity_download_and_import_parasolid", arguments: {
    source, representation: "xmt_txt", intent: "Import the explicitly selected reference", revision: "r1",
  } });
  assert.equal(response.isError, undefined);
  assert.equal(downloadCount, 1);
  assert.equal(importCount, 1);
  assert.equal(importedPath, await realpath(path));
  const output = JSON.parse((response.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  const expectedHash = createHash("sha256").update(contents).digest("hex");
  assert.equal(output.importedArtifactHash, expectedHash);
  assert.equal(output.sourceReference.sourceUrl, "https://manufacturer.example/cad/model.xmt_txt?token=%5Bredacted%5D");
  assert.equal(output.sourceReference.sourcePageUrl, "https://manufacturer.example/products/model");
  assert.equal(output.provenancePersisted, true);
  assert.equal(output.revision, "r2");
  assert.deepEqual(output.importedBodyIds, [32]);
  assert.equal(output.importedBodyCount, 1);
  assert.equal("bodies" in output, false);
  const persisted = await references.get(output.referenceRecordId as string);
  assert.equal(persisted.format, "parasolid");
  assert.equal(persisted.artifactHash, expectedHash);
  assert.deepEqual(persisted.bodies.map(({ id, boundsMm }) => ({ id, boundsMm })), [{ id: 32, boundsMm: importedBody.boundsMm }]);
  const list = await client.callTool({ name: "plasticity_list_cad_reference_imports", arguments: { limit: 10 } });
  const listData = JSON.parse((list.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  assert.equal(listData.total, 1);
  assert.equal(listData.records[0]?.format, "parasolid");
  const record = await client.callTool({ name: "plasticity_get_cad_reference_import", arguments: { id: output.referenceRecordId } });
  const recordData = JSON.parse((record.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text ?? "{}");
  assert.equal(recordData.format, "parasolid");
  assert.equal(recordData.historical, true);
  const stale = await client.callTool({ name: "plasticity_download_and_import_parasolid", arguments: {
    source, representation: "xmt_bin", intent: "This call is stale", revision: "r1",
  } });
  assert.equal(stale.isError, true);
  assert.equal(downloadCount, 1, "Stale revision must be rejected before the network download");
  await client.close(); await server.close();
});

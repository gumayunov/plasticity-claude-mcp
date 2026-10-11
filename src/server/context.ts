import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { diffScenes } from "../plasticity/change-tracker.ts";
import { ConstructionHistoryStore, type ConstructionHistoryEntry } from "../plasticity/construction-history.ts";
import { StepImportReferenceStore } from "../plasticity/import-reference-store.ts";
import { StepReferenceDownloader, type StepReferenceDownloaderLike } from "../plasticity/step-reference-downloader.ts";
import { LONG_NATIVE_IMPORT_TIMEOUT_MS, NATIVE_STATE_READ_TIMEOUT_MS, type RuntimeState } from "../plasticity/runtime.ts";
import { findEdges, findFaces, type EdgeQuery, type FaceQuery } from "../plasticity/semantic.ts";
import { type StrengthDependencies } from "../strength/mcp.ts";
import { PrintedThreadQualificationStore } from "../printing/thread-qualification.ts";
import { PLASTICITY_MCP_INSTRUCTIONS } from "../server-instructions.ts";
import { CATALOG_SCHEMA_PAGE_LIMIT, catalogSummary, compactJsonSchema, exposeDirectTool, type ToolCatalogMode } from "../tool-catalog.ts";
import { importedReferenceSourceSchema, revision, intent, type JournalEntry, type NamedSelection } from "./schemas/common.ts";
import { isRuntimeState, compactMutationResult, changesOnlyMutationResult, compactJournalChange, result } from "./results.ts";
import { PlasticitySession, type SessionLike, strengthDependenciesForSession } from "./session.ts";
import { validatedStepPath, validatedParasolidPath, sha256File, provenanceSafeUrl } from "./files.ts";
import { CompatibilityError } from "../plasticity/compat/errors.ts";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { formatValidationIssues, withNextStep } from "./error-hints.ts";
import { closestNames, rankCatalog } from "./catalog-search.ts";

export type ToolResult = ReturnType<typeof result>;
export type ToolExtra = {
  _meta?: { progressToken?: string | number };
  sendNotification(notification: {
    method: "notifications/progress";
    params: { progressToken: string | number; progress: number; message?: string };
  }): Promise<void>;
};
export type RegisterTool = (
  name: string,
  config: {
    title?: string;
    description: string;
    inputSchema: z.ZodType;
    annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean };
  },
  callback: (input: unknown, extra: ToolExtra) => Promise<ToolResult>,
) => unknown;
export type RoutedTool = {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean };
  callback: (input: unknown, extra: ToolExtra) => Promise<ToolResult>;
  toolset: string;
};
export type CadReferenceAcquisition = {
  bytes: number;
  finalUrl: string;
  sourceArchive?: { sha256: string; bytes: number; memberPath: string };
};

export interface ServerOptions {
  /**
   * "summary" (default) answers a mutation with the paginated scene summary
   * plus the change; "changes" returns only what the mutation changed.
   */
  mutationResponses?: "summary" | "changes";
}

export function createToolContext(catalogMode: ToolCatalogMode, session: SessionLike = new PlasticitySession(), suppliedStrength?: StrengthDependencies, threadQualifications: PrintedThreadQualificationStore = new PrintedThreadQualificationStore(), stepImportReferences: StepImportReferenceStore = new StepImportReferenceStore(process.env.PLASTICITY_REFERENCE_ROOT), constructionHistory: ConstructionHistoryStore | null = new ConstructionHistoryStore(process.env.PLASTICITY_CONSTRUCTION_HISTORY_ROOT), stepReferenceDownloader: StepReferenceDownloaderLike = new StepReferenceDownloader(process.env.PLASTICITY_REFERENCE_ARTIFACT_ROOT
    ? { root: process.env.PLASTICITY_REFERENCE_ARTIFACT_ROOT }
    : {}), options: ServerOptions = {}) {
  const mutationResult = options.mutationResponses === "changes" ? changesOnlyMutationResult : compactMutationResult;
  const server = new McpServer({ name: "plasticity-mcp", version: "0.2.2" }, { instructions: PLASTICITY_MCP_INSTRUCTIONS });
  // SDK 1.30 validates tool input before calling the handler; format failures compactly for the model.
  (server as unknown as {
    validateToolInput: (tool: { inputSchema?: z.ZodType }, args: unknown, toolName: string) => Promise<unknown>;
  }).validateToolInput = async (registered, args, toolName) => {
    if (!registered.inputSchema) return undefined;
    const parsed = await registered.inputSchema.safeParseAsync(args);
    if (parsed.success) return parsed.data;
    throw new McpError(ErrorCode.InvalidParams, formatValidationIssues(toolName, parsed.error.issues));
  };
  const strength = suppliedStrength ?? strengthDependenciesForSession(session, {
    analysisUnavailableReason: "The isolated analysis provider was not initialized by this server launcher",
  });
  const journal: JournalEntry[] = [];
  const journalPersistenceWarnings: Array<{ id: string; error: string }> = [];
  const namedSelections = new Map<string, NamedSelection>();
  const closeServer = server.close.bind(server);
  server.close = async () => {
    await strength.analysis?.close();
    await strength.referenceSearch?.close();
    await session.close?.();
    await closeServer();
  };
  const routedTools = new Map<string, RoutedTool>();
  const rawRegisterTool = server.registerTool.bind(server) as unknown as RegisterTool;
  (server as unknown as { registerTool: RegisterTool }).registerTool = (name, config, callback) => {
    const registered = exposeDirectTool(catalogMode, name) ? rawRegisterTool(name, config, callback) : undefined;
    routedTools.set(name, { name, description: config.description, inputSchema: config.inputSchema, annotations: config.annotations, callback, toolset: "session" });
    return registered;
  };
  const registerTool = server.registerTool.bind(server) as unknown as RegisterTool;
  const plasticityCallSchema = z.object({
    toolName: z.string().trim().min(1).max(128).default("catalog"),
    arguments: z.record(z.string(), z.unknown()).default({}),
    query: z.string().trim().min(1).max(200).optional(),
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(25).default(10),
    schemas: z.boolean().optional(),
  }).strict();
  rawRegisterTool("plasticity_call", {
    title: "Plasticity tool catalog and dispatcher",
    description: `Browse the bounded catalog of registered Plasticity MCP operations or invoke one by its exact tool name. Use toolName='catalog' with query/offset/limit to find operations: a page of up to ${CATALOG_SCHEMA_PAGE_LIMIT} operations, or an exact operation name as the query, returns full descriptions and JSON input schemas; longer pages list one-line summaries unless schemas=true. Set toolName to a returned operation name and pass its arguments object to invoke it. Only registered MCP operations are callable; the selected operation's original Zod schema and safety checks are applied. This is not JavaScript execution.`,
    inputSchema: plasticityCallSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  }, async (rawInput, extra) => {
    const input = plasticityCallSchema.parse(rawInput);
    if (input.toolName !== "catalog") {
      const selected = routedTools.get(input.toolName);
      if (!selected || input.toolName === "plasticity_call") {
        throw new Error(`Unknown Plasticity MCP operation: ${input.toolName}. Did you mean: ${closestNames(input.toolName, [...routedTools.keys()]).join(", ")}?`);
      }
      const parsedArguments = await selected.inputSchema.safeParseAsync(input.arguments);
      if (!parsedArguments.success) throw new Error(formatValidationIssues(selected.name, parsedArguments.error.issues));
      return await selected.callback(parsedArguments.data, extra);
    }

    const catalog = [...routedTools.values()].filter((candidate) => candidate.name !== "plasticity_call");
    const matching = input.query ? rankCatalog(catalog, input.query) : [...catalog].sort((left, right) => left.name.localeCompare(right.name));
    const page = matching.slice(input.offset, input.offset + input.limit);
    const withSchemas = input.schemas ?? page.length <= CATALOG_SCHEMA_PAGE_LIMIT;
    return result({
      total: matching.length,
      offset: input.offset,
      limit: input.limit,
      nextOffset: input.offset + page.length < matching.length ? input.offset + page.length : null,
      ...(withSchemas ? {
        validationNote: "The original server-side Zod schema is authoritative; cross-field refinements may be stricter than the exported JSON Schema.",
        tools: page.map((candidate) => ({
          name: candidate.name,
          toolset: candidate.toolset,
          description: candidate.description,
          annotations: candidate.annotations,
          inputSchema: compactJsonSchema(z.toJSONSchema(candidate.inputSchema, { unrepresentable: "any" })),
        })),
      } : {
        schemaNote: "Summaries only. Query an exact operation name, or narrow the page to a few operations, for its full description and input schema.",
        tools: page.map((candidate) => ({
          name: candidate.name,
          toolset: candidate.toolset,
          summary: catalogSummary(candidate.description),
          readOnly: candidate.annotations.readOnlyHint,
        })),
      }),
    });
  });
  let toolTail: Promise<void> = Promise.resolve();
  const exclusive = async <T>(operation: () => Promise<T>): Promise<T> => {
    const prior = toolTail;
    let release: (() => void) | undefined;
    toolTail = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    try {
      return await operation();
    } finally {
      release?.();
    }
  };
  const persistJournalEntry = async (entry: JournalEntry): Promise<void> => {
    if (!constructionHistory) return;
    const record: ConstructionHistoryEntry = {
      id: entry.id,
      occurredAt: entry.occurredAt,
      operation: entry.operation,
      intent: entry.intent,
      input: JSON.parse(JSON.stringify(entry.input)) as ConstructionHistoryEntry["input"],
      documentToken: entry.documentToken,
      beforeRevision: entry.beforeRevision,
      afterDocumentToken: entry.afterDocumentToken,
      afterRevision: entry.afterRevision,
      status: entry.status,
      error: entry.error?.slice(0, 4_000) ?? null,
      change: entry.diff ?? compactJournalChange(null),
    };
    try {
      await constructionHistory.append(record);
    } catch (error) {
      journalPersistenceWarnings.push({ id: entry.id, error: (error instanceof Error ? error.message : String(error)).slice(0, 1_000) });
      if (journalPersistenceWarnings.length > 20) journalPersistenceWarnings.shift();
    }
  };
  const tool = <T extends z.ZodType>(
    name: string,
    description: string,
    schema: T,
    handler: (input: z.output<T>, extra: ToolExtra) => Promise<unknown>,
    readOnly = false,
    annotationOverrides: Partial<{ readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean }> = {},
  ) => registerTool(name, {
    description,
    inputSchema: schema,
    annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, openWorldHint: false, ...annotationOverrides },
  }, async (input, extra) => {
    const progressToken = extra._meta?.progressToken;
    const startedAt = Date.now();
    const progressTimer = progressToken === undefined ? undefined : setInterval(() => {
      void extra.sendNotification({
        method: "notifications/progress",
        params: {
          progressToken,
          progress: Date.now() - startedAt,
          message: `Plasticity MCP operation ${name} is still running.`,
        },
      }).catch(() => undefined);
    }, 10_000);
    try {
      return result(await exclusive(() => handler(schema.parse(input) as z.output<T>, extra)));
    } catch (error) {
      if (error instanceof CompatibilityError) throw new Error(`${name}: ${error.message}. Run plasticity_compatibility_report for the full list of affected tools.`);
      if (error instanceof z.ZodError) throw new Error(formatValidationIssues(name, error.issues));
      throw new Error(withNextStep(error instanceof Error ? error.message : String(error)));
    } finally {
      if (progressTimer) clearInterval(progressTimer);
    }
  });
  const journaled = async <T>(
    operation: string,
    intent: string | undefined,
    input: unknown,
    mutation: () => Promise<T>,
    onCompleted?: (before: RuntimeState, after: RuntimeState) => void,
    stateTimeoutMs = NATIVE_STATE_READ_TIMEOUT_MS,
  ): Promise<T> => {
    const before = await session.get().state(stateTimeoutMs);
    const entry: JournalEntry = {
      id: randomUUID(),
      operation,
      intent: intent ?? null,
      input,
      documentToken: before.documentToken,
      beforeRevision: before.revision,
      afterDocumentToken: null,
      afterRevision: null,
      status: "failed",
      diff: null,
      error: null,
      occurredAt: new Date().toISOString(),
    };
    try {
      const value = await mutation();
      const after = await session.get().state(stateTimeoutMs);
      entry.afterDocumentToken = after.documentToken;
      entry.afterRevision = after.revision;
      entry.status = "completed";
      const sceneDiff = diffScenes(before, after);
      entry.diff = compactJournalChange(sceneDiff);
      journal.push(entry);
      await persistJournalEntry(entry);
      onCompleted?.(before, after);
      return isRuntimeState(value) ? mutationResult<T>(after, sceneDiff) : value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      entry.status = /timed?\s*out|(?:socket|connection|transport|session|client)\s+(?:was\s+)?closed|uncertain/i.test(message) ? "unknown" : "failed";
      entry.error = message;
      try {
        const after = await session.get().state(stateTimeoutMs);
        entry.afterDocumentToken = after.documentToken;
        entry.afterRevision = after.revision;
        entry.diff = compactJournalChange(diffScenes(before, after));
      } catch {
        // Preserve the original mutation error. A dead CDP connection may make
        // even this read-only reconciliation snapshot unavailable.
      }
      journal.push(entry);
      await persistJournalEntry(entry);
      throw error;
    }
  };
  const importCadReference = async (
    path: string,
    format: "step" | "parasolid",
    importFile: (path: string, revision: string) => Promise<RuntimeState>,
    source: z.infer<typeof importedReferenceSourceSchema> | undefined,
    purpose: string | undefined,
    current: string,
    acquisition?: CadReferenceAcquisition,
    expectedHash?: string,
  ) => {
    const referencePath = format === "step" ? await validatedStepPath(path) : await validatedParasolidPath(path);
    const importedArtifactHash = await sha256File(referencePath);
    if (expectedHash && importedArtifactHash !== expectedHash) throw new Error(`Downloaded ${format} artifact changed before native import; inspect the private reference artifact before retrying`);
    const sourceReference = source ? {
      ...source,
      sourceUrl: provenanceSafeUrl(source.sourceUrl),
      ...(source.sourcePageUrl ? { sourcePageUrl: provenanceSafeUrl(source.sourcePageUrl) } : {}),
      artifactHash: importedArtifactHash,
    } : undefined;
    let importSnapshot: { before: RuntimeState; after: RuntimeState } | undefined;
    const state = await journaled(`import-${format}`, purpose, {
      path: referencePath,
      format,
      importedArtifactHash,
      ...(sourceReference ? { sourceReference } : {}),
      ...(acquisition ? { acquisition } : {}),
    }, async () => {
      const imported = await importFile(referencePath, current);
      const postImportHash = await sha256File(referencePath);
      if (postImportHash !== importedArtifactHash) {
        throw new Error(`${format} file changed during import; source identity is uncertain, inspect Plasticity state and construction journal before retrying`);
      }
      return imported;
    }, (before, after) => { importSnapshot = { before, after }; }, LONG_NATIVE_IMPORT_TIMEOUT_MS);
    if (!importSnapshot) throw new Error(`Native ${format} import completed without a captured scene snapshot; reconcile the construction journal before retrying`);
    const { before, after } = importSnapshot;
    const changes = diffScenes(before, after);
    const changedBodies = [...changes.added, ...changes.modified.map((change) => change.after)];
    let referenceRecord: Awaited<ReturnType<typeof stepImportReferences.create>> | undefined;
    let persistenceError: string | undefined;
    try {
      referenceRecord = await stepImportReferences.create({
        artifactHash: importedArtifactHash,
        sourcePath: referencePath,
        format,
        ...(acquisition?.sourceArchive ? { sourceArchive: acquisition.sourceArchive } : {}),
        ...(sourceReference ? { sourceReference } : {}),
        documentToken: after.documentToken,
        revision: after.revision,
        documentTitle: after.title,
        bodies: changedBodies.map((body) => ({
          id: body.id,
          type: body.type,
          name: body.name,
          boundsMm: body.boundsMm,
          faceCount: body.faces.length,
          edgeCount: body.edges.length,
        })),
      });
    } catch (error) {
      persistenceError = error instanceof Error ? error.message : String(error);
    }
    return {
      targetId: state.targetId,
      title: state.title,
      documentToken: state.documentToken,
      revision: state.revision,
      dbVersion: state.dbVersion,
      undoDepth: state.undoDepth,
      redoDepth: state.redoDepth,
      importedFormat: format,
      importedBodyCount: changedBodies.length,
      importedBodyIds: changedBodies.map((body) => body.id),
      importedArtifactHash,
      ...(sourceReference ? { sourceReference } : {}),
      ...(referenceRecord ? { referenceRecordId: referenceRecord.id, provenancePersisted: true } : { provenancePersisted: false, persistenceError }),
      ...(acquisition ? { acquisition } : {}),
    };
  };
  const importStepReference = (
    path: string,
    source: z.infer<typeof importedReferenceSourceSchema> | undefined,
    purpose: string | undefined,
    current: string,
    acquisition?: CadReferenceAcquisition,
    expectedHash?: string,
  ) => importCadReference(path, "step", (inputPath, expectedRevision) => session.get().importStep(inputPath, expectedRevision), source, purpose, current, acquisition, expectedHash);
  const importParasolidReference = (
    path: string,
    source: z.infer<typeof importedReferenceSourceSchema> | undefined,
    purpose: string | undefined,
    current: string,
    acquisition?: CadReferenceAcquisition,
    expectedHash?: string,
  ) => importCadReference(path, "parasolid", (inputPath, expectedRevision) => session.get().importParasolid(inputPath, expectedRevision), source, purpose, current, acquisition, expectedHash);
  const importReferenceThreeMfArtifact = async (
    path: string,
    source: z.infer<typeof importedReferenceSourceSchema> | undefined,
    purpose: string | undefined,
    current: string,
    acquisition?: { bytes: number; finalUrl: string },
    expectedHash?: string,
    expectedDocumentToken?: string,
  ) => {
    const beforeImport = await session.get().state();
    if (beforeImport.revision !== current) throw new Error(`Stale document revision ${current}; current revision is ${beforeImport.revision}`);
    if (expectedDocumentToken && beforeImport.documentToken !== expectedDocumentToken) {
      throw new Error("Plasticity document changed while the 3MF reference was downloading; inspect the document before importing");
    }
    const artifactHash = await sha256File(path);
    if (expectedHash && artifactHash !== expectedHash) throw new Error("Downloaded 3MF reference changed before native import; inspect the private artifact before retrying");
    const sourceReference = source ? {
      ...source,
      sourceUrl: provenanceSafeUrl(source.sourceUrl),
      ...(source.sourcePageUrl ? { sourcePageUrl: provenanceSafeUrl(source.sourcePageUrl) } : {}),
      artifactHash,
      format: "3mf" as const,
      geometryKind: "approximate-reference-mesh" as const,
      unitSource: "embedded-3mf-model-metadata" as const,
      exactGeometry: false as const,
    } : undefined;
    let snapshots: { before: RuntimeState; after: RuntimeState } | undefined;
    const imported = await journaled("import-reference-3mf", purpose, {
      artifactHash,
      ...(sourceReference ? { sourceReference } : {}),
      ...(acquisition ? { acquisition } : {}),
    }, async () => {
      if (await sha256File(path) !== artifactHash) throw new Error("3MF reference changed before native import; inspect it before retrying");
      const state = await session.get().importReference3mf(path, current);
      if (await sha256File(path) !== artifactHash) throw new Error("3MF reference changed during import; inspect Plasticity and construction history before retrying");
      return state;
    }, (before, after) => { snapshots = { before, after }; }, LONG_NATIVE_IMPORT_TIMEOUT_MS);
    if (!snapshots) throw new Error("Native 3MF import completed without a captured scene snapshot; reconcile the construction journal before retrying");
    const previousIds = new Set((snapshots.before.referenceMeshes ?? []).map((mesh) => mesh.id));
    const importedMeshes = (snapshots.after.referenceMeshes ?? []).filter((mesh) => !previousIds.has(mesh.id));
    if (importedMeshes.length === 0 || importedMeshes.some((mesh) => mesh.sourceFormat !== "3mf")) {
      throw new Error("Plasticity 3MF import did not produce identifiable 3MF reference meshes; inspect the document and construction journal before retrying");
    }
    let referenceRecord: Awaited<ReturnType<typeof stepImportReferences.create>> | undefined;
    let persistenceError: string | undefined;
    try {
      referenceRecord = await stepImportReferences.create({
        artifactHash,
        format: "3mf",
        sourcePath: path,
        ...(acquisition ? { acquisition: { bytes: acquisition.bytes, finalUrl: provenanceSafeUrl(acquisition.finalUrl) } } : {}),
        ...(sourceReference ? { sourceReference } : {}),
        documentToken: snapshots.after.documentToken,
        revision: snapshots.after.revision,
        documentTitle: snapshots.after.title,
        bodies: [],
        referenceMeshes: importedMeshes.map((mesh) => ({
          id: mesh.id,
          name: mesh.name,
          sourcePath: mesh.sourcePath,
          boundsMm: mesh.boundsMm,
          vertexEntries: mesh.vertexEntries,
          triangles: mesh.triangles,
        })),
      });
    } catch (error) {
      persistenceError = error instanceof Error ? error.message : String(error);
    }
    return {
      ...imported,
      referenceArtifactHash: artifactHash,
      ...(sourceReference ? { sourceReference } : {}),
      ...(acquisition ? { acquisition } : {}),
      approximateReference: true,
      measurementSource: "reference-mesh",
      importedMeshes,
      ...(referenceRecord ? { referenceRecordId: referenceRecord.id, provenancePersisted: true } : { provenancePersisted: false, persistenceError }),
    };
  };
  const evaluateNamedSelection = (selection: NamedSelection, state: RuntimeState) => {
    if (selection.documentToken !== state.documentToken) {
      return { ...selection, status: "document-changed" as const, matches: [] };
    }
    const matches = selection.kind === "faces"
      ? findFaces(state, selection.query as FaceQuery)
      : findEdges(state, selection.query as EdgeQuery);
    const expected = selection.expectedCount;
    const status = matches.length === 0 || (expected !== null && matches.length < expected)
      ? "unresolved" as const
      : expected !== null && matches.length > expected
        ? "ambiguous" as const
        : "resolved" as const;
    return { ...selection, status, currentRevision: state.revision, matches };
  };
  const sceneChangeInput = z.object({
    snapshotId: z.string().uuid(),
    bodyOffset: z.number().int().min(0).max(1_000_000).default(0),
    bodyLimit: z.number().int().min(1).max(100).default(20),
    expectedRevision: z.string().min(1).optional(),
  });
  const importReferenceListInput = z.object({ offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(100).default(20) }).strict();
  const listImportReferences = async ({ offset, limit }: { offset: number; limit: number }) => {
    const page = await stepImportReferences.list(offset, limit);
    return {
      ...page,
    records: page.records.map(({ id, importedAt, artifactHash, format, sourcePath, sourceArchive, sourceReference, documentToken, revision: importedRevision, documentTitle, bodies, referenceMeshes }) => ({
        id, importedAt, artifactHash, ...(format ? { format } : {}), sourcePath, ...(sourceArchive ? { sourceArchive } : {}), ...(sourceReference ? { sourceReference } : {}),
        documentToken, revision: importedRevision, documentTitle, bodyCount: bodies.length, ...(referenceMeshes ? { referenceMeshCount: referenceMeshes.length } : {}),
        historical: true as const,
      })),
    };
  };
  const getImportReference = async ({ id }: { id: string }) => ({
    ...(await stepImportReferences.get(id)),
    historical: true as const,
  });
  return { catalogMode, session, suppliedStrength, threadQualifications, stepImportReferences, constructionHistory, stepReferenceDownloader, server, strength, journal, journalPersistenceWarnings, namedSelections, closeServer, routedTools, rawRegisterTool, registerTool, plasticityCallSchema, toolTail, exclusive, persistJournalEntry, tool, journaled, importCadReference, importStepReference, importParasolidReference, importReferenceThreeMfArtifact, evaluateNamedSelection, sceneChangeInput, importReferenceListInput, listImportReferences, getImportReference };
}

export type ToolContext = ReturnType<typeof createToolContext>;

import { z } from "zod";
import { importedReferenceSourceSchema, revision, intent } from "../schemas/common.ts";
import { provenanceSafeUrl } from "../files.ts";
import type { ToolContext } from "../context.ts";

export function registerReferencesTools(ctx: ToolContext): void {
  const { session, stepReferenceDownloader, tool, importStepReference, importParasolidReference, importReferenceThreeMfArtifact, importReferenceListInput, listImportReferences, getImportReference } = ctx;
  for (const name of ["plasticity_list_cad_reference_imports", "plasticity_list_step_imports"] as const) {
    tool(name, "List persistent CAD reference import provenance records (STEP, Parasolid, and approximate 3MF reference meshes) from the local MCP store. Records are historical evidence tied to the document/revision at import time; their body or mesh IDs are not current references. Use offset/limit to page results.", importReferenceListInput, listImportReferences, true);
  }
  for (const name of ["plasticity_get_cad_reference_import", "plasticity_get_step_import"] as const) {
    tool(name, "Read one persistent CAD reference import provenance record (STEP, Parasolid, or 3MF). STEP and Parasolid records contain exact native B-Rep measurements; 3MF records contain approximate reference-mesh bounds and topology counts, not editable B-Rep. The record is historical; verify the current scene before using any stored body or mesh ID.", z.object({ id: z.string().uuid() }).strict(), getImportReference, true);
  }
  tool("plasticity_download_and_import_step", "Download one explicitly selected HTTPS STEP file or ZIP containing exactly one STEP member from a public hostname and import it as exact native CAD geometry. Returns compact document state and changed body IDs/count; use plasticity_body_info for selected exact B-Rep detail. Provide source.sourceUrl as the direct file/archive URL and source.sourcePageUrl as the candidate page URL when available. The downloader pins a resolved public IPv4 address per request, limits redirects, archive size and response size, validates the STEP envelope and archive CRC, stores private content-addressed source and import artifacts, and records both source/archive provenance hashes. Search candidates first with plasticity_search_product_references, review the source, license, format and fit, then select one before calling this importer. Never use arbitrary, untrusted candidates as exact dimensions.", z.object({
    source: importedReferenceSourceSchema,
    intent,
    revision,
  }).strict(), async ({ source, intent: purpose, revision: current }) => {
    const beforeDownload = await session.get().state();
    if (beforeDownload.revision !== current) throw new Error(`Stale document revision ${current}; current revision is ${beforeDownload.revision}`);
    const downloaded = await stepReferenceDownloader.download(source.sourceUrl);
    const sourceReference = {
      ...source,
      sourceUrl: provenanceSafeUrl(source.sourceUrl),
      ...(source.sourcePageUrl ? { sourcePageUrl: provenanceSafeUrl(source.sourcePageUrl) } : {}),
    };
    const acquisition = {
      bytes: downloaded.bytes,
      finalUrl: provenanceSafeUrl(downloaded.finalUrl),
      ...(downloaded.sourceArchive ? { sourceArchive: downloaded.sourceArchive } : {}),
    };
    return await importStepReference(downloaded.path, sourceReference, purpose, current, acquisition, downloaded.sha256);
  }, false, { openWorldHint: true });
  tool("plasticity_list_reference_assets", "Read one explicitly selected product or CAD source page and list its direct STEP/Parasolid, mesh (including 3MF), and drawing links. This performs one bounded HTTPS GET of the selected HTML page only; it does not download an asset, import geometry, run page scripts, or mutate Plasticity. Provide the same explicit allowedDomains used for the selected search. Page hosts, redirects, and returned asset hosts must match those domains, DNS is pinned to public IPv4, and all query-bearing asset links are omitted to avoid exposing expiring credentials. Review the returned exact asset URL, format, license, and fit before separately choosing a download/import tool.", z.object({
    sourcePageUrl: z.string().url().max(4_096),
    allowedDomains: z.array(z.string().trim().min(1).max(253)).min(1).max(20),
  }).strict(), async ({ sourcePageUrl, allowedDomains }) => {
    const listAssets = stepReferenceDownloader.listReferenceAssets;
    if (!listAssets) throw new Error("This server runtime does not provide selected-page reference asset discovery");
    return await listAssets.call(stepReferenceDownloader, sourcePageUrl, allowedDomains);
  }, true, { openWorldHint: true });
  tool("plasticity_download_and_import_reference_3mf", "Download one explicitly selected direct HTTPS 3MF file from a public hostname and import it through Plasticity as approximate reference mesh geometry. The embedded 3MF unit is used by the native importer; returned bounds are reference-mesh measurements, not native B-rep accuracy or proof of exact product dimensions. The downloader pins public IPv4, limits redirects and payloads to 64 MiB, validates the bounded ZIP/XML package, CRCs, paths and mesh indices, then stores a private SHA-256-addressed artifact. It records the artifact hash, source, acquisition and all import-time meshes in the persistent CAD reference-import registry; read the historical record with plasticity_get_cad_reference_import. Review source, license and product/SKU first; this does not import exact editable CAD or start a print.", z.object({
    source: importedReferenceSourceSchema,
    intent,
    revision,
  }).strict(), async ({ source, intent: purpose, revision: current }) => {
    const downloader = stepReferenceDownloader.downloadReferenceThreeMf;
    if (!downloader) throw new Error("This server runtime does not provide validated 3MF reference downloads");
    const beforeDownload = await session.get().state();
    if (beforeDownload.revision !== current) throw new Error(`Stale document revision ${current}; current revision is ${beforeDownload.revision}`);
    const downloaded = await downloader.call(stepReferenceDownloader, source.sourceUrl);
    if (downloaded.format !== "reference-mesh-3mf") throw new Error(`3MF downloader returned ${downloaded.format}; expected reference-mesh-3mf`);
    const acquisition = { bytes: downloaded.bytes, finalUrl: provenanceSafeUrl(downloaded.finalUrl) };
    return await importReferenceThreeMfArtifact(downloaded.path, source, purpose, current, acquisition, downloaded.sha256, beforeDownload.documentToken);
  }, false, { openWorldHint: true });
  tool("plasticity_import_reference_3mf", "Import a local 3MF as approximate reference mesh geometry through Plasticity's native importer. The file's embedded unit determines scale; read the returned mesh bounds and keep them distinct from exact native B-rep dimensions. The server stores the artifact hash, import-time document/revision, mesh IDs, bounds and topology counts in the persistent CAD reference-import registry; optional source URLs are redacted and retain license and confidence. Read the historical record with plasticity_get_cad_reference_import.", z.object({
    path: z.string().min(1),
    source: importedReferenceSourceSchema.optional(),
    intent,
    revision,
  }).strict(), async ({ path, source, intent: purpose, revision: current }) =>
    await importReferenceThreeMfArtifact(path, source, purpose, current));
  tool("plasticity_download_and_import_parasolid", "Download one explicitly selected HTTPS Parasolid file or ZIP containing exactly one compatible member from a public hostname and import it as exact native B-Rep geometry. Returns compact document state and changed body IDs/count; use plasticity_body_info for selected exact B-Rep detail. Select the source page and license first; source.sourceUrl is the direct file/archive URL and source.sourcePageUrl should identify the product page. Choose the exact representation explicitly; .xmt_txt is text and .xmt_bin is binary. DNS is pinned to public IPv4 addresses; redirects, archive/response size, content header, revision, hashes and imported B-Rep provenance are checked.", z.object({
    source: importedReferenceSourceSchema,
    representation: z.enum(["x_t", "x_b", "xmt_txt", "xmt_bin"]),
    intent,
    revision,
  }).strict(), async ({ source, representation, intent: purpose, revision: current }) => {
    const beforeDownload = await session.get().state();
    if (beforeDownload.revision !== current) throw new Error(`Stale document revision ${current}; current revision is ${beforeDownload.revision}`);
    const downloaded = await stepReferenceDownloader.downloadParasolid(source.sourceUrl, representation);
    const sourceReference = {
      ...source,
      sourceUrl: provenanceSafeUrl(source.sourceUrl),
      ...(source.sourcePageUrl ? { sourcePageUrl: provenanceSafeUrl(source.sourcePageUrl) } : {}),
    };
    const acquisition = {
      bytes: downloaded.bytes,
      finalUrl: provenanceSafeUrl(downloaded.finalUrl),
      ...(downloaded.sourceArchive ? { sourceArchive: downloaded.sourceArchive } : {}),
    };
    return await importParasolidReference(downloaded.path, sourceReference, purpose, current, acquisition, downloaded.sha256);
  }, false, { openWorldHint: true });
}

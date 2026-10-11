import { z } from "zod";
import { LONG_NATIVE_IMPORT_TIMEOUT_MS, type RuntimeState } from "../../plasticity/runtime.ts";
import { importedReferenceSourceSchema, ids, revision, intent } from "../schemas/common.ts";
import { sha256File, provenanceSafeUrl } from "../files.ts";
import type { ToolContext } from "../context.ts";

export function registerExchangeTools(ctx: ToolContext): void {
  const { session, stepReferenceDownloader, tool, journaled, importStepReference, importParasolidReference } = ctx;
  tool("plasticity_export_step", "Export exact B-Rep bodies to a new STEP file without overwriting.", z.object({ ids, path: z.string().min(1), revision }), async ({ ids: bodyIds, path, revision: current }) =>
    await session.get().exportStep(bodyIds, path, current), false, { destructiveHint: false });
  tool("plasticity_export_parasolid", "Export exact native B-Rep bodies to a new Parasolid text (.x_t) or binary (.x_b) file without overwriting. Use this for high-fidelity exchange with software that supports the Parasolid kernel format.", z.object({ ids, path: z.string().min(1), revision }), async ({ ids: bodyIds, path, revision: current }) =>
    await session.get().exportParasolid(bodyIds, path, current), false, { destructiveHint: false });
  tool("plasticity_export_stl", "Tessellate exact B-Rep bodies to a new millimeter-scaled binary STL for slicing. The result is a derived mesh, while STEP remains the editable source.", z.object({
    ids,
    path: z.string().min(1),
    chordToleranceMm: z.number().finite().positive().max(10).default(0.05),
    angleToleranceDegrees: z.number().finite().positive().max(90).default(15),
    revision,
  }).strict(), async ({ ids: bodyIds, path, chordToleranceMm, angleToleranceDegrees, revision: current }) =>
    await session.get().exportStl(bodyIds, path, current, chordToleranceMm, angleToleranceDegrees), false, { destructiveHint: false });
  tool("plasticity_export_3mf", "Tessellate current exact Solid or Sheet bodies to a new validated 3MF for slicers. Plasticity 26.1.3 declares meters, so the adapter applies its verified 0.001 scale to preserve millimeter dimensions and reports mesh bounds from the saved package. The result is a derived mesh; keep .plasticity or STEP as the editable source.", z.object({
    ids,
    path: z.string().min(1),
    chordToleranceMm: z.number().finite().positive().max(10).default(0.05),
    angleToleranceDegrees: z.number().finite().positive().max(90).default(15),
    revision,
  }).strict(), async ({ ids: bodyIds, path, chordToleranceMm, angleToleranceDegrees, revision: current }) =>
    await session.get().export3mf(bodyIds, path, current, chordToleranceMm, angleToleranceDegrees), false, { destructiveHint: false });
  tool("plasticity_export_obj", "Tessellate current exact Solid or Sheet bodies to a new validated Wavefront OBJ without overwriting. Coordinates are written in millimeters with Z up; the result reports counts and bounds parsed from the saved file. OBJ is a derived mesh for interchange or rendering, so retain .plasticity, STEP, or Parasolid as the editable source.", z.object({
    ids,
    path: z.string().min(1),
    chordToleranceMm: z.number().finite().positive().max(10).default(0.05),
    angleToleranceDegrees: z.number().finite().positive().max(90).default(15),
    revision,
  }).strict(), async ({ ids: bodyIds, path, chordToleranceMm, angleToleranceDegrees, revision: current }) =>
    await session.get().exportObj(bodyIds, path, current, chordToleranceMm, angleToleranceDegrees), false, { destructiveHint: false });
  tool("plasticity_export_svg", "Export coplanar native Wire profiles as a new millimeter-scaled SVG without overwriting. B-Rep Lines, full circles, trimmed circular arcs, and native Ellipse segments remain exact when Plasticity exposes their analytic carrier data; non-rational polynomial BCurves of integer degree 1 through 3, including periodic curves, are exported span-by-span as cubic Bezier commands only after additional exact B-Rep validation samples pass. Degree-1 and degree-2 non-rational fixtures have live production stdio verification with independent B-Rep samples on Plasticity 26.1.3. Rational BCurves that fit a conic and agree with 65 dense exact B-Rep samples are represented by an SVG ellipse/arc and marked with sampled-validation metadata; this does not prove global equality, and anything that fails validation uses the approximation path. Other planar B-Rep curves use an adaptive polyline checked at quarter samples against curveChordToleranceMm and curveChordAngleDegrees and are explicitly marked as approximations in SVG metadata. Returned deviation is the maximum tested chord deviation, not a proof of global error. Noncoplanar Wires are rejected; for Solid drawings use plasticity_export_hiddenline_svg. Keep the .plasticity or STEP file as the editable source.", z.object({
    ids: z.array(z.number().int().positive()).min(1).max(4096).refine((values) => new Set(values).size === values.length, "Wire IDs must be unique"),
    path: z.string().min(1),
    curveChordToleranceMm: z.number().finite().positive().max(5).default(0.05),
    curveChordAngleDegrees: z.number().finite().positive().max(30).default(5),
    revision,
  }).strict(), async ({ ids: wireIds, path, revision: current, curveChordToleranceMm, curveChordAngleDegrees }) =>
    await session.get().exportSvg(wireIds, path, current, curveChordToleranceMm, curveChordAngleDegrees), false, { destructiveHint: false });
  tool("plasticity_export_hiddenline_svg", "Project current native Solid B-rep geometry through Plasticity's hidden-line generator into a new vector SVG without overwriting. Requires an orthographic current view; output geometry is calibrated to projected model millimeters and includes visible and hidden line styles. Set a named orthographic camera with plasticity_set_view first when needed. This is a derived drawing, not an editable CAD model; retain .plasticity or STEP.", z.object({
    ids: z.array(z.number().int().positive()).min(1).max(128).refine((values) => new Set(values).size === values.length, "Solid IDs must be unique"),
    path: z.string().min(1),
    curveChordToleranceMm: z.number().finite().positive().max(5).default(0.05),
    curveChordAngleDegrees: z.number().finite().positive().max(30).default(5),
    marginMm: z.number().finite().min(0).max(1_000).default(1),
    revision,
  }).strict(), async ({ ids: bodyIds, path, curveChordToleranceMm, curveChordAngleDegrees, marginMm, revision: current }) =>
    await session.get().exportHiddenLineSvg(bodyIds, path, current, curveChordToleranceMm, curveChordAngleDegrees, marginMm), false, { destructiveHint: false });
  tool("plasticity_import_step", "Import exact STEP geometry into the current document. Returns compact document state, imported body IDs/count, source SHA-256, and a persistent local provenance record with native B-Rep measurements. Optionally provide HTTPS source provenance. The record is historical after further edits; use plasticity_body_info for selected bodies and plasticity_measure_solid_properties for measurements.", z.object({
    path: z.string().min(1),
    source: importedReferenceSourceSchema.optional(),
    intent,
    revision,
  }).strict(), async ({ path, source, intent: purpose, revision: current }) => {
    return await importStepReference(path, source, purpose, current);
  });
  tool("plasticity_download_and_import_reference_mesh", "Download one explicitly selected HTTPS STL or OBJ file from a public hostname and import it into Plasticity as an approximate reference mesh. Declare sourceUnit because STL is unitless and community mesh scale can be ambiguous. The downloader pins a public IPv4 address, limits redirects and payloads to 64 MiB, validates the mesh structure and finite coordinates, and stores a private SHA-256-addressed artifact. The import is journaled with redacted source provenance and measured mesh bounds. This is tessellated reference geometry, not native B-rep or proof of exact product dimensions; do not use it as a fit-critical datum without checking official drawings or user-confirmed measurements.", z.object({
    source: importedReferenceSourceSchema,
    format: z.enum(["stl", "obj"]),
    sourceUnit: z.enum(["millimeter", "centimeter", "meter", "inch", "foot"]),
    intent,
    revision,
  }).strict(), async ({ source, format, sourceUnit, intent: purpose, revision: current }) => {
    const downloader = stepReferenceDownloader.downloadReferenceMesh;
    if (!downloader) throw new Error("This server runtime does not provide validated reference-mesh downloads");
    const beforeDownload = await session.get().state();
    if (beforeDownload.revision !== current) throw new Error(`Stale document revision ${current}; current revision is ${beforeDownload.revision}`);
    const downloaded = await downloader.call(stepReferenceDownloader, source.sourceUrl, format);
    if (downloaded.format !== `reference-mesh-${format}`) throw new Error(`Reference-mesh downloader returned ${downloaded.format}; expected reference-mesh-${format}`);
    const sourceHash = await sha256File(downloaded.path);
    if (sourceHash !== downloaded.sha256) throw new Error("Downloaded reference-mesh artifact changed before import; inspect the private artifact before retrying");
    const currentState = await session.get().state();
    if (currentState.documentToken !== beforeDownload.documentToken || currentState.revision !== beforeDownload.revision) {
      throw new Error("Plasticity document changed while the reference mesh was downloading; inspect the document before retrying the import");
    }
    const sourceReference = {
      ...source,
      sourceUrl: provenanceSafeUrl(source.sourceUrl),
      ...(source.sourcePageUrl ? { sourcePageUrl: provenanceSafeUrl(source.sourcePageUrl) } : {}),
      artifactHash: downloaded.sha256,
      format,
      sourceUnit,
      exactGeometry: false as const,
    };
    const acquisition = { bytes: downloaded.bytes, finalUrl: provenanceSafeUrl(downloaded.finalUrl) };
    let snapshots: { before: RuntimeState; after: RuntimeState } | undefined;
    const imported = await journaled("download-and-import-reference-mesh", purpose, {
      sourceReference,
      acquisition,
      sourceArtifactHash: downloaded.sha256,
    }, async () => {
      const beforeImportHash = await sha256File(downloaded.path);
      if (beforeImportHash !== downloaded.sha256) throw new Error("Downloaded reference-mesh artifact changed before native import");
      const state = await session.get().importReferenceMesh(downloaded.path, sourceUnit, current);
      if (await sha256File(downloaded.path) !== downloaded.sha256) {
        throw new Error("Reference-mesh file changed during import; inspect Plasticity and construction history before retrying");
      }
      return state;
    }, (before, after) => { snapshots = { before, after }; }, LONG_NATIVE_IMPORT_TIMEOUT_MS);
    if (!snapshots) throw new Error("Native reference-mesh import completed without a captured scene snapshot; reconcile the construction journal before retrying");
    const previousIds = new Set((snapshots.before.referenceMeshes ?? []).map((mesh) => mesh.id));
    const importedMeshes = (snapshots.after.referenceMeshes ?? []).filter((mesh) => !previousIds.has(mesh.id));
    return {
      ...imported,
      referenceArtifactHash: downloaded.sha256,
      sourceReference,
      acquisition,
      approximateReference: true,
      measurementSource: "reference-mesh",
      importedMeshes,
    };
  }, false, { openWorldHint: true });
  tool("plasticity_import_svg", "Import a local SVG as editable native planar Wires in one Plasticity history step. The source unit explicitly defines how SVG coordinate values map to physical length. Closed non-self-intersecting contours also produce revision-bound planar Regions that can be extruded or used as profiles; verify exact Wire geometry after import because SVG transforms and curve content can change the resulting placement and topology.", z.object({
    path: z.string().min(1),
    sourceUnit: z.enum(["millimeter", "centimeter", "meter", "inch", "foot"]),
    intent,
    revision,
  }).strict(), async ({ path, sourceUnit, intent: purpose, revision: current }) =>
    await journaled("import-svg", purpose, { path, sourceUnit }, () => session.get().importSvg(path, sourceUnit, current)));
  tool("plasticity_import_reference_mesh", "Import a local STL or OBJ as an approximate reference mesh in one Plasticity history step. The source unit is explicit because STL is unitless and community OBJ scale is often ambiguous. The result can be selected and transformed, but its mesh bounds and triangles are reference evidence only; use manufacturer CAD, drawings, or user-confirmed dimensions for exact modeling.", z.object({
    path: z.string().min(1),
    sourceUnit: z.enum(["millimeter", "centimeter", "meter", "inch", "foot"]),
    intent,
    revision,
  }).strict(), async ({ path, sourceUnit, intent: purpose, revision: current }) =>
    await journaled("import-reference-mesh", purpose, { path, sourceUnit }, () => session.get().importReferenceMesh(path, sourceUnit, current)));
  tool("plasticity_import_parasolid", "Import a validated Parasolid text (.x_t) or binary (.x_b) file as native editable B-Rep geometry. Returns compact document state, imported body IDs/count, artifact SHA-256, and historical document/revision provenance with exact imported-body measurements. Optional source metadata records the direct asset and source page. Use plasticity_body_info for selected bodies.", z.object({ path: z.string().min(1), source: importedReferenceSourceSchema.optional(), intent, revision }).strict(), async ({ path, source, intent: purpose, revision: current }) =>
    await importParasolidReference(path, source, purpose, current));
}

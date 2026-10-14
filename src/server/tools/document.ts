import { z } from "zod";
import { revision, intent } from "../schemas/common.ts";
import type { ToolContext } from "../context.ts";
import { mcpContent } from "../results.ts";
import { writeProjectBrief } from "../project-brief.ts";

export function registerDocumentTools(ctx: ToolContext): void {
  const { session, tool, journaled } = ctx;
  tool("plasticity_undo", "Undo the most recent document edit.", z.object({ intent, revision }), async ({ intent: purpose, revision: current }) =>
    await journaled("undo", purpose, {}, () => session.get().undo(current)));
  tool("plasticity_redo", "Redo the most recent undone document edit.", z.object({ intent, revision }), async ({ intent: purpose, revision: current }) =>
    await journaled("redo", purpose, {}, () => session.get().redo(current)));

  tool("plasticity_set_view", "Set a named viewport orientation and optionally fit all geometry.", z.object({ view: z.enum(["front", "back", "left", "right", "top", "bottom", "isometric"]), fit: z.boolean().default(false) }), async ({ view, fit }) =>
    await session.get().setView(view, fit));
  tool("plasticity_screenshot", "Save a PNG screenshot of the visible Plasticity renderer viewport to a new file without overwriting. Refuses hidden windows to avoid stale frames.", z.object({ path: z.string().min(1) }), async ({ path }) =>
    await session.get().screenshot(path), false, { destructiveHint: false });
  tool("plasticity_save_copy", "Save the current document to a new .plasticity file without overwriting.", z.object({ path: z.string().min(1) }), async ({ path }) =>
    await session.get().saveCopy(path), false, { destructiveHint: false });
  tool("plasticity_save", "Save the open document over its own .plasticity file, exactly like File > Save: Plasticity rotates its backup copies and clears the unsaved-changes flag. expectedPath must be the file the document is open from; a document that has never been saved is refused, use plasticity_save_copy for it.", z.object({ expectedPath: z.string().min(1), revision }).strict(), async ({ expectedPath, revision: current }) =>
    await session.get().saveDocument(expectedPath, current));
  tool("plasticity_open_document", "Open a .plasticity document after writing the current document to a new backup file.", z.object({ path: z.string().min(1), backupPath: z.string().min(1), intent, revision }), async ({ path, backupPath, intent: purpose, revision: current }) =>
    await journaled("open-document", purpose, { path, backupPath }, () => session.get().openDocument(path, backupPath, current)));
  tool("plasticity_view", "Capture the Plasticity viewport from one or more standard views and return the images directly, so you can check visually what you built. Fitting uses visible bodies only; with bodyIds only those bodies are shown and framed (the others are hidden in the renderer for the capture, not in the document). Toolbars and panels are left out unless hideOverlays is false. The user's camera is restored afterwards. Use measurements, not images, for exact dimensions.", z.object({
    views: z.array(z.enum(["current", "isometric", "front", "back", "left", "right", "top", "bottom"])).min(1).max(4).default(["isometric"]),
    fit: z.boolean().default(true),
    maxWidth: z.number().int().min(256).max(2048).default(1024),
    format: z.enum(["jpeg", "png"]).default("jpeg"),
    bodyIds: z.array(z.number().int().positive()).min(1).max(4096).optional(),
    hideOverlays: z.boolean().default(true),
  }).strict(), async ({ views, fit, maxWidth, format, bodyIds, hideOverlays }) => {
    const captured = await session.get().viewImages(views, fit, maxWidth, format, { ...(bodyIds ? { bodyIds } : {}), hideOverlays });
    return mcpContent([
      { type: "text", text: JSON.stringify({ revision: captured.revision, bodyCount: captured.bodyCount, cameraSettled: captured.cameraSettled, views: captured.images.map(({ view, width, height }) => ({ view, width, height })) }) },
      ...captured.images.map(({ data, mimeType }) => ({ type: "image" as const, data, mimeType })),
    ]);
  }, true);

  const briefView = z.enum(["isometric", "front", "back", "left", "right", "top", "bottom"]);
  tool("plasticity_write_project_brief", "Write or update the project brief: a Markdown file next to the .plasticity document (Name.md, pictures in Name.assets/) with an overview, coordinate conventions, one section per assembly with isolated pictures and a body table, open issues and a body inventory by group. Read it first when resuming a project; update it at milestones. Generated parts sit between plasticity-brief markers and are replaced; text outside them is kept. Sections are upserted by id, so pass only the sections that changed; summary, conventions and openIssues are kept when omitted. Pictures hide the other bodies in the renderer only; the document is not changed.", z.object({
    path: z.string().min(1).optional().describe("Brief .md path; default is the document's file with .md"),
    title: z.string().min(1).max(200).optional(),
    summary: z.string().max(20_000).optional().describe("Markdown: what the model is, key dimensions, status"),
    conventions: z.string().max(20_000).optional().describe("Markdown: axes, which side is front, units, reference planes, transforms"),
    sections: z.array(z.object({
      id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
      title: z.string().min(1).max(200),
      description: z.string().max(20_000).describe("Markdown: purpose, how it is made or bought, fasteners, material, decisions"),
      bodyIds: z.array(z.number().int().positive()).max(4096).optional(),
      groupIds: z.array(z.number().int().min(0)).max(256).optional(),
      views: z.array(briefView).min(1).max(4).optional(),
    }).strict()).max(64).optional(),
    removeSectionIds: z.array(z.string().min(1)).max(64).optional(),
    openIssues: z.array(z.string().min(1).max(2000)).max(100).optional(),
    overviewViews: z.array(briefView).min(1).max(4).optional(),
    imageWidth: z.number().int().min(400).max(2048).default(1200),
    includeInventory: z.boolean().default(true),
    language: z.enum(["en", "ru"]).default("en").describe("Language of generated headings and labels"),
  }).strict(), async (input) => await writeProjectBrief(session.get(), input), false, { destructiveHint: false });
}

import { z } from "zod";
import { revision, intent } from "../schemas/common.ts";
import type { ToolContext } from "../context.ts";

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
}

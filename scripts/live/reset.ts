import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { assertEmptyDocument, snapshot } from "./harness.ts";
import type { McpCaller } from "./types.ts";

export interface ConnectRetryOptions {
  timeoutMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export async function connectWithRetry(mcp: McpCaller, targetId: string, options: ConnectRetryOptions = {}): Promise<any> {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = now() + timeoutMs;
  let lastError: unknown;
  for (;;) {
    try {
      return await mcp.call("plasticity_connect", { targetId });
    } catch (error) {
      lastError = error;
    }
    if (now() + intervalMs > deadline) {
      const reason = lastError instanceof Error ? lastError.message : String(lastError);
      throw new Error(`Could not connect to Plasticity window ${targetId} within ${timeoutMs} ms: ${reason}`);
    }
    await sleep(intervalMs);
  }
}

export interface HarnessDocument {
  fixture: string;
  target: string;
  backupPath: string;
}

// A new Plasticity instance may reopen whatever document was used last, possibly a user's file that
// Plasticity autosaves. Before changing anything, switch to a harness-owned copy of an empty document
// (open_document writes a backup of the previous document first), so edits and autosaves only reach it.
export async function openHarnessDocument(mcp: McpCaller, document: HarnessDocument): Promise<void> {
  await mkdir(dirname(document.target), { recursive: true });
  await copyFile(document.fixture, document.target);
  const before = await snapshot(mcp);
  await mcp.call("plasticity_open_document", {
    path: document.target,
    backupPath: document.backupPath,
    intent: "Open the live harness document",
    revision: before.revision,
  });
  assertEmptyDocument(await snapshot(mcp));
}

// Resets by deleting bodies instead of opening a file: opening over unsaved changes makes Plasticity
// show a modal "unsaved changes" dialog that blocks the renderer.
export function createResetter(getMcp: () => McpCaller): () => Promise<void> {
  return async () => {
    const mcp = getMcp();
    const before = await snapshot(mcp);
    if (before.bodyTotal > 0) {
      await mcp.call("plasticity_delete", { ids: before.bodies.map((body) => body.id), intent: "Live harness reset", revision: before.revision });
    }
    assertEmptyDocument(await snapshot(mcp));
  };
}

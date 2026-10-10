import { join } from "node:path";

import { CheckFailure, assertEmptyDocument, snapshot } from "./harness.ts";
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

export async function prepareTemplate(mcp: McpCaller, runDir: string): Promise<string> {
  let state = await snapshot(mcp);
  // The isolated instance opens the user's startup document; plain bodies in it are safe to clear.
  if (state.bodyTotal > 0 && state.instanceCount === 0 && state.nonRootGroupCount === 0) {
    await mcp.call("plasticity_delete", { ids: state.bodies.map((body) => body.id), intent: "Clear the isolated startup document", revision: state.revision });
    state = await snapshot(mcp);
  }
  try {
    assertEmptyDocument(state);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CheckFailure(`The isolated Plasticity startup document is not empty (check ~/.plasticity/startup.plasticity): ${reason}`);
  }
  const path = join(runDir, "empty.plasticity");
  await mcp.call("plasticity_save_copy", { path });
  return path;
}

export function createResetter(getMcp: () => McpCaller, templatePath: string, backupDir: string): () => Promise<void> {
  let counter = 0;
  return async () => {
    const mcp = getMcp();
    const before = await snapshot(mcp);
    counter += 1;
    await mcp.call("plasticity_open_document", {
      path: templatePath,
      backupPath: join(backupDir, `before-reset-${counter}.plasticity`),
      intent: "Live harness reset to the empty template",
      revision: before.revision,
    });
    assertEmptyDocument(await snapshot(mcp));
  };
}

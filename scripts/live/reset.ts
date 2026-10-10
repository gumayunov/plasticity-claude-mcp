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

// The isolated instance opens the startup (or last) document; plain bodies in it are safe to clear.
// Nothing is saved: a saved harness file would become the "last document" in the shared ~/.plasticity state.
export async function clearStartupDocument(mcp: McpCaller): Promise<void> {
  let state = await snapshot(mcp);
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

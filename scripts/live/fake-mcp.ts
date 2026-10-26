import type { McpCaller } from "./types.ts";

export type FakeHandler = (args: Record<string, unknown>) => unknown;

export interface FakeMcp extends McpCaller {
  calls: Array<{ tool: string; args: Record<string, unknown> }>;
}

export function fakeMcp(handlers: Record<string, FakeHandler>): FakeMcp {
  const calls: FakeMcp["calls"] = [];
  return {
    calls,
    async call(tool, args) {
      calls.push({ tool, args });
      const handler = handlers[tool];
      if (!handler) throw new Error(`Unexpected tool ${tool}`);
      return await handler(args);
    },
    async close() {},
    stderrTail() { return ""; },
  };
}

export function emptyStatus(revision = "r1"): Record<string, unknown> {
  return {
    revision,
    undoDepth: 0,
    redoDepth: 0,
    bodies: [],
    regions: [],
    bodyPagination: { offset: 0, limit: 200, total: 0, nextOffset: null },
    groups: [{ id: 0 }],
  };
}

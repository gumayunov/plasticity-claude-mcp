import { assertEmptyDocument, requireCondition, snapshot } from "../harness.ts";
import type { LiveCheck } from "../types.ts";

export const connectReadScene: LiveCheck = {
  name: "connect-read-scene",
  async run({ mcp, targetId }) {
    const windows = await mcp.call("plasticity_list_windows", {});
    requireCondition(
      Array.isArray(windows) && windows.some((window: { targetId: string }) => window.targetId === targetId),
      `Window ${targetId} is not listed by plasticity_list_windows`,
    );
    const state = await snapshot(mcp);
    assertEmptyDocument(state);
    return { bodyCount: state.bodyTotal, regionCount: state.regions.length };
  },
};

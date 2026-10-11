import { comparePngPixels } from "../../png-pixels.ts";
import { SMOKE_INTENT, mutate, requireCondition } from "../harness.ts";
import type { LiveCheck, McpCaller } from "../types.ts";

type Content = Array<{ type: string; text?: string; data?: string; mimeType?: string }>;

async function view(mcp: McpCaller, views: string[], format: "png" | "jpeg"): Promise<Content> {
  const response = await mcp.callRaw("plasticity_view", { views, format, maxWidth: 512 }) as { content: Content; isError?: boolean };
  requireCondition(!response.isError, `plasticity_view failed: ${response.content[0]?.text ?? ""}`);
  return response.content;
}

export const viewImages: LiveCheck = {
  name: "view-images",
  async run({ mcp }) {
    await mutate(mcp, "plasticity_create_box", { originMm: [0, 0, 0], sizeMm: [40, 20, 10], intent: SMOKE_INTENT });
    const before = await view(mcp, ["current"], "png");
    const pair = await view(mcp, ["top", "front"], "jpeg");
    const images = pair.filter((item) => item.type === "image");
    requireCondition(images.length === 2 && images.every((item) => item.mimeType === "image/jpeg" && (item.data?.length ?? 0) > 1000), "expected two non-empty JPEG images");
    const after = await view(mcp, ["current"], "png");
    const first = Buffer.from(before.find((item) => item.type === "image")!.data!, "base64");
    const second = Buffer.from(after.find((item) => item.type === "image")!.data!, "base64");
    const difference = comparePngPixels(first, second);
    requireCondition(difference.changedPixelRatio < 0.01, `camera was not restored: ${(difference.changedPixelRatio * 100).toFixed(2)}% pixels changed`);
    return { images: images.length, cameraRestored: true };
  },
};

export const toolsetListing: LiveCheck = {
  name: "toolset-listing",
  async run({ mcp }) {
    const rows = await mcp.call("plasticity_toolsets", {}) as Array<{ name: string; toolCount: number; enabled: boolean }>;
    requireCondition(rows.length >= 15, `expected at least 15 toolsets, got ${rows.length}`);
    requireCondition(rows.every((row) => row.enabled), "every toolset must be enabled in full mode");
    const solids = rows.find((row) => row.name === "solids");
    requireCondition(solids !== undefined && solids.toolCount > 0, "solids toolset is empty");
    return { toolsets: rows.length };
  },
};

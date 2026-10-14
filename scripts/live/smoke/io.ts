import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { decodePngPixels } from "../../png-pixels.ts";
import { SMOKE_INTENT, expectBounds, mutate, onlyBody, readBinaryStlBounds, requireCondition, snapshot, type BodySummary } from "../harness.ts";
import type { LiveCheck, McpCaller } from "../types.ts";

async function box(mcp: McpCaller, sizeMm: [number, number, number]): Promise<BodySummary> {
  return onlyBody((await mutate(mcp, "plasticity_create_box", { originMm: [0, 0, 0], sizeMm, intent: SMOKE_INTENT })).added, "Solid", "io box");
}

async function exportStep(mcp: McpCaller, bodyId: number, path: string): Promise<void> {
  const { revision } = await snapshot(mcp);
  await mcp.call("plasticity_export_step", { ids: [bodyId], path, revision });
  const text = await readFile(path, "utf8");
  requireCondition(text.startsWith("ISO-10303-21"), "STEP file does not start with ISO-10303-21");
}

export const exportStepStl: LiveCheck = {
  name: "export-step-stl",
  async run({ mcp, workDir }) {
    const body = await box(mcp, [20, 10, 5]);
    await exportStep(mcp, body.id, join(workDir, "box.step"));
    const stlPath = join(workDir, "box.stl");
    const { revision } = await snapshot(mcp);
    await mcp.call("plasticity_export_stl", { ids: [body.id], path: stlPath, revision });
    const stl = readBinaryStlBounds(await readFile(stlPath));
    expectBounds(stl.boundsMm, [0, 0, 0], [20, 10, 5], "STL");
    return { stlBoundsMm: stl.boundsMm };
  },
};

export const importStep: LiveCheck = {
  name: "import-step",
  async run({ mcp, workDir }) {
    const body = await box(mcp, [20, 10, 5]);
    const stepPath = join(workDir, "roundtrip.step");
    await exportStep(mcp, body.id, stepPath);
    const undone = await mutate(mcp, "plasticity_undo", { intent: SMOKE_INTENT });
    requireCondition(undone.after.bodyTotal === 0, `undo before import: expected an empty document, got ${undone.after.bodyTotal} bodies`);
    const imported = onlyBody((await mutate(mcp, "plasticity_import_step", { path: stepPath, intent: SMOKE_INTENT })).added, "Solid", "imported solid");
    expectBounds(imported.boundsMm, [0, 0, 0], [20, 10, 5], "imported solid");
    requireCondition(imported.faceCount === 6, `import: expected 6 faces, got ${imported.faceCount}`);
    return { boundsMm: imported.boundsMm, faceCount: imported.faceCount };
  },
};

export const saveAndReopen: LiveCheck = {
  name: "save-reopen",
  async run({ mcp, workDir }) {
    await box(mcp, [12, 8, 4]);
    const documentPath = join(workDir, "document.plasticity");
    await mcp.call("plasticity_save_copy", { path: documentPath });
    const { revision } = await snapshot(mcp);
    await mcp.call("plasticity_open_document", { path: documentPath, backupPath: join(workDir, "before-open.plasticity"), intent: SMOKE_INTENT, revision });
    const reopened = await snapshot(mcp);
    const body = onlyBody(reopened.bodies, "Solid", "reopened body");
    expectBounds(body.boundsMm, [0, 0, 0], [12, 8, 4], "reopened body");
    return { boundsMm: body.boundsMm };
  },
};

export const viewportScreenshot: LiveCheck = {
  name: "viewport-screenshot",
  async run({ mcp, workDir }) {
    await box(mcp, [40, 20, 10]);
    const path = join(workDir, "viewport.png");
    await mcp.call("plasticity_screenshot", { path });
    const png = decodePngPixels(await readFile(path));
    requireCondition(png.width > 0 && png.height > 0, "screenshot has no pixels");
    const colors = new Set<string>();
    const pixelCount = png.width * png.height;
    const step = Math.max(1, Math.floor(pixelCount / 5000));
    for (let pixel = 0; pixel < pixelCount; pixel += step) {
      const offset = pixel * png.channels;
      colors.add(`${png.pixels[offset]},${png.pixels[offset + 1]},${png.pixels[offset + 2]}`);
    }
    requireCondition(colors.size >= 8, `screenshot looks blank: ${colors.size} distinct sampled colors`);
    return { nonblank: true };
  },
};

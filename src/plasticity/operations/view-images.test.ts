import assert from "node:assert/strict";
import { test } from "node:test";

import type { PlasticityRuntime } from "../runtime.ts";
import { PlasticityOperations } from "./index.ts";

interface Options {
  failOn?: string;
  settled?: boolean;
  viewportRect?: { x: number; y: number; width: number; height: number } | null;
}

function fakeRuntime(options: Options = {}) {
  const log: string[] = [];
  const setViewArgs: Array<{ view: string; fit: boolean; visibleVersionIds: number[] }> = [];
  const clips: unknown[] = [];
  let currentView = "start";
  const runtime = {
    async getState() {
      return {
        targetId: "t", title: "Part", documentToken: "d", revision: "r5", measurements: [],
        bodies: [
          { id: 1, versionId: 11, visible: true, hidden: false },
          { id: 2, versionId: 12, visible: false, hidden: false },
          { id: 3, versionId: 13, visible: true, hidden: true },
        ],
      };
    },
    isUncertain() { return false; },
    async cdp(method: string) {
      log.push(`cdp:${method}`);
      return method === "Page.getLayoutMetrics" ? { cssVisualViewport: { clientWidth: 2048, clientHeight: 1280 } } : {};
    },
    async read(declaration: string, values: unknown[] = []) {
      if (declaration.includes("document.hidden")) return false;
      if (declaration.includes("matrixWorld")) { log.push("settle"); return options.settled ?? true; }
      if (declaration.includes("plasticity-viewport")) return options.viewportRect === undefined ? { x: 100, y: 50, width: 1600, height: 1000 } : options.viewportRect;
      if (declaration.includes("action, saved")) {
        log.push(`camera:${String(values[0])}`);
        return values[0] === "save" ? { position: [1, 2, 3] } : true;
      }
      if (declaration.includes("navigateToOrientation")) {
        const args = values[0] as { view: string; fit: boolean; visibleVersionIds: number[] };
        setViewArgs.push(args);
        currentView = args.view;
        return null;
      }
      throw new Error(`Unexpected read: ${declaration.slice(0, 60)}`);
    },
    async captureScreenshot(screenshot: { format?: string; clip?: unknown }) {
      if (currentView === options.failOn) throw new Error("capture failed");
      clips.push(screenshot.clip);
      log.push(`shot:${currentView}:${screenshot.format}`);
      return `data-${currentView}`;
    },
  } as unknown as PlasticityRuntime;
  return { runtime, log, setViewArgs, clips };
}

test("setView fits only visible bodies", async () => {
  const { runtime, setViewArgs } = fakeRuntime();
  await new PlasticityOperations(runtime).setView("top", true);
  assert.deepEqual(setViewArgs, [{ view: "top", fit: true, visibleVersionIds: [11] }]);
});

test("captures each view inside the viewport, waits for the camera and restores it", async () => {
  const { runtime, log, clips } = fakeRuntime();
  const result = await new PlasticityOperations(runtime).viewImages(["isometric", "current"], true, 800, "jpeg");
  assert.equal(result.revision, "r5");
  assert.equal(result.bodyCount, 3);
  assert.equal(result.cameraSettled, true);
  assert.deepEqual(result.images.map(({ view, width, height, mimeType }) => ({ view, width, height, mimeType })), [
    { view: "isometric", width: 800, height: 500, mimeType: "image/jpeg" },
    { view: "current", width: 800, height: 500, mimeType: "image/jpeg" },
  ]);
  assert.deepEqual(clips[0], { x: 100, y: 50, width: 1600, height: 1000, scale: 0.5 });
  assert.deepEqual(log.filter((entry) => entry.startsWith("camera:") || entry === "settle"), ["camera:save", "settle", "settle", "camera:restore"]);
});

test("falls back to the page size without a viewport element and reports an unsettled camera", async () => {
  const { runtime, clips } = fakeRuntime({ viewportRect: null, settled: false });
  const result = await new PlasticityOperations(runtime).viewImages(["top"], false, 1024, "png");
  assert.equal(result.cameraSettled, false);
  assert.deepEqual(clips[0], { x: 0, y: 0, width: 2048, height: 1280, scale: 0.5 });
  assert.equal(result.images[0]?.mimeType, "image/png");
});

test("the camera is restored when a capture fails", async () => {
  const { runtime, log } = fakeRuntime({ failOn: "top" });
  await assert.rejects(new PlasticityOperations(runtime).viewImages(["front", "top"], false, 1024, "png"), /capture failed/);
  assert.deepEqual(log.filter((entry) => entry.startsWith("camera:")), ["camera:save", "camera:restore"]);
});

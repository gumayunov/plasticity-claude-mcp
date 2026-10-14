import { constants } from "node:fs";
import { copyFile, mkdir, mkdtemp, open, readFile, realpath, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { LONG_NATIVE_IMPORT_TIMEOUT_MS, type RuntimeState } from "../runtime.ts";
import { assertAbsent, canonicalPath } from "./helpers.ts";
import { OperationsBase } from "./base.ts";

export type ViewName = "current" | "isometric" | "front" | "back" | "left" | "right" | "top" | "bottom";

// Runs in the renderer: save or restore the first viewport camera and its active construction plane
// (switching views also switches the workplane), so image capture leaves the user's view untouched.
export const CAMERA_SNIPPET = `function (action, saved) {
  const viewport = Array.from(this.viewports)[0];
  if (!viewport) throw new Error('Plasticity viewport is unavailable');
  const camera = viewport.camera;
  const target = camera.target ?? viewport.orbitControls?.target;
  if (action === 'save') {
    this.__mcpViewSavedConstructionPlane = viewport.constructionPlane;
    return { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), up: camera.up.toArray(), zoom: camera.zoom, target: target?.toArray ? target.toArray() : null };
  }
  camera.position.fromArray(saved.position);
  camera.quaternion.fromArray(saved.quaternion);
  camera.up.fromArray(saved.up);
  camera.zoom = saved.zoom;
  if (this.__mcpViewSavedConstructionPlane !== undefined) {
    viewport.constructionPlane = this.__mcpViewSavedConstructionPlane;
    delete this.__mcpViewSavedConstructionPlane;
  }
  if (saved.target && target?.fromArray) target.fromArray(saved.target);
  camera.updateProjectionMatrix?.();
  viewport.orbitControls?.update?.();
  viewport.setNeedsRender?.();
  return true;
}`;

// Runs in the renderer: view changes animate, so wait until the camera matrix is unchanged for three frames (max 1.5 s).
const CAMERA_SETTLED_SNIPPET = `function () {
  const camera = Array.from(this.viewports ?? [])[0]?.camera;
  if (!camera?.matrixWorld) return Promise.resolve(true);
  return new Promise((resolve) => {
    let previous = null;
    let stable = 0;
    const started = performance.now();
    const tick = () => {
      const current = Array.from(camera.matrixWorld.elements).join(',');
      stable = current === previous ? stable + 1 : 0;
      previous = current;
      if (stable >= 3) return resolve(true);
      if (performance.now() - started > 1500) return resolve(false);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}`;

// Runs in the renderer: the 3D viewport's rectangle, so screenshots leave out the panels around it.
const VIEWPORT_RECT_SNIPPET = `function () {
  const element = document.querySelector('plasticity-viewport');
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
}`;

// Runs in the renderer: hide every body view except the kept versions, or restore the ones hidden before.
// Only the three.js objects change, so the document, its Undo history and the user's visibility stay untouched.
export const ISOLATE_SNIPPET = `function (action, keepVersionIds) {
  const views = this.geo.geometryModel;
  if (action === 'restore') {
    const saved = this.__mcpIsolation ?? { hidden: [], shown: [] };
    for (const versionId of saved.hidden) { const item = views.get(versionId); if (item?.view) item.view.visible = true; }
    for (const versionId of saved.shown) { const item = views.get(versionId); if (item?.view) item.view.visible = false; }
    delete this.__mcpIsolation;
  } else {
    // Kept bodies the user has hidden are shown too: a picture of a part should not depend on what is hidden right now.
    const keep = new Set(keepVersionIds);
    const hidden = [];
    const shown = [];
    for (const [versionId, item] of views) {
      if (!item?.view) continue;
      if (keep.has(versionId) && !item.view.visible) { item.view.visible = true; shown.push(versionId); }
      else if (!keep.has(versionId) && item.view.visible) { item.view.visible = false; hidden.push(versionId); }
    }
    this.__mcpIsolation = { hidden, shown };
  }
  for (const viewport of this.viewports) viewport.setNeedsRender?.();
  return true;
}`;

// Runs in the renderer: the toolbars, view cube and settings panels are HTML drawn over the viewport canvas,
// so a viewport crop still contains them. Hide everything above the canvas while capturing.
export const CAPTURE_OVERLAY_SNIPPET = `function (hide) {
  const id = '__mcp-capture-overlays';
  document.getElementById(id)?.remove();
  if (hide) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = 'plasticity-viewport > :not(canvas) { visibility: hidden !important; }';
    document.head.appendChild(style);
  }
  return new Promise((resolve) => requestAnimationFrame(() => resolve(true)));
}`;

export interface ViewImageOptions {
  /** Show and frame only these bodies; every other body is hidden in the renderer for the capture. */
  bodyIds?: readonly number[];
  /** Hide the HTML panels drawn over the viewport. */
  hideOverlays?: boolean;
}

export abstract class DocumentOperations extends OperationsBase {
  async undo(revision?: string): Promise<RuntimeState> {
    if (revision) await this.assertRevision(revision);
    await this.runtime.mutate(`async function () { if (this.executor.isBusy) throw new Error('Plasticity is busy'); await this.undo(); }`, [], [], LONG_NATIVE_IMPORT_TIMEOUT_MS);
    return await this.state(LONG_NATIVE_IMPORT_TIMEOUT_MS);
  }

  async redo(revision?: string): Promise<RuntimeState> {
    if (revision) await this.assertRevision(revision);
    await this.runtime.mutate(`async function () { if (this.executor.isBusy) throw new Error('Plasticity is busy'); await this.redo(); }`, []);
    return await this.state();
  }

  /** The .plasticity file the open document was loaded from or last saved to, or null for a new document. */
  async documentFile(): Promise<string | null> {
    return await this.runtime.read<string | null>(`function () { return this.document?.filename || null; }`);
  }

  async saveCopy(outputPath: string): Promise<{ path: string; bytes: number }> {
    const output = resolve(outputPath);
    if (extname(output).toLowerCase() !== ".plasticity") throw new Error("Output must end in .plasticity");
    await assertAbsent(output);
    await mkdir(dirname(output), { recursive: true });
    const staging = await mkdtemp(join(dirname(output), ".plasticity-save-"));
    const temporary = join(staging, "document.plasticity");
    try {
      await this.runtime.mutate(`async function (path) { if (this.executor.isBusy) throw new Error('Plasticity is busy'); await this.saver.save(path); }`, [], [temporary], LONG_NATIVE_IMPORT_TIMEOUT_MS);
      const header = await readFile(temporary);
      if (header.length < 24 || header.subarray(0, 10).toString() !== "plasticity") throw new Error("Plasticity produced an invalid document");
      await copyFile(temporary, output, constants.COPYFILE_EXCL);
      return { path: output, bytes: header.length };
    } finally {
      if (!this.runtime.isUncertain()) {
        await rm(temporary, { force: true }).catch(() => undefined);
        await rmdir(staging).catch(() => undefined);
      }
    }
  }

  async saveDocument(expectedPath: string, revision: string): Promise<{ path: string; bytes: number; hasUnsavedChanges: boolean; revision: string }> {
    await this.assertRevision(revision);
    const expected = resolve(expectedPath);
    if (extname(expected).toLowerCase() !== ".plasticity") throw new Error("Expected path must end in .plasticity");
    const current = await this.runtime.read<string | null>(`function () { return this.document?.filename || null; }`);
    if (!current) throw new Error("The document has no file yet; use plasticity_save_copy to write it to a new file");
    if (await canonicalPath(current) !== await canonicalPath(expected)) {
      throw new Error(`The document is open from ${current}, not ${expected}; refusing to save over a different file`);
    }
    const startedAt = Date.now();
    const result = await this.runtime.mutate<{ filename: string; hasUnsavedChanges: boolean }>(`async function (args) {
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      if (this.document.filename !== args.filename) throw new Error('The document file changed before saving');
      await this.save();
      return { filename: this.document.filename, hasUnsavedChanges: Boolean(this.hasUnsavedChanges) };
    }`, [], [{ filename: current }], LONG_NATIVE_IMPORT_TIMEOUT_MS);
    const saved = await stat(result.filename);
    if (saved.mtimeMs < startedAt - 2000) throw new Error(`Plasticity did not write ${result.filename}`);
    const handle = await open(result.filename, "r");
    try {
      const header = Buffer.alloc(10);
      await handle.read(header, 0, header.length, 0);
      if (header.toString() !== "plasticity") throw new Error("Plasticity produced an invalid document");
    } finally {
      await handle.close();
    }
    const state = await this.state();
    return { path: result.filename, bytes: saved.size, hasUnsavedChanges: result.hasUnsavedChanges, revision: state.revision };
  }

  async openDocument(inputPath: string, backupPath: string, revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    const input = await realpath(resolve(inputPath));
    if (extname(input).toLowerCase() !== ".plasticity") throw new Error("Input must end in .plasticity");
    const handle = await open(input, "r");
    try {
      const header = Buffer.alloc(24);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      if (bytesRead < 24 || header.subarray(0, 10).toString() !== "plasticity") throw new Error("Input is not a valid Plasticity document");
    } finally {
      await handle.close();
    }
    await this.saveCopy(backupPath);
    // editor.open is what File > Open runs: unlike OpenFileFactory it also resets Undo history and
    // the unsaved-changes flag, so Undo cannot reach edits made in the previous document.
    // The current document was just written to backupPath, so skip the unsaved-changes prompt:
    // it is a modal dialog that would block the renderer until someone clicks it.
    const opened = await this.runtime.mutate<{ filename: string }>(`async function (args) {
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      this._hasUnsavedChanges = false;
      await this.open(args.path);
      return { filename: this.document.filename };
    }`, [], [{ path: input }], LONG_NATIVE_IMPORT_TIMEOUT_MS);
    if (await canonicalPath(opened.filename) !== input) throw new Error(`Plasticity opened ${opened.filename} instead of ${input}`);
    return await this.state(LONG_NATIVE_IMPORT_TIMEOUT_MS);
  }

  async screenshot(outputPath: string): Promise<{ path: string; bytes: number }> {
    const output = resolve(outputPath);
    if (extname(output).toLowerCase() !== ".png") throw new Error("Screenshot output must end in .png");
    await assertAbsent(output);
    await mkdir(dirname(output), { recursive: true });
    await this.runtime.cdp("Page.bringToFront");
    const hidden = await this.runtime.read<boolean>("function () { return document.hidden; }");
    if (hidden) throw new Error("Plasticity renderer is hidden; activate Plasticity and retry the screenshot");
    const frame = await this.runtime.captureScreenshot();
    const data = Buffer.from(frame, "base64");
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (data.length < 24 || !data.subarray(0, 8).equals(pngSignature) || data.toString("ascii", 12, 16) !== "IHDR" ||
      data.readUInt32BE(16) < 1 || data.readUInt32BE(20) < 1) {
      throw new Error("Plasticity returned an invalid PNG screencast frame");
    }
    await writeFile(output, data, { flag: "wx" });
    return { path: output, bytes: data.length };
  }

  async setView(view: "front" | "back" | "left" | "right" | "top" | "bottom" | "isometric", fit: boolean, fitVersionIds?: readonly number[]): Promise<unknown> {
    // Fit only what the user can see: hidden bodies (for example a large startup cube) must not shrink the framing.
    const visibleVersionIds = !fit
      ? []
      : fitVersionIds
        ? [...fitVersionIds]
        : (await this.state()).bodies.filter((body) => body.visible && !body.hidden).map((body) => body.versionId);
    return await this.runtime.read(`async function (args) {
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const viewport = Array.from(this.viewports)[0];
      if (!viewport) throw new Error('Plasticity viewport is unavailable');
      if (args.view === 'isometric') {
        const camera = viewport.camera.clone();
        camera.position.copy(viewport.camera.target).add(camera.position.clone().set(1, -1, 1));
        camera.lookAt(viewport.camera.target);
        viewport.orbitControls.setQuaternion(camera.quaternion);
      } else {
        await viewport.navigateToOrientation(({ front: 4, back: 1, left: 3, right: 0, top: 2, bottom: 5 })[args.view]);
      }
      if (args.fit) {
        // The bounding sphere already contains the box, so only a small margin is needed.
        const FIT_MARGIN = 1.08;
        const bounds = [...this.geo.geometryModel].filter(([versionId]) => args.visibleVersionIds.includes(versionId)).map(([, item]) => item.model?.FindBox?.()).filter(Boolean);
        if (bounds.length) {
          const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
          for (const box of bounds) for (let i = 0; i < 3; i++) {
            min[i] = Math.min(min[i], [box.min.x, box.min.y, box.min.z][i]);
            max[i] = Math.max(max[i], [box.max.x, box.max.y, box.max.z][i]);
          }
          const center = viewport.camera.target.clone().fromArray(min.map((value, i) => (value + max[i]) / 2));
          const radius = Math.max(1e-6, Math.hypot(...max.map((value, i) => value - min[i])) / 2);
          const camera = viewport.camera;
          const controls = viewport.orbitControls;
          const halfVerticalFov = camera.perspective.fov * Math.PI / 360;
          const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * camera.aspect);
          const limitingFov = Math.min(halfVerticalFov, halfHorizontalFov);
          const distance = limitingFov > 0 ? radius / Math.sin(limitingFov) * FIT_MARGIN : radius * 3;
          controls.target.copy(center);
          controls.targetEnd.copy(center);
          controls.focalOffset.set(0, 0, 0);
          controls.focalOffsetEnd.set(0, 0, 0);
          controls.radius = controls.radiusEnd = distance;
          const width = camera.orthographic.right - camera.orthographic.left;
          const height = camera.orthographic.top - camera.orthographic.bottom;
          const zoom = Math.min(width, height) / (radius * 2 * FIT_MARGIN);
          controls.zoom = controls.zoomEnd = zoom;
          camera.zoom = zoom;
          controls.setNeedsUpdate();
          controls.update(1 / 60);
          camera.updateProjectionMatrix();
        }
      }
      viewport.setNeedsRender();
      return { position: viewport.camera.position.toArray(), target: viewport.camera.target.toArray(), mode: viewport.camera.mode };
    }`, [{ view, fit, visibleVersionIds }]);
  }

  async viewImages(views: readonly ViewName[], fit: boolean, maxWidth: number, format: "jpeg" | "png", options: ViewImageOptions = {}): Promise<{
    revision: string;
    bodyCount: number;
    cameraSettled: boolean;
    images: Array<{ view: ViewName; width: number; height: number; data: string; mimeType: string }>;
  }> {
    const state = await this.state();
    await this.runtime.cdp("Page.bringToFront");
    if (await this.runtime.read<boolean>("function () { return document.hidden; }")) {
      throw new Error("Plasticity renderer is hidden; activate Plasticity and retry");
    }
    let isolatedVersionIds: number[] | undefined;
    if (options.bodyIds && options.bodyIds.length > 0) {
      const byId = new Map(state.bodies.map((body) => [body.id, body.versionId]));
      const missing = options.bodyIds.filter((id) => !byId.has(id));
      if (missing.length > 0) throw new Error(`Unknown body ids: ${missing.join(", ")}`);
      isolatedVersionIds = options.bodyIds.map((id) => byId.get(id)!);
    }
    const saved = await this.runtime.read<unknown>(CAMERA_SNIPPET, ["save", null]);
    const images: Array<{ view: ViewName; width: number; height: number; data: string; mimeType: string }> = [];
    let cameraSettled = true;
    try {
      if (isolatedVersionIds) await this.runtime.read(ISOLATE_SNIPPET, ["isolate", isolatedVersionIds]);
      if (options.hideOverlays) await this.runtime.read(CAPTURE_OVERLAY_SNIPPET, [true]);
      for (const view of views) {
        if (view !== "current") await this.setView(view, fit, isolatedVersionIds);
        if (!(await this.runtime.read<boolean>(CAMERA_SETTLED_SNIPPET))) cameraSettled = false;
        const viewport = await this.runtime.read<{ x: number; y: number; width: number; height: number } | null>(VIEWPORT_RECT_SNIPPET);
        let rect = viewport;
        if (!rect) {
          const metrics = await this.runtime.cdp("Page.getLayoutMetrics") as { cssVisualViewport?: { clientWidth?: number; clientHeight?: number } };
          rect = { x: 0, y: 0, width: metrics.cssVisualViewport?.clientWidth ?? maxWidth, height: metrics.cssVisualViewport?.clientHeight ?? Math.round(maxWidth * 0.625) };
        }
        const scale = Math.min(1, maxWidth / rect.width);
        const data = await this.runtime.captureScreenshot({
          format,
          ...(format === "jpeg" ? { quality: 80 } : {}),
          clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale },
        });
        images.push({ view, width: Math.round(rect.width * scale), height: Math.round(rect.height * scale), data, mimeType: format === "jpeg" ? "image/jpeg" : "image/png" });
      }
    } finally {
      // Restore everything even if one step fails, and report the first failure.
      const restores = [
        () => this.runtime.read(CAMERA_SNIPPET, ["restore", saved]),
        ...(isolatedVersionIds ? [() => this.runtime.read(ISOLATE_SNIPPET, ["restore", null])] : []),
        ...(options.hideOverlays ? [() => this.runtime.read(CAPTURE_OVERLAY_SNIPPET, [false])] : []),
      ];
      const failures: unknown[] = [];
      for (const restore of restores) await restore().catch((error: unknown) => { failures.push(error); });
      if (failures.length > 0) throw failures[0];
    }
    return { revision: state.revision, bodyCount: state.bodies.length, cameraSettled, images };
  }
}

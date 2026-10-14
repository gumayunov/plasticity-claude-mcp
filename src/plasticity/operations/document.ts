import { constants } from "node:fs";
import { copyFile, mkdir, mkdtemp, open, readFile, realpath, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { LONG_NATIVE_IMPORT_TIMEOUT_MS, type RuntimeState } from "../runtime.ts";
import { assertAbsent, canonicalPath } from "./helpers.ts";
import { OperationsBase } from "./base.ts";

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

  async setView(view: "front" | "back" | "left" | "right" | "top" | "bottom" | "isometric", fit: boolean): Promise<unknown> {
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
        const bounds = [...this.geo.geometryModel].map(([, item]) => item.model?.FindBox?.()).filter(Boolean);
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
          const distance = limitingFov > 0 ? radius / Math.sin(limitingFov) * 1.4 : radius * 3;
          controls.target.copy(center);
          controls.targetEnd.copy(center);
          controls.focalOffset.set(0, 0, 0);
          controls.focalOffsetEnd.set(0, 0, 0);
          controls.radius = controls.radiusEnd = distance;
          const width = camera.orthographic.right - camera.orthographic.left;
          const height = camera.orthographic.top - camera.orthographic.bottom;
          const zoom = Math.min(width, height) / (radius * 2 * 1.4);
          controls.zoom = controls.zoomEnd = zoom;
          camera.zoom = zoom;
          controls.setNeedsUpdate();
          controls.update(1 / 60);
          camera.updateProjectionMatrix();
        }
      }
      viewport.setNeedsRender();
      return { position: viewport.camera.position.toArray(), target: viewport.camera.target.toArray(), mode: viewport.camera.mode };
    }`, [{ view, fit }]);
  }
}

import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, mkdtemp, open, readFile, realpath, rm, rmdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { LONG_NATIVE_IMPORT_TIMEOUT_MS, NATIVE_STATE_READ_TIMEOUT_MS, PlasticityRuntime, type RuntimeState } from "../runtime.ts";
import { ConstructionGeometry } from "../construction.ts";
import { DatumRegistry } from "../references.ts";
import { millimetersToMeters } from "../units.ts";
import { MAX_REFERENCE_THREE_MF_ARCHIVE_BYTES, validateReferenceThreeMfArchive, validateThreeMfArchive, type ThreeMfValidation } from "../three-mf.ts";
import { type PlasticitySelection } from "./types.ts";
import { findView } from "./native-snippets.ts";
import { requireMeshExportBodies, assertAbsent } from "./helpers.ts";

export abstract class OperationsBase {
  readonly runtime: PlasticityRuntime;
  readonly datumRegistry: DatumRegistry;
  readonly constructionGeometry: ConstructionGeometry;
  protected measurementOverlaySignature?: string;

  constructor(runtime: PlasticityRuntime, sessionId: string = randomUUID()) {
    this.runtime = runtime;
    this.datumRegistry = new DatumRegistry(sessionId);
    this.constructionGeometry = new ConstructionGeometry(runtime);
  }

  async state(timeoutMs = NATIVE_STATE_READ_TIMEOUT_MS): Promise<RuntimeState> {
    const state = await this.runtime.getState(timeoutMs);
    const measurements = (state.measurements ?? []).filter((measurement) =>
      measurement.type === "DistanceMeasurement"
      && measurement.first?.positionMm
      && measurement.second?.positionMm
      && measurement.direction
      && measurement.normal
      && measurement.offsetMm.length >= 2
      && typeof measurement.distanceMm === "number"
      && Number.isFinite(measurement.distanceMm),
    );
    const signature = JSON.stringify({
      documentToken: state.documentToken,
      measurements: measurements.map((measurement) => [
        measurement.versionId,
        measurement.first!.positionMm,
        measurement.second!.positionMm,
        measurement.direction,
        measurement.normal,
        measurement.offsetMm.slice(0, 2),
        measurement.distanceMm,
      ]),
    });
    if (this.measurementOverlaySignature !== signature
      && (measurements.length > 0 || this.measurementOverlaySignature !== undefined)
      && this.runtime.isUncertain?.() !== true
      && typeof this.runtime.mutate === "function") {
      await this.runtime.mutate(`function (LineSegmentHelper, Vector3, Vector2, makeAxisAlignedMeasurementPath, args) {
        const nativeLabels = this.measurements.distanceLabels;
        for (const label of nativeLabels.labels.slice()) {
          nativeLabels.group.remove(label);
          label.element?.remove();
        }
        nativeLabels.labels.length = 0;
        nativeLabels.segments.clear();
        this.measurements.distanceSegments.clear();
        const managerKey = '__plasticityMcpDistanceOverlays';
        if (!(this[managerKey] instanceof Map)) Object.defineProperty(this, managerKey, { value: new Map(), configurable: true });
        const manager = this[managerKey];
        const managedLabels = new Set(Array.from(manager.values()).flatMap(tag => tag.labels ?? []));
        for (const label of document.querySelectorAll('[data-plasticity-mcp-distance]')) {
          if (!managedLabels.has(label)) label.remove();
        }
        const tagged = this.helpers.scene.children.filter(helper => helper.userData?.plasticityMcpMeasurementOverlay);
        const viewports = Array.from(this.viewports);
        const currentVersions = new Set(args.measurements.map(measurement => measurement.versionId));
        const overlayKey = (documentToken, versionId) => documentToken + ':' + versionId;
        const removeOverlay = (key, tag) => {
          if (tag.frameId !== undefined) cancelAnimationFrame(tag.frameId);
          for (const label of tag.labels ?? []) label.remove();
          for (const helper of tag.helpers ?? (tag.helper ? [tag.helper] : [])) {
            if (helper.parent) this.helpers.remove(helper);
          }
          manager.delete(key);
        };
        for (const helper of tagged) {
          const tag = helper.userData.plasticityMcpMeasurementOverlay;
          const key = overlayKey(tag.documentToken, tag.versionId);
          tag.helper = helper;
          tag.labels ??= [];
          if (!manager.has(key)) manager.set(key, tag);
        }
        for (const [key, tag] of Array.from(manager.entries())) {
          if (tag.documentToken !== args.documentToken || !currentVersions.has(tag.versionId)) removeOverlay(key, tag);
        }
        for (const measurement of args.measurements) {
          const key = overlayKey(args.documentToken, measurement.versionId);
          const previous = manager.get(key);
          if (previous) removeOverlay(key, previous);
          const first = new Vector3(...measurement.firstMm.map(value => value / 1000));
          const second = new Vector3(...measurement.secondMm.map(value => value / 1000));
          const direction = new Vector3(...measurement.direction);
          const normal = new Vector3(...measurement.normal);
          const offset = new Vector2(...measurement.offsetMm.map(value => value / 1000));
          let displayOffset = offset;
          if (offset.length() < 0.0005) {
            const extent = args.bodyBoundsMm
              .filter(body => body.bodyIds.includes(measurement.firstBodyId) || body.bodyIds.includes(measurement.secondBodyId))
              .map(body => body.boundsMm)
              .filter(Boolean);
            const bounds = extent.length ? {
              min: [0, 1, 2].map(axis => Math.min(...extent.map(value => value.min[axis]))),
              max: [0, 1, 2].map(axis => Math.max(...extent.map(value => value.max[axis]))),
            } : undefined;
            const step = Math.max(measurement.distanceMm * 0.08, 2);
            const maxSpan = bounds ? Math.max(...bounds.max.map((value, axis) => value - bounds.min[axis])) : 0;
            const distances = Array.from(new Set([step, maxSpan * 0.25, maxSpan * 0.5, maxSpan * 0.75, maxSpan, maxSpan + step].filter(value => value >= step))).sort((a, b) => a - b);
            const outsideDistance = point => bounds ? Math.hypot(...point.map((value, axis) => Math.max(bounds.min[axis] - value, 0, value - bounds.max[axis]))) : 0;
            let best;
            for (const distanceMm of distances) {
              for (const candidate of [[distanceMm, 0], [-distanceMm, 0], [0, distanceMm], [0, -distanceMm]]) {
                const candidatePath = makeAxisAlignedMeasurementPath(first, second, direction, normal, new Vector2(candidate[0] / 1000, candidate[1] / 1000));
                const startMm = candidatePath[1].toArray().map(value => value * 1000);
                const endMm = candidatePath[3].toArray().map(value => value * 1000);
                const clearance = Math.min(outsideDistance(startMm), outsideDistance(endMm));
                if (!best || clearance > best.clearance) best = { candidate, clearance, path: candidatePath };
                if (clearance > 0.01) {
                  displayOffset = new Vector2(candidate[0] / 1000, candidate[1] / 1000);
                  break;
                }
              }
              if (displayOffset !== offset) break;
            }
            if (displayOffset === offset && best && best.clearance > 0) {
              displayOffset = new Vector2(best.candidate[0] / 1000, best.candidate[1] / 1000);
            }
            if (displayOffset === offset) displayOffset = new Vector2(0, step / 1000);
          }
          const path = makeAxisAlignedMeasurementPath(first, second, direction, normal, displayOffset);
          const linePairs = [[path[0], path[1]], [path[1], path[3]], [path[3], path[4]]];
          const helpers = linePairs
            .filter(([start, end]) => start.distanceToSquared(end) > 1e-16)
            .map(([start, end]) => {
              const helper = new LineSegmentHelper(this);
              helper.p1.copy(start);
              helper.p2.copy(end);
              return helper;
            });
          const helper = helpers.find(candidate => candidate.p1.distanceToSquared(path[1]) < 1e-16
            && candidate.p2.distanceToSquared(path[3]) < 1e-16);
          const labelPoint = path[1].clone().add(path[3]).multiplyScalar(0.5);
          const labels = viewports.map(viewport => {
            const label = document.createElement('div');
            label.dataset.plasticityMcpDistance = String(measurement.versionId);
            label.textContent = measurement.distanceMm.toFixed(2) + ' mm';
            Object.assign(label.style, {
              position: 'absolute',
              zIndex: '30',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              transform: 'translate(-50%, -120%)',
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid rgba(183, 243, 151, 0.7)',
              color: '#eef4f0',
              background: 'rgba(10, 13, 16, 0.9)',
              font: '600 12px ui-sans-serif, system-ui, sans-serif',
              lineHeight: '16px',
            });
            viewport.container.append(label);
            return { viewport, label };
          });
          const tag = {
            documentToken: args.documentToken,
            versionId: measurement.versionId,
            helper,
            helpers,
            labels: labels.map(entry => entry.label),
            frameId: undefined,
          };
          helper.userData.plasticityMcpMeasurementOverlay = tag;
          for (const lineHelper of helpers) lineHelper.userData.plasticityMcpMeasurementOverlay = tag;
          manager.set(key, tag);
          for (const lineHelper of helpers) {
            this.helpers.add(lineHelper);
            lineHelper.render();
            lineHelper.line.material.color.setHex(0xb7f397);
            lineHelper.line.material.depthTest = false;
            lineHelper.line.material.depthWrite = false;
            lineHelper.line.material.linewidth = 2;
            lineHelper.line.renderOrder = 1000;
            lineHelper.line.material.needsUpdate = true;
          }
          const updateLabels = () => {
            if (manager.get(key) !== tag) {
              for (const entry of labels) entry.label.remove();
              return;
            }
            for (const { viewport, label } of labels) {
              const camera = viewport.camera;
              camera.updateMatrixWorld(true);
              const point = labelPoint.clone().project(camera);
              const width = viewport.container.clientWidth;
              const height = viewport.container.clientHeight;
              const visible = width > 0 && height > 0 && point.z >= -1 && point.z <= 1
                && point.x >= -1 && point.x <= 1 && point.y >= -1 && point.y <= 1;
              label.style.display = visible ? 'block' : 'none';
              if (visible) {
                label.style.left = ((point.x + 1) * width / 2) + 'px';
                label.style.top = ((1 - point.y) * height / 2) + 'px';
              }
            }
            tag.frameId = requestAnimationFrame(updateLabels);
          };
          updateLabels();
        }
        for (const viewport of viewports) viewport.setNeedsRender();
      }`, ["LineSegmentHelper", "Vector3", "Vector2", "makeAxisAlignedMeasurementPath"], [{
        documentToken: state.documentToken,
          measurements: measurements.map((measurement) => ({
            versionId: measurement.versionId,
            firstMm: measurement.first!.positionMm!,
            secondMm: measurement.second!.positionMm!,
            firstBodyId: measurement.first!.bodyId,
            secondBodyId: measurement.second!.bodyId,
            direction: measurement.direction!,
            normal: measurement.normal!,
            offsetMm: measurement.offsetMm.slice(0, 2),
            distanceMm: measurement.distanceMm!,
          })),
        bodyBoundsMm: state.bodies.flatMap(body => body.boundsMm ? [{ bodyIds: [body.id], boundsMm: body.boundsMm }] : []),
      }]);
      this.measurementOverlaySignature = signature;
    }
    return state;
  }

  async selection(): Promise<PlasticitySelection> {
    const state = await this.state();
    const selected = await this.runtime.read<Omit<PlasticitySelection, "documentToken" | "revision">>(`function () {
      const selection = this.selection.selected;
      const stableId = view => {
        const versionId = view?.parentItem?.versionId ?? view?.versionId;
        return versionId === undefined ? null : (this.db.lookupStableId(versionId) ?? null);
      };
      return {
        bodyIds: Array.from(selection.items ?? []).map(stableId).filter(Number.isInteger),
        curveIds: Array.from(selection.curveIds ?? []).map(Number).filter(Number.isInteger),
        instanceIds: Array.from(selection.empties ?? [])
          .filter(empty => empty?.constructor?.name === 'InstanceEmpty')
          .map(empty => Number(empty.versionId))
          .filter(Number.isInteger),
        referenceMeshIds: Array.from(selection.empties ?? [])
          .filter(empty => empty?.constructor?.name === 'Empties_ObjectEmpty')
          .map(empty => Number(empty.versionId))
          .filter(Number.isInteger),
        groupIds: Array.from(selection.groups ?? [])
          .map(group => Number(group.versionId))
          .filter(Number.isInteger),
        faces: Array.from(selection.faces ?? []).map(face => ({ bodyId: stableId(face), faceId: String(face.versionId) })),
        edges: Array.from(selection.edges ?? []).map(edge => ({ bodyId: stableId(edge), edgeId: String(edge.versionId) })),
        regionIds: Array.from(selection.regionIds ?? []).map(String),
        curveControlPoints: [
          ...Array.from(selection.curveVertices ?? []).map(vertex => ({ bodyId: stableId(vertex), kind: 'vertex', pointId: Number(vertex.id) })),
          ...Array.from(selection.curveCVs ?? []).map(controlPoint => ({ bodyId: stableId(controlPoint), kind: 'control-point', pointId: Number(controlPoint.id) })),
        ].filter(reference => Number.isInteger(reference.bodyId) && Number.isInteger(reference.pointId)),
      };
    }`);
    return { documentToken: state.documentToken, revision: state.revision, ...selected };
  }

  async export3mf(
    ids: number[],
    outputPath: string,
    revision: string,
    chordToleranceMm: number,
    angleToleranceDegrees: number,
  ): Promise<ThreeMfValidation & {
    path: string;
    bytes: number;
    sourceUnits: "millimeter";
    chordToleranceMm: number;
    angleToleranceDegrees: number;
  }> {
    const state = await this.assertRevision(revision);
    requireMeshExportBodies(state, ids);
    if (!Number.isFinite(chordToleranceMm) || chordToleranceMm <= 0) throw new Error("3MF chord tolerance must be a positive finite millimeter value");
    if (!Number.isFinite(angleToleranceDegrees) || angleToleranceDegrees <= 0 || angleToleranceDegrees > 90) throw new Error("3MF angle tolerance must be within (0, 90] degrees");
    const output = resolve(outputPath);
    if (extname(output).toLowerCase() !== ".3mf") throw new Error("3MF output must end in .3mf");
    await assertAbsent(output);
    await mkdir(dirname(output), { recursive: true });
    const staging = await mkdtemp(join(dirname(output), ".plasticity-3mf-"));
    const temporary = join(staging, "geometry.3mf");
    try {
      await this.runtime.mutate(`async function (Factory, args) {
        ${findView}
        if (this.executor.isBusy) throw new Error('Plasticity is busy');
        const factory = new Factory(this);
        factory.shells = args.ids.map(find);
        factory.filePath = args.path;
        factory.scale = args.scale;
        factory.curveChordTolerance = args.chordTolerance;
        factory.surfacePlaneTolerance = args.chordTolerance;
        factory.curveChordAngleDegrees = args.angleToleranceDegrees;
        factory.surfacePlaneAngleDegrees = args.angleToleranceDegrees;
        await factory.commit();
      }`, ["ThreeMfExportFactory"], [{
        ids,
        path: temporary,
        scale: 0.001,
        chordTolerance: millimetersToMeters(chordToleranceMm),
        angleToleranceDegrees,
      }]);
      const data = await readFile(temporary);
      const validation = validateThreeMfArchive(data);
      await copyFile(temporary, output, constants.COPYFILE_EXCL);
      return {
        path: output,
        bytes: data.length,
        sourceUnits: "millimeter",
        ...validation,
        chordToleranceMm,
        angleToleranceDegrees,
      };
    } finally {
      if (!this.runtime.isUncertain()) {
        await rm(temporary, { force: true }).catch(() => undefined);
        await rmdir(staging).catch(() => undefined);
      }
    }
  }

  async importReference3mf(inputPath: string, revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    const input = await realpath(resolve(inputPath));
    if (extname(input).toLowerCase() !== ".3mf") throw new Error("Reference mesh input must end in .3mf");
    const source = await open(input, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const metadata = await source.stat();
      if (!metadata.isFile()) throw new Error("Reference 3MF input must be a regular file");
      if (metadata.size === 0) throw new Error("Reference 3MF input must not be empty");
      if (metadata.size > MAX_REFERENCE_THREE_MF_ARCHIVE_BYTES) throw new Error(`Reference 3MF input exceeds ${MAX_REFERENCE_THREE_MF_ARCHIVE_BYTES} bytes`);
      const archive = Buffer.alloc(metadata.size);
      let position = 0;
      while (position < archive.length) {
        const { bytesRead } = await source.read(archive, position, archive.length - position, position);
        if (bytesRead === 0) throw new Error("Reference 3MF input changed while it was being read");
        position += bytesRead;
      }
      const overflow = Buffer.alloc(1);
      if ((await source.read(overflow, 0, 1, position)).bytesRead !== 0) throw new Error("Reference 3MF input grew beyond its validated size");
      validateReferenceThreeMfArchive(archive);
    } finally {
      await source.close();
    }
    await this.runtime.mutate(`async function (ImporterExporter, Command, args) {
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(this);
      command.remember = false;
      command.execute = async function () {
        try { return await new ImporterExporter(editor).import3mf(args.path); }
        catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["ImporterExporter", "ImportCommand"], [{ path: input }], LONG_NATIVE_IMPORT_TIMEOUT_MS);
    return await this.state(LONG_NATIVE_IMPORT_TIMEOUT_MS);
  }

  protected async assertRevision(expected: string): Promise<RuntimeState> {
    const current = await this.state();
    if (current.revision !== expected) throw new Error(`Stale reference: expected revision ${expected}, current revision is ${current.revision}`);
    return current;
  }
}

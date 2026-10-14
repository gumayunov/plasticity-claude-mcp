import { constants } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { LONG_NATIVE_IMPORT_TIMEOUT_MS, NATIVE_STATE_READ_TIMEOUT_MS, type RuntimeState } from "../runtime.ts";
import { cross, dot, normalize, scale, subtract } from "../construction.ts";
import { millimetersToMeters } from "../units.ts";
import { MAX_THREE_MF_ARCHIVE_BYTES } from "../three-mf.ts";
import { MAX_OBJ_BYTES, validateObj, type ObjValidation } from "../obj.ts";
import { serializeHiddenLineSvg, type HiddenLineProjectionSegment } from "../hiddenline-svg.ts";
import { tessellateCurve } from "../svg-tessellation.ts";
import { analyzeSvgEllipseArc, fitSvgConicEllipse, fitSvgEllipse } from "../svg-ellipse.ts";
import { evaluateSvgCubicBezier, fitSvgCubicBezier, isExactSvgCubicPolynomialDegree, svgCubicBezierBoundsPoints } from "../svg-cubic.ts";
import { type Vector3, type NativeImportUnit, type ReferenceMeshUnit } from "./types.ts";
import { findView } from "./native-snippets.ts";
import { requireMeshExportBodies, formatSvgNumber, escapeSvgAttribute, requireWireBodyIds, requireHiddenLineBodies, requireCadExportBodies, validateParasolidPath, assertAbsent, validateBinaryStl } from "./helpers.ts";
import { OperationsBase } from "./base.ts";

export abstract class ExchangeOperations extends OperationsBase {
  async exportStep(ids: number[], outputPath: string, revision?: string): Promise<{ path: string; bytes: number }> {
    if (revision) await this.assertRevision(revision);
    const output = resolve(outputPath);
    if (![".step", ".stp"].includes(extname(output).toLowerCase())) throw new Error("STEP output must end in .step or .stp");
    await assertAbsent(output);
    await mkdir(dirname(output), { recursive: true });
    const staging = await mkdtemp(join(dirname(output), ".plasticity-step-"));
    const temporary = join(staging, "geometry.step");
    try {
      await this.runtime.mutate(`async function (Factory, args) {
        ${findView}
        if (this.executor.isBusy) throw new Error('Plasticity is busy');
        const factory = new Factory(this);
        factory.items = args.ids.map(find);
        factory.filePath = args.path;
        await factory.commit();
      }`, ["ExportCadFactory"], [{ ids, path: temporary }]);
      const text = await readFile(temporary, "utf8");
      if (!text.startsWith("ISO-10303-21;") || !text.includes("END-ISO-10303-21;")) throw new Error("Plasticity produced an invalid STEP file");
      await copyFile(temporary, output, constants.COPYFILE_EXCL);
      return { path: output, bytes: (await stat(output)).size };
    } finally {
      if (!this.runtime.isUncertain()) {
        await rm(temporary, { force: true }).catch(() => undefined);
        await rmdir(staging).catch(() => undefined);
      }
    }
  }

  async exportParasolid(
    ids: number[],
    outputPath: string,
    revision: string,
  ): Promise<{ path: string; bytes: number; format: "parasolid-text" | "parasolid-binary" }> {
    const state = await this.assertRevision(revision);
    requireCadExportBodies(state, ids, "Parasolid");
    const output = resolve(outputPath);
    const extension = extname(output).toLowerCase();
    if (extension !== ".x_t" && extension !== ".x_b") throw new Error("Parasolid output must end in .x_t or .x_b");
    await assertAbsent(output);
    await mkdir(dirname(output), { recursive: true });
    const staging = await mkdtemp(join(dirname(output), ".plasticity-parasolid-"));
    const temporary = join(staging, `geometry${extension}`);
    try {
      await this.runtime.mutate(`async function (Factory, args) {
        ${findView}
        if (this.executor.isBusy) throw new Error('Plasticity is busy');
        const factory = new Factory(this);
        factory.items = args.ids.map(find);
        factory.filePath = args.path;
        await factory.commit();
      }`, ["ExportCadFactory"], [{ ids, path: temporary }]);
      const bytes = await validateParasolidPath(temporary, "Plasticity Parasolid output");
      await copyFile(temporary, output, constants.COPYFILE_EXCL);
      return {
        path: output,
        bytes,
        format: extension === ".x_t" ? "parasolid-text" : "parasolid-binary",
      };
    } finally {
      if (!this.runtime.isUncertain()) {
        await rm(temporary, { force: true }).catch(() => undefined);
        await rmdir(staging).catch(() => undefined);
      }
    }
  }

  async exportStl(
    ids: number[],
    outputPath: string,
    revision: string,
    chordToleranceMm: number,
    angleToleranceDegrees: number,
  ): Promise<{ path: string; bytes: number; triangles: number; chordToleranceMm: number; angleToleranceDegrees: number }> {
    await this.assertRevision(revision);
    const output = resolve(outputPath);
    if (extname(output).toLowerCase() !== ".stl") throw new Error("STL output must end in .stl");
    await assertAbsent(output);
    await mkdir(dirname(output), { recursive: true });
    const staging = await mkdtemp(join(dirname(output), ".plasticity-stl-"));
    const temporary = join(staging, "geometry.stl");
    try {
      await this.runtime.mutate(`async function (Factory, args) {
        ${findView}
        if (this.executor.isBusy) throw new Error('Plasticity is busy');
        const factory = new Factory(this);
        factory.shells = args.ids.map(find);
        factory.filePath = args.path;
        factory.unit = 'millimeter';
        factory.curveChordTolerance = args.chordTolerance;
        factory.surfacePlaneTolerance = args.chordTolerance;
        factory.curveChordAngleDegrees = args.angleToleranceDegrees;
        factory.surfacePlaneAngleDegrees = args.angleToleranceDegrees;
        await factory.commit();
      }`, ["STLExportFactory"], [{
        ids,
        path: temporary,
        chordTolerance: millimetersToMeters(chordToleranceMm),
        angleToleranceDegrees,
      }]);
      const temporarySize = (await stat(temporary)).size;
      if (temporarySize === 0 || temporarySize > MAX_THREE_MF_ARCHIVE_BYTES) throw new Error("Plasticity produced an empty or excessively large 3MF archive");
      const data = await readFile(temporary);
      const triangles = validateBinaryStl(data);
      await copyFile(temporary, output, constants.COPYFILE_EXCL);
      return { path: output, bytes: data.length, triangles, chordToleranceMm, angleToleranceDegrees };
    } finally {
      if (!this.runtime.isUncertain()) {
        await rm(temporary, { force: true }).catch(() => undefined);
        await rmdir(staging).catch(() => undefined);
      }
    }
  }

  async exportObj(
    ids: number[],
    outputPath: string,
    revision: string,
    chordToleranceMm: number,
    angleToleranceDegrees: number,
  ): Promise<ObjValidation & {
    path: string;
    bytes: number;
    sourceUnits: "millimeter";
    upAxis: "z";
    chordToleranceMm: number;
    angleToleranceDegrees: number;
  }> {
    const state = await this.assertRevision(revision);
    requireMeshExportBodies(state, ids, "OBJ");
    if (!Number.isFinite(chordToleranceMm) || chordToleranceMm <= 0) throw new Error("OBJ chord tolerance must be a positive finite millimeter value");
    if (!Number.isFinite(angleToleranceDegrees) || angleToleranceDegrees <= 0 || angleToleranceDegrees > 90) throw new Error("OBJ angle tolerance must be within (0, 90] degrees");
    const output = resolve(outputPath);
    if (extname(output).toLowerCase() !== ".obj") throw new Error("OBJ output must end in .obj");
    await assertAbsent(output);
    await mkdir(dirname(output), { recursive: true });
    const staging = await mkdtemp(join(dirname(output), ".plasticity-obj-"));
    const temporary = join(staging, "geometry.obj");
    try {
      await this.runtime.mutate(`async function (Factory, args) {
        ${findView}
        if (this.executor.isBusy) throw new Error('Plasticity is busy');
        const factory = new Factory(this);
        factory.shells = args.ids.map(find);
        factory.filePath = args.path;
        factory.unit = 'millimeter';
        factory.scale = 1;
        factory.upAxis = 'z';
        factory.showWireframe = false;
        factory.simplify = false;
        factory.curveChordTolerance = args.chordTolerance;
        factory.surfacePlaneTolerance = args.chordTolerance;
        factory.curveChordAngleDegrees = args.angleToleranceDegrees;
        factory.surfacePlaneAngleDegrees = args.angleToleranceDegrees;
        await factory.commit();
      }`, ["OBJExportFactory"], [{
        ids,
        path: temporary,
        chordTolerance: millimetersToMeters(chordToleranceMm),
        angleToleranceDegrees,
      }]);
      const temporarySize = (await stat(temporary)).size;
      if (temporarySize === 0 || temporarySize > MAX_OBJ_BYTES) throw new Error("Plasticity produced an empty or excessively large OBJ file");
      const data = await readFile(temporary);
      const validation = validateObj(data);
      await copyFile(temporary, output, constants.COPYFILE_EXCL);
      return {
        path: output,
        bytes: data.length,
        sourceUnits: "millimeter",
        upAxis: "z",
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

  async exportSvg(ids: number[], outputPath: string, revision: string, curveChordToleranceMm = 0.05, curveChordAngleDegrees = 5): Promise<{
    path: string;
    bytes: number;
    bodies: number;
    lineSegments: number;
    circularSegments: number;
    fullCircles: number;
    fullEllipses: number;
    ellipticalArcs: number;
    cubicBezierSegments: number;
    approximatedSegments: number;
    maxChordDeviationMm: number;
    curveChordToleranceMm: number;
    curveChordAngleDegrees: number;
    sourceUnits: "millimeter";
    boundsMm: { min: [number, number]; max: [number, number]; size: [number, number] };
    pageSizeMm: [number, number];
  }> {
    const before = await this.assertRevision(revision);
    requireWireBodyIds(before, ids);
    if (!Number.isFinite(curveChordToleranceMm) || curveChordToleranceMm <= 0 || curveChordToleranceMm > 5) {
      throw new Error("SVG curve chord tolerance must be within (0, 5] mm");
    }
    if (!Number.isFinite(curveChordAngleDegrees) || curveChordAngleDegrees <= 0 || curveChordAngleDegrees > 30) {
      throw new Error("SVG curve angle tolerance must be within (0, 30] degrees");
    }
    const output = resolve(outputPath);
    if (extname(output).toLowerCase() !== ".svg") throw new Error("SVG output must end in .svg");
    await assertAbsent(output);
    const curves = await this.runtime.readNative<Array<{
      id: number;
      closed: boolean;
      plane: { originMm: Vector3; normal: Vector3 } | null;
      segments: Array<{
        curveType: string;
        startMm: Vector3;
        endMm: Vector3;
        lengthMm: number;
        circle: { centerMm: Vector3; radiusMm: number; normal: Vector3; samplesMm: Vector3[] } | null;
        ellipse: {
          carrierSamplesMm: Vector3[];
          parameterStart: number;
          parameterEnd: number;
          parameterPeriod: number;
          startTangent: Vector3;
        } | null;
        cubicBezierSpans: Array<{
          samplesMm: Vector3[];
          validationSamples: Array<{ parameter: number; positionMm: Vector3 }>;
        }> | null;
        rationalConic: { fitSamplesMm: Vector3[]; validationSamplesMm: Vector3[]; startTangent: Vector3 } | null;
        approximation: { pointsMm: Vector3[]; maxChordDeviationMm: number } | null;
      }>;
    }>>(`function (args) {
      const tessellateCurve = (${tessellateCurve.toString()});
      const isExactSvgCubicPolynomialDegree = (${isExactSvgCubicPolynomialDegree.toString()});
      const mm = value => value * 1000;
      const vector = value => [mm(value.x), mm(value.y), mm(value.z)];
      const directionVector = value => [value.x, value.y, value.z];
      const direction = value => {
        const length = Math.hypot(value.x, value.y, value.z);
        if (!(length > 0)) throw new Error('Native circular curve has a zero plane normal');
        return [value.x / length, value.y / length, value.z / length];
      };
      const result = [];
      let totalApproximationPoints = 0;
      for (const wantedId of args.ids) {
        let found;
        for (const [versionId, item] of this.geo.geometryModel) {
          if (this.db.lookupStableId(versionId) === wantedId) { found = [versionId, item]; break; }
        }
        if (!found) throw new Error('Unknown current Wire ID: ' + wantedId);
        const [versionId, item] = found;
        if (item.view?.constructor?.name !== 'Wire') throw new Error('SVG export requires a Wire: ' + wantedId);
        const basis = item.model?.FindPlanarBasis?.();
        const edges = item.model?.GetEdges?.();
        if (!basis || !edges) throw new Error('SVG export requires a planar native Wire: ' + wantedId);
        let closed = true;
        for (const vertex of Array.from(item.view.vertices ?? [])) {
          if (this.db.lookupTopologyItem(vertex).IsSpur()) { closed = false; break; }
        }
        const segments = [];
        for (let index = 0; index < edges.Size(); index++) {
          const edge = edges.Get(index);
          const wrapped = edge.GetCurve();
          const curve = wrapped?.curve ?? wrapped;
          const curveType = String(curve?.constructor?.name ?? 'Unknown');
          const startEvaluation = edge.GetPointAndTangent(0);
          const endEvaluation = edge.GetPointAndTangent(1);
          let circle = null;
          let ellipse = null;
          let cubicBezierSpans = null;
          let rationalConic = null;
          let approximation = null;
          if (curveType === 'Circle') {
            const info = curve.GetInfo?.();
            const circleBasis = info?.basis;
            if (!circleBasis || !Number.isFinite(info?.radius) || !(info.radius > 0)) {
              throw new Error('Plasticity returned incomplete analytic data for a circular Wire segment');
            }
            circle = {
              centerMm: vector(circleBasis.Location),
              radiusMm: mm(info.radius),
              normal: direction(circleBasis.Axis),
              samplesMm: [0, 0.25, 0.5, 0.75, 1].map(parameter => vector(edge.GetPointAndTangent(parameter).position)),
            };
          } else if (curveType === 'Ellipse') {
            const carrierInterval = curve.GetInterval?.();
            const uMin = Number(wrapped?.uMin);
            const uMax = Number(wrapped?.uMax);
            const carrierMin = Number(carrierInterval?.tmin);
            const carrierMax = Number(carrierInterval?.tmax);
            if ([uMin, uMax, carrierMin, carrierMax].every(Number.isFinite) && uMax !== uMin && carrierMax > carrierMin) {
              const fromMin = curve.GetPoint(uMin);
              const fromMax = curve.GetPoint(uMax);
              const minMatchesStart = Math.hypot(fromMin.x - startEvaluation.position.x, fromMin.y - startEvaluation.position.y, fromMin.z - startEvaluation.position.z) <= 1e-9;
              const maxMatchesStart = Math.hypot(fromMax.x - startEvaluation.position.x, fromMax.y - startEvaluation.position.y, fromMax.z - startEvaluation.position.z) <= 1e-9;
              const minMatchesEnd = Math.hypot(fromMin.x - endEvaluation.position.x, fromMin.y - endEvaluation.position.y, fromMin.z - endEvaluation.position.z) <= 1e-9;
              const maxMatchesEnd = Math.hypot(fromMax.x - endEvaluation.position.x, fromMax.y - endEvaluation.position.y, fromMax.z - endEvaluation.position.z) <= 1e-9;
              let parameterStart = NaN;
              let parameterEnd = NaN;
              if (minMatchesStart && maxMatchesEnd) { parameterStart = uMin; parameterEnd = uMax; }
              else if (maxMatchesStart && minMatchesEnd) { parameterStart = uMax; parameterEnd = uMin; }
              if (Number.isFinite(parameterStart) && Number.isFinite(parameterEnd)) {
                ellipse = {
                  carrierSamplesMm: [0, 0.25, 0.5, 0.75, 1].map(fraction => vector(curve.GetPoint(carrierMin + (carrierMax - carrierMin) * fraction))),
                  parameterStart,
                  parameterEnd,
                  parameterPeriod: carrierMax - carrierMin,
                  startTangent: directionVector(startEvaluation.tangent),
                };
              }
            }
            if (!ellipse) {
              const tessellation = tessellateCurve(parameter => {
                const evaluated = edge.GetPointAndTangent(parameter);
                return { point: vector(evaluated.position), tangent: directionVector(evaluated.tangent) };
              }, args.curveChordToleranceMm, args.curveChordAngleDegrees);
              totalApproximationPoints += tessellation.points.length;
              if (totalApproximationPoints > 200_000) throw new Error('SVG export exceeds the total adaptive-curve point limit');
              approximation = { pointsMm: tessellation.points, maxChordDeviationMm: tessellation.maxChordDeviationMm };
            }
          } else if (curveType === 'BCurve') {
            try {
              const info = curve.GetInfo?.();
              if (info?.isRational === true) {
                const sample = parameter => vector(edge.GetPointAndTangent(parameter).position);
                rationalConic = {
                  fitSamplesMm: [0.1, 0.3, 0.5, 0.7, 0.9].map(sample),
                  validationSamplesMm: Array.from({ length: 65 }, (_, index) => sample(index / 64)),
                  startTangent: directionVector(startEvaluation.tangent),
                };
              }
              // Each non-rational B-spline knot span of degree 1-3 is polynomial
              // and can be represented exactly by an SVG cubic, including periodic
              // curves. The per-span native sample checks below remain the gate.
              if (isExactSvgCubicPolynomialDegree(info?.degree, info?.isRational) && Number.isInteger(info?.numDistinctKnots) && info.numDistinctKnots >= 2 && info.knotVals) {
              const knotParameters = [];
              for (let knotIndex = 0; knotIndex < info.numDistinctKnots; knotIndex++) {
                const parameter = Number(edge.Normalize(Number(info.knotVals[knotIndex])));
                if (Number.isFinite(parameter) && parameter >= -1e-10 && parameter <= 1 + 1e-10) knotParameters.push(Math.max(0, Math.min(1, parameter)));
              }
              knotParameters.push(0, 1);
              const breaks = Array.from(new Set(knotParameters.sort((left, right) => left - right).map(parameter => Number(parameter.toPrecision(14)))));
              if (breaks[0] === 0 && breaks.at(-1) === 1 && breaks.length >= 2 && breaks.length <= 1_025) {
                const sample = parameter => vector(edge.GetPointAndTangent(parameter).position);
                const spans = [];
                for (let spanIndex = 0; spanIndex < breaks.length - 1; spanIndex++) {
                  const start = breaks[spanIndex];
                  const end = breaks[spanIndex + 1];
                  if (!(end > start)) continue;
                  const at = fraction => start + (end - start) * fraction;
                  spans.push({
                    samplesMm: [0, 1 / 3, 2 / 3, 1].map(fraction => sample(at(fraction))),
                    validationSamples: [1 / 8, 1 / 4, 1 / 2, 3 / 4, 7 / 8].map(fraction => ({ parameter: fraction, positionMm: sample(at(fraction)) })),
                  });
                }
                if (spans.length === breaks.length - 1) cubicBezierSpans = spans;
              }
              }
            } catch { cubicBezierSpans = null; }
            if (!cubicBezierSpans) {
              const tessellation = tessellateCurve(parameter => {
                const evaluated = edge.GetPointAndTangent(parameter);
                return { point: vector(evaluated.position), tangent: directionVector(evaluated.tangent) };
              }, args.curveChordToleranceMm, args.curveChordAngleDegrees);
              totalApproximationPoints += tessellation.points.length;
              if (totalApproximationPoints > 200_000) throw new Error('SVG export exceeds the total adaptive-curve point limit');
              approximation = { pointsMm: tessellation.points, maxChordDeviationMm: tessellation.maxChordDeviationMm };
            }
          } else if (curveType !== 'Line') {
            const tessellation = tessellateCurve(parameter => {
              const evaluated = edge.GetPointAndTangent(parameter);
              return { point: vector(evaluated.position), tangent: directionVector(evaluated.tangent) };
            }, args.curveChordToleranceMm, args.curveChordAngleDegrees);
            totalApproximationPoints += tessellation.points.length;
            if (totalApproximationPoints > 200_000) throw new Error('SVG export exceeds the total adaptive-curve point limit');
            approximation = { pointsMm: tessellation.points, maxChordDeviationMm: tessellation.maxChordDeviationMm };
          }
          segments.push({
            curveType,
            startMm: vector(startEvaluation.position),
            endMm: vector(endEvaluation.position),
            lengthMm: mm(edge.FindLength().length),
            circle,
            ellipse,
            cubicBezierSpans,
            rationalConic,
            approximation,
          });
        }
        result.push({ id: wantedId, versionId: Number(versionId), closed, plane: { originMm: vector(basis.Location), normal: direction(basis.Axis) }, segments });
      }
      return result;
    }`, [], [{ ids, curveChordToleranceMm, curveChordAngleDegrees }]);
    const after = await this.state();
    if (after.documentToken !== before.documentToken || after.revision !== before.revision) {
      throw new Error("Plasticity document changed while SVG geometry was being read");
    }
    if (curves.length !== ids.length || curves.some((curve, index) => curve.id !== ids[index])) {
      throw new Error("Plasticity returned an incomplete or reordered SVG Wire set");
    }
    const referencePlane = curves[0]?.plane;
    if (!referencePlane) throw new Error("SVG export requires a planar native Wire");
    const normalLength = Math.hypot(...referencePlane.normal);
    if (!Number.isFinite(normalLength) || normalLength <= 0) throw new Error("SVG Wire has an invalid native plane normal");
    const normal = referencePlane.normal.map((value) => value / normalLength) as Vector3;
    const worldX: Vector3 = [1, 0, 0];
    const worldY: Vector3 = [0, 1, 0];
    const candidate = Math.abs(dot(normal, worldX)) < 0.9 ? worldX : worldY;
    const xProjection = subtract(candidate, scale(normal, dot(candidate, normal)));
    const xAxis = normalize(xProjection);
    const yAxis = cross(normal, xAxis);
    const project = (point: Vector3): [number, number] => {
      if (Math.abs(dot(subtract(point, referencePlane.originMm), normal)) > 1e-6) {
        throw new Error("All exported Wire segments must lie in one common plane");
      }
      const relative = subtract(point, referencePlane.originMm);
      const x = dot(relative, xAxis);
      const y = -dot(relative, yAxis);
      return [Object.is(x, -0) ? 0 : x, Object.is(y, -0) ? 0 : y];
    };
    const paths: string[] = [];
    const points: Array<[number, number]> = [];
    let lineSegments = 0;
    let circularSegments = 0;
    let fullCircles = 0;
    let fullEllipses = 0;
    let ellipticalArcs = 0;
    let cubicBezierSegments = 0;
    let approximatedSegments = 0;
    let maxChordDeviationMm = 0;
    let totalPolylinePoints = 0;
    const angle2d = (point: [number, number], center: [number, number]) => Math.atan2(point[1] - center[1], point[0] - center[0]);
    const positiveAngle = (angle: number) => (angle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    for (const curve of curves) {
      if (!curve.plane) throw new Error(`SVG export requires a planar native Wire: ${curve.id}`);
      const curveNormalLength = Math.hypot(...curve.plane.normal);
      if (!Number.isFinite(curveNormalLength) || curveNormalLength <= 0) throw new Error(`SVG Wire has an invalid plane normal: ${curve.id}`);
      const curveNormal = curve.plane.normal.map((value) => value / curveNormalLength) as Vector3;
      if (Math.abs(Math.abs(dot(normal, curveNormal)) - 1) > 1e-9 || Math.abs(dot(subtract(curve.plane.originMm, referencePlane.originMm), normal)) > 1e-6) {
        throw new Error("All exported Wires must be coplanar");
      }
      for (const segment of curve.segments) {
        const start = project(segment.startMm);
        const end = project(segment.endMm);
        let exactCubicBezier: { commands: string[]; boundsPoints: [number, number][] } | null = null;
        let exactRationalConic: { ellipse: ReturnType<typeof fitSvgConicEllipse>; arc: { largeArcFlag: 0 | 1; sweepFlag: 0 | 1 } | null; boundsPoints: [number, number][]; full: boolean } | null = null;
        if (segment.curveType === "BCurve" && segment.rationalConic) {
          try {
            const conic = segment.rationalConic;
            if (conic.fitSamplesMm.length === 5 && conic.validationSamplesMm.length >= 9) {
              const ellipse = fitSvgConicEllipse(conic.fitSamplesMm.map(project));
              const validationTolerance = Math.max(1e-7, ellipse.majorRadius * 1e-9);
              const validationPoints = conic.validationSamplesMm.map(project);
              for (const point of validationPoints) {
                const x = (point[0] - ellipse.center[0]) * ellipse.majorAxis[0] + (point[1] - ellipse.center[1]) * ellipse.majorAxis[1];
                const y = (point[0] - ellipse.center[0]) * ellipse.minorAxis[0] + (point[1] - ellipse.center[1]) * ellipse.minorAxis[1];
                if (Math.abs(Math.hypot(x / ellipse.majorRadius, y / ellipse.minorRadius) - 1) * ellipse.majorRadius > validationTolerance) {
                  throw new Error("Rational BCurve validation samples do not lie on one ellipse");
                }
              }
              const parameterAngle = (point: [number, number]): number => Math.atan2(
                ((point[0] - ellipse.center[0]) * ellipse.minorAxis[0] + (point[1] - ellipse.center[1]) * ellipse.minorAxis[1]) / ellipse.minorRadius,
                ((point[0] - ellipse.center[0]) * ellipse.majorAxis[0] + (point[1] - ellipse.center[1]) * ellipse.majorAxis[1]) / ellipse.majorRadius,
              );
              let sweep = 0;
              let direction = 0;
              for (let index = 1; index < validationPoints.length; index++) {
                const difference = parameterAngle(validationPoints[index]!) - parameterAngle(validationPoints[index - 1]!);
                const delta = Math.atan2(Math.sin(difference), Math.cos(difference));
                if (Math.abs(delta) >= Math.PI / 2) throw new Error("Rational BCurve ellipse sweep is under-sampled or ambiguous");
                if (Math.abs(delta) > 1e-10) {
                  const nextDirection = Math.sign(delta);
                  if (direction !== 0 && direction !== nextDirection) throw new Error("Rational BCurve reverses direction on its fitted ellipse");
                  direction = nextDirection;
                }
                sweep += delta;
              }
              const full = Math.abs(Math.abs(sweep) - 2 * Math.PI) <= 1e-6;
              if (!(Math.abs(sweep) > 1e-8) || Math.abs(sweep) > 2 * Math.PI + 1e-6) throw new Error("Rational BCurve ellipse sweep is degenerate or exceeds one turn");
              if (full && (!curve.closed || Math.hypot(end[0] - start[0], end[1] - start[1]) > validationTolerance)) {
                throw new Error("A full rational conic must be a closed native Wire");
              }
              const boundsPoints: [number, number][] = [];
              if (full) {
                const xExtent = Math.hypot(ellipse.majorRadius * ellipse.majorAxis[0], ellipse.minorRadius * ellipse.minorAxis[0]);
                const yExtent = Math.hypot(ellipse.majorRadius * ellipse.majorAxis[1], ellipse.minorRadius * ellipse.minorAxis[1]);
                boundsPoints.push([ellipse.center[0] - xExtent, ellipse.center[1]], [ellipse.center[0] + xExtent, ellipse.center[1]], [ellipse.center[0], ellipse.center[1] - yExtent], [ellipse.center[0], ellipse.center[1] + yExtent]);
              } else {
                const tangent: [number, number] = [dot(conic.startTangent, xAxis), -dot(conic.startTangent, yAxis)];
                const arc = analyzeSvgEllipseArc(ellipse, start, end, tangent, 0, sweep / (2 * Math.PI), 1);
                boundsPoints.push(...arc.boundsPoints);
                exactRationalConic = { ellipse, arc, boundsPoints, full };
              }
              if (full) exactRationalConic = { ellipse, arc: null, boundsPoints, full };
            }
          } catch { exactRationalConic = null; }
        }
        if (segment.curveType === "BCurve" && segment.cubicBezierSpans) {
          const commands: string[] = [];
          const boundsPoints: [number, number][] = [];
          let currentStart: [number, number] | null = null;
          let valid = true;
          for (const span of segment.cubicBezierSpans) {
            if (span.samplesMm.length !== 4 || span.validationSamples.length !== 5) { valid = false; break; }
            const samples = span.samplesMm.map(project);
            const controls = fitSvgCubicBezier(samples);
            const validationScale = Math.max(1, ...controls.flat().map(Math.abs));
            for (const validation of span.validationSamples) {
              const actual = project(validation.positionMm);
              const expected = evaluateSvgCubicBezier(controls, validation.parameter);
              if (Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) > validationScale * 1e-10) {
                valid = false;
                break;
              }
            }
            if (!valid) break;
            const spanStart = controls[0];
            if (currentStart && Math.hypot(currentStart[0] - spanStart[0], currentStart[1] - spanStart[1]) > validationScale * 1e-10) {
              valid = false;
              break;
            }
            if (!currentStart && Math.hypot(start[0] - spanStart[0], start[1] - spanStart[1]) > validationScale * 1e-10) {
              valid = false;
              break;
            }
            if (!currentStart) currentStart = spanStart;
            commands.push(`C ${formatSvgNumber(controls[1][0])} ${formatSvgNumber(controls[1][1])} ${formatSvgNumber(controls[2][0])} ${formatSvgNumber(controls[2][1])} ${formatSvgNumber(controls[3][0])} ${formatSvgNumber(controls[3][1])}`);
            boundsPoints.push(...svgCubicBezierBoundsPoints(controls));
            currentStart = controls[3];
          }
          if (valid && commands.length > 0 && currentStart && Math.hypot(currentStart[0] - end[0], currentStart[1] - end[1]) <= Math.max(1e-8, Math.hypot(...end) * 1e-10)) {
            exactCubicBezier = { commands, boundsPoints };
          }
        }
        if (segment.curveType === "Line") {
          if (Math.hypot(end[0] - start[0], end[1] - start[1]) <= 1e-12) throw new Error("SVG export cannot include zero-length native lines");
          points.push(start, end);
          paths.push(`<path d="M ${formatSvgNumber(start[0])} ${formatSvgNumber(start[1])} L ${formatSvgNumber(end[0])} ${formatSvgNumber(end[1])}"/>`);
          lineSegments += 1;
        } else if (segment.curveType === "Circle" && segment.circle) {
          const circle = segment.circle;
          if (!Number.isFinite(circle.radiusMm) || circle.radiusMm <= 0) throw new Error("SVG circular Wire radius must be positive and finite");
          const circleNormalLength = Math.hypot(...circle.normal);
          if (!Number.isFinite(circleNormalLength) || circleNormalLength <= 0) throw new Error("SVG circular Wire has an invalid plane normal");
          const circleNormal = circle.normal.map((value) => value / circleNormalLength) as Vector3;
          if (Math.abs(Math.abs(dot(normal, circleNormal)) - 1) > 1e-9) throw new Error("SVG circular Wire axis must match its planar profile");
          const center = project(circle.centerMm);
          if (circle.samplesMm.length !== 5) throw new Error("SVG circular Wire requires five exact native curve samples");
          const samples = circle.samplesMm.map(project);
          for (const sample of samples) {
            const distance = Math.hypot(sample[0] - center[0], sample[1] - center[1]);
            if (Math.abs(distance - circle.radiusMm) > Math.max(1e-6, circle.radiusMm * 1e-8)) {
              throw new Error("Native Circle sample does not match its reported exact radius");
            }
          }
          const endpointGap = Math.hypot(end[0] - start[0], end[1] - start[1]);
          if (endpointGap <= Math.max(1e-8, circle.radiusMm * 1e-9)) {
            if (!curve.closed) throw new Error("A full circular SVG element requires a closed native Wire");
            if (Math.abs(segment.lengthMm - 2 * Math.PI * circle.radiusMm) > Math.max(1e-6, segment.lengthMm * 1e-8)) {
              throw new Error("Closed native Circle length does not match its exact radius");
            }
            points.push([center[0] - circle.radiusMm, center[1]], [center[0] + circle.radiusMm, center[1]], [center[0], center[1] - circle.radiusMm], [center[0], center[1] + circle.radiusMm]);
            paths.push(`<circle cx="${formatSvgNumber(center[0])}" cy="${formatSvgNumber(center[1])}" r="${formatSvgNumber(circle.radiusMm)}"/>`);
            circularSegments += 1;
            fullCircles += 1;
            continue;
          }
          if (Math.hypot(samples[0]![0] - start[0], samples[0]![1] - start[1]) > 1e-8 || Math.hypot(samples[4]![0] - end[0], samples[4]![1] - end[1]) > 1e-8) {
            throw new Error("Native circular Wire samples do not match its B-Rep endpoints");
          }
          const startAngle = angle2d(start, center);
          const endAngle = angle2d(end, center);
          const middleAngle = angle2d(samples[2]!, center);
          const ccwSweep = positiveAngle(endAngle - startAngle);
          const middleCcwSweep = positiveAngle(middleAngle - startAngle);
          const sweepFlag = middleCcwSweep < ccwSweep ? 1 : 0;
          const sweep = sweepFlag === 1 ? ccwSweep : 2 * Math.PI - ccwSweep;
          if (!(sweep > 1e-10 && sweep < 2 * Math.PI - 1e-10)) throw new Error("Native circular Wire sweep is degenerate or ambiguous");
          if (Math.abs(segment.lengthMm - circle.radiusMm * sweep) > Math.max(1e-6, segment.lengthMm * 1e-8)) {
            throw new Error("Native circular Wire length does not match its exact SVG arc sweep");
          }
          const largeArcFlag = sweep > Math.PI + 1e-10 ? 1 : 0;
          points.push(start, end);
          for (let quadrant = 0; quadrant < 4; quadrant++) {
            const angle = quadrant * Math.PI / 2;
            const delta = sweepFlag === 1 ? positiveAngle(angle - startAngle) : positiveAngle(startAngle - angle);
            if (delta <= sweep + 1e-10) points.push([center[0] + circle.radiusMm * Math.cos(angle), center[1] + circle.radiusMm * Math.sin(angle)]);
          }
          paths.push(`<path d="M ${formatSvgNumber(start[0])} ${formatSvgNumber(start[1])} A ${formatSvgNumber(circle.radiusMm)} ${formatSvgNumber(circle.radiusMm)} 0 ${largeArcFlag} ${sweepFlag} ${formatSvgNumber(end[0])} ${formatSvgNumber(end[1])}"/>`);
          circularSegments += 1;
        } else if (exactRationalConic) {
          const conic = exactRationalConic;
          points.push(...conic.boundsPoints);
          if (conic.full) {
            paths.push(`<ellipse cx="${formatSvgNumber(conic.ellipse.center[0])}" cy="${formatSvgNumber(conic.ellipse.center[1])}" rx="${formatSvgNumber(conic.ellipse.majorRadius)}" ry="${formatSvgNumber(conic.ellipse.minorRadius)}" transform="rotate(${formatSvgNumber(conic.ellipse.rotationDegrees)} ${formatSvgNumber(conic.ellipse.center[0])} ${formatSvgNumber(conic.ellipse.center[1])})" data-curve-type="BCurve" data-representation="ellipse-fit" data-validation="65-native-brep-samples"/>`);
            fullEllipses += 1;
          } else {
            if (!conic.arc) throw new Error("Validated rational conic arc lost its SVG sweep data");
            paths.push(`<path d="M ${formatSvgNumber(start[0])} ${formatSvgNumber(start[1])} A ${formatSvgNumber(conic.ellipse.majorRadius)} ${formatSvgNumber(conic.ellipse.minorRadius)} ${formatSvgNumber(conic.ellipse.rotationDegrees)} ${conic.arc.largeArcFlag} ${conic.arc.sweepFlag} ${formatSvgNumber(end[0])} ${formatSvgNumber(end[1])}" data-curve-type="BCurve" data-representation="ellipse-fit" data-validation="65-native-brep-samples"/>`);
            ellipticalArcs += 1;
          }
        } else if (exactCubicBezier) {
          points.push(...exactCubicBezier.boundsPoints);
          paths.push(`<path d="M ${formatSvgNumber(start[0])} ${formatSvgNumber(start[1])} ${exactCubicBezier.commands.join(" ")}" data-curve-type="BCurve"/>`);
          cubicBezierSegments += 1;
        } else if (segment.approximation) {
          const { pointsMm, maxChordDeviationMm: segmentDeviation } = segment.approximation;
          if (pointsMm.length < 2 || pointsMm.length > 16_384 || !Number.isFinite(segmentDeviation) || segmentDeviation < 0 || segmentDeviation > curveChordToleranceMm) {
            throw new Error(`SVG approximation for ${segment.curveType} did not meet its point-count or chord-tolerance contract`);
          }
          totalPolylinePoints += pointsMm.length;
          if (totalPolylinePoints > 200_000) throw new Error("SVG export exceeds the total polyline point limit");
          const polyline = pointsMm.map(project);
          if (Math.hypot(polyline[0]![0] - start[0], polyline[0]![1] - start[1]) > 1e-8 || Math.hypot(polyline.at(-1)![0] - end[0], polyline.at(-1)![1] - end[1]) > 1e-8) {
            throw new Error(`SVG approximation endpoints do not match native ${segment.curveType} B-Rep endpoints`);
          }
          if (polyline.some((point, index) => index > 0 && Math.hypot(point[0] - polyline[index - 1]![0], point[1] - polyline[index - 1]![1]) <= 1e-12)) {
            throw new Error(`SVG approximation for ${segment.curveType} contains a zero-length span`);
          }
          const pathData = polyline.map((point, index) => `${index === 0 ? "M" : "L"} ${formatSvgNumber(point[0])} ${formatSvgNumber(point[1])}`).join(" ");
          points.push(...polyline);
          paths.push(`<path d="${pathData}" data-curve-type="${escapeSvgAttribute(segment.curveType)}" data-approximation="adaptive-chord"/>`);
          approximatedSegments += 1;
          maxChordDeviationMm = Math.max(maxChordDeviationMm, segmentDeviation);
        } else if (segment.curveType === "Ellipse" && segment.ellipse) {
          const ellipse = fitSvgEllipse(segment.ellipse.carrierSamplesMm.map(project));
          const parameterSpan = Math.abs(segment.ellipse.parameterEnd - segment.ellipse.parameterStart);
          const isSingleClosedEllipse = curve.closed && curve.segments.length === 1 &&
            Math.abs(parameterSpan - segment.ellipse.parameterPeriod) <= segment.ellipse.parameterPeriod * 1e-8;
          if (isSingleClosedEllipse) {
            if (Math.hypot(end[0] - start[0], end[1] - start[1]) > Math.max(1e-7, ellipse.majorRadius * 1e-8)) {
              throw new Error("Closed native Ellipse endpoints do not meet");
            }
            const xExtent = Math.hypot(ellipse.majorRadius * ellipse.majorAxis[0], ellipse.minorRadius * ellipse.minorAxis[0]);
            const yExtent = Math.hypot(ellipse.majorRadius * ellipse.majorAxis[1], ellipse.minorRadius * ellipse.minorAxis[1]);
            points.push(
              [ellipse.center[0] - xExtent, ellipse.center[1]], [ellipse.center[0] + xExtent, ellipse.center[1]],
              [ellipse.center[0], ellipse.center[1] - yExtent], [ellipse.center[0], ellipse.center[1] + yExtent],
            );
            paths.push(`<ellipse cx="${formatSvgNumber(ellipse.center[0])}" cy="${formatSvgNumber(ellipse.center[1])}" rx="${formatSvgNumber(ellipse.majorRadius)}" ry="${formatSvgNumber(ellipse.minorRadius)}" transform="rotate(${formatSvgNumber(ellipse.rotationDegrees)} ${formatSvgNumber(ellipse.center[0])} ${formatSvgNumber(ellipse.center[1])})"/>`);
            fullEllipses += 1;
          } else {
            const startTangent: [number, number] = [
              dot(segment.ellipse.startTangent, xAxis),
              -dot(segment.ellipse.startTangent, yAxis),
            ];
            const arc = analyzeSvgEllipseArc(
              ellipse, start, end, startTangent,
              segment.ellipse.parameterStart, segment.ellipse.parameterEnd, segment.ellipse.parameterPeriod,
            );
            points.push(...arc.boundsPoints);
            paths.push(`<path d="M ${formatSvgNumber(start[0])} ${formatSvgNumber(start[1])} A ${formatSvgNumber(ellipse.majorRadius)} ${formatSvgNumber(ellipse.minorRadius)} ${formatSvgNumber(ellipse.rotationDegrees)} ${arc.largeArcFlag} ${arc.sweepFlag} ${formatSvgNumber(end[0])} ${formatSvgNumber(end[1])}" data-curve-type="Ellipse"/>`);
            ellipticalArcs += 1;
          }
        } else {
          throw new Error(`SVG export encountered an unsupported native curve: ${segment.curveType}`);
        }
      }
    }
    if (paths.length === 0 || paths.length > 100_000) throw new Error("SVG export requires between 1 and 100000 native curve segments");
    const min: [number, number] = [Infinity, Infinity];
    const max: [number, number] = [-Infinity, -Infinity];
    for (const [x, y] of points) {
      min[0] = Math.min(min[0], x);
      min[1] = Math.min(min[1], y);
      max[0] = Math.max(max[0], x);
      max[1] = Math.max(max[1], y);
    }
    const size: [number, number] = [max[0] - min[0], max[1] - min[1]];
    if (size[0] <= 0 || size[1] <= 0) throw new Error("SVG export requires nonzero width and height");
    const strokeWidthMm = 0.2;
    const paddingMm = strokeWidthMm / 2;
    const pageSizeMm: [number, number] = [size[0] + strokeWidthMm, size[1] + strokeWidthMm];
    const viewBox = [min[0] - paddingMm, min[1] - paddingMm, pageSizeMm[0], pageSizeMm[1]].map(formatSvgNumber).join(" ");
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${formatSvgNumber(pageSizeMm[0])}mm" height="${formatSvgNumber(pageSizeMm[1])}mm" viewBox="${viewBox}">\n<g fill="none" stroke="#000000" stroke-width="${formatSvgNumber(strokeWidthMm)}" stroke-linecap="round" stroke-linejoin="round">\n${paths.join("\n")}\n</g>\n</svg>\n`;
    if (Buffer.byteLength(svg) > 16 * 1024 * 1024) throw new Error("SVG export exceeds the 16 MiB output limit");
    await mkdir(dirname(output), { recursive: true });
    const staging = await mkdtemp(join(dirname(output), ".plasticity-svg-"));
    const temporary = join(staging, "geometry.svg");
    try {
      await writeFile(temporary, svg, { flag: "wx" });
      await copyFile(temporary, output, constants.COPYFILE_EXCL);
      return { path: output, bytes: Buffer.byteLength(svg), bodies: curves.length, lineSegments, circularSegments, fullCircles, fullEllipses, ellipticalArcs, cubicBezierSegments, approximatedSegments, maxChordDeviationMm, curveChordToleranceMm, curveChordAngleDegrees, sourceUnits: "millimeter", boundsMm: { min, max, size }, pageSizeMm };
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
      await rmdir(staging).catch(() => undefined);
    }
  }

  async exportHiddenLineSvg(
    ids: number[],
    outputPath: string,
    revision: string,
    curveChordToleranceMm = 0.05,
    curveChordAngleDegrees = 5,
    marginMm = 1,
  ): Promise<{
    path: string;
    bytes: number;
    bodies: number;
    segments: number;
    visibleSegments: number;
    hiddenSegments: number;
    sourceUnits: "millimeter";
    projection: "native-orthographic";
    projectedBoundsMm: { min: [number, number]; max: [number, number]; size: [number, number] };
    curveChordToleranceMm: number;
    curveChordAngleDegrees: number;
  }> {
    const before = await this.assertRevision(revision);
    requireHiddenLineBodies(before, ids);
    if (!Number.isFinite(curveChordToleranceMm) || curveChordToleranceMm <= 0 || curveChordToleranceMm > 5) {
      throw new Error("Hidden-line curve chord tolerance must be within (0, 5] mm");
    }
    if (!Number.isFinite(curveChordAngleDegrees) || curveChordAngleDegrees <= 0 || curveChordAngleDegrees > 30) {
      throw new Error("Hidden-line curve chord angle must be within (0, 30] degrees");
    }
    if (!Number.isFinite(marginMm) || marginMm < 0 || marginMm > 1_000) {
      throw new Error("Hidden-line SVG margin must be between 0 and 1000 mm");
    }
    const output = resolve(outputPath);
    if (extname(output).toLowerCase() !== ".svg") throw new Error("Hidden-line SVG output must end in .svg");
    await assertAbsent(output);

    const projection = await this.runtime.readNative<{
      positions: number[];
      segments: HiddenLineProjectionSegment[];
      scaleXmmPerPixel: number;
      scaleYmmPerPixel: number;
      cameraType: string;
    }>(`async function (Factory, Vector2, args) {
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const views = args.ids.map(wantedId => {
        for (const [versionId, item] of this.geo.geometryModel) {
          if (this.db.lookupStableId(versionId) !== wantedId) continue;
          if (item.view?.constructor?.name !== 'Solid') throw new Error('Hidden-line SVG export requires native Solid bodies: ' + wantedId);
          return item.view;
        }
        throw new Error('Unknown current Solid ID: ' + wantedId);
      });
      const factory = new Factory(this);
      try {
        factory.items = views;
        factory.includeBackgroundImage = false;
        factory.useMaterialColors = false;
        factory.curveChordTolerance = args.curveChordTolerance;
        factory.curveChordAngleDegrees = args.curveChordAngleDegrees;
        const bodyData = factory.collectBodyData();
        const viewport = Array.from(this.viewports)[0];
        if (!viewport?.camera) throw new Error('Plasticity viewport camera is unavailable');
        const camera = viewport.camera.clone();
        if (!camera.isOrthographicCamera) throw new Error('Native hidden-line SVG export requires an orthographic Plasticity view');
        camera.updateMatrixWorld(true);
        camera.updateProjectionMatrix();
        const horizontalSpan = camera.right - camera.left;
        const verticalSpan = camera.top - camera.bottom;
        if (!(horizontalSpan > 0) || !(verticalSpan > 0)) throw new Error('Plasticity orthographic camera has invalid bounds');
        const resolutionX = 2048;
        const resolutionY = Math.max(1, Math.round(resolutionX * verticalSpan / horizontalSpan));
        const resolution = new Vector2(resolutionX, resolutionY);
        const projected = await factory.generator.generate(camera, resolution, bodyData.bodyIds, factory, bodyData.transforms);
        if (!projected?.geo || !ArrayBuffer.isView(projected.geo) || !Array.isArray(projected.segments)) {
          throw new Error('Plasticity returned an invalid native hidden-line projection');
        }
        if (projected.geo.length > 600_000 || projected.segments.length > 100_000) {
          throw new Error('Native hidden-line projection exceeds the MCP output limit');
        }
        const matrix = camera.projectionMatrix.elements;
        const p00 = Math.abs(matrix[0]);
        const p11 = Math.abs(matrix[5]);
        if (!(p00 > 0) || !(p11 > 0)) throw new Error('Plasticity orthographic projection matrix is degenerate');
        return {
          positions: Array.from(projected.geo),
          segments: projected.segments.map(segment => ({
            bodyIndex: Number(segment.bodyIndex),
            category: String(segment.category),
            offset: Number(segment.offset),
            count: Number(segment.count),
          })),
          scaleXmmPerPixel: 2000 / (p00 * resolutionX),
          scaleYmmPerPixel: 2000 / (p11 * resolutionY),
          cameraType: camera.isOrthographicCamera ? 'OrthographicCamera' : camera.constructor.name,
        };
      } finally {
        factory.dispose?.();
      }
    }`, ["ExportHiddenLineFactory", "Vector2"], [{
      ids,
      curveChordTolerance: millimetersToMeters(curveChordToleranceMm),
      curveChordAngleDegrees,
    }], NATIVE_STATE_READ_TIMEOUT_MS);

    const after = await this.state();
    if (after.documentToken !== before.documentToken || after.revision !== before.revision) {
      throw new Error("Plasticity document changed while its hidden-line projection was being generated");
    }
    if (projection.cameraType !== "OrthographicCamera") throw new Error("Plasticity did not return an orthographic hidden-line projection");
    const svg = serializeHiddenLineSvg({
      positions: projection.positions,
      segments: projection.segments,
      scaleXmmPerPixel: projection.scaleXmmPerPixel,
      scaleYmmPerPixel: projection.scaleYmmPerPixel,
      marginMm,
    });
    const minimum: [number, number] = [Infinity, Infinity];
    const maximum: [number, number] = [-Infinity, -Infinity];
    for (const segment of projection.segments) {
      for (let point = 0; point < segment.count; point += 1) {
        const index = segment.offset + point * 2;
        const x = projection.positions[index]! * projection.scaleXmmPerPixel;
        const y = -projection.positions[index + 1]! * projection.scaleYmmPerPixel;
        minimum[0] = Math.min(minimum[0], x);
        minimum[1] = Math.min(minimum[1], y);
        maximum[0] = Math.max(maximum[0], x);
        maximum[1] = Math.max(maximum[1], y);
      }
    }
    const size: [number, number] = [maximum[0] - minimum[0], maximum[1] - minimum[1]];
    await mkdir(dirname(output), { recursive: true });
    const staging = await mkdtemp(join(dirname(output), ".plasticity-hidden-line-svg-"));
    const temporary = join(staging, "projection.svg");
    try {
      await writeFile(temporary, svg, { flag: "wx" });
      await copyFile(temporary, output, constants.COPYFILE_EXCL);
      return {
        path: output,
        bytes: Buffer.byteLength(svg),
        bodies: ids.length,
        segments: projection.segments.length,
        visibleSegments: projection.segments.filter(segment => !segment.category.includes("Hidden")).length,
        hiddenSegments: projection.segments.filter(segment => segment.category.includes("Hidden")).length,
        sourceUnits: "millimeter",
        projection: "native-orthographic",
        projectedBoundsMm: {
          min: [0, 0],
          max: size,
          size,
        },
        curveChordToleranceMm,
        curveChordAngleDegrees,
      };
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined);
      await rmdir(staging).catch(() => undefined);
    }
  }

  async importStep(inputPath: string, revision?: string): Promise<RuntimeState> {
    if (revision) await this.assertRevision(revision);
    const input = await realpath(resolve(inputPath));
    if (![".step", ".stp"].includes(extname(input).toLowerCase())) throw new Error("STEP input must end in .step or .stp");
    if (!(await stat(input)).isFile()) throw new Error("STEP input must be a regular file");
    await this.runtime.mutate(`async function (Factory, Command, args) {
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.filePath = args.path;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["ExchangeImportFactory", "ImportCommand"], [{ path: input }], LONG_NATIVE_IMPORT_TIMEOUT_MS);
    return await this.state(LONG_NATIVE_IMPORT_TIMEOUT_MS);
  }

  async importSvg(
    inputPath: string,
    sourceUnit: NativeImportUnit,
    revision: string,
  ): Promise<RuntimeState> {
    await this.assertRevision(revision);
    const input = await realpath(resolve(inputPath));
    if (extname(input).toLowerCase() !== ".svg") throw new Error("SVG input must end in .svg");
    const metadata = await stat(input);
    if (!metadata.isFile()) throw new Error("SVG input must be a regular file");
    if (metadata.size === 0) throw new Error("SVG input must not be empty");
    await this.runtime.mutate(`async function (Factory, Command, args) {
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.filePath = args.path;
          factory.unit = args.sourceUnit;
          const result = await factory.commit();
          const created = Array.isArray(result) ? result : [result].filter(Boolean);
          if (created.length === 0 || !created.every(item => item?.constructor?.name === 'Wire')) {
            throw new Error('Plasticity did not create editable native Wires for the complete SVG import');
          }
          return result;
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["VectorImportFactory", "ImportCommand"], [{ path: input, sourceUnit }]);
    return await this.state();
  }

  async importReferenceMesh(
    inputPath: string,
    sourceUnit: ReferenceMeshUnit,
    revision: string,
  ): Promise<RuntimeState> {
    await this.assertRevision(revision);
    const input = await realpath(resolve(inputPath));
    const extension = extname(input).toLowerCase();
    if (extension !== ".stl" && extension !== ".obj") {
      throw new Error("Reference mesh input must end in .stl or .obj");
    }
    const metadata = await stat(input);
    if (!metadata.isFile()) throw new Error("Reference mesh input must be a regular file");
    if (metadata.size === 0) throw new Error("Reference mesh input must not be empty");
    await this.runtime.mutate(`async function (Factory, Command, args) {
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.filePath = args.path;
          factory.unit = args.sourceUnit;
          const result = await factory.commit();
          const created = Array.isArray(result) ? result : [result].filter(Boolean);
          if (created.length === 0 || !created.every(item => item?.constructor?.name === 'Empties_ObjectEmpty')) {
            throw new Error('Plasticity did not create reference mesh objects for the complete import');
          }
          return result;
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["MeshImportFactory", "ImportCommand"], [{ path: input, sourceUnit }]);
    return await this.state();
  }

  async importParasolid(inputPath: string, revision?: string): Promise<RuntimeState> {
    if (revision) await this.assertRevision(revision);
    const input = await realpath(resolve(inputPath));
    const extension = extname(input).toLowerCase();
    if (extension !== ".x_t" && extension !== ".x_b") throw new Error("Parasolid input must end in .x_t or .x_b");
    await validateParasolidPath(input, "Parasolid input");
    await this.runtime.mutate(`async function (Factory, Command, args) {
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new Command(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const factory = new Factory(editor).resource(this);
          factory.filePath = args.path;
          return await factory.commit();
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["ParasolidImportFactory", "ImportCommand"], [{ path: input }], LONG_NATIVE_IMPORT_TIMEOUT_MS);
    return await this.state(LONG_NATIVE_IMPORT_TIMEOUT_MS);
  }
}

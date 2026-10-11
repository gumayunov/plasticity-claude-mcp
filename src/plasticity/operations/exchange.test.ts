import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PlasticityOperations } from "./index.ts";
import { evaluateSvgCubicBezier, type SvgCubicBezier } from "../svg-cubic.ts";
import type { PlasticityRuntime, RuntimeState } from "../runtime.ts";
import { emptyConstruction } from "./test-support.ts";

test("exports selected native bodies as a validated millimeter OBJ mesh", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-obj-test-"));
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const body = { id: 7, versionId: 17, type: "Solid", name: "Box", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const payload = Buffer.from("o Box\nv 0 0 0\nv 20 0 0\nv 0 10 5\nvt 0 0\nvt 1 0\nvt 0 1\nvn 0 0 1\nf 1/1/1 2/2/1 3/3/1\n");
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) {
      call = { source, bindings, values };
      await writeFile((values[0] as { path: string }).path, payload);
      return {};
    },
    isUncertain() { return false; },
  } as unknown as PlasticityRuntime;
  try {
    const output = join(root, "box.obj");
    const operations = new PlasticityOperations(runtime);

    const result = await operations.exportObj([7], output, state.revision, 0.08, 12);

    assert.deepEqual(call?.bindings, ["OBJExportFactory"]);
    const exportArgs = call?.values[0] as { ids: number[]; path: string; chordTolerance: number; angleToleranceDegrees: number };
    assert.deepEqual({ ...exportArgs, path: "<staging>" }, { ids: [7], path: "<staging>", chordTolerance: 0.00008, angleToleranceDegrees: 12 });
    assert.match(exportArgs.path, /\.plasticity-obj-[^/]+\/geometry\.obj$/u);
    assert.match(call?.source ?? "", /factory\.unit = 'millimeter'/u);
    assert.match(call?.source ?? "", /factory\.upAxis = 'z'/u);
    assert.match(call?.source ?? "", /factory\.showWireframe = false/u);
    assert.deepEqual(result, {
      path: output,
      bytes: payload.length,
      sourceUnits: "millimeter",
      upAxis: "z",
      objects: 1,
      vertices: 3,
      textureCoordinates: 3,
      normals: 1,
      faces: 1,
      triangles: 1,
      boundsMm: { min: [0, 0, 0], max: [20, 10, 5], size: [20, 10, 5] },
      chordToleranceMm: 0.08,
      angleToleranceDegrees: 12,
    });
    assert.deepEqual(await readFile(output), payload);
    await assert.rejects(operations.exportObj([7], output, state.revision, 0.08, 12), /overwrite/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exports exact planar native line Wires as an SVG with millimeter dimensions", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-svg-export-test-"));
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [{ id: 7, versionId: 17, type: "Wire", name: "Rectangle", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] }],
  };
  const wireGeometry = [{
    id: 7,
    plane: { originMm: [0, 0, 0], normal: [0, 0, 1] },
    segments: [
      { curveType: "Line", startMm: [0, 0, 0], endMm: [20, 0, 0] },
      { curveType: "Line", startMm: [20, 0, 0], endMm: [20, 10, 0] },
      { curveType: "Line", startMm: [20, 10, 0], endMm: [0, 10, 0] },
      { curveType: "Line", startMm: [0, 10, 0], endMm: [0, 0, 0] },
    ],
  }];
  const runtime = {
    async getState() { return state; },
    async readNative() { return wireGeometry; },
  } as unknown as PlasticityRuntime;
  try {
    const output = join(root, "rectangle.svg");
    const result = await new PlasticityOperations(runtime).exportSvg([7], output, state.revision);
    const svg = await readFile(output, "utf8");
    assert.deepEqual(result, {
      path: output,
      bytes: Buffer.byteLength(svg),
      bodies: 1,
      lineSegments: 4,
      circularSegments: 0,
      fullCircles: 0,
      fullEllipses: 0,
      ellipticalArcs: 0,
      cubicBezierSegments: 0,
      approximatedSegments: 0,
      maxChordDeviationMm: 0,
      curveChordToleranceMm: 0.05,
      curveChordAngleDegrees: 5,
      sourceUnits: "millimeter",
      boundsMm: { min: [0, -10], max: [20, 0], size: [20, 10] },
      pageSizeMm: [20.2, 10.2],
    });
    assert.match(svg, /width="20\.2mm" height="10\.2mm" viewBox="-0\.1 -10\.1 20\.2 10\.2"/u);
    assert.equal((svg.match(/<path /gu) ?? []).length, 4);
    assert.match(svg, /stroke-width="0\.2"/u);
    assert.match(svg, /M 0 0 L 20 0/u);
    assert.match(svg, /M 20 -10 L 0 -10/u);
    await assert.rejects(new PlasticityOperations(runtime).exportSvg([7], output, state.revision), /overwrite/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exports a validated polynomial cubic BCurve as an exact SVG cubic with analytic bounds", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-svg-cubic-test-"));
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [{ id: 9, versionId: 19, type: "Wire", name: "Cubic", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] }],
  };
  const controls: [[number, number], [number, number], [number, number], [number, number]] = [[0, 0], [0, 3], [3, 3], [3, 0]];
  const samplesMm = [0, 1 / 3, 2 / 3, 1].map((parameter) => {
    const point = evaluateSvgCubicBezier(controls, parameter);
    return [point[0], point[1], 0] as [number, number, number];
  });
  const validationSamples = [1 / 8, 1 / 4, 1 / 2, 3 / 4, 7 / 8].map((parameter) => {
    const point = evaluateSvgCubicBezier(controls, parameter);
    return { parameter, positionMm: [point[0], point[1], 0] as [number, number, number] };
  });
  const runtime = {
    async getState() { return state; },
    async readNative() { return [{
      id: 9,
      plane: { originMm: [0, 0, 0], normal: [0, 0, 1] },
      segments: [{ curveType: "BCurve", startMm: [0, 0, 0], endMm: [3, 0, 0], cubicBezierSpans: [{ samplesMm, validationSamples }], approximation: null }],
    }]; },
  } as unknown as PlasticityRuntime;
  try {
    const output = join(root, "cubic.svg");
    const result = await new PlasticityOperations(runtime).exportSvg([9], output, state.revision);
    const svg = await readFile(output, "utf8");
    assert.equal(result.cubicBezierSegments, 1);
    assert.equal(result.approximatedSegments, 0);
    result.boundsMm.min.forEach((value, index) => assert.ok(Math.abs(value - [0, -2.25][index]!) < 1e-12));
    result.boundsMm.max.forEach((value, index) => assert.ok(Math.abs(value - [3, 0][index]!) < 1e-12));
    result.boundsMm.size.forEach((value, index) => assert.ok(Math.abs(value - [3, 2.25][index]!) < 1e-12));
    assert.match(svg, /<path d="M 0 0 C 0 -3 3 -3 3 0" data-curve-type="BCurve"\/>/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exports a validated polynomial quadratic BCurve as an exact SVG cubic without approximation", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-svg-quadratic-test-"));
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [{ id: 10, versionId: 20, type: "Wire", name: "Quadratic", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] }],
  };
  const evaluateQuadratic = (parameter: number): [number, number] => [10 * parameter, 8 * parameter * (1 - parameter)];
  const samplesMm = [0, 1 / 3, 2 / 3, 1].map((parameter) => {
    const point = evaluateQuadratic(parameter);
    return [point[0], point[1], 0] as [number, number, number];
  });
  const validationSamples = [1 / 8, 1 / 4, 1 / 2, 3 / 4, 7 / 8].map((parameter) => {
    const point = evaluateQuadratic(parameter);
    return { parameter, positionMm: [point[0], point[1], 0] as [number, number, number] };
  });
  const runtime = {
    async getState() { return state; },
    async readNative() { return [{
      id: 10,
      plane: { originMm: [0, 0, 0], normal: [0, 0, 1] },
      segments: [{ curveType: "BCurve", startMm: [0, 0, 0], endMm: [10, 0, 0], lengthMm: 12, cubicBezierSpans: [{ samplesMm, validationSamples }], approximation: null }],
    }]; },
  } as unknown as PlasticityRuntime;
  try {
    const output = join(root, "quadratic.svg");
    const result = await new PlasticityOperations(runtime).exportSvg([10], output, state.revision);
    const svg = await readFile(output, "utf8");
    assert.equal(result.cubicBezierSegments, 1);
    assert.equal(result.approximatedSegments, 0);
    assert.match(svg, /<path d="M 0 0 C 3\.333333333333 -2\.666666666667 6\.666666666667 -2\.666666666667 10 0" data-curve-type="BCurve"\/>/u);
    assert.doesNotMatch(svg, /data-approximation=/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("extracts a native non-rational quadratic BCurve through the CDP bridge and exports it exactly", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-svg-native-quadratic-test-"));
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [{ id: 11, versionId: 21, type: "Wire", name: "Native quadratic", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] }],
  };
  const evaluateQuadratic = (parameter: number) => ({
    x: 0.01 * parameter,
    y: 0.008 * parameter * (1 - parameter),
    z: 0,
  });
  class BCurve {
    GetInfo() { return { degree: 2, isRational: false, numDistinctKnots: 2, knotVals: [0, 1] }; }
  }
  class Wire {}
  const edge = {
    GetCurve() { return { curve: new BCurve() }; },
    Normalize(parameter: number) { return parameter; },
    GetPointAndTangent(parameter: number) {
      return { position: evaluateQuadratic(parameter), tangent: { x: 1, y: 1, z: 0 } };
    },
    FindLength() { return { length: 0.012 }; },
  };
  const item = {
    view: Object.assign(new Wire(), { vertices: [] }),
    model: {
      FindPlanarBasis() { return { Location: { x: 0, y: 0, z: 0 }, Axis: { x: 0, y: 0, z: 1 } }; },
      GetEdges() { return { Size: () => 1, Get: () => edge }; },
    },
  };
  const nativeApp = {
    geo: { geometryModel: new Map([[21, item]]) },
    db: {
      lookupStableId(versionId: number) { return versionId === 21 ? 11 : null; },
      lookupTopologyItem() { return { IsSpur: () => false }; },
    },
  };
  const runtime = {
    async getState() { return state; },
    async readNative(source: string, _bindings: string[], values: unknown[]) {
      const execute = new Function(`return (${source})`)() as (this: typeof nativeApp, args: unknown) => unknown;
      return execute.call(nativeApp, values[0]);
    },
  } as unknown as PlasticityRuntime;
  try {
    const output = join(root, "native-quadratic.svg");
    const result = await new PlasticityOperations(runtime).exportSvg([11], output, state.revision);
    const svg = await readFile(output, "utf8");
    assert.equal(result.cubicBezierSegments, 1);
    assert.equal(result.approximatedSegments, 0);
    assert.match(svg, /<path d="M 0 0 C 3\.333333333333 -2\.666666666667 6\.666666666667 -2\.666666666667 10 0" data-curve-type="BCurve"\/>/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exports a closed periodic polynomial cubic BCurve as validated exact SVG cubic spans", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-svg-periodic-cubic-test-"));
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [{ id: 9, versionId: 19, type: "Wire", name: "Periodic cubic", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] }],
  };
  const controls: SvgCubicBezier[] = [
    [[0, 0], [0, -1], [1, -1], [1, 0]],
    [[1, 0], [1, 1], [0, 1], [0, 0]],
  ];
  const spans = controls.map((spanControls) => ({
    samplesMm: [0, 1 / 3, 2 / 3, 1].map((parameter) => {
      const point = evaluateSvgCubicBezier(spanControls, parameter);
      return [point[0], point[1], 0] as [number, number, number];
    }),
    validationSamples: [1 / 8, 1 / 4, 1 / 2, 3 / 4, 7 / 8].map((parameter) => {
      const point = evaluateSvgCubicBezier(spanControls, parameter);
      return { parameter, positionMm: [point[0], point[1], 0] as [number, number, number] };
    }),
  }));
  const runtime = {
    async getState() { return state; },
    async readNative() { return [{
      id: 9,
      closed: true,
      plane: { originMm: [0, 0, 0], normal: [0, 0, 1] },
      segments: [{ curveType: "BCurve", startMm: [0, 0, 0], endMm: [0, 0, 0], lengthMm: 6, cubicBezierSpans: spans, approximation: null }],
    }]; },
  } as unknown as PlasticityRuntime;
  try {
    const output = join(root, "periodic.svg");
    const result = await new PlasticityOperations(runtime).exportSvg([9], output, state.revision);
    const svg = await readFile(output, "utf8");
    assert.equal(result.cubicBezierSegments, 1);
    assert.equal(result.approximatedSegments, 0);
    assert.match(svg, /<path d="M 0 0 C [^"]+ C [^"]+" data-curve-type="BCurve"\/>/u);
    assert.doesNotMatch(svg, /data-approximation=/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exports native full circles and trimmed circular arcs as exact SVG primitives", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-svg-circular-export-test-"));
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [7, 8].map((id) => ({ id, versionId: id + 10, type: "Wire", name: "Circle", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] })),
  };
  const circleSamples = [
    [105, 100, 0], [100, 105, 0], [95, 100, 0], [100, 95, 0], [105, 100, 0],
  ] as [number, number, number][];
  const arcSamples = [30, 85, 140, 195, 250].map((angle) => [
    130 + 5 * Math.cos(angle * Math.PI / 180),
    100 + 5 * Math.sin(angle * Math.PI / 180),
    0,
  ] as [number, number, number]);
  const wireGeometry = [
    { id: 7, closed: true, plane: { originMm: [0, 0, 0], normal: [0, 0, 1] }, segments: [{ curveType: "Circle", startMm: circleSamples[0]!, endMm: circleSamples[4]!, lengthMm: 2 * Math.PI * 5, circle: { centerMm: [100, 100, 0], radiusMm: 5, normal: [0, 0, 1], samplesMm: circleSamples } }] },
    { id: 8, closed: false, plane: { originMm: [0, 0, 0], normal: [0, 0, 1] }, segments: [{ curveType: "Circle", startMm: arcSamples[0]!, endMm: arcSamples[4]!, lengthMm: 5 * 220 * Math.PI / 180, circle: { centerMm: [130, 100, 0], radiusMm: 5, normal: [0, 0, 1], samplesMm: arcSamples } }] },
  ];
  const runtime = {
    async getState() { return state; },
    async readNative() { return wireGeometry; },
  } as unknown as PlasticityRuntime;
  try {
    const output = join(root, "circles.svg");
    const result = await new PlasticityOperations(runtime).exportSvg([7, 8], output, state.revision);
    const svg = await readFile(output, "utf8");
    assert.equal(result.bodies, 2);
    assert.equal(result.lineSegments, 0);
    assert.equal(result.circularSegments, 2);
    assert.equal(result.fullCircles, 1);
    assert.equal(result.approximatedSegments, 0);
    assert.deepEqual(result.sourceUnits, "millimeter");
    assert.ok(Math.abs(result.boundsMm.min[0] - 95) < 1e-9);
    assert.ok(Math.abs(result.boundsMm.min[1] + 105) < 1e-9);
    assert.ok(Math.abs(result.boundsMm.max[0] - arcSamples[0]![0]) < 1e-9);
    assert.ok(Math.abs(result.boundsMm.max[1] + 95) < 1e-9);
    assert.match(svg, /<circle cx="100" cy="-100" r="5"\/>/u);
    assert.match(svg, /A 5 5 0 1 0 128\.289899283372 -95\.30153689607/u);
    assert.equal((svg.match(/<circle /gu) ?? []).length, 1);
    assert.equal((svg.match(/ A /gu) ?? []).length, 1);
    assert.equal(result.bytes, Buffer.byteLength(svg));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exports a closed native Ellipse as an exact SVG ellipse instead of a polyline", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-svg-ellipse-export-test-"));
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [{ id: 7, versionId: 17, type: "Wire", name: "Ellipse", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] }],
  };
  const radians = 35 * Math.PI / 180;
  const sample = (angleDegrees: number): [number, number, number] => {
    const angle = angleDegrees * Math.PI / 180;
    return [
      100 + 12 * Math.cos(angle) * Math.cos(radians) - 5 * Math.sin(angle) * Math.sin(radians),
      100 + 12 * Math.cos(angle) * Math.sin(radians) + 5 * Math.sin(angle) * Math.cos(radians),
      0,
    ];
  };
  const samplesMm = [0, 90, 180, 270, 360].map(sample);
  const runtime = {
    async getState() { return state; },
    async readNative() { return [{
      id: 7,
      closed: true,
      plane: { originMm: [0, 0, 0], normal: [0, 0, 1] },
      segments: [{
        curveType: "Ellipse", startMm: samplesMm[0], endMm: samplesMm[4], lengthMm: 55.69594968881921,
        ellipse: { carrierSamplesMm: samplesMm, parameterStart: 0, parameterEnd: 2 * Math.PI, parameterPeriod: 2 * Math.PI, startTangent: [0, 0, 0] },
      }],
    }]; },
  } as unknown as PlasticityRuntime;
  try {
    const output = join(root, "ellipse.svg");
    const result = await new PlasticityOperations(runtime).exportSvg([7], output, state.revision);
    const svg = await readFile(output, "utf8");

    assert.equal(result.approximatedSegments, 0);
    assert.equal(result.maxChordDeviationMm, 0);
    assert.match(svg, /<ellipse cx="100" cy="-100" rx="12" ry="5" transform="rotate\(-35 100 -100\)"\/>/u);
    assert.doesNotMatch(svg, /data-approximation="adaptive-chord"/u);
    assert.ok(Math.abs(result.boundsMm.min[0] - 89.76) < 0.002);
    assert.ok(Math.abs(result.boundsMm.max[0] - 110.24) < 0.002);
    assert.ok(Math.abs(result.boundsMm.min[1] + 108.009) < 0.002);
    assert.ok(Math.abs(result.boundsMm.max[1] + 91.991) < 0.002);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exports a trimmed native Ellipse as an exact SVG elliptical arc instead of a polyline", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-svg-ellipse-arc-test-"));
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [{ id: 7, versionId: 17, type: "Wire", name: "Ellipse arc", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] }],
  };
  const phi = 35 * Math.PI / 180;
  const pointAt = (angleDegrees: number): [number, number, number] => {
    const angle = angleDegrees * Math.PI / 180;
    return [
      12 * Math.cos(angle) * Math.cos(phi) - 5 * Math.sin(angle) * Math.sin(phi),
      12 * Math.cos(angle) * Math.sin(phi) + 5 * Math.sin(angle) * Math.cos(phi),
      0,
    ];
  };
  const start = pointAt(30);
  const end = pointAt(250);
  const tangent = [
    -12 * Math.sin(30 * Math.PI / 180) * Math.cos(phi) - 5 * Math.cos(30 * Math.PI / 180) * Math.sin(phi),
    -12 * Math.sin(30 * Math.PI / 180) * Math.sin(phi) + 5 * Math.cos(30 * Math.PI / 180) * Math.cos(phi),
    0,
  ] as [number, number, number];
  const runtime = {
    async getState() { return state; },
    async readNative() { return [{
      id: 7,
      closed: false,
      plane: { originMm: [0, 0, 0], normal: [0, 0, 1] },
      segments: [{
        curveType: "Ellipse", startMm: start, endMm: end, lengthMm: 40,
        ellipse: {
          carrierSamplesMm: [0, 90, 180, 270, 360].map(pointAt),
          parameterStart: 30 * Math.PI / 180,
          parameterEnd: 250 * Math.PI / 180,
          parameterPeriod: 2 * Math.PI,
          startTangent: tangent,
        },
      }],
    }]; },
  } as unknown as PlasticityRuntime;
  try {
    const output = join(root, "ellipse-arc.svg");
    const result = await new PlasticityOperations(runtime).exportSvg([7], output, state.revision);
    const svg = await readFile(output, "utf8");
    const path = svg.match(/<path d="([^"]+)" data-curve-type="Ellipse"\/>/u)?.[1];

    assert.equal(result.approximatedSegments, 0);
    assert.equal(result.ellipticalArcs, 1);
    assert.ok(path);
    assert.match(path, / A 12 5 -35 1 0 /u);
    assert.match(svg, /M 7\.078936668117 -8\.008661289428/u);
    assert.match(svg, /-0\.66707027164 6\.202851996228"/u);
    assert.ok(Math.abs(result.boundsMm.min[0] + 10.239638593616) < 1e-9);
    assert.ok(Math.abs(result.boundsMm.max[0] - 7.078936668117) < 1e-9);
    assert.ok(Math.abs(result.boundsMm.min[1] + 8.009357119777) < 1e-9);
    assert.ok(Math.abs(result.boundsMm.max[1] - 8.009357119777) < 1e-9);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exports a validated rational conic BCurve as an exact SVG elliptical arc", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-svg-rational-conic-test-"));
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [{ id: 7, versionId: 17, type: "Wire", name: "Rational conic", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] }],
  };
  const pointAt = (parameter: number): [number, number, number] => {
    const angle = parameter * 220 * Math.PI / 180;
    return [30 + 12 * Math.cos(angle), 15 + 5 * Math.sin(angle), 0];
  };
  const tangent: [number, number, number] = [0, 5, 0];
  const runtime = {
    async getState() { return state; },
    async readNative() { return [{
      id: 7,
      closed: false,
      plane: { originMm: [0, 0, 0], normal: [0, 0, 1] },
      segments: [{
        curveType: "BCurve",
        startMm: pointAt(0),
        endMm: pointAt(1),
        lengthMm: 30,
        rationalConic: {
          fitSamplesMm: [0.1, 0.3, 0.5, 0.7, 0.9].map(pointAt),
          validationSamplesMm: Array.from({ length: 65 }, (_, index) => pointAt(index / 64)),
          startTangent: tangent,
        },
        approximation: { pointsMm: Array.from({ length: 65 }, (_, index) => pointAt(index / 64)), maxChordDeviationMm: 0.01 },
      }],
    }]; },
  } as unknown as PlasticityRuntime;
  try {
    const output = join(root, "rational-conic.svg");
    const result = await new PlasticityOperations(runtime).exportSvg([7], output, state.revision);
    const svg = await readFile(output, "utf8");
    assert.equal(result.ellipticalArcs, 1);
    assert.equal(result.approximatedSegments, 0);
    assert.match(svg, /data-representation="ellipse-fit" data-validation="65-native-brep-samples"/u);
    assert.match(svg, / A 12 5 0 1 0 /u);
    assert.doesNotMatch(svg, /data-approximation="adaptive-chord"/u);

    const invalidRuntime = {
      async getState() { return state; },
      async readNative() { return [{
        id: 7,
        closed: false,
        plane: { originMm: [0, 0, 0], normal: [0, 0, 1] },
        segments: [{
          curveType: "BCurve",
          startMm: pointAt(0),
          endMm: pointAt(1),
          lengthMm: 30,
          rationalConic: {
            fitSamplesMm: [0.1, 0.3, 0.5, 0.7, 0.9].map(pointAt),
            validationSamplesMm: Array.from({ length: 65 }, (_, index) => pointAt(index / 64)).map((point, index) => index === 31 ? [point[0], point[1] + 0.1, point[2]] as [number, number, number] : point),
            startTangent: tangent,
          },
          approximation: { pointsMm: Array.from({ length: 65 }, (_, index) => pointAt(index / 64)), maxChordDeviationMm: 0.01 },
        }],
      }]; },
    } as unknown as PlasticityRuntime;
    const fallback = await new PlasticityOperations(invalidRuntime).exportSvg([7], join(root, "rational-fallback.svg"), state.revision);
    const fallbackSvg = await readFile(join(root, "rational-fallback.svg"), "utf8");
    assert.equal(fallback.approximatedSegments, 1);
    assert.match(fallbackSvg, /data-approximation="adaptive-chord"/u);
    assert.doesNotMatch(fallbackSvg, /data-representation="ellipse-fit"/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects stale, unsupported, nonplanar, and non-line SVG Wire exports before writing", async () => {
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [
      { id: 7, versionId: 17, type: "Wire", name: "Path", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] },
      { id: 8, versionId: 18, type: "Solid", name: "Box", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] },
    ],
  };
  let readCount = 0;
  const runtime = {
    async getState() { return state; },
    async readNative() { readCount += 1; return []; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);
  await assert.rejects(operations.exportSvg([7], "/tmp/stale.svg", "old"), /stale reference/iu);
  await assert.rejects(operations.exportSvg([7], "/tmp/bad-tolerance.svg", state.revision, 0, 5), /chord tolerance/u);
  await assert.rejects(operations.exportSvg([7], "/tmp/bad-angle.svg", state.revision, 0.05, 31), /angle tolerance/u);
  await assert.rejects(operations.exportSvg([], "/tmp/empty.svg", state.revision), /nonempty unique/u);
  await assert.rejects(operations.exportSvg([7, 7], "/tmp/duplicate.svg", state.revision), /nonempty unique/u);
  await assert.rejects(operations.exportSvg([99], "/tmp/missing.svg", state.revision), /unknown current Wire ID/iu);
  await assert.rejects(operations.exportSvg([8], "/tmp/solid.svg", state.revision), /Wire/u);
  await assert.rejects(operations.exportSvg([7], "/tmp/wrong.step", state.revision), /end in \.svg/u);
  assert.equal(readCount, 0);
});

test("exports other planar native B-Rep curves as explicitly tolerance-bounded SVG polylines", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-svg-reject-test-"));
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [7, 8].map((id) => ({ id, versionId: id + 10, type: "Wire", name: "Path", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] })),
  };
  const first = { id: 7, plane: { originMm: [0, 0, 0], normal: [0, 0, 1] }, segments: [{ curveType: "Line", startMm: [0, 0, 0], endMm: [10, 0, 0] }] };
  let capturedSvgReadSource = "";
  const curvedRuntime = {
    async getState() { return state; },
    async readNative(source: string) { capturedSvgReadSource = source; return [{
      ...first,
      closed: false,
      segments: [{ ...first.segments[0], curveType: "NurbsCurve", lengthMm: 10.4, approximation: {
        pointsMm: [[0, 0, 0], [5, 1, 0], [10, 0, 0]], maxChordDeviationMm: 0.04,
      } }],
    }]; },
  } as unknown as PlasticityRuntime;
  const noncoplanarRuntime = {
    async getState() { return state; },
    async readNative() { return [first, { id: 8, plane: { originMm: [0, 0, 1], normal: [0, 0, 1] }, segments: [{ curveType: "Line", startMm: [0, 0, 1], endMm: [0, 10, 1] }] }]; },
  } as unknown as PlasticityRuntime;
  const curvedOutput = join(root, "curved.svg");
  const noncoplanarOutput = join(root, "noncoplanar.svg");
  try {
    const approximation = await new PlasticityOperations(curvedRuntime).exportSvg([7], curvedOutput, state.revision);
    const svg = await readFile(curvedOutput, "utf8");
    assert.equal(approximation.approximatedSegments, 1);
    assert.equal(approximation.maxChordDeviationMm, 0.04);
    assert.match(capturedSvgReadSource, /let totalApproximationPoints = 0/u);
    assert.match(svg, /data-curve-type="NurbsCurve" data-approximation="adaptive-chord"/u);
    assert.match(svg, /M 0 0 L 5 -1 L 10 0/u);
    assert.equal(approximation.curveChordToleranceMm, 0.05);
    const unsupportedRuntime = {
      async getState() { return state; },
      async readNative() { return [{ ...first, closed: false, segments: [{ ...first.segments[0], curveType: "NurbsCurve" }] }]; },
    } as unknown as PlasticityRuntime;
    await assert.rejects(new PlasticityOperations(unsupportedRuntime).exportSvg([7], join(root, "unsupported.svg"), state.revision), /unsupported native curve/u);
    await assert.rejects(new PlasticityOperations(noncoplanarRuntime).exportSvg([7, 8], noncoplanarOutput, state.revision), /coplanar/u);
    await assert.rejects(readFile(noncoplanarOutput), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects invalid OBJ export selections and tessellation settings before mutation", async () => {
  let mutations = 0;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [],
    bodies: [
      { id: 7, versionId: 17, type: "Solid", name: "Box", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] },
      { id: 8, versionId: 18, type: "Wire", name: "Path", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] },
    ],
  };
  const runtime = { async getState() { return state; }, async mutate() { mutations += 1; return {}; }, isUncertain() { return false; } } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await assert.rejects(operations.exportObj([7], "/tmp/stale.obj", "old", 0.05, 15), /stale reference/iu);
  await assert.rejects(operations.exportObj([], "/tmp/empty.obj", state.revision, 0.05, 15), /nonempty unique/u);
  await assert.rejects(operations.exportObj([7, 7], "/tmp/duplicate.obj", state.revision, 0.05, 15), /nonempty unique/u);
  await assert.rejects(operations.exportObj([99], "/tmp/missing.obj", state.revision, 0.05, 15), /unknown current body/iu);
  await assert.rejects(operations.exportObj([8], "/tmp/wire.obj", state.revision, 0.05, 15), /Solid or Sheet/u);
  await assert.rejects(operations.exportObj([7], "/tmp/bad.stl", state.revision, 0.05, 15), /end in \.obj/u);
  await assert.rejects(operations.exportObj([7], "/tmp/bad-chord.obj", state.revision, 0, 15), /chord tolerance/u);
  await assert.rejects(operations.exportObj([7], "/tmp/bad-angle.obj", state.revision, 0.05, 91), /angle tolerance/u);
  assert.equal(mutations, 0);
});

test("exports selected native bodies as a validated Parasolid file without overwriting", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-parasolid-export-test-"));
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const body = { id: 7, versionId: 17, type: "Solid", name: "Box", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const payload = Buffer.from("**ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz**************************\n**PARASOLID test fixture\n");
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) {
      call = { source, bindings, values };
      const args = values[0] as { path: string };
      await writeFile(args.path, payload);
      return {};
    },
    isUncertain() { return false; },
  } as unknown as PlasticityRuntime;
  try {
    const output = join(root, "box.x_t");
    const operations = new PlasticityOperations(runtime);

    const result = await operations.exportParasolid([7], output, state.revision);

    assert.deepEqual(call?.bindings, ["ExportCadFactory"]);
    assert.match(call?.source ?? "", /factory\.items = args\.ids\.map\(find\)/u);
    assert.match((call?.values[0] as { path: string }).path, /\.plasticity-parasolid-[^/]+\/geometry\.x_t$/u);
    assert.deepEqual(result, { path: output, bytes: payload.length, format: "parasolid-text" });
    assert.deepEqual(await readFile(output), payload);
    await assert.rejects(operations.exportParasolid([7], output, state.revision), /overwrite/u);
    await assert.rejects(operations.exportParasolid([7], join(root, "box.step"), state.revision), /\.x_t or \.x_b/u);
    await assert.rejects(operations.exportParasolid([], join(root, "empty.x_t"), state.revision), /nonempty unique/u);
    await assert.rejects(operations.exportParasolid([7, 7], join(root, "duplicate.x_t"), state.revision), /nonempty unique/u);
    await assert.rejects(operations.exportParasolid([99], join(root, "missing.x_t"), state.revision), /unknown current body/iu);
    await assert.rejects(operations.exportParasolid([7], join(root, "stale.x_t"), "stale-revision"), /stale reference/iu);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("imports a validated Parasolid file through the native Parasolid importer", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-parasolid-import-test-"));
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [] };
  const input = join(root, "box.x_b");
  await writeFile(input, Buffer.from("**ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz**************************\n**PARASOLID test fixture\n"));
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) {
      call = { source, bindings, values };
      return {};
    },
    isUncertain() { return false; },
  } as unknown as PlasticityRuntime;
  try {
    const operations = new PlasticityOperations(runtime);

    assert.equal(await operations.importParasolid(input, state.revision), state);

    assert.deepEqual(call?.bindings, ["ParasolidImportFactory", "ImportCommand"]);
    assert.match(call?.source ?? "", /new Factory\(editor\)\.resource\(this\)/u);
    assert.deepEqual(call?.values, [{ path: await realpath(input) }]);
    await assert.rejects(operations.importParasolid(join(root, "missing.x_t"), state.revision), /ENOENT/u);
    const invalid = join(root, "invalid.x_t");
    await writeFile(invalid, "not Parasolid");
    await assert.rejects(operations.importParasolid(invalid, state.revision), /invalid Parasolid/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("imports a local STL or OBJ as an explicitly scaled approximate reference mesh", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-reference-mesh-import-test-"));
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [], referenceMeshes: [],
  };
  const input = join(root, "phone-reference.stl");
  await writeFile(input, "solid reference\nendsolid reference\n");
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  try {
    const operations = new PlasticityOperations(runtime);

    assert.equal(await operations.importReferenceMesh(input, "millimeter", state.revision), state);

    assert.deepEqual(call?.bindings, ["MeshImportFactory", "ImportCommand"]);
    assert.match(call?.source ?? "", /factory\.unit = args\.sourceUnit/u);
    assert.match(call?.source ?? "", /Empties_ObjectEmpty/u);
    assert.deepEqual(call?.values, [{ path: await realpath(input), sourceUnit: "millimeter" }]);
    const invalid = join(root, "phone-reference.step");
    await writeFile(invalid, "not a mesh");
    await assert.rejects(operations.importReferenceMesh(invalid, "millimeter", state.revision), /\.stl or \.obj/u);
    const empty = join(root, "empty.obj");
    await writeFile(empty, "");
    await assert.rejects(operations.importReferenceMesh(empty, "millimeter", state.revision), /must not be empty/u);
    await assert.rejects(operations.importReferenceMesh(input, "millimeter", "stale"), /stale reference/iu);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("imports a local SVG as explicitly scaled editable native Wires", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-svg-import-test-"));
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [],
  };
  const input = join(root, "bracket-profile.svg");
  await writeFile(input, '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H20V10H0Z"/></svg>');
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  try {
    const operations = new PlasticityOperations(runtime);

    assert.equal(await operations.importSvg(input, "inch", state.revision), state);

    assert.deepEqual(call?.bindings, ["VectorImportFactory", "ImportCommand"]);
    assert.match(call?.source ?? "", /factory\.unit = args\.sourceUnit/u);
    assert.match(call?.source ?? "", /constructor\?\.name === 'Wire'/u);
    assert.deepEqual(call?.values, [{ path: await realpath(input), sourceUnit: "inch" }]);
    const wrongExtension = join(root, "profile.txt");
    await writeFile(wrongExtension, "<svg/>");
    await assert.rejects(operations.importSvg(wrongExtension, "millimeter", state.revision), /end in \.svg/u);
    const empty = join(root, "empty.svg");
    await writeFile(empty, "");
    await assert.rejects(operations.importSvg(empty, "millimeter", state.revision), /must not be empty/u);
    await assert.rejects(operations.importSvg(input, "millimeter", "stale"), /stale reference/iu);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

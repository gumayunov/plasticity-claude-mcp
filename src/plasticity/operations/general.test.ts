import assert from "node:assert/strict";
import { mkdtemp, readFile, realpath, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PlasticityOperations } from "../operations.ts";
import { countActiveCurveSpans } from "../curve-span-count.ts";
import type { PlasticityRuntime, RuntimeState } from "../runtime.ts";
import { emptyConstruction, testThreeMfArchive } from "./test-support.ts";

test("exports selected native bodies as a validated, millimeter-scaled 3MF package", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-3mf-test-"));
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const body = { id: 7, versionId: 17, type: "Solid", name: "Box", boundsMm: null, faceIds: [], edgeIds: [], faces: [], edges: [], vertices: [] };
  const state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [body] };
  const archive = testThreeMfArchive();
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) {
      call = { source, bindings, values };
      const args = values[0] as { path: string };
      await writeFile(args.path, archive);
      return {};
    },
    isUncertain() { return false; },
  } as unknown as PlasticityRuntime;
  try {
    const output = join(root, "box.3mf");
    const operations = new PlasticityOperations(runtime);

    const result = await operations.export3mf([7], output, state.revision, 0.05, 15);

    assert.deepEqual(call?.bindings, ["ThreeMfExportFactory"]);
    const exportArgs = call?.values[0] as { ids: number[]; path: string; scale: number; chordTolerance: number; angleToleranceDegrees: number };
    assert.deepEqual({ ...exportArgs, path: "<staging>" }, { ids: [7], path: "<staging>", scale: 0.001, chordTolerance: 0.00005, angleToleranceDegrees: 15 });
    assert.match(exportArgs.path, /\.plasticity-3mf-[^/]+\/geometry\.3mf$/u);
    assert.match(call?.source ?? "", /factory\.shells = args\.ids\.map\(find\)/u);
    assert.match(call?.source ?? "", /factory\.scale = args\.scale/u);
    assert.deepEqual(result, {
      path: output,
      bytes: archive.length,
      modelUnit: "meter",
      sourceUnits: "millimeter",
      objects: 1,
      buildItems: 1,
      vertices: 3,
      triangles: 1,
      boundsMm: { min: [0, 0, 0], max: [20, 10, 0], size: [20, 10, 0] },
      chordToleranceMm: 0.05,
      angleToleranceDegrees: 15,
    });
    assert.deepEqual(await readFile(output), archive);
    await assert.rejects(operations.export3mf([7], output, state.revision, 0.05, 15), /overwrite/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects stale, duplicate, missing, and non-B-Rep 3MF body selections before export", async () => {
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

  await assert.rejects(operations.export3mf([7], "/tmp/stale.3mf", "old", 0.05, 15), /stale reference/iu);
  await assert.rejects(operations.export3mf([], "/tmp/empty.3mf", state.revision, 0.05, 15), /nonempty unique/u);
  await assert.rejects(operations.export3mf([7, 7], "/tmp/duplicate.3mf", state.revision, 0.05, 15), /nonempty unique/u);
  await assert.rejects(operations.export3mf([99], "/tmp/missing.3mf", state.revision, 0.05, 15), /unknown current body/iu);
  await assert.rejects(operations.export3mf([8], "/tmp/wire.3mf", state.revision, 0.05, 15), /Solid or Sheet/u);
  await assert.rejects(operations.export3mf([7], "/tmp/bad.obj", state.revision, 0.05, 15), /end in \.3mf/u);
  assert.equal(mutations, 0);
});

test("imports a validated unit-aware 3MF as a native approximate reference mesh", async () => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-reference-3mf-import-test-"));
  let call: { source: string; bindings: string[]; values: unknown[] } | undefined;
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1,
    undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [], referenceMeshes: [],
  };
  const input = join(root, "reference.3mf");
  await writeFile(input, testThreeMfArchive());
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { call = { source, bindings, values }; return {}; },
  } as unknown as PlasticityRuntime;
  try {
    const operations = new PlasticityOperations(runtime);

    assert.equal(await operations.importReference3mf(input, state.revision), state);
    assert.deepEqual(call?.bindings, ["ImporterExporter", "ImportCommand"]);
    assert.match(call?.source ?? "", /\.import3mf\(args\.path\)/u);
    assert.deepEqual(call?.values, [{ path: await realpath(input) }]);

    const wrongExtension = join(root, "reference.step");
    await writeFile(wrongExtension, await readFile(input));
    await assert.rejects(operations.importReference3mf(wrongExtension, state.revision), /\.3mf/u);
    const oversized = join(root, "oversized.3mf");
    await writeFile(oversized, Buffer.from([0]));
    await truncate(oversized, 64 * 1024 * 1024 + 1);
    await assert.rejects(operations.importReference3mf(oversized, state.revision), /exceeds 67108864 bytes/u);
    await assert.rejects(operations.importReference3mf(input, "stale"), /stale reference/iu);
    const corrupt = Buffer.from(await readFile(input));
    const firstPayloadOffset = 30 + Buffer.byteLength("[Content_Types].xml");
    corrupt[firstPayloadOffset] = (corrupt[firstPayloadOffset]! + 1) % 256;
    await writeFile(input, corrupt);
    const previousCall = call;
    await assert.rejects(operations.importReference3mf(input, state.revision), /CRC-32/u);
    assert.equal(call, previousCall, "invalid package must be rejected before native mutation");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("synchronizes visible native distance-measurement overlays with exact B-Rep state", async () => {
  const measurement = {
    id: 3, versionId: 13, type: "DistanceMeasurement", name: "Width", measurementSource: "native-brep" as const,
    first: { bodyId: 7, topologyId: 101, landmark: 0, positionMm: [0, 0, 0] as [number, number, number] },
    second: { bodyId: 7, topologyId: 102, landmark: 0, positionMm: [20, 0, 0] as [number, number, number] },
    distanceMm: 20, direction: [1, 0, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], offsetMm: [0, 0],
  };
  let state: RuntimeState = { targetId: "window-1", title: "Untitled - Plasticity", documentToken: "document-1", revision: "current-revision", dbVersion: 1, undoDepth: 0, redoDepth: 0, construction: emptyConstruction, regions: [], bodies: [], measurements: [measurement] };
  const calls: Array<{ source: string; bindings: string[]; values: unknown[] }> = [];
  let uncertain = false;
  const runtime = {
    async getState() { return state; },
    async mutate(source: string, bindings: string[], values: unknown[]) { calls.push({ source, bindings, values }); return {}; },
    isUncertain() { return uncertain; },
  } as unknown as PlasticityRuntime;
  const operations = new PlasticityOperations(runtime);

  await operations.state();

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.bindings, ["LineSegmentHelper", "Vector3", "Vector2", "makeAxisAlignedMeasurementPath"]);
  assert.deepEqual(calls[0]?.values, [{
    documentToken: "document-1",
    measurements: [{
      versionId: 13,
      firstMm: [0, 0, 0],
      secondMm: [20, 0, 0],
      firstBodyId: 7,
      secondBodyId: 7,
      direction: [1, 0, 0],
      normal: [0, 0, 1],
      offsetMm: [0, 0],
      distanceMm: 20,
    }],
    bodyBoundsMm: [],
  }]);
  assert.match(calls[0]?.source ?? "", /this\.helpers\.add\(lineHelper\)/);
  assert.match(calls[0]?.source ?? "", /Math\.max\(measurement\.distanceMm \* 0\.08, 2\)/);
  assert.match(calls[0]?.source ?? "", /const outsideDistance = point => bounds/);
  assert.match(calls[0]?.source ?? "", /clearance > 0\.01/);
  assert.match(calls[0]?.source ?? "", /new Vector2\(0, step \/ 1000\)/);
  assert.match(calls[0]?.source ?? "", /const linePairs = \[\[path\[0\], path\[1\]\], \[path\[1\], path\[3\]\], \[path\[3\], path\[4\]\]\]/);
  assert.match(calls[0]?.source ?? "", /lineHelper\.line\.material\.color\.setHex\(0xb7f397\)/);
  assert.match(calls[0]?.source ?? "", /lineHelper\.line\.material\.depthTest = false/);
  assert.match(calls[0]?.source ?? "", /lineHelper\.line\.material\.linewidth = 2/);
  assert.match(calls[0]?.source ?? "", /for \(const helper of tag\.helpers/);
  assert.match(calls[0]?.source ?? "", /nativeLabels\.group\.remove\(label\)/);
  assert.match(calls[0]?.source ?? "", /nativeLabels\.segments\.clear\(\)/);
  assert.match(calls[0]?.source ?? "", /this\.measurements\.distanceSegments\.clear\(\)/);
  assert.match(calls[0]?.source ?? "", /document\.querySelectorAll\('\[data-plasticity-mcp-distance\]'\)/);
  assert.match(calls[0]?.source ?? "", /document\.createElement\('div'\)/);
  assert.match(calls[0]?.source ?? "", /measurement\.distanceMm\.toFixed\(2\) \+ ' mm'/);
  assert.match(calls[0]?.source ?? "", /labelPoint\.clone\(\)\.project\(camera\)/);
  assert.match(calls[0]?.source ?? "", /requestAnimationFrame\(updateLabels\)/);
  assert.match(calls[0]?.source ?? "", /cancelAnimationFrame\(tag\.frameId\)/);
  assert.match(calls[0]?.source ?? "", /label\.remove\(\)/);
  assert.match(calls[0]?.source ?? "", /manager\.set\(key, tag\)/);
  assert.match(calls[0]?.source ?? "", /manager\.get\(key\) !== tag/);

  await operations.state();
  assert.equal(calls.length, 1, "an unchanged measurement revision should not rebuild its overlay");

  state = { ...state, revision: "while-uncertain", documentToken: "document-2" };
  uncertain = true;
  await operations.state();
  assert.equal(calls.length, 1, "an uncertain CDP session must not attempt an overlay mutation");
  uncertain = false;
  await operations.state();
  assert.equal(calls.length, 2, "the changed document overlay should sync after uncertainty is resolved");

  state = { ...state, revision: "after-delete", measurements: [] };
  await operations.state();
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2]?.values, [{ documentToken: "document-2", measurements: [], bodyBoundsMm: [] }]);
});

test("counts active B-spline spans inside the normalized segment and ignores periodic extension knots", () => {
  assert.equal(countActiveCurveSpans([0.4634531444636595, 0.6668940159247746, 0.8430536255781333, 0, 0.03404017353322942, 0.2391400413826988, 0.46345314446365937, 0.6668940159247746, 0.8430536255781333, 0, 0.03404017353322941, 0.23914004138269873, 0.46345314446365937]), 6);
  assert.equal(countActiveCurveSpans([0, 0.25, 0.5, 0.75, 1]), 4);
  assert.equal(countActiveCurveSpans([-0.2, 0, 1, 1.2]), 1);
});

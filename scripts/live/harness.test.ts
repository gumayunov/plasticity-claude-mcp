import assert from "node:assert/strict";
import test from "node:test";

import { emptyStatus, fakeMcp } from "./fake-mcp.ts";
import {
  CheckFailure, ToolError, assertEmptyDocument, diffSnapshots, expectBounds, expectClose, extentMm,
  hasSceneContentChanges, mutate, onlyBody, parseToolResult, readBinaryStlBounds, requireCondition,
  sanitizeEvidence, toSnapshot, unionBounds,
} from "./harness.ts";

const box = (id: number, min: [number, number, number], max: [number, number, number], type = "Solid") =>
  ({ id, type, name: null, boundsMm: { min, max }, faceCount: 6, edgeCount: 12 });

test("requireCondition throws CheckFailure", () => {
  assert.throws(() => requireCondition(false, "nope"), (error: unknown) => error instanceof CheckFailure && error.message === "nope");
  requireCondition(true, "fine");
});

test("expectClose accepts values inside tolerance and rejects NaN", () => {
  expectClose(10.005, 10, "x");
  assert.throws(() => expectClose(10.02, 10, "x"), /x: expected 10 ± 0.01, got 10.02/);
  assert.throws(() => expectClose(Number.NaN, 10, "x"), CheckFailure);
});

test("expectBounds checks every axis and missing bounds", () => {
  expectBounds({ min: [0, 0, 0], max: [20, 10, 5] }, [0, 0, 0], [20, 10, 5], "box");
  assert.throws(() => expectBounds({ min: [0, 0, 0], max: [20, 10, 6] }, [0, 0, 0], [20, 10, 5], "box"), /box.max\[2\]/);
  assert.throws(() => expectBounds(null, [0, 0, 0], [1, 1, 1], "box"), /box: bounds are missing/);
});

test("extentMm and unionBounds", () => {
  assert.equal(extentMm({ min: [-5, 0, 0], max: [5, 1, 1] }, 0, "c"), 10);
  assert.deepEqual(unionBounds([box(1, [0, 0, 0], [1, 1, 1]), box(2, [-2, 3, 0], [0, 4, 2])]), { min: [-2, 0, 0], max: [1, 4, 2] });
  assert.equal(unionBounds([]), null);
});

test("parseToolResult parses JSON text and maps isError to ToolError", () => {
  assert.deepEqual(parseToolResult("t", { content: [{ type: "text", text: "{\"a\":1}" }] }), { a: 1 });
  assert.throws(() => parseToolResult("t", { isError: true, content: [{ type: "text", text: "boom" }] }), (error: unknown) => error instanceof ToolError && /t: boom/.test(error.message));
  assert.throws(() => parseToolResult("t", { content: [] }), /t: returned no text content/);
  assert.throws(() => parseToolResult("t", { content: [{ type: "text", text: "not json" }] }), /non-JSON/);
});

test("toSnapshot reads status and assertEmptyDocument rejects content", () => {
  const empty = toSnapshot(emptyStatus("r7"));
  assert.equal(empty.revision, "r7");
  assertEmptyDocument(empty);
  const withBody = toSnapshot({ ...emptyStatus(), bodies: [box(1, [0, 0, 0], [1, 1, 1])], bodyPagination: { total: 1 } });
  assert.throws(() => assertEmptyDocument(withBody), /bodies=1/);
  const withGroup = toSnapshot({ ...emptyStatus(), groups: [{ id: 0 }, { id: 4 }] });
  assert.throws(() => assertEmptyDocument(withGroup), /groups=1/);
});

test("toSnapshot refuses paginated status", () => {
  assert.throws(() => toSnapshot({ ...emptyStatus(), bodies: [], bodyPagination: { total: 300 } }), /paginated/);
});

test("diffSnapshots finds added and removed bodies and regions", () => {
  const before = toSnapshot({ ...emptyStatus("a"), bodies: [box(1, [0, 0, 0], [1, 1, 1])], bodyPagination: { total: 1 } });
  const after = toSnapshot({
    ...emptyStatus("b"),
    bodies: [box(2, [0, 0, 0], [2, 2, 2])],
    bodyPagination: { total: 1 },
    regions: [{ id: "r-1", displayBoundsMm: { min: [0, 0, 0], max: [1, 1, 0] } }],
  });
  const diff = diffSnapshots(before, after);
  assert.deepEqual(diff.added.map((body) => body.id), [2]);
  assert.deepEqual(diff.removed.map((body) => body.id), [1]);
  assert.deepEqual(diff.regionsAdded.map((region) => region.id), ["r-1"]);
});

test("mutate passes the current revision and reports added bodies", async () => {
  let created = false;
  const mcp = fakeMcp({
    plasticity_status: () => created
      ? { ...emptyStatus("r2"), bodies: [box(5, [0, 0, 0], [1, 1, 1])], bodyPagination: { total: 1 } }
      : emptyStatus("r1"),
    plasticity_create_box: (args) => { created = true; return { echoed: args }; },
  });
  const outcome = await mutate(mcp, "plasticity_create_box", { originMm: [0, 0, 0], sizeMm: [1, 1, 1] });
  assert.equal((outcome.result as { echoed: { revision: string } }).echoed.revision, "r1");
  assert.equal(onlyBody(outcome.added, "Solid", "box").id, 5);
});

test("onlyBody requires exactly one body of a type", () => {
  assert.throws(() => onlyBody([], "Solid", "x"), /x: expected exactly one Solid, got none/);
  assert.throws(() => onlyBody([box(1, [0, 0, 0], [1, 1, 1]), box(2, [0, 0, 0], [1, 1, 1])], "Solid", "x"), /got Solid, Solid/);
});

test("readBinaryStlBounds reads triangle count and bounds", () => {
  const data = new Uint8Array(84 + 50);
  const view = new DataView(data.buffer);
  view.setUint32(80, 1, true);
  const vertices = [[0, 0, 0], [20, 10, 0], [0, 10, 5]];
  vertices.forEach((vertex, v) => vertex.forEach((value, axis) => view.setFloat32(84 + 12 + v * 12 + axis * 4, value, true)));
  assert.deepEqual(readBinaryStlBounds(data), { triangleCount: 1, boundsMm: { min: [0, 0, 0], max: [20, 10, 5] } });
  assert.throws(() => readBinaryStlBounds(data.subarray(0, 100)), /does not match/);
});

test("sanitizeEvidence drops sensitive keys recursively", () => {
  assert.deepEqual(sanitizeEvidence({ a: 1, prompt: "x", nested: [{ secret: 1, b: 2 }] }), { a: 1, nested: [{ b: 2 }] });
});

test("hasSceneContentChanges detects any change", () => {
  const quiet = {
    documentChanged: false, added: [], removed: [], modified: [],
    constructionPlanesAdded: [], constructionPlanesRemoved: [], constructionPlanesModified: [], activeWorkplaneChanged: null,
  };
  assert.equal(hasSceneContentChanges(quiet), false);
  assert.equal(hasSceneContentChanges({ ...quiet, added: [1] }), true);
  assert.equal(hasSceneContentChanges({ ...quiet, groupsChanged: true }), true);
});

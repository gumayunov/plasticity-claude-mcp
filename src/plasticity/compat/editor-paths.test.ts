import assert from "node:assert/strict";
import { test } from "node:test";

import { MISSING_EDITOR_PATHS_PREFIX, withEditorCompat } from "./editor-paths.ts";

// Evaluates a renderer function declaration the way Runtime.callFunctionOn does.
function run(declaration: string, self: unknown, ...args: unknown[]): unknown {
  const fn = new Function(`return (${declaration});`)() as (...values: unknown[]) => unknown;
  return fn.apply(self, args);
}

test("compat exposes values resolved from profile paths", () => {
  const editor = { geo: { geometryModel: new Map([[1, "body"]]) }, db: { version: 7 } };
  const declaration = withEditorCompat("function (offset) { return [compat.geometryModel.get(1), compat.dbVersion + offset]; }", {
    geometryModel: "geo.geometryModel",
    dbVersion: "db.version",
  });
  assert.deepEqual(run(declaration, editor, 1), ["body", 8]);
});

test("functions stay bound to their parent object", () => {
  const editor = { db: { prefix: "id-", lookupStableId(value: number) { return `${this.prefix}${value}`; } } };
  const declaration = withEditorCompat("function () { const lookup = compat.lookupStableId; return lookup(5); }", { lookupStableId: "db.lookupStableId" });
  assert.equal(run(declaration, editor), "id-5");
});

test("a missing required path fails only when it is used, like a direct property access", () => {
  const declaration = withEditorCompat("function (useMissing) { return useMissing ? compat.geometryModel : compat.db.version; }", { geometryModel: "geo.geometryModel", db: "db" });
  assert.equal(run(declaration, { db: { version: 3 } }, false), 3);
  assert.throws(() => run(declaration, { db: {} }, true), (error: unknown) =>
    error instanceof Error && error.message === `${MISSING_EDITOR_PATHS_PREFIX}geometryModel=geo.geometryModel`);
});

test("the parameter list and body of the original function are kept", () => {
  const declaration = withEditorCompat("async function (A, B) {\n  return A + B;\n}", { db: "db" });
  assert.match(declaration, /^async function \(A, B\) \{\n {2}const compat = /);
  assert.match(declaration, /return A \+ B;\n\}$/);
});

test("optional paths (prefixed with ?) resolve to undefined instead of failing", () => {
  const declaration = withEditorCompat("function () { return [compat.document, compat.db.x]; }", { document: "?document", db: "db" });
  assert.deepEqual(run(declaration, { db: { x: 1 } }), [undefined, 1]);
  assert.deepEqual(run(declaration, { db: { x: 2 }, document: "doc" }), ["doc", 2]);
});

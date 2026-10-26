import assert from "node:assert/strict";
import test from "node:test";

import { parseRunArgs, selectByName } from "./run.ts";
import { smokeChecks } from "./smoke/index.ts";

test("parseRunArgs defaults to smoke", () => {
  assert.deepEqual(parseRunArgs([]), { tier: "smoke", only: [], updateBaseline: false, help: false });
});

test("parseRunArgs reads tier, only and baseline flags", () => {
  assert.deepEqual(parseRunArgs(["--tier", "full", "--only", "a,b", "--only", "c", "--update-baseline"]), {
    tier: "full", only: ["a", "b", "c"], updateBaseline: true, help: false,
  });
  assert.throws(() => parseRunArgs(["--tier", "medium"]), /--tier must be smoke or full/);
  assert.throws(() => parseRunArgs(["--only"]), /--only requires/);
  assert.throws(() => parseRunArgs(["--bogus"]), /Unknown argument: --bogus/);
});

test("selectByName keeps order and rejects unknown names before launching anything", () => {
  const items = [{ name: "a" }, { name: "b" }, { name: "c" }];
  assert.deepEqual(selectByName(items, []), items);
  assert.deepEqual(selectByName(items, ["c", "a"]), [{ name: "a" }, { name: "c" }]);
  assert.throws(() => selectByName(items, ["z"]), /Unknown check\(s\): z. Available: a, b, c/);
});

test("smoke check names are unique kebab-case", () => {
  const names = smokeChecks.map((check) => check.name);
  assert.equal(new Set(names).size, names.length);
  for (const name of names) assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

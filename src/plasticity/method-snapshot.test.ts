import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { PlasticityOperations } from "./operations.ts";
import { PlasticityRecipes } from "./recipes.ts";

const snapshotPath = fileURLToPath(new URL("./method-snapshot.json", import.meta.url));

function methodNames(prototype: object): string[] {
  const names = new Set<string>();
  for (let current: object | null = prototype; current && current !== Object.prototype; current = Object.getPrototypeOf(current)) {
    for (const name of Object.getOwnPropertyNames(current)) if (name !== "constructor") names.add(name);
  }
  return [...names].sort();
}

test("operations and recipes expose the same methods as before the module split", async () => {
  const current = {
    PlasticityOperations: methodNames(PlasticityOperations.prototype),
    PlasticityRecipes: methodNames(PlasticityRecipes.prototype),
  };
  if (process.env.UPDATE_METHOD_SNAPSHOT === "1") {
    await writeFile(snapshotPath, `${JSON.stringify(current, null, 2)}\n`);
    return;
  }
  assert.deepEqual(current, JSON.parse(await readFile(snapshotPath, "utf8")));
});

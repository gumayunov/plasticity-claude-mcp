import assert from "node:assert/strict";
import test from "node:test";

import { hasMaterial, materialIdByName, parseAppearanceDeleteAcceptanceArgs } from "./verify-appearance-material-delete-live.ts";

test("appearance delete acceptance requires an explicit disposable target and new output", () => {
  assert.deepEqual(parseAppearanceDeleteAcceptanceArgs([]), { help: true, allowDisposableMutations: false });
  assert.throws(() => parseAppearanceDeleteAcceptanceArgs(["--allow-disposable-mutations", "--output", "out"]), /--target/);
  assert.throws(() => parseAppearanceDeleteAcceptanceArgs(["--target", "w1", "--output", "out"]), /--allow-disposable-mutations/);
  assert.throws(() => parseAppearanceDeleteAcceptanceArgs(["--target", "w1", "--allow-disposable-mutations"]), /--output/);
  assert.deepEqual(parseAppearanceDeleteAcceptanceArgs(["--target", "w1", "--allow-disposable-mutations", "--output", "out"]), {
    help: false, target: "w1", allowDisposableMutations: true, output: "out",
  });
});

test("appearance delete acceptance finds its probe material by exact name", () => {
  const listing = { materials: [{ id: 3, name: "Delete acceptance probe" }, { id: 4, name: "Other" }] };
  assert.equal(materialIdByName(listing, "Delete acceptance probe"), 3);
  assert.throws(() => materialIdByName({ materials: [] }, "Delete acceptance probe"), /exactly one/);
  assert.equal(hasMaterial(listing, 4), true);
  assert.equal(hasMaterial(listing, 9), false);
});

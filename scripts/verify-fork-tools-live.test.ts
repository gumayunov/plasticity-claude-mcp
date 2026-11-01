import assert from "node:assert/strict";
import test from "node:test";

import { changedBoundsMethod, parseForkToolsAcceptanceArgs } from "./verify-fork-tools-live.ts";

test("fork tools acceptance requires an explicit disposable target and new output", () => {
  assert.deepEqual(parseForkToolsAcceptanceArgs([]), { help: true, allowDisposableMutations: false });
  assert.deepEqual(parseForkToolsAcceptanceArgs(["--help"]), { help: true, allowDisposableMutations: false });
  assert.throws(() => parseForkToolsAcceptanceArgs(["--allow-disposable-mutations", "--output", "out"]), /--target/);
  assert.throws(() => parseForkToolsAcceptanceArgs(["--target", "w1", "--output", "out"]), /--allow-disposable-mutations/);
  assert.throws(() => parseForkToolsAcceptanceArgs(["--target", "w1", "--allow-disposable-mutations"]), /--output/);
  assert.throws(() => parseForkToolsAcceptanceArgs(["--unknown"]), /Unknown argument/);
  assert.deepEqual(parseForkToolsAcceptanceArgs(["--target", "w1", "--allow-disposable-mutations", "--output", "out"]), {
    help: false, target: "w1", allowDisposableMutations: true, output: "out",
  });
});

test("fork tools acceptance reads boundsMethod from a changes-only response", () => {
  assert.equal(changedBoundsMethod({ change: { added: [{ boundsMethod: "native-box" }] } }), "native-box");
  assert.throws(() => changedBoundsMethod({ change: { added: [{}] } }), /boundsMethod/);
  assert.throws(() => changedBoundsMethod({ bodies: [] }), /boundsMethod/);
});

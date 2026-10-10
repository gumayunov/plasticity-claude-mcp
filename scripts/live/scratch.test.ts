import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { withScratchDirectory } from "./scratch.ts";

test("work happens in a temporary directory and its files are kept afterwards, even on failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "scratch-test-"));
  const scratchRoot = join(root, "scratch");
  const keep = join(root, "kept");
  try {
    let seen = "";
    const value = await withScratchDirectory(scratchRoot, "box", join(keep, "box"), async (directory) => {
      seen = directory;
      await writeFile(join(directory, "box.step"), "ISO-10303-21;");
      return 42;
    });
    assert.equal(value, 42);
    assert.ok(seen.startsWith(scratchRoot));
    assert.equal(await readFile(join(keep, "box", "box.step"), "utf8"), "ISO-10303-21;");
    await assert.rejects(withScratchDirectory(scratchRoot, "broken", join(keep, "broken"), async (directory) => {
      await writeFile(join(directory, "partial.txt"), "x");
      throw new Error("check failed");
    }), /check failed/);
    assert.ok(existsSync(join(keep, "broken", "partial.txt")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

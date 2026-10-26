import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { fullRegistry, runFullEntry } from "./full.ts";
import { CheckFailure } from "./harness.ts";
import { projectRoot } from "./mcp.ts";

const fixtures = join(projectRoot, "scripts", "live", "fixtures");

test("registry covers every live verification script exactly once", async () => {
  const files = (await readdir(join(projectRoot, "scripts"))).filter((name) => /^verify-.*-live\.ts$/.test(name)).sort();
  assert.deepEqual(fullRegistry.map((entry) => entry.script).sort(), files);
});

test("registry names are unique and skips carry a reason", () => {
  const names = fullRegistry.map((entry) => entry.name);
  assert.equal(new Set(names).size, names.length);
  for (const entry of fullRegistry) if (entry.skipReason !== undefined) assert.ok(entry.skipReason.length > 10, entry.name);
});

test("runFullEntry passes target, output and CDP endpoint and keeps logs", async () => {
  const checkDir = await mkdtemp(join(tmpdir(), "live-full-test-"));
  try {
    const evidence = await runFullEntry(
      { name: "ok", script: "exit-ok.ts", args: ["--allow-disposable-mutations"] },
      { cdpUrl: "http://127.0.0.1:5001", targetId: "T1", checkDir, signal: new AbortController().signal, scriptsDir: fixtures },
    );
    assert.deepEqual(evidence, { exitCode: 0 });
    const printed = JSON.parse(await readFile(join(checkDir, "stdout.log"), "utf8"));
    assert.deepEqual(printed.argv, ["--target", "T1", "--allow-disposable-mutations", "--output", join(checkDir, "evidence")]);
    assert.equal(printed.cdp, "http://127.0.0.1:5001");
  } finally {
    await rm(checkDir, { recursive: true, force: true });
  }
});

test("nonzero exit is a CheckFailure with the last stderr line", async () => {
  const checkDir = await mkdtemp(join(tmpdir(), "live-full-test-"));
  try {
    await assert.rejects(
      runFullEntry({ name: "bad", script: "exit-fail.ts", args: [] }, { cdpUrl: "http://x", targetId: "T1", checkDir, signal: new AbortController().signal, scriptsDir: fixtures }),
      (error: unknown) => error instanceof CheckFailure && error.message === "exit 3: boom",
    );
  } finally {
    await rm(checkDir, { recursive: true, force: true });
  }
});

test("abort signal kills the subprocess and is not a CheckFailure", async () => {
  const checkDir = await mkdtemp(join(tmpdir(), "live-full-test-"));
  const controller = new AbortController();
  try {
    const running = runFullEntry({ name: "hang", script: "hang.ts", args: [] }, { cdpUrl: "http://x", targetId: "T1", checkDir, signal: controller.signal, scriptsDir: fixtures });
    setTimeout(() => controller.abort(), 100);
    await assert.rejects(running, (error: unknown) => !(error instanceof CheckFailure));
  } finally {
    await rm(checkDir, { recursive: true, force: true });
  }
});

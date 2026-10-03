import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { analysisProviderFromEnv, inspectClaudeExecutable } from "./provider.ts";

const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-claude.ts");

test("Claude is the default analysis provider", () => {
  assert.equal(analysisProviderFromEnv({}), "claude");
  assert.equal(analysisProviderFromEnv({ PLASTICITY_ANALYSIS_PROVIDER: "codex" }), "codex");
  assert.equal(analysisProviderFromEnv({ PLASTICITY_ANALYSIS_PROVIDER: " None " }), "none");
});

test("an unknown provider name is rejected instead of silently falling back", () => {
  assert.throws(() => analysisProviderFromEnv({ PLASTICITY_ANALYSIS_PROVIDER: "openai" }), /PLASTICITY_ANALYSIS_PROVIDER/);
});

test("a working claude executable reports its version", async () => {
  assert.deepEqual(
    await inspectClaudeExecutable(process.execPath, [fixture, "--mode", "success", "--"]),
    { available: true, version: "9.9.9 (Claude Code)" },
  );
});

test("a missing, failing or foreign executable makes analysis unavailable with a reason", async () => {
  const missing = await inspectClaudeExecutable("/nonexistent/claude");
  assert.equal(missing.available, false);
  const failing = await inspectClaudeExecutable(process.execPath, [fixture, "--mode", "version-fails", "--"]);
  assert.equal(failing.available, false);
  const foreign = await inspectClaudeExecutable(process.execPath, [fixture, "--mode", "not-claude", "--"]);
  assert.deepEqual(foreign, { available: false, reason: "Not a Claude Code executable: codex-cli 0.1.0" });
});

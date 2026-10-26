import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ToolError } from "./harness.ts";
import { projectRoot, serverEnvironment, startMcp } from "./mcp.ts";

test("serverEnvironment pins the CDP endpoint, state roots and disables analysis", () => {
  const env = serverEnvironment({ PATH: "/bin", HOME: "/h", SECRET_TOKEN: "x" }, { cdpUrl: "http://127.0.0.1:5001", stateDir: "/s" });
  assert.equal(env.PLASTICITY_CDP_URL, "http://127.0.0.1:5001");
  assert.equal(env.PLASTICITY_ANALYSIS_PROVIDER, "none");
  assert.equal(env.PLASTICITY_MCP_STATE_DIR, "/s/ownership");
  assert.equal(env.PATH, "/bin");
  assert.equal(env.SECRET_TOKEN, undefined);
});

test("startMcp talks to a real stdio server and maps tool errors", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "live-mcp-test-"));
  const mcp = await startMcp({
    cdpUrl: "http://127.0.0.1:5001",
    stateDir,
    serverScript: join(projectRoot, "scripts", "live", "fixtures", "fake-mcp-server.ts"),
  });
  try {
    assert.deepEqual(await mcp.call("echo_env", { key: "PLASTICITY_CDP_URL" }), { value: "http://127.0.0.1:5001" });
    await assert.rejects(mcp.call("always_fails", {}), (error: unknown) => error instanceof ToolError && /boom/.test(error.message));
  } finally {
    await mcp.close();
    await rm(stateDir, { recursive: true, force: true });
  }
});

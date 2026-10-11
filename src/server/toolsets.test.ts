import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";

import type { PlasticityOperations } from "../plasticity/operations/index.ts";
import { createCompactServer, type SessionLike } from "./index.ts";
import { TOOLSET_REGISTRATIONS } from "./tools/registry.ts";
import { TOOLSETS } from "./toolsets.ts";

const fakeSession = () => ({
  async windows() { return []; },
  async connect() { return {}; },
  get() { return {} as PlasticityOperations; },
  capabilities() { return { bindings: [], operations: { constructionPlanes: { available: false, reason: "t" }, activeWorkplane: { available: false, reason: "t" } } }; },
  async captureSnapshot() { return {}; },
  async changesSince() { return {}; },
  async waitForChange() { return {}; },
}) as unknown as SessionLike;

const text = (response: unknown) => (response as { content: Array<{ text: string }> }).content[0]!.text;

test("toolset metadata matches the tool domain files", () => {
  const files = readdirSync(fileURLToPath(new URL("./tools/", import.meta.url)))
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "registry.ts")
    .map((name) => name.replace(/\.ts$/, "")).sort();
  assert.deepEqual(TOOLSET_REGISTRATIONS.map(([name]) => name).sort(), files);
  assert.deepEqual(TOOLSETS.map((toolset) => toolset.name).sort(), [...files, "strength"].sort());
});

test("enabling a toolset shows its tools and notifies the client; disabling keeps core tools", async () => {
  const server = createCompactServer(fakeSession(), undefined, undefined, undefined, null);
  const client = new Client({ name: "toolsets-test", version: "1.0.0" });
  let notifications = 0;
  client.setNotificationHandler(ToolListChangedNotificationSchema, () => { notifications += 1; });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const before = (await client.listTools()).tools.map((tool) => tool.name);
  assert.equal(before[0], "plasticity_call");
  assert.ok(before.includes("plasticity_toolsets") && before.includes("plasticity_enable_toolset"));
  assert.equal(before.includes("plasticity_create_box"), false);

  const rows = JSON.parse(text(await client.callTool({ name: "plasticity_toolsets", arguments: {} })));
  const solids = rows.find((row: { name: string }) => row.name === "solids");
  assert.equal(solids.enabled, false);
  assert.ok(solids.toolCount > 0 && solids.approxTokens > 0);

  const enabled = JSON.parse(text(await client.callTool({ name: "plasticity_enable_toolset", arguments: { name: "solids" } })));
  assert.equal(enabled.enabled, true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(notifications > 0);
  const after = (await client.listTools()).tools.map((tool) => tool.name);
  assert.ok(after.includes("plasticity_create_box"));

  await client.callTool({ name: "plasticity_enable_toolset", arguments: { name: "session", enabled: false } });
  const core = (await client.listTools()).tools.map((tool) => tool.name);
  assert.ok(core.includes("plasticity_connect") && core.includes("plasticity_status"));

  const unknown = await client.callTool({ name: "plasticity_enable_toolset", arguments: { name: "nope" } });
  assert.equal(unknown.isError, true);
  assert.match(text(unknown), /Unknown toolset nope. Available: session/);
});

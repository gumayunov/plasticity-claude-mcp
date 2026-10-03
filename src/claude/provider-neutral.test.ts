import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { AnalysisClient } from "../codex/analysis-client.ts";
import type { ReferenceSearchClient } from "../codex/reference-search-client.ts";
import { createServer, strengthDependenciesForSession, type SessionLike } from "../server.ts";
import { StrengthStore } from "../strength/store.ts";

const fakeSession = {
  async windows() { return []; },
  async connect() { return {}; },
  get() { throw new Error("not connected"); },
  capabilities() {
    return {
      bindings: [],
      operations: {
        constructionPlanes: { available: false, reason: "test" },
        activeWorkplane: { available: false, reason: "test" },
      },
    };
  },
  async captureSnapshot() { return {}; },
  async changesSince() { return {}; },
  async waitForChange() { return {}; },
} satisfies SessionLike;

test("nothing the model reads names a specific analysis vendor", async (context) => {
  const client = await connect(context, createServer(fakeSession));
  const texts: [string, string][] = [["instructions", client.getInstructions() ?? ""]];
  for (const tool of (await client.listTools()).tools) texts.push([`tool ${tool.name}`, tool.description ?? ""]);
  for (const prompt of (await client.listPrompts()).prompts) {
    texts.push([`prompt ${prompt.name}`, prompt.description ?? ""]);
    const args = Object.fromEntries((prompt.arguments ?? []).map((argument) => [argument.name, argument.name === "defaultUnits" ? "mm" : "x"]));
    for (const message of (await client.getPrompt({ name: prompt.name, arguments: args })).messages) {
      if (message.content.type === "text") texts.push([`prompt ${prompt.name} message`, message.content.text]);
    }
  }
  for (const resource of (await client.listResources()).resources) {
    for (const content of (await client.readResource({ uri: resource.uri })).contents) {
      if ("text" in content) texts.push([`resource ${resource.uri}`, content.text]);
    }
  }
  const offenders = texts.filter(([, text]) => /\bCodex\b/.test(text)).map(([where]) => where);
  assert.deepEqual(offenders, []);
});

test("status tools report which provider runs analysis and search", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "plasticity-provider-status-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const strength = strengthDependenciesForSession(fakeSession, {
    store: new StrengthStore(root),
    analysis: { close: async () => undefined } as unknown as AnalysisClient,
    analysisProvider: "claude",
    referenceSearch: { close: async () => undefined } as unknown as ReferenceSearchClient,
    referenceSearchTransport: "claude -p with WebSearch and WebFetch",
  });
  const client = await connect(context, createServer(fakeSession, strength));
  const methods = JSON.parse(text(await client.callTool({ name: "plasticity_strength_methods", arguments: {} }))) as { analysis: unknown };
  assert.deepEqual(methods.analysis, { available: true, provider: "claude" });
  const search = JSON.parse(text(await client.callTool({ name: "plasticity_reference_search_status", arguments: {} })));
  assert.deepEqual(search, { available: true, transport: "claude -p with WebSearch and WebFetch", autoImport: false });
});

test("a server without an analysis launcher explains it without naming a vendor", async (context) => {
  const client = await connect(context, createServer(fakeSession));
  const methods = JSON.parse(text(await client.callTool({ name: "plasticity_strength_methods", arguments: {} }))) as { analysis: { available: boolean; reason: string } };
  assert.equal(methods.analysis.available, false);
  assert.doesNotMatch(methods.analysis.reason, /Codex/);
});

async function connect(context: test.TestContext, server: ReturnType<typeof createServer>): Promise<Client> {
  const client = new Client({ name: "neutral-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  context.after(async () => {
    await client.close();
    await server.close();
  });
  return client;
}

function text(response: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = response.content as Array<{ type: string; text?: string }>;
  return content.filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n");
}

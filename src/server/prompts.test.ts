import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { PlasticityOperations } from "../plasticity/operations/index.ts";
import { createServer, type SessionLike } from "./index.ts";
import { loadPrompts, parsePromptFile, renderPrompt } from "./prompts.ts";

const sample = `---
name: plasticity_demo
description: Demo prompt.
arguments:
  - name: part
    description: What to build.
    required: true
  - name: material
    description: Optional material.
---
Build {{part}} from {{material}}.`;

test("parses front matter and renders arguments", () => {
  const prompt = parsePromptFile(sample, "demo.md");
  assert.equal(prompt.name, "plasticity_demo");
  assert.deepEqual(prompt.arguments, [
    { name: "part", description: "What to build.", required: true },
    { name: "material", description: "Optional material.", required: false },
  ]);
  assert.equal(renderPrompt(prompt, { part: "a bracket" }), "Build a bracket from not specified.");
});

test("unknown placeholders and broken headers are rejected", () => {
  assert.throws(() => parsePromptFile(sample.replace("{{material}}", "{{color}}"), "demo.md"), /unknown placeholders color/);
  assert.throws(() => parsePromptFile("no header", "x.md"), /missing front matter/);
});

test("shipped prompts load, are registered and mention only real tools", async () => {
  const prompts = loadPrompts();
  assert.deepEqual(prompts.map((prompt) => prompt.name).sort(), ["plasticity_enclosure", "plasticity_inspect", "plasticity_modify_part", "plasticity_new_part", "plasticity_prepare_print"]);
  const session = {
    async windows() { return []; }, async connect() { return {}; }, get() { return {} as PlasticityOperations; },
    capabilities() { return { bindings: [], operations: { constructionPlanes: { available: false, reason: "t" }, activeWorkplane: { available: false, reason: "t" } } }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } as unknown as SessionLike;
  const server = createServer(session, undefined, undefined, undefined, null);
  const client = new Client({ name: "prompts-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const tools = new Set((await client.listTools()).tools.map((tool) => tool.name));
  const listed = (await client.listPrompts()).prompts.map((prompt) => prompt.name);
  for (const prompt of prompts) {
    assert.ok(listed.includes(prompt.name), prompt.name);
    for (const [mention] of prompt.template.matchAll(/plasticity_[a-z0-9_]+/g)) {
      assert.ok(tools.has(mention) || listed.includes(mention), `${prompt.name} mentions unknown ${mention}`);
    }
  }
  assert.ok(listed.includes("plasticity_model_from_reference"));
  const rendered = await client.getPrompt({ name: "plasticity_inspect", arguments: { question: "How thick is the wall?" } });
  assert.match((rendered.messages[0]!.content as { text: string }).text, /How thick is the wall\?/);
});

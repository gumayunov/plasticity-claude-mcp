import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { referenceSearchOutputJsonSchema } from "../codex/reference-search-client.ts";
import { createClaudeReferenceSearchClient } from "./reference-search-client.ts";

const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "fake-claude.ts");
const PAGE = "https://www.example-maker.com/products/hfs5-2020";
const ASSET = "https://cdn.example-maker.com/cad/hfs5-2020.step";

test("search runs claude with only WebSearch and WebFetch and the shared output schema", async (context) => {
  const harness = await createHarness(context, "success");
  const client = harness.client({ model: "sonnet" });
  await client.search({ query: "HFS5-2020 STEP", allowedDomains: [], limit: 5 }, { timeoutMs: 5_000 });
  const argv = await recordedArgv(harness.record);
  assert.deepEqual(values(argv, "--tools"), ["WebSearch", "WebFetch"]);
  assert.deepEqual(values(argv, "--allowedTools"), ["WebSearch", "WebFetch"]);
  assert.deepEqual(JSON.parse(values(argv, "--json-schema")[0]!), referenceSearchOutputJsonSchema());
  assert.ok(argv.includes("--strict-mcp-config"));
  assert.equal(values(argv, "--setting-sources")[0], "");
  assert.equal(values(argv, "--model")[0], "sonnet");
  await client.close();
});

test("allowed domains limit WebFetch permissions to the domains and their subdomains", async (context) => {
  const harness = await createHarness(context, "success");
  const client = harness.client();
  await client.search({ query: "HFS5-2020 STEP", allowedDomains: ["Example-Maker.com"], limit: 5 }, { timeoutMs: 5_000 });
  const argv = await recordedArgv(harness.record);
  assert.deepEqual(values(argv, "--allowedTools"), ["WebSearch", "WebFetch(domain:example-maker.com)", "WebFetch(domain:*.example-maker.com)"]);
  assert.match((await lines(harness.record)).find((line) => line.startsWith("prompt="))!, /example-maker\.com/);
  await client.close();
});

test("only URLs seen in successful search or fetch results survive", async (context) => {
  const harness = await createHarness(context, "success");
  const client = harness.client();
  const result = await client.search({ query: "HFS5-2020 STEP", allowedDomains: [], limit: 5 }, { timeoutMs: 5_000 });
  assert.equal(result.candidates[0]!.url, PAGE);
  assert.deepEqual(result.candidates[0]!.assets.map((asset) => asset.url), [ASSET]);
  assert.ok(result.limitations.some((note) => /1 unverified direct asset URL was omitted/.test(note)));
  await client.close();
});

test("candidates outside the allowed domains are dropped with a note", async (context) => {
  const harness = await createHarness(context, "success");
  const client = harness.client();
  const result = await client.search({ query: "HFS5-2020 STEP", allowedDomains: ["example-maker.com"], limit: 5 }, { timeoutMs: 5_000 });
  assert.deepEqual(result.candidates.map((candidate) => candidate.url), [PAGE]);
  assert.ok(result.limitations.some((note) => /outside the allowed domains/.test(note)));
  await client.close();
});

test("a candidate page absent from search results rejects the whole answer", async (context) => {
  const harness = await createHarness(context, "search-unverified-page");
  const client = harness.client();
  await assert.rejects(
    () => client.search({ query: "HFS5-2020 STEP", allowedDomains: [], limit: 5 }, { timeoutMs: 5_000 }),
    (error: unknown) => hasCode(error, "UNVERIFIED_SEARCH_URL"),
  );
  await client.close();
});

test("an answer without any web search is not accepted", async (context) => {
  const harness = await createHarness(context, "search-not-performed");
  const client = harness.client();
  await assert.rejects(
    () => client.search({ query: "HFS5-2020 STEP", allowedDomains: [], limit: 5 }, { timeoutMs: 5_000 }),
    (error: unknown) => hasCode(error, "SEARCH_NOT_PERFORMED"),
  );
  await client.close();
});

test("tools beyond web search and fetch are forbidden", async (context) => {
  const harness = await createHarness(context, "forbidden");
  const client = harness.client();
  await assert.rejects(
    () => client.search({ query: "HFS5-2020 STEP", allowedDomains: [], limit: 5 }, { timeoutMs: 5_000 }),
    (error: unknown) => hasCode(error, "FORBIDDEN_CAPABILITY_REQUEST"),
  );
  await client.close();
});

test("timeouts are reported as search timeouts", async (context) => {
  const harness = await createHarness(context, "stall");
  const client = harness.client();
  await assert.rejects(
    () => client.search({ query: "HFS5-2020 STEP", allowedDomains: [], limit: 5 }, { timeoutMs: 1_000 }),
    (error: unknown) => hasCode(error, "SEARCH_TIMEOUT"),
  );
  await client.close();
});

async function createHarness(context: test.TestContext, mode: string) {
  const root = await mkdtemp(join(tmpdir(), "plasticity-claude-search-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const record = join(root, "record.log");
  return {
    record,
    client: (options: { model?: string } = {}) => createClaudeReferenceSearchClient({
      executable: process.execPath,
      executableArgs: [fixture, "--mode", mode, "--record", record, "--exit-record", join(root, "exit.log"), "--"],
      cwd: root,
      ...options,
    }),
  };
}

async function recordedArgv(path: string): Promise<string[]> {
  return JSON.parse((await lines(path)).find((line) => line.startsWith("argv="))!.slice(5)) as string[];
}

/** Values following a variadic flag, up to the next flag. */
function values(argv: string[], name: string): string[] {
  const start = argv.indexOf(name);
  if (start < 0) return [];
  const result: string[] = [];
  for (const value of argv.slice(start + 1)) {
    if (value.startsWith("--")) break;
    result.push(value);
  }
  return result;
}

async function lines(path: string): Promise<string[]> {
  try { return (await readFile(path, "utf8")).trim().split("\n").filter(Boolean); } catch { return []; }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

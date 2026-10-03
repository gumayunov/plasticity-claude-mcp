#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

// Stands in for `claude -p --input-format stream-json --output-format stream-json`.
// Usage: node fake-claude.ts --mode <mode> --record <file> --exit-record <file> -- <claude argv...>
const separator = process.argv.indexOf("--");
const own = parseArgs(process.argv.slice(2, separator < 0 ? undefined : separator));
const claudeArgv = separator < 0 ? [] : process.argv.slice(separator + 1);

process.on("SIGTERM", () => process.exit(0));
process.on("exit", () => {
  if (own.exitRecord) writeFileSync(own.exitRecord, "exited\n", { flag: "a" });
});

if (claudeArgv[0] === "--version") {
  process.stdout.write(own.mode === "not-claude" ? "codex-cli 0.1.0\n" : "9.9.9 (Claude Code)\n");
  process.exit(own.mode === "version-fails" ? 3 : 0);
}

record(`argv=${JSON.stringify(claudeArgv)}`);
record(`env=${JSON.stringify(Object.keys(process.env).sort())}`);

const lines = createInterface({ input: process.stdin });
lines.once("line", (line) => {
  const message = JSON.parse(line) as { message?: { content?: Array<Record<string, unknown>> } };
  const content = message.message?.content ?? [];
  const text = content.find((item) => item.type === "text")?.text;
  record(`prompt=${JSON.stringify(text ?? "")}`);
  const images = content.filter((item) => item.type === "image").map((item) => item.source as { media_type: string; data: string });
  record(`images=${JSON.stringify(images.map((image) => ({
    mediaType: image.media_type,
    sha256: createHash("sha256").update(Buffer.from(image.data, "base64")).digest("hex"),
  })))}`);
  if (String(text ?? "").includes("CAD or reliable dimensional candidates")) respondSearch();
  else respond(String(text ?? "").includes('"analysisMode":"design-reference"'));
});

function respond(designReference: boolean): void {
  emit({ type: "system", subtype: "init", tools: ["StructuredOutput"], mcp_servers: [], model: "claude-test" });
  const output = designReference ? designOutput() : strengthOutput();
  switch (own.mode) {
    case "success":
      emit({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "StructuredOutput", input: output }] } });
      emit({ type: "result", subtype: "success", is_error: false, structured_output: output, result: JSON.stringify(output) });
      return;
    case "unknown-field":
      emit({ type: "result", subtype: "success", is_error: false, structured_output: { ...output, shellCommand: "rm -rf /" } });
      return;
    case "missing-output":
      emit({ type: "result", subtype: "success", is_error: false, result: "I cannot comply." });
      return;
    case "forbidden":
      emit({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } }] } });
      emit({ type: "result", subtype: "success", is_error: false, structured_output: output });
      return;
    case "api-error":
      emit({
        type: "result", subtype: "success", is_error: true,
        result: 'API Error: 429 {"type":"error","error":{"type":"rate_limit_error","message":"Rate limited for /Users/example api_key=secret"}}',
      });
      return;
    case "crash":
      process.stderr.write("fatal: synthetic crash\n");
      process.exit(7);
      return;
    case "stall":
      setInterval(() => undefined, 1_000);
      return;
    default:
      throw new Error(`unknown mode ${own.mode}`);
  }
}

const PAGE = "https://www.example-maker.com/products/hfs5-2020";
const ASSET = "https://cdn.example-maker.com/cad/hfs5-2020.step";
const GUESSED = "https://www.example-maker.com/cad/guessed.step";

function respondSearch(): void {
  emit({ type: "system", subtype: "init", tools: ["WebSearch", "WebFetch", "StructuredOutput"], mcp_servers: [], model: "claude-test" });
  if (own.mode === "stall") {
    setInterval(() => undefined, 1_000);
    return;
  }
  if (own.mode === "forbidden") {
    emit({ type: "assistant", message: { content: [{ type: "tool_use", id: "t0", name: "Bash", input: { command: "curl" } }] } });
  }
  if (own.mode !== "search-not-performed") {
    emit({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "WebSearch", input: { query: "hfs5-2020 step" } }] } });
    emit({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "t1", content: `Links: [{"title":"HFS5-2020","url":"${PAGE}"},{"title":"Other","url":"https://other.example.org/hfs5"}]` }] },
      tool_use_result: { query: "hfs5-2020 step", results: [{ content: [{ title: "HFS5-2020", url: PAGE }] }] },
    });
    emit({ type: "assistant", message: { content: [{ type: "tool_use", id: "t2", name: "WebFetch", input: { url: PAGE, prompt: "links" } }] } });
    emit({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "t2", content: `CAD download: ${ASSET}` }] },
      tool_use_result: { code: 200, codeText: "OK", url: PAGE, result: `CAD download: ${ASSET}` },
    });
    emit({ type: "assistant", message: { content: [{ type: "tool_use", id: "t3", name: "WebFetch", input: { url: GUESSED, prompt: "links" } }] } });
    emit({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "t3", content: "The server returned HTTP 404 Not Found." }] },
      tool_use_result: { code: 404, codeText: "Not Found", url: GUESSED, result: "The server returned HTTP 404 Not Found." },
    });
  }
  const candidate = (url: string, assets: string[]) => ({
    title: "HFS5-2020 extrusion", url, sourceKind: "manufacturer", summary: "Product page with CAD download.",
    licenseStatus: "unknown", accessStatus: "free", dimensionEvidence: ["20 x 20 mm profile"],
    assets: assets.map((asset) => ({ url: asset, format: "step", kind: "editable-cad", evidence: "Download link on product page" })),
  });
  const candidates = own.mode === "search-unverified-page"
    ? [candidate("https://www.example-maker.com/invented", [])]
    : [candidate(PAGE, [ASSET, GUESSED]), candidate("https://other.example.org/hfs5", [])];
  const output = { query: "hfs5-2020 step", candidates, limitations: [] };
  emit({ type: "result", subtype: "success", is_error: false, structured_output: output });
}

function strengthOutput(): Record<string, unknown> {
  return {
    observations: [],
    proposedMethod: "cantilever-tip-rectangle-v1",
    questions: [{ id: "q1", question: "How long is the arm?", resolves: ["lengthMm"], reason: "Bending moment depends on it." }],
    unsupportedConditions: [],
    designInterpretation: null,
  };
}

function designOutput(): Record<string, unknown> {
  return {
    observations: [{
      id: "obs-mount", label: "Two mounting holes on the base", status: "derived", unit: null, value: null, range: null,
      sourceUrl: null, sourceHash: null, sourceLocator: null, sourceImageIndices: [], dependsOn: [], derivation: null,
    }],
    proposedMethod: null,
    questions: [{ id: "q1", question: "What does the bracket hold?", resolves: ["load"], reason: "Load path is unknown." }],
    unsupportedConditions: [],
    designInterpretation: {
      articleType: "Bracket",
      functionalIntent: "Holds a rod",
      scaleStatus: "unscaled",
      interfaces: [{ id: "if-1", kind: "mounting", description: "Bolted base", confidence: "probable", evidenceIds: ["obs-mount"] }],
      featureCandidates: [],
    },
  };
}

function emit(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function record(line: string): void {
  if (own.record) appendFileSync(own.record, `${line}\n`);
}

function parseArgs(args: string[]): { mode: string; record?: string; exitRecord?: string } {
  const result: { mode: string; record?: string; exitRecord?: string } = { mode: "success" };
  for (let index = 0; index < args.length; index += 2) {
    const value = args[index + 1]!;
    if (args[index] === "--mode") result.mode = value;
    if (args[index] === "--record") result.record = value;
    if (args[index] === "--exit-record") result.exitRecord = value;
  }
  return result;
}

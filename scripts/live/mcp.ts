import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

import { parseToolResult } from "./harness.ts";
import type { McpCaller } from "./types.ts";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const PASSTHROUGH_ENV = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"];
const TOOL_TIMEOUT_MS = 300_000;

export interface StartMcpOptions {
  cdpUrl: string;
  stateDir: string;
  serverScript?: string;
}

export function serverEnvironment(source: NodeJS.ProcessEnv, options: StartMcpOptions): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of PASSTHROUGH_ENV) {
    const value = source[key];
    if (value !== undefined) env[key] = value;
  }
  return {
    ...env,
    PLASTICITY_CDP_URL: options.cdpUrl,
    PLASTICITY_ANALYSIS_PROVIDER: "none",
    PLASTICITY_MCP_STATE_DIR: join(options.stateDir, "ownership"),
    PLASTICITY_STRENGTH_ROOT: join(options.stateDir, "strength"),
    PLASTICITY_CONSTRUCTION_HISTORY_ROOT: join(options.stateDir, "construction-history"),
    PLASTICITY_REFERENCE_ROOT: join(options.stateDir, "references"),
    PLASTICITY_REFERENCE_ARTIFACT_ROOT: join(options.stateDir, "reference-artifacts"),
  };
}

export async function startMcp(options: StartMcpOptions): Promise<McpCaller> {
  const env = serverEnvironment(process.env, options);
  for (const key of ["PLASTICITY_MCP_STATE_DIR", "PLASTICITY_STRENGTH_ROOT", "PLASTICITY_CONSTRUCTION_HISTORY_ROOT", "PLASTICITY_REFERENCE_ROOT", "PLASTICITY_REFERENCE_ARTIFACT_ROOT"]) {
    await mkdir(env[key]!, { recursive: true });
  }
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [options.serverScript ?? join(projectRoot, "scripts", "run-server.ts")],
    cwd: projectRoot,
    env,
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-16_384); });
  const client = new Client({ name: "plasticity-live-harness", version: "1.0.0" });
  await client.connect(transport);
  return {
    async call(tool, args) {
      const response = await client.callTool({ name: tool, arguments: args }, CallToolResultSchema, { timeout: TOOL_TIMEOUT_MS });
      return parseToolResult(tool, response);
    },
    async close() { await client.close(); },
    stderrTail() { return stderr; },
  };
}

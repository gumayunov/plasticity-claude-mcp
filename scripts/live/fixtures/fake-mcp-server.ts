import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "fake-plasticity", version: "1.0.0" });

server.registerTool("echo_env", { description: "Echo one environment variable", inputSchema: { key: z.string() } }, async ({ key }) => ({
  content: [{ type: "text", text: JSON.stringify({ value: process.env[key] ?? null }) }],
}));

server.registerTool("always_fails", { description: "Return a tool error", inputSchema: {} }, async () => ({
  isError: true,
  content: [{ type: "text", text: "boom" }],
}));

await server.connect(new StdioServerTransport());

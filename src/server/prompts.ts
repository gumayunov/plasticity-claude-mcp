import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface PromptArgument { name: string; description: string; required: boolean }
export interface PromptDefinition { name: string; description: string; arguments: PromptArgument[]; template: string }

const PROMPTS_DIRECTORY = fileURLToPath(new URL("../prompts/", import.meta.url));

export function parsePromptFile(text: string, source: string): PromptDefinition {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`${source}: missing front matter`);
  let name = "";
  let description = "";
  const args: PromptArgument[] = [];
  let current: PromptArgument | undefined;
  for (const line of match[1]!.split("\n")) {
    let found: RegExpExecArray | null;
    if ((found = /^name:\s*(.+)$/.exec(line))) name = found[1]!.trim();
    else if ((found = /^description:\s*(.+)$/.exec(line))) description = found[1]!.trim();
    else if (/^arguments:\s*$/.test(line)) continue;
    else if ((found = /^\s+-\s+name:\s*(.+)$/.exec(line))) {
      current = { name: found[1]!.trim(), description: "", required: false };
      args.push(current);
    } else if ((found = /^\s+description:\s*(.+)$/.exec(line)) && current) current.description = found[1]!.trim();
    else if ((found = /^\s+required:\s*(true|false)$/.exec(line)) && current) current.required = found[1] === "true";
    else if (line.trim()) throw new Error(`${source}: unexpected front matter line: ${line}`);
  }
  if (!name || !description) throw new Error(`${source}: name and description are required`);
  const template = match[2]!.trim();
  const known = new Set(args.map((argument) => argument.name));
  const unknown = [...new Set([...template.matchAll(/\{\{(\w+)\}\}/g)].map((placeholder) => placeholder[1]!))].filter((placeholder) => !known.has(placeholder));
  if (unknown.length > 0) throw new Error(`${source}: unknown placeholders ${unknown.join(", ")}`);
  return { name, description, arguments: args, template };
}

export function renderPrompt(prompt: PromptDefinition, values: Readonly<Record<string, string | undefined>>): string {
  return prompt.template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values[name]?.trim() || "not specified");
}

export function loadPrompts(directory = PROMPTS_DIRECTORY): PromptDefinition[] {
  return readdirSync(directory).filter((file) => file.endsWith(".md")).sort()
    .map((file) => parsePromptFile(readFileSync(join(directory, file), "utf8"), file));
}

export function registerPrompts(server: McpServer, prompts: readonly PromptDefinition[]): void {
  for (const prompt of prompts) {
    const argsSchema = Object.fromEntries(prompt.arguments.map((argument) => [
      argument.name,
      argument.required ? z.string().min(1).describe(argument.description) : z.string().optional().describe(argument.description),
    ]));
    server.registerPrompt(prompt.name, { description: prompt.description, argsSchema }, ((values: Record<string, string | undefined>) => ({
      messages: [{ role: "user" as const, content: { type: "text" as const, text: renderPrompt(prompt, values) } }],
    })) as never);
  }
}

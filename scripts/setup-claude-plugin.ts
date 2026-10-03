import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// Installs the Claude Code plugin from this checkout: the local marketplace in
// .claude-plugin/ and the plasticity plugin it lists. The plugin's launcher
// starts the server from the path recorded in ~/.plasticity-mcp/repository.
const root = await realpath(resolve(import.meta.dirname, ".."));
const home = join(homedir(), ".plasticity-mcp");
const marketplace = "plasticity";
const pluginId = `plasticity@${marketplace}`;

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Node.js 24 or newer is required");
await mkdir(home, { recursive: true, mode: 0o700 });
await chmod(home, 0o700);
await writePrivate("repository", `${root}\n`);

const marketplaces = claudeJson<Array<{ name: string }>>(["plugin", "marketplace", "list", "--json"]);
if (marketplaces.some((entry) => entry.name === marketplace)) claude(["plugin", "marketplace", "update", marketplace]);
else claude(["plugin", "marketplace", "add", root]);

const manifest = JSON.parse(await readFile(join(root, "plugins", "plasticity-claude", ".claude-plugin", "plugin.json"), "utf8")) as { version: string };
const installed = claudeJson<Array<{ id?: string; version?: string }>>(["plugin", "list", "--json"]).find((entry) => entry.id === pluginId);
if (!installed) claude(["plugin", "install", pluginId]);
else if (installed.version !== manifest.version) claude(["plugin", "update", pluginId]);

process.stdout.write(`Plasticity plugin ${manifest.version} is installed in Claude Code from ${root}. Restart Claude Code to load it.\n`);

async function writePrivate(name: string, value: string): Promise<void> {
  const destination = join(home, name);
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, value, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, destination);
}

function claude(args: string[]): string {
  return execFileSync("claude", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function claudeJson<T>(args: string[]): T {
  return JSON.parse(claude(args)) as T;
}

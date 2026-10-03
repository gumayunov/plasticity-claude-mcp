// Starts the Plasticity MCP server from the repository checkout recorded by
// `npm run setup:claude`. The plugin cache holds only this launcher; the server,
// node_modules and the FEM Python environment stay in the checkout. When the
// checkout has a mise.toml and mise is installed, the server runs under
// `mise exec` so its [env] (FEM Python, trusted image roots) applies.
import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const root = repositoryRoot();
if (!root) {
  process.stderr.write("Plasticity MCP could not start: the repository checkout is not configured.\nRun npm run setup:claude in the plasticity-mcp repository and restart Claude Code.\n");
  process.exit(1);
}

const server = ["scripts/run-server.ts", "--compact-tools"];
const mise = existsSync(join(root, "mise.toml")) ? findExecutable("mise") : undefined;
const [command, args] = mise
  ? [mise, ["exec", "-C", root, "--", "node", ...server]]
  : [process.execPath, server];
const child = spawn(command, args, { cwd: root, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  process.stderr.write(`Plasticity MCP could not start: ${error.message}\n`);
  process.exit(1);
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 128 : 1)));

function repositoryRoot() {
  const fromEnv = process.env.PLASTICITY_MCP_REPOSITORY?.trim();
  if (fromEnv) return fromEnv;
  try {
    return readFileSync(join(homedir(), ".plasticity-mcp", "repository"), "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

function findExecutable(name) {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not in this PATH entry.
    }
  }
  return undefined;
}

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const pluginRoot = join(root, "plugins", "plasticity-claude");
const launcher = join(pluginRoot, "scripts", "launcher.mjs");

test("marketplace and plugin manifests agree with the package version", async () => {
  const pkg = await json<{ version: string }>(join(root, "package.json"));
  const marketplace = await json<{ name: string; plugins: { name: string; source: string; version: string }[] }>(join(root, ".claude-plugin", "marketplace.json"));
  const plugin = await json<{ name: string; version: string }>(join(pluginRoot, ".claude-plugin", "plugin.json"));
  assert.equal(marketplace.name, "plasticity");
  assert.deepEqual(marketplace.plugins.map((entry) => [entry.name, entry.source, entry.version]), [["plasticity", "./plugins/plasticity-claude", pkg.version]]);
  assert.equal(plugin.name, "plasticity");
  assert.equal(plugin.version, pkg.version);
});

test("the plugin starts only the Plasticity server through its launcher", async () => {
  const config = await json<{ mcpServers: Record<string, { command: string; args: string[] }> }>(join(pluginRoot, ".mcp.json"));
  assert.deepEqual(Object.keys(config.mcpServers), ["plasticity"]);
  assert.deepEqual(config.mcpServers.plasticity, { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/scripts/launcher.mjs"] });
});

test("every skill has frontmatter naming its directory and a description", async () => {
  const skillsDir = join(pluginRoot, "skills");
  const skills = await readdir(skillsDir);
  assert.ok(skills.length > 0);
  for (const skill of skills) {
    const text = await readFile(join(skillsDir, skill, "SKILL.md"), "utf8");
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1];
    assert.ok(frontmatter, `${skill} has no frontmatter`);
    assert.match(frontmatter, new RegExp(`^name: ${skill}$`, "m"));
    assert.match(frontmatter, /^description: \S.{20,}$/m);
    assert.doesNotMatch(text, /Codex/, `${skill} mentions Codex`);
  }
});

test("skills name only operations the server registers", async () => {
  const registered = new Set<string>();
  for (const file of await sourceFiles(join(root, "src"))) {
    for (const match of (await readFile(file, "utf8")).matchAll(/"(plasticity_[a-z0-9_]+)"/g)) registered.add(match[1]!);
  }
  const skillsDir = join(pluginRoot, "skills");
  for (const skill of await readdir(skillsDir)) {
    const text = await readFile(join(skillsDir, skill, "SKILL.md"), "utf8");
    for (const [name] of text.matchAll(/plasticity_[a-z0-9_]*[a-z0-9]\b/g)) {
      assert.ok(registered.has(name), `${skill} names unknown operation ${name}`);
    }
  }
});

test("the launcher runs the server from the configured repository over stdio", async (context) => {
  const repository = await fakeRepository(context);
  const { stdout } = await runLauncher({ PLASTICITY_MCP_REPOSITORY: repository }, "ping\n");
  const reported = JSON.parse(stdout) as { cwd: string; argv: string[]; stdin: string };
  assert.equal(reported.cwd, await realpath(repository));
  assert.ok(reported.argv.includes("--compact-tools"));
  assert.equal(reported.stdin, "ping\n");
});

test("the launcher reads the repository path written by setup", async (context) => {
  const repository = await fakeRepository(context);
  const home = await mkdtemp(join(tmpdir(), "plasticity-home-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(join(home, ".plasticity-mcp"));
  await writeFile(join(home, ".plasticity-mcp", "repository"), `${repository}\n`);
  const { stdout } = await runLauncher({ HOME: home }, "");
  assert.equal((JSON.parse(stdout) as { cwd: string }).cwd, await realpath(repository));
});

test("without a configured repository the launcher fails with setup guidance", async (context) => {
  const home = await mkdtemp(join(tmpdir(), "plasticity-home-"));
  context.after(() => rm(home, { recursive: true, force: true }));
  await assert.rejects(() => runLauncher({ HOME: home }, ""), (error: unknown) => {
    const failure = error as { code?: number; stderr?: string };
    assert.equal(failure.code, 1);
    assert.match(failure.stderr ?? "", /npm run setup:claude/);
    return true;
  });
});

async function fakeRepository(context: test.TestContext): Promise<string> {
  const repository = await mkdtemp(join(tmpdir(), "plasticity-repo-"));
  context.after(() => rm(repository, { recursive: true, force: true }));
  await mkdir(join(repository, "scripts"));
  await writeFile(join(repository, "scripts", "run-server.ts"), `
let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { stdin += chunk; });
process.stdin.on("end", () => process.stdout.write(JSON.stringify({ cwd: process.cwd(), argv: process.argv.slice(2), stdin })));
`);
  return repository;
}

function runLauncher(env: Record<string, string>, stdin: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(process.execPath, [launcher], {
      encoding: "utf8",
      timeout: 10_000,
      // No mise on PATH: the launcher must fall back to plain node.
      env: { PATH: "/usr/bin:/bin", HOME: env.HOME ?? process.env.HOME ?? "", ...env },
    }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }));
      else resolvePromise({ stdout, stderr });
    });
    child.stdin?.end(stdin);
  });
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
    .map((entry) => join(entry.parentPath, entry.name));
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

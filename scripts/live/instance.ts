import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { PlasticityTarget } from "../../src/cdp/discovery.ts";
import { ensurePlasticityCdp } from "../../src/plasticity/launcher.ts";

const execFileAsync = promisify(execFile);

export interface InstanceDeps {
  launch(options: { rendererPort: number; inspectorPort: number; userDataDirectory: string }): Promise<PlasticityTarget[]>;
  freePort(excluded: ReadonlySet<number>): Promise<number>;
  makeTempDir(): Promise<string>;
  removeDir(path: string): Promise<void>;
  listProcesses(): Promise<Array<{ pid: number; command: string }>>;
  kill(pid: number, signal: NodeJS.Signals): void;
  isAlive(pid: number): boolean;
  sleep(milliseconds: number): Promise<void>;
}

export interface IsolatedInstance {
  cdpUrl: string;
  targetId: string;
  userDataDirectory: string;
  rendererPort: number;
  inspectorPort: number;
  stop(): Promise<void>;
}

export async function freeLoopbackPort(excluded: ReadonlySet<number>): Promise<number> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const server = createServer();
    const port = await new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Could not determine an ephemeral loopback port"));
          return;
        }
        resolve(address.port);
      });
    });
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (!excluded.has(port)) return port;
  }
  throw new Error("Could not allocate distinct loopback ports for isolated Plasticity");
}

export function parseProcessList(stdout: string): Array<{ pid: number; command: string }> {
  return stdout.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line);
    return match ? [{ pid: Number(match[1]), command: match[2]! }] : [];
  });
}

export function defaultInstanceDeps(): InstanceDeps {
  return {
    launch: (options) => ensurePlasticityCdp(options),
    freePort: freeLoopbackPort,
    makeTempDir: () => mkdtemp(join(tmpdir(), "plasticity-live-profile-")),
    removeDir: (path) => rm(path, { recursive: true, force: true }),
    async listProcesses() {
      const { stdout } = await execFileAsync("ps", ["-axo", "pid=,command="], { maxBuffer: 16 * 1024 * 1024 });
      return parseProcessList(stdout);
    },
    kill: (pid, signal) => { process.kill(pid, signal); },
    isAlive(pid) {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    },
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  };
}

// Matches the exact --user-data-dir token so a sibling profile path is never touched.
export async function terminateProfileProcesses(deps: InstanceDeps, directory: string, graceMs = 10_000): Promise<number[]> {
  const marker = `--user-data-dir=${directory}`;
  const pids = (await deps.listProcesses())
    .filter((entry) => entry.command.split(/\s+/).includes(marker))
    .map((entry) => entry.pid);
  for (const pid of pids) {
    try { deps.kill(pid, "SIGTERM"); } catch { /* already gone */ }
  }
  for (let waited = 0; waited < graceMs && pids.some((pid) => deps.isAlive(pid)); waited += 250) await deps.sleep(250);
  for (const pid of pids) {
    if (!deps.isAlive(pid)) continue;
    try { deps.kill(pid, "SIGKILL"); } catch { /* already gone */ }
  }
  return pids;
}

export async function startIsolatedInstance(deps: InstanceDeps = defaultInstanceDeps()): Promise<IsolatedInstance> {
  const userDataDirectory = await deps.makeTempDir();
  const rendererPort = await deps.freePort(new Set());
  const inspectorPort = await deps.freePort(new Set([rendererPort]));
  let stopping: Promise<void> | undefined;
  const stop = () => {
    stopping ??= (async () => {
      await terminateProfileProcesses(deps, userDataDirectory);
      await deps.removeDir(userDataDirectory);
    })();
    return stopping;
  };
  try {
    const targets = await deps.launch({ rendererPort, inspectorPort, userDataDirectory });
    const target = targets[0];
    if (!target) throw new Error("Isolated Plasticity exposed no renderer targets");
    return { cdpUrl: `http://127.0.0.1:${rendererPort}`, targetId: target.id, userDataDirectory, rendererPort, inspectorPort, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

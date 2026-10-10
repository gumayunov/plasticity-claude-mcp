import assert from "node:assert/strict";
import test from "node:test";

import { parseProcessList, startIsolatedInstance, terminateProfileProcesses, type InstanceDeps } from "./instance.ts";

const PROFILE = "/tmp/live-profile-x";

function fakeDeps(overrides: Partial<InstanceDeps> = {}) {
  const calls = {
    launched: [] as Array<{ rendererPort: number; inspectorPort: number; userDataDirectory: string }>,
    killed: [] as Array<[number, string]>,
    removed: [] as string[],
  };
  const alive = new Set<number>();
  const deps: InstanceDeps = {
    async launch(options) {
      calls.launched.push(options);
      alive.add(101);
      alive.add(102);
      return [{ id: "T1", title: "Plasticity", url: "file:///index.html", webSocketDebuggerUrl: "ws://127.0.0.1/x" }];
    },
    async freePort(excluded) { return excluded.size === 0 ? 50001 : 50002; },
    async makeTempDir() { return PROFILE; },
    async removeDir(path) { calls.removed.push(path); },
    async listProcesses() {
      return [
        { pid: 101, command: `/Applications/Plasticity.app/Contents/MacOS/Plasticity --inspect-brk=127.0.0.1:50002 --user-data-dir=${PROFILE}` },
        { pid: 102, command: `Plasticity Helper (Renderer) --type=renderer --user-data-dir=${PROFILE}` },
        { pid: 103, command: `/Applications/Plasticity.app/Contents/MacOS/Plasticity --user-data-dir=${PROFILE}y` },
        { pid: 200, command: "/Applications/Plasticity.app/Contents/MacOS/Plasticity" },
      ];
    },
    kill(pid, signal) {
      calls.killed.push([pid, signal]);
      if (signal === "SIGTERM" || signal === "SIGKILL") alive.delete(pid);
    },
    isAlive(pid) { return alive.has(pid); },
    async sleep() {},
    ...overrides,
  };
  return { deps, calls, alive };
}

test("launch gets a temporary profile and free ports, never the default 9223", async () => {
  const { deps, calls } = fakeDeps();
  const instance = await startIsolatedInstance(deps);
  assert.equal(instance.cdpUrl, "http://127.0.0.1:50001");
  assert.equal(instance.targetId, "T1");
  assert.deepEqual(calls.launched, [{ rendererPort: 50001, inspectorPort: 50002, userDataDirectory: PROFILE }]);
});

test("stop terminates only processes of this profile and removes it; stop is idempotent", async () => {
  const { deps, calls } = fakeDeps();
  const instance = await startIsolatedInstance(deps);
  await instance.stop();
  await instance.stop();
  assert.deepEqual(calls.killed, [[101, "SIGTERM"], [102, "SIGTERM"]]);
  assert.deepEqual(calls.removed, [PROFILE]);
});

test("SIGKILL when a process ignores SIGTERM", async () => {
  const { deps, calls, alive } = fakeDeps();
  alive.add(101);
  deps.kill = (pid, signal) => { calls.killed.push([pid, signal]); if (signal === "SIGKILL") alive.delete(pid); };
  await terminateProfileProcesses(deps, PROFILE, 1000);
  assert.deepEqual(calls.killed.filter(([, signal]) => signal === "SIGKILL").map(([pid]) => pid), [101]);
});

test("failed launch cleans up and rethrows", async () => {
  const { deps, calls } = fakeDeps({ async launch() { throw new Error("second instance refused"); } });
  await assert.rejects(startIsolatedInstance(deps), /second instance refused/);
  assert.deepEqual(calls.removed, [PROFILE]);
});

test("launch without renderer targets is an error", async () => {
  const { deps, calls } = fakeDeps({ async launch() { return []; } });
  await assert.rejects(startIsolatedInstance(deps), /no renderer targets/);
  assert.deepEqual(calls.removed, [PROFILE]);
});

test("parseProcessList reads ps output", () => {
  assert.deepEqual(parseProcessList("  101 /App --x\n 2 b c\n\n"), [{ pid: 101, command: "/App --x" }, { pid: 2, command: "b c" }]);
});

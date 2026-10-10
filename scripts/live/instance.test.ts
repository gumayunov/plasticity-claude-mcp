import assert from "node:assert/strict";
import test from "node:test";

import { foreignMainPids, parseProcessList, startIsolatedInstance, terminateProfileProcesses, type InstanceDeps } from "./instance.ts";

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
  assert.deepEqual(calls.killed, [[101, "SIGKILL"], [102, "SIGKILL"]]);
  assert.deepEqual(calls.removed, [PROFILE]);
});

test("throwaway instances are killed at once, so Plasticity cannot block on its save-before-closing dialog", async () => {
  const { deps, calls } = fakeDeps();
  let slept = 0;
  deps.sleep = async () => { slept += 1; };
  await terminateProfileProcesses(deps, PROFILE);
  assert.deepEqual(calls.killed.map(([, signal]) => signal), ["SIGKILL", "SIGKILL"]);
  assert.ok(slept <= 40, "waits only until the processes are gone");
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

test("foreignMainPids lists only main Plasticity processes outside live profiles", () => {
  assert.deepEqual(foreignMainPids([
    { pid: 1, command: "/Applications/Plasticity.app/Contents/MacOS/Plasticity --inspect-brk=127.0.0.1:9229" },
    { pid: 2, command: "/Applications/Plasticity.app/Contents/Frameworks/Plasticity Helper (Renderer).app/Contents/MacOS/Plasticity Helper (Renderer) --type=renderer" },
    { pid: 3, command: "/Applications/Plasticity.app/Contents/MacOS/Plasticity --inspect-brk=127.0.0.1:5000 --user-data-dir=/tmp/plasticity-live-profile-abc" },
    { pid: 4, command: "/usr/bin/vim notes.txt" },
  ]), [1]);
});

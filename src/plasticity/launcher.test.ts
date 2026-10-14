import assert from "node:assert/strict";
import { test } from "node:test";

import { unlockMainProcess, type InspectorClient } from "./launcher.ts";

test("unlocks renderer CDP before resuming Plasticity main", async () => {
  const calls: string[] = [];
  let paused: ((params: unknown) => void) | undefined;
  const client: InspectorClient = {
    on(method, listener) {
      assert.equal(method, "Debugger.paused");
      paused = listener;
      return () => {};
    },
    async send(method) {
      calls.push(method);
      if (method === "Runtime.runIfWaitingForDebugger") {
        paused?.({ callFrames: [{ callFrameId: "frame-1" }] });
      }
      if (method === "Debugger.evaluateOnCallFrame") {
        return { result: { value: { patched: true, port: "9223" } } };
      }
      return {};
    },
  };

  await unlockMainProcess(client, 9223);

  assert.deepEqual(calls, [
    "Runtime.enable",
    "Debugger.enable",
    "Runtime.runIfWaitingForDebugger",
    "Debugger.evaluateOnCallFrame",
    "Debugger.resume",
  ]);
});

test("startup hook falls back to require and reports the Electron version on failure", async () => {
  const sent: Array<{ method: string; params?: Record<string, unknown> }> = [];
  let pausedHandler: ((params: unknown) => void) | undefined;
  const client = {
    on(event: string, handler: (params: unknown) => void) { if (event === "Debugger.paused") pausedHandler = handler; return () => {}; },
    async send(method: string, params?: Record<string, unknown>) {
      sent.push({ method, ...(params ? { params } : {}) });
      if (method === "Runtime.runIfWaitingForDebugger") setTimeout(() => pausedHandler?.({ callFrames: [{ callFrameId: "frame" }] }), 0);
      if (method === "Debugger.evaluateOnCallFrame") return { result: { value: { patched: false, electron: "30.0.0" } } };
      return {};
    },
  };
  await assert.rejects(unlockMainProcess(client as never, 9300), /Electron 30\.0\.0.*docs\/compat\.md/);
  const expression = String(sent.find((entry) => entry.method === "Debugger.evaluateOnCallFrame")?.params?.expression);
  assert.match(expression, /process\.mainModule\?\.require/);
  assert.match(expression, /typeof require === 'function'/);
});

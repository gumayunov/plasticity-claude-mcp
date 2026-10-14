import assert from "node:assert/strict";
import { test } from "node:test";

import { plasticity26_1_3 } from "./profiles/26.1.3.ts";
import { probeWindow, type ProbeWindowDeps } from "./probe-window.ts";

const probe = { compatibility: { version: "27.0.0", status: "untested" as const, profile: "26.1.3", discoveryStrategy: "command-log-scopes", warnings: [] }, bindings: [], commands: [], missingPaths: [] };

function deps(windows: string[]) {
  const events: string[] = [];
  const value: ProbeWindowDeps = {
    async discover() { return windows.map((id) => ({ id, title: id, url: "app_window/index.html", webSocketDebuggerUrl: `ws://127.0.0.1/${id}` })); },
    async connect(target) {
      events.push(`connect ${target.id}`);
      return { async probeCompatibility() { return probe; }, getProfile() { return plasticity26_1_3; }, close() { events.push("close"); } };
    },
  };
  return { value, events };
}

test("probes the only open window without reading the document state", async () => {
  const { value, events } = deps(["W1"]);
  const result = await probeWindow(undefined, "http://127.0.0.1:9223", value);
  assert.equal(result.probe, probe);
  assert.equal(result.profile, plasticity26_1_3);
  assert.deepEqual(events, ["connect W1", "close"]);
});

test("needs an explicit target when several windows are open, and rejects an unknown one", async () => {
  await assert.rejects(probeWindow(undefined, "http://x", deps(["W1", "W2"]).value), /Pass targetId: 2 Plasticity windows/);
  await assert.rejects(probeWindow("W9", "http://x", deps(["W1"]).value), /window W9 was not found/);
  const { value, events } = deps(["W1", "W2"]);
  await probeWindow("W2", "http://x", value);
  assert.deepEqual(events, ["connect W2", "close"]);
});

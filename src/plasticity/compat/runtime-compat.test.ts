import assert from "node:assert/strict";
import { test } from "node:test";

import type { CdpClient } from "../../cdp/client.ts";
import { PlasticityRuntime } from "../runtime.ts";
import { CompatibilityError } from "./errors.ts";
import { plasticity26_1_3 } from "./profiles/26.1.3.ts";

function fakeClient(calls: Array<{ objectId: string; args: unknown[] }>): CdpClient {
  return {
    async send(method: string, params: Record<string, unknown> = {}) {
      if (method === "Runtime.callFunctionOn") {
        calls.push({ objectId: String(params.objectId), args: (params.arguments as Array<{ objectId?: string }>).map((arg) => arg.objectId) });
        return { result: { value: "ok" } };
      }
      return {};
    },
    close() {},
  } as unknown as CdpClient;
}

type Internals = { bindings: Map<string, string>; editorId: string; resolved: { profile: typeof plasticity26_1_3; status: "supported" | "untested" }; version: string | null };

function runtimeWith(aliases: Record<string, string>, calls: Array<{ objectId: string; args: unknown[] }>): PlasticityRuntime {
  const Constructor = PlasticityRuntime as unknown as new (client: CdpClient, target: { id: string; title: string; webSocketDebuggerUrl: string }, editorId: string) => PlasticityRuntime;
  const runtime = new Constructor(fakeClient(calls), { id: "t", title: "Part", webSocketDebuggerUrl: "ws://x" }, "editor");
  const internals = runtime as unknown as Internals;
  internals.bindings.set("NewBoxFactory", "box-object");
  internals.resolved = { profile: { ...plasticity26_1_3, version: "27.0.0", bindingAliases: aliases }, status: "supported" };
  internals.version = "27.0.0";
  return runtime;
}

test("binding aliases from the profile are applied", async () => {
  const calls: Array<{ objectId: string; args: unknown[] }> = [];
  const runtime = runtimeWith({ BoxFactory: "NewBoxFactory" }, calls);
  assert.equal(await runtime.readNative("function (Box) { return 1; }", ["BoxFactory"]), "ok");
  assert.deepEqual(calls[0]?.args, ["box-object"]);
});

test("a missing binding is a CompatibilityError with version and profile", async () => {
  const runtime = runtimeWith({}, []);
  await assert.rejects(runtime.readNative("function (C) { return 1; }", ["ConeFactory"]), (error: unknown) =>
    error instanceof CompatibilityError && error.missingBinding === "ConeFactory" && error.version === "27.0.0" && /profile 27\.0\.0/.test(error.message));
});

import assert from "node:assert/strict";
import { test } from "node:test";

import { DiscoveryError, discoverNativeReferences, type CdpLike } from "./discovery.ts";

type Scope = { description?: string; properties: Array<{ name: string; objectId?: string }> };

function fakeClient(scopes: Scope[] | null, editorSignature: ReadonlySet<string> = new Set()): CdpLike & { probes: string[] } {
  const probes: string[] = [];
  return {
    probes,
    async send(method, params = {}) {
      if (method === "Runtime.evaluate") return scopes === null ? { result: { type: "undefined" } } : { result: { objectId: "handler" } };
      if (method === "Runtime.getProperties") {
        const id = String(params.objectId);
        if (id === "handler") return { result: [], internalProperties: [{ name: "[[Scopes]]", value: { objectId: "scopes" } }] };
        if (id === "scopes") return { result: scopes!.map((scope, index) => ({ name: String(index), value: { objectId: `scope-${index}`, description: scope.description ?? "Closure" } })) };
        const index = Number(id.replace("scope-", ""));
        return { result: scopes![index]!.properties.map(({ name, objectId }) => ({ name, value: objectId ? { objectId } : { type: "number" } })) };
      }
      if (method === "Runtime.callFunctionOn") {
        probes.push(String(params.objectId));
        return { result: { value: editorSignature.has(String(params.objectId)) } };
      }
      throw new Error(`Unexpected ${method}`);
    },
  };
}

test("finds the editor by name in any scope and collects bindings from all scopes", async () => {
  const client = fakeClient([
    { properties: [{ name: "BoxFactory", objectId: "box-near" }] },
    { properties: [{ name: "editor", objectId: "editor-1" }, { name: "count" }] },
    { properties: [{ name: "BoxFactory", objectId: "box-far" }, { name: "Vector3", objectId: "vector" }] },
  ]);
  const result = await discoverNativeReferences(client);
  assert.equal(result.editorId, "editor-1");
  assert.equal(result.strategy, "command-log-scopes");
  assert.deepEqual([...result.bindings].sort(), [["BoxFactory", "box-near"], ["Vector3", "vector"]]);
  assert.deepEqual(client.probes, []);
});

test("global scope is skipped", async () => {
  const result = await discoverNativeReferences(fakeClient([
    { properties: [{ name: "editor", objectId: "editor-1" }] },
    { description: "Global", properties: [{ name: "window", objectId: "window" }] },
  ]));
  assert.equal(result.bindings.has("window"), false);
});

test("without an editor name, the editor is found by its signature", async () => {
  const client = fakeClient([
    { properties: [{ name: "a", objectId: "not-editor" }, { name: "e", objectId: "real-editor" }, { name: "CutFactory", objectId: "cut" }] },
  ], new Set(["real-editor"]));
  const result = await discoverNativeReferences(client);
  assert.equal(result.editorId, "real-editor");
  assert.equal(result.bindings.has("e"), false);
  assert.deepEqual(client.probes, ["not-editor", "real-editor"]);
});

test("missing command-log reports the strategy and reason", async () => {
  await assert.rejects(discoverNativeReferences(fakeClient(null)), (error: unknown) =>
    error instanceof DiscoveryError
    && error.attempts[0]?.strategy === "command-log-scopes"
    && /command-log/.test(error.attempts[0]?.reason ?? "")
    && /docs\/compat\.md/.test(error.message));
});

test("no editor anywhere is a DiscoveryError", async () => {
  await assert.rejects(discoverNativeReferences(fakeClient([{ properties: [{ name: "x", objectId: "x" }] }])), /editor/);
});

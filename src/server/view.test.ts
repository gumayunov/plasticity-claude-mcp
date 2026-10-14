import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { PlasticityOperations } from "../plasticity/operations/index.ts";
import { createCompactServer, type SessionLike } from "./index.ts";

test("plasticity_view returns a summary and one image per view, visible in compact mode", async () => {
  const operations = {
    async viewImages(views: string[]) {
      return { revision: "r3", bodyCount: 1, cameraSettled: true, images: views.map((view) => ({ view, width: 1024, height: 640, data: "QUJD", mimeType: "image/jpeg" })) };
    },
  };
  const session = {
    async windows() { return []; }, async connect() { return {}; }, get() { return operations as unknown as PlasticityOperations; },
    capabilities() { return { bindings: [], operations: { constructionPlanes: { available: false, reason: "t" }, activeWorkplane: { available: false, reason: "t" } } }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } as unknown as SessionLike;
  const server = createCompactServer(session, undefined, undefined, undefined, null);
  const client = new Client({ name: "view-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  assert.ok((await client.listTools()).tools.some((tool) => tool.name === "plasticity_view"));
  const response = await client.callTool({ name: "plasticity_view", arguments: { views: ["isometric", "top"] } });
  const content = response.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  assert.equal(content.length, 3);
  assert.deepEqual(JSON.parse(content[0]!.text!), { revision: "r3", bodyCount: 1, cameraSettled: true, views: [{ view: "isometric", width: 1024, height: 640 }, { view: "top", width: 1024, height: 640 }] });
  assert.deepEqual(content.slice(1).map((item) => [item.type, item.mimeType, item.data]), [["image", "image/jpeg", "QUJD"], ["image", "image/jpeg", "QUJD"]]);
});

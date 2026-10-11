import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type SessionLike } from "../../server.ts";
import { PlasticityOperations } from "../../plasticity/operations.ts";
import { createServer, unavailableConstruction } from "../test-support.ts";

test("MCP forwards a valid exact fastener-group inspection", async () => {
  const expected = {
    status: "verified",
    source: "native-brep-cylindrical-faces",
    reasons: [],
    fasteners: [
      { id: "f1", faceId: "f1", xMm: -10, yMm: 0, diameterMm: 6 },
      { id: "f2", faceId: "f2", xMm: 10, yMm: 0, diameterMm: 6 },
    ],
  };
  const fake = {
    async windows() { return []; },
    async connect() { return {}; },
    get() {
      return {
        async inspectFastenerGroup(request: unknown) {
          assert.deepEqual(request, {
            bodyId: 7,
            cylindricalFaceIds: ["f1", "f2"],
            frame: { originMm: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0] },
            revision: "r1",
          });
          return expected;
        },
      } as unknown as PlasticityOperations;
    },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; },
    async changesSince() { return {}; },
    async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "fastener-group-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const response = await client.callTool({
    name: "plasticity_inspect_fastener_group",
    arguments: {
      bodyId: 7,
      cylindricalFaceIds: ["f1", "f2"],
      frame: { originMm: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0] },
      revision: "r1",
    },
  });
  assert.equal(response.isError, undefined);
  const responseText = (response.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  assert(responseText);
  const parsed = JSON.parse(responseText) as typeof expected;
  assert.equal(parsed.source, "native-brep-cylindrical-faces");
  assert.equal(parsed.fasteners[1]?.xMm, 10);

  await client.close();
});

test("MCP forwards an exact fastener-group layout check with explicit envelope criteria", async () => {
  const expected = {
    status: "verified",
    measurementSource: "native-brep-boundary-and-cylindrical-faces",
    evaluation: { status: "pass", basis: "Manufacturer head and driver dimensions", failures: [] },
    reasons: [],
  };
  const fake = {
    async windows() { return []; },
    async connect() { return {}; },
    get() {
      return {
        async inspectFastenerGroupLayout(request: unknown) {
          assert.deepEqual(request, {
            bodyId: 7,
            boundaryFaceId: "top",
            cylindricalFaceIds: ["f1", "f2"],
            frame: { originMm: [0, 0, 8], normal: [0, 0, 1], xDirection: [1, 0, 0] },
            requirements: {
              basis: "Manufacturer head and driver dimensions",
              minimumHoleEdgeClearanceMm: 3,
              envelopes: [{ id: "driver", diameterMm: 12, minimumBoundaryClearanceMm: 0, minimumMutualClearanceMm: 0 }],
            },
            revision: "r1",
          });
          return expected;
        },
      } as unknown as PlasticityOperations;
    },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; },
    async changesSince() { return {}; },
    async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "fastener-group-layout-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const response = await client.callTool({
    name: "plasticity_check_fastener_group_layout",
    arguments: {
      bodyId: 7,
      boundaryFaceId: "top",
      cylindricalFaceIds: ["f1", "f2"],
      frame: { originMm: [0, 0, 8], normal: [0, 0, 1], xDirection: [1, 0, 0] },
      requirements: {
        basis: "Manufacturer head and driver dimensions",
        minimumHoleEdgeClearanceMm: 3,
        envelopes: [{ id: "driver", diameterMm: 12 }],
      },
      revision: "r1",
    },
  });
  assert.equal(response.isError, undefined);
  const responseText = (response.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  assert(responseText);
  assert.deepEqual(JSON.parse(responseText), expected);

  await client.close();
});

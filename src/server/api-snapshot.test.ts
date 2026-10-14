import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createCompactServer, createServer, type SessionLike } from "./index.ts";
import type { PlasticityOperations } from "../plasticity/operations/index.ts";

const snapshotPath = fileURLToPath(new URL("./api-snapshot.json", import.meta.url));

function fakeSession(): SessionLike {
  return {
    async windows() { return []; },
    async connect() { return {}; },
    get() { return {} as PlasticityOperations; },
    capabilities() {
      return { bindings: [], operations: { constructionPlanes: { available: false, reason: "snapshot" }, activeWorkplane: { available: false, reason: "snapshot" } } };
    },
    async captureSnapshot() { return {}; },
    async changesSince() { return {}; },
    async waitForChange() { return {}; },
  } as unknown as SessionLike;
}

async function listed(server: ReturnType<typeof createServer>) {
  const client = new Client({ name: "api-snapshot", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const { tools } = await client.listTools();
  const catalog: Array<{ name: string; description?: string | undefined }> = [];
  for (let offset = 0; ;) {
    const response = await client.callTool({ name: "plasticity_call", arguments: { toolName: "catalog", offset, limit: 25 } });
    const page = JSON.parse((response.content as Array<{ text: string }>)[0]!.text);
    catalog.push(...(page.tools as Array<{ name: string; description?: string | undefined }>).map(({ name, description }) => ({ name, description })));
    if (page.nextOffset === null) break;
    offset = page.nextOffset;
  }
  await client.close();
  return { tools, catalog };
}

async function currentApi() {
  const full = await listed(createServer(fakeSession(), undefined, undefined, undefined, null));
  const compact = await listed(createCompactServer(fakeSession(), undefined, undefined, undefined, null));
  const byName = <T extends { name: string }>(items: T[]) => [...items].sort((a, b) => a.name.localeCompare(b.name));
  return {
    firstTool: full.tools[0]?.name,
    tools: byName(full.tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations }))),
    compactVisible: compact.tools.map((tool) => tool.name).sort(),
    compactCatalog: byName(compact.catalog),
  };
}

test("MCP API matches the snapshot taken before the module split", async () => {
  const api = JSON.parse(JSON.stringify(await currentApi()));
  if (process.env.UPDATE_API_SNAPSHOT === "1") {
    await writeFile(snapshotPath, `${JSON.stringify(api, null, 2)}\n`);
    return;
  }
  assert.deepEqual(api, JSON.parse(await readFile(snapshotPath, "utf8")));
});

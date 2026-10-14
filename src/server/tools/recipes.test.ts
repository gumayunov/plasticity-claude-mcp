import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type SessionLike } from "../index.ts";
import { PlasticityOperations } from "../../plasticity/operations/index.ts";
import type { RuntimeState } from "../../plasticity/runtime.ts";
import { createServer, emptyState, unavailableConstruction } from "../test-support.ts";

test("executes and journals a counterbore recipe through MCP", async () => {
  const target: RuntimeState["bodies"][number] = {
    id: 7, versionId: 70, type: "Solid", name: "Plate", boundsMm: { min: [0, 0, 0], max: [20, 20, 8] },
    faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  let state = { ...emptyState(), bodies: [target] };
  const cylinderCalls: Array<{ revision: string | undefined; radiusMm: number; heightMm: number }> = [];
  const operations = {
    async state() { return state; },
    async createCylinder(_centerMm: [number, number, number], radiusMm: number, heightMm: number, _name?: string, current?: string) {
      cylinderCalls.push({ revision: current, radiusMm, heightMm });
      const id = state.bodies.length + 7;
      state = { ...state, revision: `r${cylinderCalls.length + 1}`, bodies: [...state.bodies, { ...target, id, versionId: id, name: null }] };
      return state;
    },
    async boolean(_targets: number[], tools: number[], _operation: string, _keep: boolean, current: string) {
      assert.equal(current, "r3");
      state = { ...state, revision: "r4", bodies: state.bodies.filter((body) => !tools.includes(body.id)) };
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const created = await client.callTool({ name: "plasticity_create_counterbore", arguments: {
    targetId: 7, entryCenterMm: [10, 10, 8], axis: [0, 0, -1],
    throughDiameterMm: 4, counterboreDiameterMm: 8,
    counterboreDepthMm: 3, throughDepthMm: 8, revision: "r1",
  } });
  assert.equal(created.isError, undefined);
  const createdText = (created.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  assert.equal(JSON.parse(createdText ?? "null").undoSteps, 3);
  assert.deepEqual(cylinderCalls, [
    { revision: "r1", radiusMm: 2, heightMm: 9 },
    { revision: "r2", radiusMm: 4, heightMm: 3.5 },
  ]);
  const journal = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journalText = (journal.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const journalValue = JSON.parse(journalText ?? "null");
  assert.equal(journalValue.entries[0].operation, "recipe-counterbore");
  assert.equal(journalValue.entries[0].status, "completed");
  assert.equal(journalValue.entries[0].afterRevision, "r4");

  await client.close(); await server.close();
});

test("executes and journals a multi-center counterbore pattern through MCP", async () => {
  const target: RuntimeState["bodies"][number] = {
    id: 7, versionId: 70, type: "Solid", name: "Plate", boundsMm: { min: [0, 0, 0], max: [40, 20, 8] },
    faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  let state = { ...emptyState(), bodies: [target] };
  const calls: Array<Record<string, unknown>> = [];
  const operations = {
    async state() { return state; },
    async createCylinder(centerMm: [number, number, number], radiusMm: number, heightMm: number, _name: string | undefined, current: string, axis: [number, number, number]) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, current, axis });
      const id = 8 + calls.length - 1;
      state = { ...state, revision: `r${calls.length + 1}`, bodies: [...state.bodies, { ...target, id, versionId: id, name: null }] };
      return state;
    },
    async boolean(targets: number[], tools: number[], operation: string, keep: boolean, current: string) {
      calls.push({ operation: "boolean", targets, tools, kind: operation, keep, current });
      state = { ...state, revision: "r6", bodies: state.bodies.filter((body) => !tools.includes(body.id)) };
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "counterbore-pattern-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const created = await client.callTool({ name: "plasticity_create_counterbore_pattern", arguments: {
    targetId: 7, entryCentersMm: [[10, 10, 8], [30, 10, 8]], axis: [0, 0, -1],
    throughDiameterMm: 4, counterboreDiameterMm: 8,
    counterboreDepthMm: 3, throughDepthMm: 8, revision: "r1",
    intent: "Create two qualified socket-head seats",
  } });
  assert.equal(created.isError, undefined);
  const createdText = (created.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const createdValue = JSON.parse(createdText ?? "null");
  assert.equal(createdValue.recipe, "counterbore-pattern");
  assert.equal(createdValue.holeCount, 2);
  assert.equal(createdValue.undoSteps, 5);
  assert.deepEqual(calls.map((call) => call.operation), ["createCylinder", "createCylinder", "createCylinder", "createCylinder", "boolean"]);
  assert.deepEqual(calls[4], { operation: "boolean", targets: [7], tools: [8, 9, 10, 11], kind: "difference", keep: false, current: "r5" });
  const journal = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journalText = (journal.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const journalValue = JSON.parse(journalText ?? "null");
  assert.equal(journalValue.entries[0].operation, "recipe-counterbore-pattern");
  assert.equal(journalValue.entries[0].afterRevision, "r6");

  await client.close(); await server.close();
});

test("executes and journals a multi-center countersink pattern through MCP", async () => {
  const target: RuntimeState["bodies"][number] = {
    id: 7, versionId: 70, type: "Solid", name: "Plate", boundsMm: { min: [0, 0, 0], max: [40, 20, 8] },
    faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  let state = { ...emptyState(), bodies: [target] };
  const calls: Array<Record<string, unknown>> = [];
  let nextId = 8;
  let nextRevision = 2;
  const addBody = (type: "Solid" | "Wire") => {
    const id = nextId++;
    state = { ...state, revision: `r${nextRevision++}`, bodies: [...state.bodies, { ...target, id, versionId: id, type, name: null }] };
    return state;
  };
  const operations = {
    async state() { return state; },
    async createCylinder(centerMm: [number, number, number], radiusMm: number, heightMm: number, _name: string | undefined, current: string, axis: [number, number, number]) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, current, axis });
      return addBody("Solid");
    },
    async createPolyline(pointsMm: Array<[number, number, number]>, closed: boolean, current: string) {
      calls.push({ operation: "createPolyline", pointsMm, closed, current });
      return addBody("Wire");
    },
    async revolveProfile(id: number, centerMm: [number, number, number], axis: [number, number, number], angleDegrees: number, current: string) {
      calls.push({ operation: "revolveProfile", id, centerMm, axis, angleDegrees, current });
      return addBody("Solid");
    },
    async boolean(targets: number[], tools: number[], operation: string, keep: boolean, current: string) {
      calls.push({ operation: "boolean", targets, tools, kind: operation, keep, current });
      state = { ...state, revision: `r${nextRevision++}`, bodies: state.bodies.filter((body) => !tools.includes(body.id)) };
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "countersink-pattern-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const created = await client.callTool({ name: "plasticity_create_countersink_pattern", arguments: {
    targetId: 7, entryCentersMm: [[10, 10, 8], [30, 10, 8]], axis: [0, 0, -1], radialDirection: [1, 0, 0],
    throughDiameterMm: 5.5, countersinkMajorDiameterMm: 10.4, includedAngleDeg: 90,
    throughDepthMm: 8, revision: "r1", intent: "Create two qualified countersunk seats",
  } });
  assert.equal(created.isError, undefined);
  const createdText = (created.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const createdValue = JSON.parse(createdText ?? "null");
  assert.equal(createdValue.recipe, "countersink-pattern");
  assert.equal(createdValue.holeCount, 2);
  assert.equal(createdValue.undoSteps, 7);
  assert.deepEqual(createdValue.profileBodyIds, [9, 12]);
  assert.deepEqual(calls.map((call) => call.operation), [
    "createCylinder", "createPolyline", "revolveProfile",
    "createCylinder", "createPolyline", "revolveProfile", "boolean",
  ]);
  assert.deepEqual(calls[6], { operation: "boolean", targets: [7], tools: [8, 10, 11, 13], kind: "difference", keep: false, current: "r7" });
  const journal = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journalText = (journal.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const journalValue = JSON.parse(journalText ?? "null");
  assert.equal(journalValue.entries[0].operation, "recipe-countersink-pattern");
  assert.equal(journalValue.entries[0].afterRevision, "r8");

  await client.close(); await server.close();
});

test("executes and journals a multi-center hex nut pocket pattern through MCP", async () => {
  const target: RuntimeState["bodies"][number] = {
    id: 7, versionId: 70, type: "Solid", name: "Plate", boundsMm: { min: [0, 0, 0], max: [40, 20, 8] },
    faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  let state = { ...emptyState(), bodies: [target] };
  const calls: Array<Record<string, unknown>> = [];
  let nextId = 8;
  let nextRevision = 2;
  const operations = {
    async state() { return state; },
    async createPolyline(pointsMm: Array<[number, number, number]>, closed: boolean, current: string) {
      calls.push({ operation: "createPolyline", pointsMm, closed, current });
      const id = nextId++;
      state = {
        ...state,
        revision: `r${nextRevision++}`,
        bodies: [...state.bodies, { ...target, id, versionId: id, type: "Wire" as const, name: null }],
        regions: [...state.regions, {
          id: `region-${id}`, entityId: id * 10, islandVersionId: id * 10 + 1, sketchId: id * 10 + 2,
          sketchWireIds: [id], measurementSource: "render-mesh" as const,
          displayBoundsMm: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] },
        }],
      };
      return state;
    },
    async extrudeRegions(regionIds: string[], distanceMm: number, current: string) {
      calls.push({ operation: "extrudeRegions", regionIds, distanceMm, current });
      const id = nextId++;
      state = { ...state, revision: `r${nextRevision++}`, bodies: [...state.bodies, { ...target, id, versionId: id, name: null }] };
      return state;
    },
    async boolean(targets: number[], tools: number[], operation: string, keep: boolean, current: string) {
      calls.push({ operation: "boolean", targets, tools, kind: operation, keep, current });
      state = { ...state, revision: `r${nextRevision++}`, bodies: state.bodies.filter((body) => !tools.includes(body.id)) };
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "hex-pocket-pattern-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const created = await client.callTool({ name: "plasticity_create_hex_nut_pocket_pattern", arguments: {
    targetId: 7, entryCentersMm: [[10, 10, 8], [30, 10, 8]], axis: [0, 0, -1], flatNormalDirection: [1, 0, 0],
    acrossFlatsMm: 8, pocketDepthMm: 4, materialDepthMm: 8,
    revision: "r1", intent: "Create two qualified captive-nut seats",
  } });
  assert.equal(created.isError, undefined);
  const createdText = (created.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const createdValue = JSON.parse(createdText ?? "null");
  assert.equal(createdValue.recipe, "hex-nut-pocket-pattern");
  assert.equal(createdValue.pocketCount, 2);
  assert.equal(createdValue.undoSteps, 5);
  assert.deepEqual(createdValue.profileBodyIds, [8, 10]);
  assert.deepEqual(calls.map((call) => call.operation), ["createPolyline", "extrudeRegions", "createPolyline", "extrudeRegions", "boolean"]);
  assert.deepEqual(calls[4], { operation: "boolean", targets: [7], tools: [9, 11], kind: "difference", keep: false, current: "r5" });
  const journal = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journalText = (journal.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const journalValue = JSON.parse(journalText ?? "null");
  assert.equal(journalValue.entries[0].operation, "recipe-hex-nut-pocket-pattern");
  assert.equal(journalValue.entries[0].afterRevision, "r6");

  await client.close(); await server.close();
});

test("executes and journals a dedicated through-hole recipe through MCP", async () => {
  const target: RuntimeState["bodies"][number] = {
    id: 7, versionId: 70, type: "Solid", name: "Plate", boundsMm: { min: [0, 0, 0], max: [20, 20, 8] },
    faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  let state = { ...emptyState(), bodies: [target] };
  const calls: Array<Record<string, unknown>> = [];
  const operations = {
    async state() { return state; },
    async createCylinder(centerMm: [number, number, number], radiusMm: number, heightMm: number, _name: string | undefined, current: string, axis: [number, number, number]) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, current, axis });
      state = { ...state, revision: "r2", bodies: [...state.bodies, { ...target, id: 8, versionId: 8, name: null }] };
      return state;
    },
    async boolean(targets: number[], tools: number[], operation: string, keep: boolean, current: string) {
      calls.push({ operation: "boolean", targets, tools, kind: operation, keep, current });
      state = { ...state, revision: "r3", bodies: state.bodies.filter((body) => !tools.includes(body.id)) };
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "through-hole-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const created = await client.callTool({ name: "plasticity_create_through_hole", arguments: {
    targetId: 7, entryCenterMm: [10, 10, 8], axis: [0, 0, -1],
    holeDiameterMm: 5.5, throughDepthMm: 8, revision: "r1",
    intent: "Create the resolved M5 clearance hole",
  } });
  assert.equal(created.isError, undefined);
  const createdText = (created.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  assert.equal(JSON.parse(createdText ?? "null").undoSteps, 2);
  assert.deepEqual(calls, [
    { operation: "createCylinder", centerMm: [10, 10, 8.5], radiusMm: 2.75, heightMm: 9, current: "r1", axis: [0, 0, -1] },
    { operation: "boolean", targets: [7], tools: [8], kind: "difference", keep: false, current: "r2" },
  ]);
  const journal = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journalText = (journal.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const journalValue = JSON.parse(journalText ?? "null");
  assert.equal(journalValue.entries[0].operation, "recipe-through-hole");
  assert.equal(journalValue.entries[0].status, "completed");
  assert.equal(journalValue.entries[0].afterRevision, "r3");

  await client.close(); await server.close();
});

test("executes and journals a multi-center through-hole pattern through MCP", async () => {
  const target: RuntimeState["bodies"][number] = {
    id: 7, versionId: 70, type: "Solid", name: "Plate", boundsMm: { min: [0, 0, 0], max: [40, 40, 8] },
    faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  let state = { ...emptyState(), bodies: [target] };
  let nextId = 8;
  const calls: Array<Record<string, unknown>> = [];
  const operations = {
    async state() { return state; },
    async createCylinder(centerMm: [number, number, number], radiusMm: number, heightMm: number, _name: string | undefined, current: string, axis: [number, number, number]) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, current, axis });
      const id = nextId++;
      state = { ...state, revision: `r${Number(current.slice(1)) + 1}`, bodies: [...state.bodies, { ...target, id, versionId: id, name: null }] };
      return state;
    },
    async boolean(targets: number[], tools: number[], operation: string, keep: boolean, current: string) {
      calls.push({ operation: "boolean", targets, tools, kind: operation, keep, current });
      state = { ...state, revision: `r${Number(current.slice(1)) + 1}`, bodies: state.bodies.filter((body) => !tools.includes(body.id)) };
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "through-hole-pattern-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const created = await client.callTool({ name: "plasticity_create_through_hole_pattern", arguments: {
    targetId: 7, entryCentersMm: [[10, 10, 8], [30, 10, 8], [10, 30, 8], [30, 30, 8]], axis: [0, 0, -1],
    holeDiameterMm: 5.5, throughDepthMm: 8, revision: "r1", intent: "Create four qualified clearance holes",
  } });
  assert.equal(created.isError, undefined);
  const createdText = (created.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const value = JSON.parse(createdText ?? "null");
  assert.equal(value.holeCount, 4);
  assert.equal(value.undoSteps, 5);
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.at(-1), { operation: "boolean", targets: [7], tools: [8, 9, 10, 11], kind: "difference", keep: false, current: "r5" });
  const journal = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journalText = (journal.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const journalValue = JSON.parse(journalText ?? "null");
  assert.equal(journalValue.entries[0].operation, "recipe-through-hole-pattern");
  assert.equal(journalValue.entries[0].afterRevision, "r6");

  await client.close(); await server.close();
});

test("executes and journals a dedicated blind-hole recipe through MCP", async () => {
  const target: RuntimeState["bodies"][number] = {
    id: 7, versionId: 70, type: "Solid", name: "Boss", boundsMm: { min: [0, 0, 0], max: [20, 20, 8] },
    faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  let state = { ...emptyState(), bodies: [target] };
  const calls: Array<Record<string, unknown>> = [];
  const operations = {
    async state() { return state; },
    async createCylinder(centerMm: [number, number, number], radiusMm: number, heightMm: number, _name: string | undefined, current: string, axis: [number, number, number]) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, current, axis });
      state = { ...state, revision: "r2", bodies: [...state.bodies, { ...target, id: 8, versionId: 8, name: null }] };
      return state;
    },
    async boolean(targets: number[], tools: number[], operation: string, keep: boolean, current: string) {
      calls.push({ operation: "boolean", targets, tools, kind: operation, keep, current });
      state = { ...state, revision: "r3", bodies: state.bodies.filter((body) => !tools.includes(body.id)) };
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "blind-hole-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const created = await client.callTool({ name: "plasticity_create_blind_hole", arguments: {
    targetId: 7, entryCenterMm: [10, 10, 8], axis: [0, 0, -1],
    holeDiameterMm: 4.2, holeDepthMm: 5, materialDepthMm: 8, revision: "r1",
    intent: "Create the qualified M5 tap-drill pilot",
  } });
  assert.equal(created.isError, undefined);
  const createdText = (created.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  assert.equal(JSON.parse(createdText ?? "null").undoSteps, 2);
  assert.deepEqual(calls, [
    { operation: "createCylinder", centerMm: [10, 10, 8.5], radiusMm: 2.1, heightMm: 5.5, current: "r1", axis: [0, 0, -1] },
    { operation: "boolean", targets: [7], tools: [8], kind: "difference", keep: false, current: "r2" },
  ]);
  const journal = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journalText = (journal.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const journalValue = JSON.parse(journalText ?? "null");
  assert.equal(journalValue.entries[0].operation, "recipe-blind-hole");
  assert.equal(journalValue.entries[0].status, "completed");
  assert.equal(journalValue.entries[0].afterRevision, "r3");

  await client.close(); await server.close();
});

test("executes and journals a multi-center blind-hole pattern through MCP", async () => {
  const target: RuntimeState["bodies"][number] = {
    id: 7, versionId: 70, type: "Solid", name: "Tapped plate", boundsMm: { min: [0, 0, 0], max: [40, 30, 8] },
    faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  let state = { ...emptyState(), bodies: [target] };
  let nextId = 8;
  const calls: Array<Record<string, unknown>> = [];
  const operations = {
    async state() { return state; },
    async createCylinder(centerMm: [number, number, number], radiusMm: number, heightMm: number, _name: string | undefined, current: string, axis: [number, number, number]) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, current, axis });
      const id = nextId++;
      state = { ...state, revision: `r${Number(current.slice(1)) + 1}`, bodies: [...state.bodies, { ...target, id, versionId: id, name: null }] };
      return state;
    },
    async boolean(targets: number[], tools: number[], operation: string, keep: boolean, current: string) {
      calls.push({ operation: "boolean", targets, tools, kind: operation, keep, current });
      state = { ...state, revision: `r${Number(current.slice(1)) + 1}`, bodies: state.bodies.filter((body) => !tools.includes(body.id)) };
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "blind-hole-pattern-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const created = await client.callTool({ name: "plasticity_create_blind_hole_pattern", arguments: {
    targetId: 7, entryCentersMm: [[10, 10, 8], [30, 10, 8]], axis: [0, 0, -1],
    holeDiameterMm: 4.2, holeDepthMm: 5, materialDepthMm: 8, revision: "r1",
    intent: "Create two qualified tap-drill pilots",
  } });
  assert.equal(created.isError, undefined);
  const createdText = (created.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const value = JSON.parse(createdText ?? "null");
  assert.equal(value.holeCount, 2);
  assert.equal(value.undoSteps, 3);
  assert.deepEqual(calls.at(-1), { operation: "boolean", targets: [7], tools: [8, 9], kind: "difference", keep: false, current: "r3" });
  const journal = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journalText = (journal.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const journalValue = JSON.parse(journalText ?? "null");
  assert.equal(journalValue.entries[0].operation, "recipe-blind-hole-pattern");
  assert.equal(journalValue.entries[0].afterRevision, "r4");

  await client.close(); await server.close();
});

test("executes and journals a multi-center heat-set insert pocket pattern through MCP", async () => {
  const target: RuntimeState["bodies"][number] = {
    id: 7, versionId: 70, type: "Solid", name: "Insert plate", boundsMm: { min: [0, 0, 0], max: [40, 20, 12] },
    faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  let state = { ...emptyState(), bodies: [target] };
  let nextId = 8;
  const calls: Array<Record<string, unknown>> = [];
  const operations = {
    async state() { return state; },
    async createCylinder(centerMm: [number, number, number], radiusMm: number, heightMm: number, _name: string | undefined, current: string, axis: [number, number, number]) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, current, axis });
      const id = nextId++;
      state = { ...state, revision: `r${Number(current.slice(1)) + 1}`, bodies: [...state.bodies, { ...target, id, versionId: id, name: null }] };
      return state;
    },
    async boolean(targets: number[], tools: number[], operation: string, keep: boolean, current: string) {
      calls.push({ operation: "boolean", targets, tools, kind: operation, keep, current });
      state = { ...state, revision: `r${Number(current.slice(1)) + 1}`, bodies: state.bodies.filter((body) => !tools.includes(body.id)) };
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "insert-pocket-pattern-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const created = await client.callTool({ name: "plasticity_create_heat_set_insert_pocket_pattern", arguments: {
    targetId: 7, entryCentersMm: [[10, 10, 12], [30, 10, 12]], axis: [0, 0, -1],
    pilotDiameterMm: 3, pilotDepthMm: 8,
    insertDiameterMm: 4.6, insertDepthMm: 6,
    leadInDiameterMm: 5.4, leadInDepthMm: 1, materialDepthMm: 12,
    revision: "r1", intent: "Create two qualified heat-set insert pockets",
  } });
  assert.equal(created.isError, undefined);
  const createdText = (created.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const value = JSON.parse(createdText ?? "null");
  assert.equal(value.pocketCount, 2);
  assert.equal(value.undoSteps, 7);
  assert.equal(calls.length, 7);
  assert.deepEqual(calls.at(-1), { operation: "boolean", targets: [7], tools: [8, 9, 10, 11, 12, 13], kind: "difference", keep: false, current: "r7" });
  const journal = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journalText = (journal.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const journalValue = JSON.parse(journalText ?? "null");
  assert.equal(journalValue.entries[0].operation, "recipe-heat-set-insert-pocket-pattern");
  assert.equal(journalValue.entries[0].afterRevision, "r8");

  await client.close(); await server.close();
});

test("executes and journals a multi-center screw boss pattern through MCP", async () => {
  const target: RuntimeState["bodies"][number] = {
    id: 7, versionId: 70, type: "Solid", name: "Boss support", boundsMm: { min: [0, 0, 0], max: [50, 30, 4] },
    faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  let state = { ...emptyState(), bodies: [target] };
  let nextId = 8;
  const calls: Array<Record<string, unknown>> = [];
  const operations = {
    async state() { return state; },
    async createCylinder(centerMm: [number, number, number], radiusMm: number, heightMm: number, _name: string | undefined, current: string, axis: [number, number, number]) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, current, axis });
      const id = nextId++;
      state = { ...state, revision: `r${Number(current.slice(1)) + 1}`, bodies: [...state.bodies, { ...target, id, versionId: id, name: null }] };
      return state;
    },
    async boolean(targets: number[], tools: number[], operation: string, keep: boolean, current: string) {
      calls.push({ operation: "boolean", targets, tools, kind: operation, keep, current });
      state = { ...state, revision: `r${Number(current.slice(1)) + 1}`, bodies: state.bodies.filter((body) => !tools.includes(body.id)) };
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "screw-boss-pattern-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const created = await client.callTool({ name: "plasticity_create_screw_boss_pattern", arguments: {
    targetId: 7, baseCentersMm: [[12, 15, 4], [38, 15, 4]], axis: [0, 0, 1],
    outerDiameterMm: 10, heightMm: 10, holeDiameterMm: 3, holeDepthMm: 8,
    baseOverlapMm: 0.5, cutterOvershootMm: 0.5,
    revision: "r1", intent: "Create two qualified printed-plastic screw bosses",
  } });
  assert.equal(created.isError, undefined);
  const createdText = (created.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const value = JSON.parse(createdText ?? "null");
  assert.equal(value.bossCount, 2);
  assert.equal(value.undoSteps, 6);
  assert.equal(calls.length, 6);
  assert.deepEqual(calls[2], { operation: "boolean", targets: [7], tools: [8, 9], kind: "union", keep: false, current: "r3" });
  assert.deepEqual(calls.at(-1), { operation: "boolean", targets: [7], tools: [10, 11], kind: "difference", keep: false, current: "r6" });
  const journal = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journalText = (journal.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const journalValue = JSON.parse(journalText ?? "null");
  assert.equal(journalValue.entries[0].operation, "recipe-screw-boss-pattern");
  assert.equal(journalValue.entries[0].afterRevision, "r7");

  await client.close(); await server.close();
});

test("executes and journals a multi-center slotted hole pattern through MCP", async () => {
  const target: RuntimeState["bodies"][number] = {
    id: 7, versionId: 70, type: "Solid", name: "Adjustable plate", boundsMm: { min: [0, 0, 0], max: [50, 40, 8] },
    faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  let state = { ...emptyState(), bodies: [target] };
  let nextId = 8;
  let nextRevision = 1;
  const calls: Array<Record<string, unknown>> = [];
  const advance = (added: RuntimeState["bodies"], removedIds: number[] = []) => {
    nextRevision += 1;
    state = { ...state, revision: `r${nextRevision}`, bodies: [...state.bodies.filter((body) => !removedIds.includes(body.id)), ...added] };
    return state;
  };
  const operations = {
    async state() { return state; },
    async createPolyline(points: Array<[number, number, number]>, closed: boolean, current: string) {
      calls.push({ operation: "createPolyline", points, closed, current });
      const id = nextId++;
      advance([{ ...target, id, versionId: id, type: "Wire", name: null }]);
      state = { ...state, regions: [...state.regions, {
        id: `region-${id}`, entityId: id * 10, islandVersionId: id * 10 + 1, sketchId: id * 10 + 2,
        sketchWireIds: [id], measurementSource: "render-mesh" as const,
        displayBoundsMm: {
          min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]!))) as [number, number, number],
          max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]!))) as [number, number, number],
        },
      }] };
      return state;
    },
    async extrudeRegions(regionIds: string[], distanceMm: number, current: string) {
      calls.push({ operation: "extrudeRegions", regionIds, distanceMm, current });
      const id = nextId++;
      return advance([{ ...target, id, versionId: id, name: null }]);
    },
    async createCylinder(centerMm: [number, number, number], radiusMm: number, heightMm: number, _name: string | undefined, current: string, axis: [number, number, number]) {
      calls.push({ operation: "createCylinder", centerMm, radiusMm, heightMm, current, axis });
      const id = nextId++;
      return advance([{ ...target, id, versionId: id, name: null }]);
    },
    async boolean(targets: number[], tools: number[], operation: string, keep: boolean, current: string) {
      calls.push({ operation: "boolean", targets, tools, kind: operation, keep, current });
      return advance([], tools);
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "slotted-hole-pattern-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const created = await client.callTool({ name: "plasticity_create_slotted_hole_pattern", arguments: {
    targetId: 7, entryCentersMm: [[20, 10, 8], [20, 30, 8]], axis: [0, 0, -1], slotDirection: [1, 0, 0],
    overallLengthMm: 20, widthMm: 6, throughDepthMm: 8,
    revision: "r1", intent: "Create two qualified adjustment slots",
  } });
  assert.equal(created.isError, undefined);
  const createdText = (created.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const value = JSON.parse(createdText ?? "null");
  assert.equal(value.slotCount, 2);
  assert.equal(value.centerDistanceMm, 14);
  assert.equal(value.undoSteps, 9);
  assert.equal(calls.length, 9);
  assert.deepEqual(calls.at(-1), { operation: "boolean", targets: [7], tools: [9, 10, 11, 13, 14, 15], kind: "difference", keep: false, current: "r9" });
  const journal = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journalText = (journal.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const journalValue = JSON.parse(journalText ?? "null");
  assert.equal(journalValue.entries[0].operation, "recipe-slotted-hole-pattern");
  assert.equal(journalValue.entries[0].afterRevision, "r10");

  await client.close(); await server.close();
});

test("executes and journals countersink, hex nut pocket, and slotted-hole recipes through MCP", async () => {
  const target: RuntimeState["bodies"][number] = {
    id: 7, versionId: 70, type: "Solid", name: "Bracket", boundsMm: { min: [0, 0, 0], max: [40, 30, 8] },
    faceIds: [], edgeIds: [], faces: [], edges: [],
  };
  const wire = (id: number): RuntimeState["bodies"][number] => ({ ...target, id, versionId: id, type: "Wire", name: null });
  const solid = (id: number): RuntimeState["bodies"][number] => ({ ...target, id, versionId: id, name: null });
  let state = { ...emptyState(), bodies: [target] };
  const calls: string[] = [];
  const operations = {
    async state() { return state; },
    async createCylinder(_center: [number, number, number], _radius: number, _height: number, _name: string | undefined, current: string) {
      calls.push(`cylinder:${current}`);
      const id = current === "r1" ? 8 : current === "r10" ? 15 : 16;
      const nextRevision = current === "r1" ? "r2" : current === "r10" ? "r11" : "r12";
      state = { ...state, revision: nextRevision, bodies: [...state.bodies, solid(id)] };
      return state;
    },
    async createPolyline(points: Array<[number, number, number]>, _closed: boolean, current: string) {
      calls.push(`polyline:${current}`);
      const id = state.revision === "r2" ? 9 : state.revision === "r5" ? 11 : 13;
      const nextRevision = state.revision === "r2" ? "r3" : state.revision === "r5" ? "r6" : "r9";
      state = { ...state, revision: nextRevision, bodies: [...state.bodies, wire(id)], regions: [{
        id: `region-${id}`, entityId: id * 10, islandVersionId: id * 10 + 1, sketchId: id * 10 + 2,
        sketchWireIds: [id], measurementSource: "render-mesh" as const,
        displayBoundsMm: {
          min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]!))) as [number, number, number],
          max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]!))) as [number, number, number],
        },
      }] };
      return state;
    },
    async revolveProfile(_id: number, _origin: [number, number, number], _axis: [number, number, number], _degrees: number, current: string) {
      calls.push(`revolve:${current}`);
      state = { ...state, revision: "r4", bodies: [...state.bodies, solid(10)] };
      return state;
    },
    async extrudeRegions(_ids: string[], _distance: number, current: string) {
      calls.push(`extrude:${current}`);
      const id = current === "r6" ? 12 : 14;
      state = { ...state, revision: current === "r6" ? "r7" : "r10", bodies: [...state.bodies, solid(id)] };
      return state;
    },
    async boolean(_targets: number[], tools: number[], _kind: string, _keep: boolean, current: string) {
      calls.push(`boolean:${current}`);
      const nextRevision = current === "r4" ? "r5" : current === "r7" ? "r8" : "r13";
      state = { ...state, revision: nextRevision, bodies: state.bodies.filter((body) => !tools.includes(body.id)) };
      return state;
    },
  } as unknown as PlasticityOperations;
  const fake = {
    async windows() { return []; }, async connect() { return state; }, get() { return operations; },
    capabilities() { return { bindings: [], operations: unavailableConstruction() }; },
    async captureSnapshot() { return {}; }, async changesSince() { return {}; }, async waitForChange() { return {}; },
  } satisfies SessionLike;
  const server = createServer(fake);
  const client = new Client({ name: "fastener-pocket-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);

  const countersink = await client.callTool({ name: "plasticity_create_countersink", arguments: {
    targetId: 7, entryCenterMm: [12, 15, 8], axis: [0, 0, -1], radialDirection: [1, 0, 0],
    throughDiameterMm: 5.5, countersinkMajorDiameterMm: 10.4, includedAngleDeg: 90,
    throughDepthMm: 8, revision: "r1",
  } });
  assert.equal(countersink.isError, undefined);
  const countersinkText = (countersink.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  assert.equal(JSON.parse(countersinkText ?? "null").recipe, "countersink");

  const pocket = await client.callTool({ name: "plasticity_create_hex_nut_pocket", arguments: {
    targetId: 7, entryCenterMm: [28, 15, 8], axis: [0, 0, -1], flatNormalDirection: [1, 0, 0],
    acrossFlatsMm: 8, pocketDepthMm: 4, materialDepthMm: 8, revision: "r5",
  } });
  assert.equal(pocket.isError, undefined);
  const pocketText = (pocket.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  assert.equal(JSON.parse(pocketText ?? "null").recipe, "hex-nut-pocket");
  const slot = await client.callTool({ name: "plasticity_create_slotted_hole", arguments: {
    targetId: 7, entryCenterMm: [20, 8, 8], axis: [0, 0, -1], slotDirection: [1, 0, 0],
    overallLengthMm: 16, widthMm: 6, throughDepthMm: 8, revision: "r8",
  } });
  assert.equal(slot.isError, undefined);
  const slotText = (slot.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  assert.equal(JSON.parse(slotText ?? "null").recipe, "slotted-hole");
  assert.deepEqual(calls, [
    "cylinder:r1", "polyline:r2", "revolve:r3", "boolean:r4",
    "polyline:r5", "extrude:r6", "boolean:r7",
    "polyline:r8", "extrude:r9", "cylinder:r10", "cylinder:r11", "boolean:r12",
  ]);

  const journal = await client.callTool({ name: "plasticity_construction_journal", arguments: {} });
  const journalText = (journal.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
  const operationsLogged = JSON.parse(journalText ?? "null").entries.map((entry: { operation: string }) => entry.operation);
  assert.deepEqual(operationsLogged, ["recipe-countersink", "recipe-hex-nut-pocket", "recipe-slotted-hole"]);

  await client.close(); await server.close();
});

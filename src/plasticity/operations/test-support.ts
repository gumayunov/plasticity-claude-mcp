import { PlasticityOperations } from "../operations.ts";
import { frameFromOriginNormalX } from "../construction.ts";
import type { PlasticityRuntime, RuntimeState } from "../runtime.ts";

export const emptyConstruction: RuntimeState["construction"] = {
  planes: [],
  activePlaneId: "standard:top",
  planeStateToken: "planes:empty",
  viewStateToken: "workplane:standard:top",
};

export function testThreeMfArchive(): Buffer {
  const model = '<model unit="meter"><resources><object id="1" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="0.02" y="0" z="0"/><vertex x="0" y="0.01" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>';
  return storedTestZip([
    ["[Content_Types].xml", Buffer.from('<Types><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>')],
    ["_rels/.rels", Buffer.from('<Relationships><Relationship Target="/3D/3dmodel.model"/></Relationships>')],
    ["3D/3dmodel.model", Buffer.from(model)],
  ]);
}

export function storedTestZip(entries: Array<readonly [string, Buffer]>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const [name, data] of entries) {
    const filename = Buffer.from(name);
    const crc = testCrc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    localParts.push(local, filename, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, filename);
    localOffset += local.length + filename.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(centralDirectory.length, 12); eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

export function testCrc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function constructionOperations(): { operations: PlasticityOperations; wasMutated: () => boolean } {
  let mutated = false;
  const top = {
    id: "standard:top",
    nativeId: "top",
    name: "Top",
    source: "standard" as const,
    ...frameFromOriginNormalX([0, 0, 0], [0, 0, 1], [1, 0, 0]),
  };
  const state: RuntimeState = {
    targetId: "window-1",
    title: "Untitled - Plasticity",
    documentToken: "doc-1",
    revision: "r1",
    dbVersion: 1,
    undoDepth: 0,
    redoDepth: 0,
    regions: [],
    construction: { planes: [top], activePlaneId: top.id, planeStateToken: "p1", viewStateToken: "v1" },
    bodies: [],
  };
  const runtime = {
    getCapabilities() { return []; },
    async getState() { return state; },
    async mutate() { mutated = true; return {}; },
  } as unknown as PlasticityRuntime;
  return { operations: new PlasticityOperations(runtime, "session-1"), wasMutated: () => mutated };
}

export function planeLocalOperations(bodies: RuntimeState["bodies"] = []): { operations: PlasticityOperations; argumentsSeen: () => unknown[] | undefined; sourceSeen: () => string | undefined } {
  let seen: unknown[] | undefined;
  let source: string | undefined;
  const plane = {
    id: "plane:7", nativeId: "7", name: "Local", source: "saved" as const,
    ...frameFromOriginNormalX([10, 20, 30], [1, 0, 0], [0, 1, 0]),
  };
  const state: RuntimeState = {
    targetId: "window-1", title: "Untitled - Plasticity", documentToken: "doc-1", revision: "r1",
    dbVersion: 1, undoDepth: 0, redoDepth: 0, regions: [],
    construction: { planes: [plane], activePlaneId: plane.id, planeStateToken: "p1", viewStateToken: "v1" }, bodies,
  };
  const runtime = {
    getCapabilities() { return []; }, async getState() { return state; },
    async mutate(nativeSource: string, _bindings: string[], values: unknown[]) { source = nativeSource; seen = values; return {}; },
  } as unknown as PlasticityRuntime;
  return { operations: new PlasticityOperations(runtime, "session-1"), argumentsSeen: () => seen, sourceSeen: () => source };
}

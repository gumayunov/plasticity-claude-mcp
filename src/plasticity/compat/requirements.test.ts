import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { defaultRequirementSources, extractRequirements } from "./requirements.ts";

test("extracts factories and commands per tool through methods, helpers and recipes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "compat-requirements-"));
  try {
    const file = async (name: string, text: string) => { const path = join(dir, name); await writeFile(path, text); return path; };
    const helpers = await file("helpers.ts", `export async function measureThing(runtime: any) { return runtime.readNative(\`function () {}\`, ["MeasureFactory"]); }`);
    const operations = await file("solids.ts", `export abstract class SolidsOperations {
      async createBox() { await this.runtime.mutate(\`\${commandStart("BoxCommand")}\`, ["ThreePointBoxFactory", "Vector3"]); }
      async measure() { return measureThing(this.runtime); }
    }`);
    const recipes = await file("holes.ts", `export abstract class HolesRecipes { async createHole() { await this.operations.createBox(); } }`);
    const tools = await file("solids-tools.ts", `export function registerSolidsTools(ctx: any) {
      const { tool, session } = ctx;
      tool("plasticity_create_box", "d", schema, async () => session.get().createBox());
      tool("plasticity_create_hole", "d", schema, async () => new PlasticityRecipes(session.get()).createHole());
      for (const name of ["plasticity_measure_a", "plasticity_measure_b"] as const) tool(name, "d", schema, async () => session.get().measure());
    }`);
    const orphan = await file("orphan.ts", `export class Importer { run(runtime: any) { return runtime.mutate(\`\${commandStart("ImportCommand")}\`, ["ExchangeImportFactory"]); } }`);
    const manifest = extractRequirements({ helpers: [helpers], operations: [operations], recipes: [recipes], tools: [tools], all: [helpers, operations, orphan] });
    assert.deepEqual(manifest.allBindings, ["ExchangeImportFactory", "MeasureFactory", "ThreePointBoxFactory", "Vector3"]);
    assert.deepEqual(manifest.allCommands, ["BoxCommand", "ImportCommand"]);
    assert.deepEqual(manifest.tools.plasticity_create_box, { methods: ["createBox"], bindings: ["ThreePointBoxFactory", "Vector3"], commands: ["BoxCommand"] });
    assert.deepEqual(manifest.tools.plasticity_create_hole, { methods: ["createBox"], bindings: ["ThreePointBoxFactory", "Vector3"], commands: ["BoxCommand"] });
    assert.deepEqual(manifest.tools.plasticity_measure_b, { methods: ["measure"], bindings: ["MeasureFactory"], commands: [] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the committed requirements manifest is up to date", async () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const current = extractRequirements(defaultRequirementSources(root));
  const committed = JSON.parse(await readFile(new URL("./requirements.generated.json", import.meta.url), "utf8"));
  assert.deepEqual(current, committed, "run npm run compat:extract");
});

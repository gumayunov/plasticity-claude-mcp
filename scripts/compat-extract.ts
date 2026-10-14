import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { defaultRequirementSources, extractRequirements } from "../src/plasticity/compat/requirements.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = extractRequirements(defaultRequirementSources(root));
await writeFile(new URL("../src/plasticity/compat/requirements.generated.json", import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
const tools = Object.values(manifest.tools);
console.log(`${tools.length} tools, ${new Set(tools.flatMap((tool) => tool.bindings)).size} factories, ${new Set(tools.flatMap((tool) => tool.commands)).size} commands`);

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ensurePlasticityCdp } from "../src/plasticity/launcher.ts";
import { freeLoopbackPort } from "./live/instance.ts";

async function main(): Promise<void> {
  if (process.argv.slice(2).some((argument) => argument !== "--help")) {
    throw new Error("Usage: npm run start:plasticity-isolated [-- --help]");
  }
  if (process.argv.includes("--help")) {
    console.log("Launch a separate Plasticity process with a fresh temporary user-data profile and loopback-only CDP.");
    return;
  }
  const userDataDirectory = await mkdtemp(join(tmpdir(), "plasticity-mcp-isolated-profile-"));
  const rendererPort = await freeLoopbackPort(new Set());
  const inspectorPort = await freeLoopbackPort(new Set([rendererPort]));
  const targets = await ensurePlasticityCdp({ rendererPort, inspectorPort, userDataDirectory });
  console.log(JSON.stringify({
    status: "available",
    isolated: true,
    userDataDirectory,
    rendererEndpoint: `http://127.0.0.1:${rendererPort}`,
    inspectorEndpoint: `http://127.0.0.1:${inspectorPort}`,
    targets,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

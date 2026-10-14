import { discoverPlasticityTargets, type PlasticityTarget } from "../../cdp/discovery.ts";
import { PlasticityRuntime, type CompatibilityProbe } from "../runtime.ts";
import type { CompatProfile } from "./types.ts";

export interface ProbeWindowDeps {
  discover(endpoint: string): Promise<PlasticityTarget[]>;
  connect(target: PlasticityTarget): Promise<{ probeCompatibility(): Promise<CompatibilityProbe>; getProfile(): CompatProfile; close(): void }>;
}

const defaultDeps: ProbeWindowDeps = {
  discover: (endpoint) => discoverPlasticityTargets(endpoint),
  connect: (target) => PlasticityRuntime.connect(target),
};

// Connects to a window only to probe compatibility. Unlike plasticity_connect it never reads the
// document state, so it still works when that read fails because of a version mismatch.
export async function probeWindow(
  targetId: string | undefined,
  endpoint: string,
  deps: ProbeWindowDeps = defaultDeps,
): Promise<{ probe: CompatibilityProbe; profile: CompatProfile }> {
  const targets = await deps.discover(endpoint);
  const target = targetId !== undefined
    ? targets.find((candidate) => candidate.id === targetId)
    : targets.length === 1 ? targets[0] : undefined;
  if (!target) {
    throw new Error(targetId !== undefined
      ? `Plasticity window ${targetId} was not found at ${endpoint}`
      : `Pass targetId: ${targets.length} Plasticity windows are open at ${endpoint}`);
  }
  const runtime = await deps.connect(target);
  try {
    return { probe: await runtime.probeCompatibility(), profile: runtime.getProfile() };
  } finally {
    runtime.close();
  }
}

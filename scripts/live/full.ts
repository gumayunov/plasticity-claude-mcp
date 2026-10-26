import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { CheckFailure } from "./harness.ts";
import { projectRoot } from "./mcp.ts";
import type { Evidence } from "./types.ts";

export interface FullEntry {
  name: string;
  script: string;
  args: string[];
  skipReason?: string;
}

const DISPOSABLE = [
  "arbitrary-section", "compact-diff", "fastener-group", "fastener-pockets", "fastener-strength", "native-3mf-export",
  "native-body-outlines", "native-closed-wire-patch", "native-cone", "native-curve-bridge", "native-curve-control-points",
  "native-curve-copy", "native-curve-deformation", "native-curve-fillet", "native-curve-loft", "native-curve-pattern",
  "native-curve-planarize", "native-curve-rebuild", "native-curve-refinement", "native-curve-segment-split",
  "native-curve-vertex-conversion", "native-curved-edge-distance", "native-edge-curvature", "native-edge-edits",
  "native-face-construction", "native-face-deformation", "native-face-draft", "native-face-patterns", "native-face-properties",
  "native-face-transforms", "native-groups", "native-hollow-solids", "native-instances", "native-interference",
  "native-obj-export", "native-parasolid", "native-point-planar-circular-face", "native-print-orientation",
  "native-radius-measurement", "native-rectangle", "native-reference-mesh", "native-section-analysis", "native-sheet-insertion",
  "native-sketch-primitives", "native-slot-profiles", "native-solid-properties", "native-sphere", "native-surface-continuity",
  "native-surface-curves", "native-surface-refinement", "native-svg-import", "native-svg-polynomial-degrees", "native-text",
  "native-tool-router", "native-topology-cache", "native-topology-distance", "native-torus", "native-ui-edits", "native-vertex-offset",
  "nonparallel-planar-clearance", "plate-strength", "printed-thread-calibration", "printed-threads", "section-strength",
  "split-solid",
];

const ALLOW_LIVE = ["native-svg-approximation", "native-svg-circular-export", "native-svg-composite", "native-svg-rational"];

const SKIPPED: Array<[string, string]> = [
  ["cohesive-layer-stack-mesh", "needs the external Gmsh/Python FEM toolchain"],
  ["cohesive-mixed-mode", "needs the external Gmsh/Python FEM toolchain"],
  ["fem-bracket", "needs the external Gmsh/Python FEM toolchain"],
  ["fem-face-mapping", "needs the external Gmsh/Python FEM toolchain"],
  ["fem-static-patch", "needs the external Gmsh/Python FEM toolchain"],
  ["interface-tensile-csv", "offline strength data check that does not use Plasticity"],
  ["design-reference-multiview", "needs --live-codex image analysis and input photos"],
  ["design-reference-to-native", "needs --live-codex image analysis and input photos"],
  ["strength", "needs --live-codex image analysis and input photos"],
  ["native-hiddenline-svg", "needs an existing solid id (--solid-id)"],
  ["native-svg-export", "needs an existing wire id (--wire-id)"],
  ["parasolid-reference-download", "needs a public source URL and a reviewed license"],
  ["parasolid-reference", "uses positional arguments <target> <output> instead of --target/--output"],
  ["reference-3mf-import", "needs a public source URL and a reviewed license"],
  ["reference-assets", "needs network access to a reference page"],
  ["reference-mesh-download", "needs a public source URL and a reviewed license"],
  ["reference-search", "needs a network search query"],
  ["step-reference-download", "needs a public source URL and a reviewed license"],
  ["step-reference-store", "uses a positional <target> argument instead of --target/--output"],
];

const script = (name: string) => `verify-${name}-live.ts`;

export const fullRegistry: FullEntry[] = [
  ...DISPOSABLE.map((name) => ({ name, script: script(name), args: ["--allow-disposable-mutations"] })),
  ...ALLOW_LIVE.map((name) => ({ name, script: script(name), args: ["--allow-live"] })),
  { name: "compact-observation", script: script("compact-observation"), args: [] },
  { name: "screenshot", script: script("screenshot"), args: ["--test-solid"] },
  ...SKIPPED.map(([name, skipReason]) => ({ name, script: script(name), args: [], skipReason })),
];

export interface FullRunOptions {
  cdpUrl: string;
  targetId: string;
  checkDir: string;
  signal: AbortSignal;
  scriptsDir?: string;
}

export async function runFullEntry(entry: FullEntry, options: FullRunOptions): Promise<Evidence> {
  const scriptPath = join(options.scriptsDir ?? join(projectRoot, "scripts"), entry.script);
  const args = [scriptPath, "--target", options.targetId, ...entry.args, "--output", join(options.checkDir, "evidence")];
  const child = spawn(process.execPath, args, {
    cwd: projectRoot,
    env: { ...process.env, PLASTICITY_CDP_URL: options.cdpUrl, PLASTICITY_ANALYSIS_PROVIDER: "none" },
    signal: options.signal,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout = (stdout + String(chunk)).slice(-65_536); });
  child.stderr.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-65_536); });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode) => resolve(exitCode));
  });
  await writeFile(join(options.checkDir, "stdout.log"), stdout);
  await writeFile(join(options.checkDir, "stderr.log"), stderr);
  if (code === 0) return { exitCode: 0 };
  const lastLine = stderr.trim().split("\n").at(-1) ?? "";
  throw new CheckFailure(`exit ${code ?? "signal"}: ${lastLine.slice(0, 500)}`);
}

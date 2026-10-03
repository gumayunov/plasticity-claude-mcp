import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const ANALYSIS_PROVIDERS = ["claude", "codex", "none"] as const;
export type AnalysisProvider = (typeof ANALYSIS_PROVIDERS)[number];

/** Which model backend runs the isolated analysis and reference-search turns. */
export function analysisProviderFromEnv(env: NodeJS.ProcessEnv): AnalysisProvider {
  const value = env.PLASTICITY_ANALYSIS_PROVIDER?.trim().toLowerCase() || "claude";
  if (!(ANALYSIS_PROVIDERS as readonly string[]).includes(value)) {
    throw new Error(`PLASTICITY_ANALYSIS_PROVIDER must be one of ${ANALYSIS_PROVIDERS.join(", ")}; got ${value}`);
  }
  return value as AnalysisProvider;
}

export async function inspectClaudeExecutable(
  executable: string,
  executableArgs: string[] = [],
): Promise<{ available: true; version: string } | { available: false; reason: string }> {
  try {
    const { stdout } = await execFileAsync(executable, [...executableArgs, "--version"], { encoding: "utf8", timeout: 10_000 });
    const version = stdout.trim();
    if (!version.includes("(Claude Code)")) return { available: false, reason: `Not a Claude Code executable: ${version}` };
    return { available: true, version };
  } catch (error) {
    return { available: false, reason: `Unable to run Claude Code executable: ${error instanceof Error ? error.message : String(error)}` };
  }
}

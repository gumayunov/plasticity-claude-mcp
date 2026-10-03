import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { delimiter } from "node:path";

import { createAnalysisClient } from "../src/codex/analysis-client.ts";
import { resolveAnalysisProfile, resolveReferenceSearchProfile } from "../src/codex/analysis-profile.ts";
import { createReferenceSearchClient } from "../src/codex/reference-search-client.ts";
import { createClaudeAnalysisClient } from "../src/claude/analysis-client.ts";
import { createClaudeReferenceSearchClient } from "../src/claude/reference-search-client.ts";
import { analysisProviderFromEnv, inspectClaudeExecutable } from "../src/claude/provider.ts";
import { createCompactServer, createServer, PlasticitySession, strengthDependenciesForSession } from "../src/server.ts";
import { StrengthStore } from "../src/strength/store.ts";
import { FemReportStore } from "../src/strength/fem/fem-report-store.ts";
import { PrintedThreadQualificationStore } from "../src/printing/thread-qualification.ts";

const session = new PlasticitySession();
const provider = analysisProviderFromEnv(process.env);
const assetRoot = process.env.PLASTICITY_STRENGTH_ASSET_ROOT ?? process.cwd();
const trustedImageRoots = process.env.PLASTICITY_STRENGTH_IMAGE_ROOTS
  ? process.env.PLASTICITY_STRENGTH_IMAGE_ROOTS.split(delimiter).filter(Boolean)
  : undefined;
const { profile, analysis, referenceSearchProfile, referenceSearch } = provider === "claude"
  ? await claudeAnalysis()
  : provider === "codex"
    ? await codexAnalysis()
    : {
      profile: { available: false as const, reason: "Analysis is disabled by PLASTICITY_ANALYSIS_PROVIDER=none" },
      analysis: null,
      referenceSearchProfile: { available: false as const, reason: "Reference search is disabled by PLASTICITY_ANALYSIS_PROVIDER=none" },
      referenceSearch: null,
    };

async function claudeAnalysis() {
  const executable = process.env.PLASTICITY_CLAUDE_EXECUTABLE ?? "claude";
  const model = process.env.PLASTICITY_CLAUDE_MODEL ?? "sonnet";
  const inspected = await inspectClaudeExecutable(executable);
  return {
    profile: inspected.available ? { available: true as const } : inspected,
    analysis: inspected.available
      ? await createClaudeAnalysisClient({
        executable,
        model,
        assetRoot,
        ...(trustedImageRoots ? { trustedImageRoots } : {}),
      })
      : null,
    referenceSearchProfile: inspected.available ? { available: true as const } : inspected,
    referenceSearch: inspected.available ? createClaudeReferenceSearchClient({ executable, model, cwd: assetRoot }) : null,
  };
}

async function codexAnalysis() {
  const executable = process.env.PLASTICITY_CODEX_EXECUTABLE ?? "codex";
  const profile = await resolveAnalysisProfile(executable);
  const referenceSearchProfile = await resolveReferenceSearchProfile(executable);
  return {
    profile,
    analysis: profile.available
      ? await createAnalysisClient(profile.profile, { executable, assetRoot, ...(trustedImageRoots ? { trustedImageRoots } : {}) })
      : null,
    referenceSearchProfile,
    referenceSearch: referenceSearchProfile.available
      ? await createReferenceSearchClient(referenceSearchProfile.profile, { executable, cwd: assetRoot })
      : null,
  };
}

const store = process.env.PLASTICITY_STRENGTH_ROOT
  ? new StrengthStore(process.env.PLASTICITY_STRENGTH_ROOT)
  : new StrengthStore();
const strength = strengthDependenciesForSession(session, {
  store,
  femReports: new FemReportStore(process.env.PLASTICITY_STRENGTH_ROOT),
  analysis,
  ...(profile.available ? {} : { analysisUnavailableReason: profile.reason }),
  referenceSearch,
  ...(referenceSearchProfile.available ? {} : { referenceSearchUnavailableReason: referenceSearchProfile.reason }),
});
const threadQualifications = process.env.PLASTICITY_THREAD_QUALIFICATION_ROOT
  ? new PrintedThreadQualificationStore(process.env.PLASTICITY_THREAD_QUALIFICATION_ROOT)
  : new PrintedThreadQualificationStore();
const server = process.argv.includes("--compact-tools")
  ? createCompactServer(session, strength, threadQualifications)
  : createServer(session, strength, threadQualifications);
const transport = new StdioServerTransport();
await server.connect(transport);

let closing = false;
const close = async (): Promise<void> => {
  if (closing) return;
  closing = true;
  await server.close();
};
process.once("SIGINT", () => { void close().finally(() => process.exit(130)); });
process.once("SIGTERM", () => { void close().finally(() => process.exit(143)); });

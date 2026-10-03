import { readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname } from "node:path";

import {
  ANALYSIS_BASE_INSTRUCTIONS,
  ANALYSIS_DEVELOPER_INSTRUCTIONS,
  AnalysisClientError,
  analysisOutputJsonSchema,
  analysisPrompt,
  bounded,
  hashImage,
  normalizeAnalysisResult,
  resolveTrustedImageRoots,
  sanitizeCodexFailureMessage,
  snapshotImages,
  validateImages,
  type AnalysisClient,
} from "../codex/analysis-client.ts";
import type { AnalysisFailureDiagnostics, AnalysisRequest, AnalysisResult, CodexErrorCategory } from "../strength/contracts.ts";
import { analysisResultSchema } from "../strength/schemas.ts";
import { isAbortError, requestedToolNames, runClaudeHeadless } from "./headless.ts";

export interface ClaudeAnalysisClientOptions {
  executable?: string;
  /** Arguments placed before the claude argv; lets tests run a script through node. */
  executableArgs?: string[];
  model?: string;
  assetRoot?: string;
  trustedImageRoots?: string[];
}

/**
 * Runs the strength and design-reference analysis as one isolated `claude -p`
 * turn: no built-in tools, no MCP servers, no settings or CLAUDE.md, no saved
 * session. The only thing the model can do is return the structured output.
 */
export async function createClaudeAnalysisClient(options: ClaudeAnalysisClientOptions = {}): Promise<AnalysisClient> {
  const assetRoot = await realpath(options.assetRoot ?? process.cwd());
  const trustedImageRoots = await resolveTrustedImageRoots(assetRoot, options.trustedImageRoots ?? []);
  return new ClaudeAnalysisClient(options, trustedImageRoots, await realpath(tmpdir()));
}

class ClaudeAnalysisClient implements AnalysisClient {
  private readonly options: ClaudeAnalysisClientOptions;
  private readonly trustedImageRoots: string[];
  private readonly cwd: string;
  private readonly activeControllers = new Set<AbortController>();
  private readonly activeRuns = new Set<Promise<unknown>>();
  private closed = false;

  constructor(options: ClaudeAnalysisClientOptions, trustedImageRoots: string[], cwd: string) {
    this.options = options;
    this.trustedImageRoots = trustedImageRoots;
    this.cwd = cwd;
  }

  async fingerprintImages(paths: string[], signal?: AbortSignal): Promise<string[]> {
    try {
      const validated = await validateImages(paths, this.trustedImageRoots, signal ?? new AbortController().signal);
      return await Promise.all(validated.map((path) => hashImage(path, signal)));
    } catch (error) {
      if (signal?.aborted) throw new AnalysisClientError("ANALYSIS_CANCELLED", "Image fingerprinting was cancelled");
      throw error;
    }
  }

  run(input: AnalysisRequest, options: { timeoutMs: number; signal?: AbortSignal; expectedImageHashes?: string[] }): Promise<AnalysisResult> {
    if (this.closed) return Promise.reject(new AnalysisClientError("ANALYSIS_CLIENT_CLOSED", "Analysis client is closed"));
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 180_000) {
      return Promise.reject(new AnalysisClientError("INVALID_ANALYSIS_TIMEOUT", "timeoutMs must be an integer from 1000 to 180000"));
    }
    const controller = new AbortController();
    this.activeControllers.add(controller);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs);
    const onCallerAbort = (): void => controller.abort();
    options.signal?.addEventListener("abort", onCallerAbort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const running = this.execute(input, controller.signal, options.expectedImageHashes)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) throw error;
        throw timedOut
          ? new AnalysisClientError("ANALYSIS_TIMEOUT", "Claude analysis timed out")
          : new AnalysisClientError("ANALYSIS_CANCELLED", "Claude analysis was cancelled");
      })
      .finally(() => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onCallerAbort);
        this.activeControllers.delete(controller);
        this.activeRuns.delete(running);
      });
    this.activeRuns.add(running);
    return running;
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const controller of this.activeControllers) controller.abort();
    await Promise.allSettled(this.activeRuns);
  }

  private async execute(input: AnalysisRequest, signal: AbortSignal, expectedImageHashes?: string[]): Promise<AnalysisResult> {
    let snapshot: { directory?: string; paths: string[] };
    try {
      const validated = await validateImages(input.imagePaths, this.trustedImageRoots, signal);
      snapshot = await snapshotImages(validated, expectedImageHashes, signal);
    } catch (error) {
      if (signal.aborted || error instanceof AnalysisClientError) throw error;
      const code = expectedImageHashes === undefined ? "IMAGE_NOT_READABLE" : "IMAGE_CHANGED_DURING_REQUEST";
      throw new AnalysisClientError(code, bounded(error instanceof Error ? error.message : String(error)));
    }
    try {
      const content: Record<string, unknown>[] = [{ type: "text", text: analysisPrompt(input) }];
      for (const path of snapshot.paths) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: mediaType(path), data: (await readFile(path)).toString("base64") },
        });
      }
      let run;
      try {
        run = await runClaudeHeadless({
          executable: this.options.executable ?? "claude",
          ...(this.options.executableArgs === undefined ? {} : { executableArgs: this.options.executableArgs }),
          args: this.claudeArgs(),
          cwd: this.cwd,
          input: { type: "user", message: { role: "user", content } },
          signal,
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        throw new AnalysisClientError("CLAUDE_PROCESS_FAILED", bounded(error instanceof Error ? error.message : String(error)));
      }
      const forbidden = requestedToolNames(run.events).filter((name) => name !== "StructuredOutput");
      if (forbidden.length > 0) {
        throw new AnalysisClientError("FORBIDDEN_CAPABILITY_REQUEST", `Claude requested forbidden capability: ${forbidden.join(", ")}`);
      }
      const result = run.result;
      if (result === undefined) {
        throw new AnalysisClientError("CLAUDE_PROCESS_FAILED", bounded(`claude exited with ${run.exit} without a result${run.stderr ? `: ${run.stderr.slice(-160)}` : ""}`));
      }
      if (result.is_error === true || result.subtype !== "success") {
        const failureDiagnostics = readFailureDiagnostics(result.result);
        throw new AnalysisClientError("CLAUDE_TURN_FAILED", `Claude analysis turn ended with ${String(result.subtype)}`, failureDiagnostics);
      }
      if (result.structured_output === undefined || result.structured_output === null) {
        throw new AnalysisClientError("INVALID_ANALYSIS_RESULT", `Claude completed without structured output: ${bounded(String(result.result ?? ""))}`);
      }
      const parsed = analysisResultSchema.safeParse(normalizeAnalysisResult(result.structured_output));
      if (!parsed.success) {
        throw new AnalysisClientError("INVALID_ANALYSIS_RESULT", `Claude returned invalid analysis JSON: ${bounded(parsed.error.message)}`);
      }
      return parsed.data as AnalysisResult;
    } finally {
      if (snapshot.directory !== undefined) await rm(snapshot.directory, { recursive: true, force: true });
    }
  }

  private claudeArgs(): string[] {
    return [
      "-p",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
      "--json-schema", JSON.stringify(analysisOutputJsonSchema()),
      "--system-prompt", `${ANALYSIS_BASE_INSTRUCTIONS}\n\n${ANALYSIS_DEVELOPER_INSTRUCTIONS}`,
      "--tools", "",
      "--strict-mcp-config",
      "--setting-sources", "",
      "--no-session-persistence",
      ...(this.options.model === undefined ? [] : ["--model", this.options.model]),
    ];
  }
}

function mediaType(path: string): string {
  return extname(path).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
}

const ERROR_TYPE_CATEGORIES: Record<string, CodexErrorCategory> = {
  invalid_request_error: "badRequest",
  authentication_error: "unauthorized",
  permission_error: "unauthorized",
  rate_limit_error: "rateLimitExceeded",
  overloaded_error: "serverOverloaded",
  api_error: "internalServerError",
};

/** Parses claude's `API Error: <status> <json>` result text into stored diagnostics. */
function readFailureDiagnostics(resultText: unknown): AnalysisFailureDiagnostics | undefined {
  if (typeof resultText !== "string") return undefined;
  const match = /API Error: (\d{3})\s*(\{.*\})?/s.exec(resultText);
  let category: CodexErrorCategory | undefined;
  let detail: string | undefined;
  if (match?.[2]) {
    try {
      const parsed: unknown = JSON.parse(match[2]);
      const error = typeof parsed === "object" && parsed !== null ? (parsed as { error?: { type?: unknown; message?: unknown } }).error : undefined;
      if (typeof error?.type === "string") category = ERROR_TYPE_CATEGORIES[error.type];
      if (typeof error?.message === "string") detail = error.message;
    } catch {
      // Keep the raw text below.
    }
  }
  const status = match ? Number(match[1]) : undefined;
  const httpStatusCode = status !== undefined && status >= 100 && status <= 599 ? status : undefined;
  const message = sanitizeCodexFailureMessage(detail ?? resultText);
  if (category === undefined && httpStatusCode === undefined && message === undefined) return undefined;
  return {
    ...(category === undefined ? {} : { category }),
    ...(httpStatusCode === undefined ? {} : { httpStatusCode }),
    ...(message === undefined ? {} : { message }),
  };
}

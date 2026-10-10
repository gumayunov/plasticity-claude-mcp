import { CheckFailure } from "./harness.ts";
import type { CheckResult, Evidence } from "./types.ts";

export class TimeoutError extends Error {
  override name = "TimeoutError";
}

export interface PlannedCheck {
  name: string;
  timeoutMs: number;
  skipReason?: string;
  execute(signal: AbortSignal): Promise<Evidence>;
}

export interface RunnerHooks {
  reset(): Promise<void>;
  restart(): Promise<void>;
  onResult?(result: CheckResult): void | Promise<void>;
  now?(): number;
}

export interface RunOutcome {
  results: CheckResult[];
  aborted: boolean;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2000);
}

export async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Reject first: abort() synchronously rejects the work, and the race must see the timeout.
      reject(new TimeoutError(label));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runChecks(checks: PlannedCheck[], hooks: RunnerHooks): Promise<RunOutcome> {
  const now = hooks.now ?? (() => Date.now());
  const results: CheckResult[] = [];
  let aborted = false;
  let abortReason = "";
  const record = async (result: CheckResult) => {
    results.push(result);
    await hooks.onResult?.(result);
  };

  for (const check of checks) {
    if (check.skipReason !== undefined) {
      await record({ name: check.name, status: "skipped", durationMs: 0, message: check.skipReason });
      continue;
    }
    if (aborted) {
      await record({ name: check.name, status: "skipped", durationMs: 0, message: abortReason });
      continue;
    }
    try {
      await hooks.reset();
    } catch {
      try {
        await hooks.restart();
        await hooks.reset();
      } catch (error) {
        aborted = true;
        abortReason = `Harness aborted: reset failed after restart: ${errorMessage(error)}`;
        await record({ name: check.name, status: "skipped", durationMs: 0, message: abortReason });
        continue;
      }
    }
    const started = now();
    try {
      const evidence = await withTimeout((signal) => check.execute(signal), check.timeoutMs, `${check.name} timed out after ${check.timeoutMs} ms`);
      await record({ name: check.name, status: "pass", durationMs: now() - started, evidence });
    } catch (error) {
      await record({
        name: check.name,
        status: error instanceof CheckFailure ? "fail" : "error",
        durationMs: now() - started,
        message: errorMessage(error),
      });
      if (error instanceof TimeoutError) {
        try {
          await hooks.restart();
        } catch (restartError) {
          aborted = true;
          abortReason = `Harness aborted: restart failed: ${errorMessage(restartError)}`;
        }
      }
    }
  }
  return { results, aborted };
}

export function exitCodeFor(outcome: RunOutcome, regressions: number): 0 | 1 {
  const broken = outcome.results.some((result) => result.status === "fail" || result.status === "error");
  return broken || outcome.aborted || regressions > 0 ? 1 : 0;
}

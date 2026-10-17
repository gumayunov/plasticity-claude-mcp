import assert from "node:assert/strict";
import test from "node:test";

import { CheckFailure } from "./harness.ts";
import { exitCodeFor, runChecks, TimeoutError, withTimeout, type PlannedCheck, type RunnerHooks } from "./runner.ts";

function hooks(overrides: Partial<RunnerHooks> = {}) {
  const log: string[] = [];
  const value: RunnerHooks = {
    async reset() { log.push("reset"); },
    async restart() { log.push("restart"); },
    onResult(result) { log.push(`result:${result.name}:${result.status}`); },
    ...overrides,
  };
  return { hooks: value, log };
}

const check = (name: string, execute: PlannedCheck["execute"], timeoutMs = 1_000): PlannedCheck => ({ name, timeoutMs, execute });

test("classifies pass, fail and error and resets before every check", async () => {
  const { hooks: h, log } = hooks();
  const outcome = await runChecks([
    check("ok", async () => ({ width: 20 })),
    check("bad", async () => { throw new CheckFailure("expected 6 faces"); }),
    check("boom", async () => { throw new Error("tool crashed"); }),
  ], h);
  assert.deepEqual(outcome.results.map((result) => result.status), ["pass", "fail", "error"]);
  assert.deepEqual(outcome.results[0]!.evidence, { width: 20 });
  assert.equal(outcome.results[1]!.message, "expected 6 faces");
  assert.deepEqual(log, ["reset", "result:ok:pass", "reset", "result:bad:fail", "reset", "result:boom:error"]);
  assert.equal(outcome.aborted, false);
});

test("skipReason records skipped without touching the document", async () => {
  const { hooks: h, log } = hooks();
  const outcome = await runChecks([{ name: "needs-network", timeoutMs: 1_000, skipReason: "needs network", execute: async () => ({}) }], h);
  assert.deepEqual(outcome.results.map((result) => [result.status, result.message]), [["skipped", "needs network"]]);
  assert.deepEqual(log, ["result:needs-network:skipped"]);
});

test("failed reset restarts once and continues", async () => {
  let resets = 0;
  const { hooks: h, log } = hooks({ async reset() { resets += 1; log.push("reset"); if (resets === 1) throw new Error("modal dialog"); } });
  const outcome = await runChecks([check("ok", async () => ({}))], h);
  assert.equal(outcome.results[0]!.status, "pass");
  assert.deepEqual(log, ["reset", "restart", "reset", "result:ok:pass"]);
});

test("reset failing after restart aborts and skips the rest", async () => {
  const { hooks: h } = hooks({ async reset() { throw new Error("still dirty"); } });
  const outcome = await runChecks([check("a", async () => ({})), check("b", async () => ({}))], h);
  assert.equal(outcome.aborted, true);
  assert.deepEqual(outcome.results.map((result) => result.status), ["skipped", "skipped"]);
  assert.match(outcome.results[0]!.message ?? "", /still dirty/);
});

test("timeout aborts the signal, records error and restarts", async () => {
  let aborted = false;
  const { hooks: h, log } = hooks();
  const outcome = await runChecks([
    check("slow", (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); })), 20),
    check("next", async () => ({})),
  ], h);
  assert.equal(aborted, true);
  assert.equal(outcome.results[0]!.status, "error");
  assert.match(outcome.results[0]!.message ?? "", /timed out after 20 ms/);
  assert.deepEqual(log, ["reset", "result:slow:error", "restart", "reset", "result:next:pass"]);
});

test("restart failure after a timeout aborts the run", async () => {
  const { hooks: h } = hooks({ async restart() { throw new Error("cannot launch"); } });
  const outcome = await runChecks([
    check("slow", () => new Promise(() => {}), 10),
    check("next", async () => ({})),
  ], h);
  assert.equal(outcome.aborted, true);
  assert.deepEqual(outcome.results.map((result) => result.status), ["error", "skipped"]);
});

test("withTimeout resolves fast work and rejects slow work with TimeoutError", async () => {
  assert.equal(await withTimeout(async () => 7, 50, "fast"), 7);
  await assert.rejects(withTimeout(() => new Promise(() => {}), 10, "slow"), TimeoutError);
});

test("exitCodeFor", () => {
  const pass = { name: "a", status: "pass" as const, durationMs: 1 };
  assert.equal(exitCodeFor({ results: [pass], aborted: false }, 0), 0);
  assert.equal(exitCodeFor({ results: [pass, { ...pass, status: "skipped" }], aborted: false }, 0), 0);
  assert.equal(exitCodeFor({ results: [{ ...pass, status: "fail" }], aborted: false }, 0), 1);
  assert.equal(exitCodeFor({ results: [{ ...pass, status: "error" }], aborted: false }, 0), 1);
  assert.equal(exitCodeFor({ results: [pass], aborted: true }, 0), 1);
  assert.equal(exitCodeFor({ results: [pass], aborted: false }, 1), 1);
});

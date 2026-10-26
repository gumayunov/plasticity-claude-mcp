import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  baselinePath, diffAgainstBaseline, formatDuration, formatResultLine, formatSummary, numericLeaves,
  readBaseline, renderMarkdown, writeBaseline, writeRunReports,
} from "./report.ts";
import type { CheckResult, RunReport } from "./types.ts";

const report = (results: CheckResult[], extra: Partial<RunReport> = {}): RunReport => ({
  schemaVersion: 1, tier: "smoke", startedAt: "2026-10-10T10:00:00.000Z", finishedAt: "2026-10-10T10:02:41.000Z", aborted: false, results, ...extra,
});
const result = (name: string, status: CheckResult["status"], evidence?: Record<string, unknown>): CheckResult =>
  ({ name, status, durationMs: 1800, ...(evidence ? { evidence } : {}) });

test("numericLeaves skips volatile keys", () => {
  const leaves = numericLeaves({ id: 5, revision: 3, bodyId: 9, edgeIds: [1, 2], undoDepth: 4, boundsMm: { min: [0, 0, 0], max: [20, 10, 5] }, faceCount: 6 });
  assert.deepEqual([...leaves.keys()].sort(), ["boundsMm.max[0]", "boundsMm.max[1]", "boundsMm.max[2]", "boundsMm.min[0]", "boundsMm.min[1]", "boundsMm.min[2]", "faceCount"]);
});

test("diff without baseline is null", () => {
  assert.equal(diffAgainstBaseline(report([result("a", "pass")]), null), null);
});

test("diff finds regressions, fixes, new, removed and drift", () => {
  const baseline = report([
    result("reg", "pass"), result("fix", "fail"), result("gone", "pass"),
    result("drift", "pass", { faceCount: 10, widthMm: 20 }),
    result("stable", "pass", { widthMm: 20 }),
  ]);
  const current = report([
    result("reg", "error"), result("fix", "pass"), result("new", "pass"),
    result("drift", "pass", { faceCount: 12, widthMm: 20.005 }),
    result("stable", "pass", { widthMm: 20.02 }),
  ]);
  const diff = diffAgainstBaseline(current, baseline)!;
  assert.deepEqual(diff.regressions, ["reg"]);
  assert.deepEqual(diff.fixed, ["fix"]);
  assert.deepEqual(diff.added, ["new"]);
  assert.deepEqual(diff.removed, ["gone"]);
  assert.deepEqual(diff.drift, [
    { name: "drift", path: "faceCount", baseline: 10, current: 12 },
    { name: "stable", path: "widthMm", baseline: 20, current: 20.02 },
  ]);
});

test("console formatting", () => {
  assert.equal(formatDuration(1800), "1.8s");
  assert.equal(formatDuration(161_000), "2m 41s");
  assert.match(formatResultLine(result("box-primitive", "pass")), /^✔ box-primitive\s+1\.8s$/);
  assert.match(formatResultLine({ ...result("fillet", "fail"), message: "expected 12 faces\nmore" }), /^✘ fillet\s+1\.8s {2}expected 12 faces$/);
  const summary = formatSummary(report([result("a", "pass"), result("b", "fail")]), { regressions: ["b"], fixed: [], added: [], removed: [], drift: [] });
  assert.equal(summary, "smoke: 1 pass, 1 fail, 0 error, 0 skipped · 2m 41s · 1 regression(s) vs baseline");
  assert.match(formatSummary(report([], { aborted: true }), null), /no baseline · ABORTED$/);
});

test("markdown lists results and changes, escaping table pipes", () => {
  const markdown = renderMarkdown(report([{ ...result("a", "fail"), message: "x | y" }]), { regressions: ["a"], fixed: [], added: [], removed: [], drift: [] });
  assert.match(markdown, /\| a \| ✘ fail \| 1\.8s \| x \\\| y \|/);
  assert.match(markdown, /### Regressions\n\n- a/);
  assert.match(renderMarkdown(report([]), null), /No baseline yet/);
});

test("reports and baseline round-trip; writeBaseline refuses broken runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "live-report-test-"));
  try {
    const good = report([result("a", "pass", { widthMm: 20 })]);
    await writeRunReports(join(root, "run"), good, null);
    assert.equal(JSON.parse(await readFile(join(root, "run", "report.json"), "utf8")).results[0].name, "a");
    assert.match(await readFile(join(root, "run", "report.md"), "utf8"), /# Live run: smoke/);
    assert.equal(await readBaseline(root, "smoke"), null);
    assert.equal(await writeBaseline(root, good), baselinePath(root, "smoke"));
    assert.deepEqual(await readBaseline(root, "smoke"), good);
    await assert.rejects(writeBaseline(root, report([result("a", "error")])), /Refusing to update baseline/);
    await assert.rejects(writeBaseline(root, report([], { aborted: true })), /Refusing to update baseline/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

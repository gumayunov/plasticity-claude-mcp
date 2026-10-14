import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ERROR_HINTS, formatValidationIssues, nextStepFor, withNextStep } from "./error-hints.ts";

const SAMPLES: Record<string, { message: string; sourceFragment: string }> = {
  "stale-revision": { message: "Stale reference: expected revision r1, current revision is r2", sourceFragment: "Stale reference: expected revision" },
  "stale-topology": { message: "Stale or unknown face 1:f3", sourceFragment: "Stale or unknown face" },
  uncertain: { message: "Previous mutation outcome is uncertain; call reconcile before another mutation", sourceFragment: "outcome is uncertain" },
  busy: { message: "Plasticity command failed: Error: Plasticity is busy", sourceFragment: "Plasticity is busy" },
  "not-connected": { message: "Connect to an explicit Plasticity window first", sourceFragment: "Connect to an explicit Plasticity window first" },
};

function sources(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) out.push(readFileSync(path, "utf8"));
  }
  return out;
}

test("every hint matches a real error message that exists in the code", () => {
  const code = sources(fileURLToPath(new URL("../", import.meta.url))).join("\n");
  assert.deepEqual(ERROR_HINTS.map((hint) => hint.id).sort(), Object.keys(SAMPLES).sort());
  for (const [id, sample] of Object.entries(SAMPLES)) {
    assert.equal(nextStepFor(sample.message)?.id, id, id);
    assert.ok(code.includes(sample.sourceFragment), `${id}: "${sample.sourceFragment}" not found in src`);
  }
});

test("other stale topology messages are recognised", () => {
  for (const message of ["Unknown current body IDs: 4", "Unknown current Wire ID 9", "Unknown native instance ID 2", "Unknown native reference mesh ID 7", "Stale or unknown faces: 1:f1"]) {
    assert.equal(nextStepFor(message)?.id, "stale-topology", message);
  }
});

test("withNextStep appends once and leaves unknown errors alone", () => {
  const once = withNextStep("Plasticity is busy");
  assert.match(once, /^Plasticity is busy\nNext step: A command is active in Plasticity/);
  assert.equal(withNextStep(once), once);
  assert.equal(withNextStep("Something else"), "Something else");
});

test("validation issues are compact", () => {
  const text = formatValidationIssues("plasticity_create_box", [
    { path: ["sizeMm", 2], message: "Too small: expected number to be >0" },
    { path: [], message: "Unrecognized key: \"color\"" },
  ]);
  assert.equal(text, [
    "Invalid arguments for plasticity_create_box:",
    "- sizeMm[2]: Too small: expected number to be >0",
    "- (root): Unrecognized key: \"color\"",
    "Next step: request the schema with plasticity_call toolName=\"catalog\" query=\"plasticity_create_box\".",
  ].join("\n"));
  const many = formatValidationIssues("t", Array.from({ length: 12 }, (_, index) => ({ path: ["a", index], message: "bad" })));
  assert.match(many, /- …and 2 more/);
});

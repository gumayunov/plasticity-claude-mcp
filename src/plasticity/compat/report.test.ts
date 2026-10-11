import assert from "node:assert/strict";
import { test } from "node:test";

import { plasticity26_1_3 } from "./profiles/26.1.3.ts";
import { buildCompatibilityReport, renderCompatibilityMarkdown } from "./report.ts";

const manifest = { tools: {
  plasticity_create_box: { methods: ["createBox"], bindings: ["ThreePointBoxFactory", "Vector3"], commands: ["BoxCommand"] },
  plasticity_fillet: { methods: ["fillet"], bindings: ["FilletFactory"], commands: [] },
} };
const compatibility = { version: "27.0.0", status: "untested" as const, profile: "26.1.3", discoveryStrategy: "command-log-scopes", warnings: [] };

test("everything present is ok", () => {
  const report = buildCompatibilityReport(
    { compatibility, bindings: ["ThreePointBoxFactory", "Vector3", "FilletFactory"], commands: ["BoxCommand"], missingPaths: [] },
    manifest, plasticity26_1_3,
  );
  assert.equal(report.ok, true);
  assert.deepEqual(report.affectedTools, []);
});

test("missing factories, commands and paths list affected tools; aliases are honoured", () => {
  const report = buildCompatibilityReport(
    { compatibility, bindings: ["BoxFactory3", "Vector3", "ChamferFactory"], commands: [], missingPaths: ["geometryModel"] },
    manifest, { ...plasticity26_1_3, bindingAliases: { ThreePointBoxFactory: "BoxFactory3" } },
  );
  assert.equal(report.ok, false);
  assert.deepEqual(report.editorPaths.missing, ["geometryModel"]);
  assert.deepEqual(report.bindings.missing, [{ name: "FilletFactory", resolvedAs: "FilletFactory", tools: ["plasticity_fillet"] }]);
  assert.deepEqual(report.commands.missing, [{ name: "BoxCommand", tools: ["plasticity_create_box"] }]);
  assert.deepEqual(report.bindings.unexpected, ["ChamferFactory"]);
  assert.deepEqual(report.affectedTools, ["plasticity_create_box", "plasticity_fillet"]);
  const markdown = renderCompatibilityMarkdown(report);
  assert.match(markdown, /# Plasticity compatibility: 27\.0\.0/);
  assert.match(markdown, /FilletFactory.*plasticity_fillet/);
});

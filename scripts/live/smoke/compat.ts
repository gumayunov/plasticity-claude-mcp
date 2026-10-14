import { requireCondition } from "../harness.ts";
import type { LiveCheck } from "../types.ts";

export const compatibilityReport: LiveCheck = {
  name: "compat-report",
  async run({ mcp }) {
    const report = await mcp.call("plasticity_compatibility_report", {});
    requireCondition(report.plasticity.status === "supported", `expected a supported Plasticity, got ${report.plasticity.status} (${report.plasticity.version})`);
    requireCondition(report.ok === true, `compatibility problems: ${report.affectedTools.length} tool(s) affected`);
    return { missingFactories: report.bindings.missing.length, missingCommands: report.commands.missing.length, missingPaths: report.editorPaths.missing.length };
  },
};

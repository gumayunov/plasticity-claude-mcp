import type { CompatibilityProbe, RuntimeCompatibility } from "../runtime.ts";
import type { RequirementsManifest } from "./requirements.ts";
import type { CompatProfile } from "./types.ts";

export interface CompatibilityReport {
  plasticity: RuntimeCompatibility;
  editorPaths: { missing: string[] };
  bindings: { required: number; missing: Array<{ name: string; resolvedAs: string; tools: string[] }>; unexpected: string[] };
  commands: { required: number; missing: Array<{ name: string; tools: string[] }> };
  affectedTools: string[];
  ok: boolean;
}

function usersOf(manifest: RequirementsManifest, key: "bindings" | "commands"): Map<string, string[]> {
  const users = new Map<string, string[]>();
  for (const [tool, requirements] of Object.entries(manifest.tools)) {
    for (const name of requirements[key]) users.set(name, [...(users.get(name) ?? []), tool]);
  }
  return users;
}

export function buildCompatibilityReport(probe: CompatibilityProbe, manifest: RequirementsManifest, profile: CompatProfile): CompatibilityReport {
  const present = new Set(probe.bindings);
  const commandsPresent = new Set(probe.commands);
  const bindingUsers = usersOf(manifest, "bindings");
  const commandUsers = usersOf(manifest, "commands");
  // Names used in the sources but not traced to a tool are checked too, with no affected tools listed.
  for (const name of manifest.allBindings ?? []) if (!bindingUsers.has(name)) bindingUsers.set(name, []);
  for (const name of manifest.allCommands ?? []) if (!commandUsers.has(name)) commandUsers.set(name, []);
  const missingBindings = [...bindingUsers].sort(([a], [b]) => a.localeCompare(b)).flatMap(([name, tools]) => {
    const resolvedAs = profile.bindingAliases[name] ?? name;
    return present.has(resolvedAs) ? [] : [{ name, resolvedAs, tools: tools.sort() }];
  });
  const missingCommands = [...commandUsers].sort(([a], [b]) => a.localeCompare(b)).flatMap(([name, tools]) =>
    commandsPresent.has(name) ? [] : [{ name, tools: tools.sort() }]);
  const known = new Set([...bindingUsers.keys()].map((name) => profile.bindingAliases[name] ?? name));
  const unexpected = probe.bindings.filter((name) => /(Factory|Command)$/.test(name) && !known.has(name)).sort();
  const affected = new Set([...missingBindings, ...missingCommands].flatMap((entry) => entry.tools));
  if (probe.missingPaths.length > 0) Object.keys(manifest.tools).forEach((tool) => affected.add(tool));
  return {
    plasticity: probe.compatibility,
    editorPaths: { missing: probe.missingPaths },
    bindings: { required: bindingUsers.size, missing: missingBindings, unexpected },
    commands: { required: commandUsers.size, missing: missingCommands },
    affectedTools: [...affected].sort(),
    ok: missingBindings.length === 0 && missingCommands.length === 0 && probe.missingPaths.length === 0,
  };
}

export function renderCompatibilityMarkdown(report: CompatibilityReport): string {
  const list = (items: string[]) => items.length === 0 ? "- none\n" : `${items.map((item) => `- ${item}`).join("\n")}\n`;
  return [
    `# Plasticity compatibility: ${report.plasticity.version ?? "unknown version"}`,
    "",
    `- Status: ${report.plasticity.status} (profile ${report.plasticity.profile})`,
    `- Discovery: ${report.plasticity.discoveryStrategy}`,
    `- Result: ${report.ok ? "OK" : `${report.affectedTools.length} tool(s) affected`}`,
    ...report.plasticity.warnings.map((warning) => `- Warning: ${warning}`),
    "",
    "## Missing editor paths",
    list(report.editorPaths.missing),
    `## Missing factories (of ${report.bindings.required})`,
    list(report.bindings.missing.map((entry) => `${entry.name}${entry.resolvedAs !== entry.name ? ` (as ${entry.resolvedAs})` : ""} — ${entry.tools.join(", ")}`)),
    `## Missing commands (of ${report.commands.required})`,
    list(report.commands.missing.map((entry) => `${entry.name} — ${entry.tools.join(", ")}`)),
    "## New factories not used by this server",
    list(report.bindings.unexpected),
  ].join("\n");
}

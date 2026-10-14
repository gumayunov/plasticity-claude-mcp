export interface ErrorHint {
  id: string;
  pattern: RegExp;
  hint: string;
}

export const ERROR_HINTS: readonly ErrorHint[] = [
  { id: "stale-revision", pattern: /Stale (reference|document revision)/, hint: "Call plasticity_status, re-read the IDs you need from the new revision, then retry with that revision." },
  { id: "stale-topology", pattern: /Stale or unknown (face|edge)|Unknown current (body|Wire)|Unknown native (instance|reference mesh)/i, hint: "Topology IDs changed. Find current IDs with plasticity_find_faces, plasticity_find_edges or plasticity_body_info for the current revision." },
  { id: "uncertain", pattern: /outcome is uncertain/, hint: "Call plasticity_reconcile before anything else; do not retry or undo the operation." },
  { id: "busy", pattern: /Plasticity is busy/, hint: "A command is active in Plasticity. Ask the user to finish it or press Esc in Plasticity, then retry once." },
  { id: "not-connected", pattern: /Connect to (an explicit|a) Plasticity window/i, hint: "Call plasticity_list_windows, then plasticity_connect with the chosen window." },
];

const NEXT_STEP = "\nNext step: ";

export function nextStepFor(message: string): ErrorHint | undefined {
  return ERROR_HINTS.find((hint) => hint.pattern.test(message));
}

export function withNextStep(message: string): string {
  if (message.includes(NEXT_STEP)) return message;
  const hint = nextStepFor(message);
  return hint ? `${message}${NEXT_STEP}${hint.hint}` : message;
}

function issuePath(path: ReadonlyArray<PropertyKey>): string {
  if (path.length === 0) return "(root)";
  return path.map((part, index) => typeof part === "number" ? `[${part}]` : `${index === 0 ? "" : "."}${String(part)}`).join("");
}

export function formatValidationIssues(toolName: string, issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): string {
  const lines = issues.slice(0, 10).map((issue) => `- ${issuePath(issue.path)}: ${issue.message}`);
  if (issues.length > 10) lines.push(`- …and ${issues.length - 10} more`);
  return [
    `Invalid arguments for ${toolName}:`,
    ...lines,
    `Next step: request the schema with plasticity_call toolName="catalog" query="${toolName}".`,
  ].join("\n");
}

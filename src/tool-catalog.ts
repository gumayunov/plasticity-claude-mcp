export type ToolCatalogMode = "compact" | "full";

// Keep the common connect, inspect, change-tracking, and delivery path visible.
// Every other registered operation remains discoverable and callable through plasticity_call.
const compactTools = new Set([
  "plasticity_list_windows",
  "plasticity_connect",
  "plasticity_status",
  "plasticity_current_selection",
  "plasticity_list_bodies",
  "plasticity_body_info",
  "plasticity_capture_snapshot",
  "plasticity_changes_since",
  "plasticity_reconcile",
  "plasticity_screenshot",
]);

export function exposeDirectTool(mode: ToolCatalogMode, name: string): boolean {
  return mode === "full" || compactTools.has(name);
}

/** Catalog pages longer than this list operations without input schemas. */
export const CATALOG_SCHEMA_PAGE_LIMIT = 3;

// Light English stemming so query and tool words meet halfway:
// bodies/body, holes/hole, validity/validate, sheets/sheet
const SUFFIXES: Array<[string, string]> = [
  ["ations", ""], ["ation", ""], ["ities", ""], ["ity", ""], ["ates", ""], ["ate", ""],
  ["ings", ""], ["ing", ""], ["ies", "y"], ["es", ""], ["s", ""], ["ed", ""],
];

function stem(word: string): string {
  for (const [suffix, replacement] of SUFFIXES) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) return word.slice(0, -suffix.length) + replacement;
  }
  return word;
}

function words(text: string): string[] {
  return text.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stem);
}

// The query word is a prefix of the tool word, or a stem left slightly longer
// by the stemming ("hole" against "hol" from "holes")
function wordMatches(term: string, word: string): boolean {
  return word.startsWith(term) || (word.length >= 3 && term.startsWith(word) && term.length - word.length <= 2);
}

// Same word up to an ending the stemming left behind ("hole" and "hol")
function sameWord(term: string, word: string): boolean {
  return wordMatches(term, word) && Math.abs(term.length - word.length) <= 1;
}

/**
 * Relevance of an operation for a catalog query. Each query word counts on its
 * own: 3 when it is a word of the tool name, 2 when it starts one ("line" in
 * "linear"), 1 when it only matches the description (or, for a word with
 * underscores, a substring of the name). One more point when the query covers
 * every word of the name, so "delete bodies" prefers plasticity_delete over
 * plasticity_delete_instances.
 */
export function catalogScore(query: string, candidate: { name: string; description: string }): number {
  const name = candidate.name.toLocaleLowerCase();
  const nameWords = words(name.replace(/^plasticity_/, ""));
  const descriptionWords = words(candidate.description);
  const covered = new Set<string>();
  const score = query.toLocaleLowerCase().split(/\s+/).filter(Boolean).reduce((sum, raw) => {
    const term = stem(raw);
    const inName = nameWords.filter((word) => wordMatches(term, word));
    inName.forEach((word) => covered.add(word));
    if (inName.some((word) => sameWord(term, word))) return sum + 3;
    if (inName.length > 0) return sum + 2;
    if (descriptionWords.some((word) => wordMatches(term, word)) || name.includes(raw)) return sum + 1;
    return sum;
  }, 0);
  return score > 0 && nameWords.every((word) => covered.has(word)) ? score + 1 : score;
}

/** First sentence of an operation description, for catalog listings without schemas. */
export function catalogSummary(description: string): string {
  const sentence = /^[\s\S]*?[.!?](?=\s|$)/.exec(description)?.[0] ?? description;
  return sentence.length > 240 ? `${sentence.slice(0, 237)}...` : sentence;
}

/**
 * Shrink an exported JSON Schema without changing what it accepts: drop the
 * `$schema` marker and write fixed-length tuples of one item type, such as
 * millimetre vectors, as a plain array with equal min and max length.
 */
export function compactJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(compactJsonSchema);
  if (typeof schema !== "object" || schema === null) return schema;
  const { $schema: _, ...rest } = schema as Record<string, unknown>;
  const node = Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, compactJsonSchema(value)]));
  const prefixItems = node.prefixItems;
  if (
    node.type === "array" && node.items === false && Array.isArray(prefixItems) && prefixItems.length > 0
    && node.minItems === prefixItems.length && node.maxItems === prefixItems.length
    && prefixItems.every((item) => JSON.stringify(item) === JSON.stringify(prefixItems[0]))
  ) {
    const { prefixItems: __, items: ___, ...array } = node;
    return { ...array, items: prefixItems[0] };
  }
  return node;
}

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
  "plasticity_toolsets",
  "plasticity_enable_toolset",
  "plasticity_view",
]);

export function exposeDirectTool(mode: ToolCatalogMode, name: string): boolean {
  return mode === "full" || compactTools.has(name);
}

/** Catalog pages longer than this list operations without input schemas. */
export const CATALOG_SCHEMA_PAGE_LIMIT = 3;

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

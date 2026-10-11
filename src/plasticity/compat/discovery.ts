export interface CdpLike {
  send(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
}

export interface DiscoveryResult {
  editorId: string;
  bindings: Map<string, string>;
  strategy: string;
  temporaryObjectIds: string[];
}

export class DiscoveryError extends Error {
  override name = "DiscoveryError";
  readonly attempts: Array<{ strategy: string; reason: string }>;

  constructor(attempts: Array<{ strategy: string; reason: string }>) {
    super(`Plasticity editor was not found (${attempts.map((attempt) => `${attempt.strategy}: ${attempt.reason}`).join("; ")}). See docs/compat.md`);
    this.attempts = attempts;
  }
}

interface PropertyDescriptor {
  name: string;
  value?: { objectId?: string; description?: string; type?: string };
}

const EDITOR_SIGNATURE = "function () { return Boolean(this && this.geo && this.executor && this.db); }";
const MAX_EDITOR_CANDIDATES = 200;

async function properties(client: CdpLike, objectId: string): Promise<{ result: PropertyDescriptor[]; internalProperties?: PropertyDescriptor[] }> {
  return await client.send("Runtime.getProperties", { objectId, ownProperties: true }) as { result: PropertyDescriptor[]; internalProperties?: PropertyDescriptor[] };
}

async function commandLogScopes(client: CdpLike): Promise<DiscoveryResult> {
  const handler = await client.send("Runtime.evaluate", {
    expression: "document.querySelector('command-log')?.handleCommandStarted",
    returnByValue: false,
  }) as { result?: { objectId?: string } };
  const handlerId = handler.result?.objectId;
  if (!handlerId) throw new Error("command-log.handleCommandStarted is not available");
  const handlerProperties = await properties(client, handlerId);
  const scopesId = handlerProperties.internalProperties?.find((property) => property.name === "[[Scopes]]")?.value?.objectId;
  if (!scopesId) throw new Error("command-log handler has no [[Scopes]]");
  const scopeEntries = (await properties(client, scopesId)).result
    .filter((property) => /^\d+$/.test(property.name) && property.value?.objectId)
    .sort((a, b) => Number(a.name) - Number(b.name))
    .filter((property) => !(property.value?.description ?? "").startsWith("Global"));
  const temporary = [handlerId, scopesId];
  const scopes: PropertyDescriptor[][] = [];
  for (const entry of scopeEntries) {
    temporary.push(entry.value!.objectId!);
    scopes.push((await properties(client, entry.value!.objectId!)).result);
  }
  const flat = scopes.flat().filter((property) => property.value?.objectId);
  let editorId = flat.find((property) => property.name === "editor")?.value?.objectId;
  if (!editorId) {
    for (const candidate of flat.slice(0, MAX_EDITOR_CANDIDATES)) {
      const probe = await client.send("Runtime.callFunctionOn", {
        objectId: candidate.value!.objectId,
        functionDeclaration: EDITOR_SIGNATURE,
        returnByValue: true,
      }) as { result?: { value?: unknown } };
      if (probe.result?.value === true) {
        editorId = candidate.value!.objectId;
        break;
      }
    }
  }
  if (!editorId) throw new Error(`no editor object in ${scopes.length} closure scopes`);
  const bindings = new Map<string, string>();
  for (const property of flat) {
    const objectId = property.value!.objectId!;
    if (objectId === editorId || bindings.has(property.name)) continue;
    bindings.set(property.name, objectId);
  }
  return { editorId, bindings, strategy: "command-log-scopes", temporaryObjectIds: temporary };
}

const STRATEGIES: Array<[string, (client: CdpLike) => Promise<DiscoveryResult>]> = [["command-log-scopes", commandLogScopes]];

export async function discoverNativeReferences(client: CdpLike): Promise<DiscoveryResult> {
  const attempts: Array<{ strategy: string; reason: string }> = [];
  for (const [strategy, run] of STRATEGIES) {
    try {
      return await run(client);
    } catch (error) {
      attempts.push({ strategy, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  throw new DiscoveryError(attempts);
}

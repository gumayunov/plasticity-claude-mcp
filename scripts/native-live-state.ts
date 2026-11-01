/** Acceptance suites need detailed topology; MCP mutation responses are compact. */
export async function hydrateNativeState(
  result: any,
  bodyInfo: (id: number) => Promise<any>,
  bodyPage?: (offset: number, revision: string) => Promise<any>,
): Promise<any> {
  if (!result?.documentToken || !result.revision || !Number.isInteger(result.undoDepth) || !Array.isArray(result.bodies)) return result;
  const summaries = [...result.bodies];
  let nextOffset = result.bodyPagination?.nextOffset;
  const offsets = new Set<number>();
  while (typeof nextOffset === "number") {
    if (!bodyPage) throw new Error("Acceptance requires all body pages");
    if (offsets.has(nextOffset)) throw new Error("Acceptance body pagination did not advance");
    offsets.add(nextOffset);
    const page = await bodyPage(nextOffset, result.revision);
    if (page.documentToken !== result.documentToken || page.revision !== result.revision || !Array.isArray(page.bodies)) {
      throw new Error("Document changed while acceptance topology was being read");
    }
    summaries.push(...page.bodies);
    nextOffset = page.bodyPagination?.nextOffset;
  }
  const bodies = [];
  const ids = new Set<number>();
  for (const [index, body] of summaries.entries()) {
    if (ids.has(body.id)) throw new Error("Acceptance body pagination returned duplicate identities");
    ids.add(body.id);
    if (Array.isArray(body.faces)) { bodies.push(body); continue; }
    const detailed = await bodyInfo(body.id);
    if (detailed.documentToken !== result.documentToken || detailed.revision !== result.revision || detailed.body?.id !== body.id) {
      throw new Error("Document changed while acceptance topology was being read");
    }
    bodies.push(detailed.pagination ? await completeBody(detailed, index, result, bodyPage) : detailed.body);
  }
  return { ...result, bodies };
}

/** This fork's plasticity_body_info answers with one page per collection and no faceIds/edgeIds. */
async function completeBody(
  detailed: any,
  index: number,
  result: any,
  bodyPage?: (offset: number, revision: string) => Promise<any>,
): Promise<any> {
  if (bodyPage) {
    const page = await bodyPage(index, result.revision);
    if (page.documentToken !== result.documentToken || page.revision !== result.revision || !Array.isArray(page.bodies)) {
      throw new Error("Document changed while acceptance topology was being read");
    }
    const listed = page.bodies.find((candidate: { id: number }) => candidate.id === detailed.body.id);
    if (Array.isArray(listed?.faces)) return listed;
  }
  const truncated = Object.values(detailed.pagination as Record<string, { nextOffset: number | null }>).some((collection) => collection.nextOffset !== null);
  if (truncated) throw new Error("Acceptance requires all body pages");
  const idsOf = (items?: Array<{ id: unknown }>) => (items ?? []).map((item) => item.id);
  return { ...detailed.body, faceIds: idsOf(detailed.body.faces), edgeIds: idsOf(detailed.body.edges) };
}

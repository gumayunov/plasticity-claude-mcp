export interface CatalogEntry {
  name: string;
  description: string;
  toolset: string;
}

const words = (text: string) => text.toLocaleLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(Boolean);

export function catalogScore(entry: CatalogEntry, query: string): number {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return 0;
  const tokens = words(normalized);
  const name = entry.name.toLocaleLowerCase();
  const description = entry.description.toLocaleLowerCase();
  const toolset = entry.toolset.toLocaleLowerCase();
  if (name === normalized) return 100;
  let score = 0;
  if (tokens.length > 0 && tokens.every((token) => name.includes(token))) score += 50;
  if (tokens.some((token) => toolset.includes(token))) score += 20;
  const inDescription = tokens.filter((token) => description.includes(token)).length;
  score += tokens.length > 0 && inDescription === tokens.length ? 10 : inDescription;
  return score;
}

export function rankCatalog<T extends CatalogEntry>(entries: readonly T[], query: string): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  const exact = entries.filter((entry) => entry.name.toLocaleLowerCase() === normalized);
  if (exact.length > 0) return exact;
  return entries
    .map((entry) => ({ entry, score: catalogScore(entry, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .map(({ entry }) => entry);
}

export function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j]!;
      previous[j] = Math.min(previous[j]! + 1, previous[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length]!;
}

export function closestNames(name: string, candidates: readonly string[], count = 3): string[] {
  return [...candidates]
    .map((candidate) => ({ candidate, distance: levenshtein(name, candidate) }))
    .sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate))
    .slice(0, count)
    .map(({ candidate }) => candidate);
}

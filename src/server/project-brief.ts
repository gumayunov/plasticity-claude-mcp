import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import type { ViewImageOptions, ViewName } from "../plasticity/operations/document.ts";
import type { RuntimeState } from "../plasticity/runtime.ts";

/**
 * A project brief is a Markdown file next to the .plasticity document: pictures of the model and of each
 * assembly, what every part is for, the conventions the model follows and the open questions. People read it
 * to follow the project; a model reads it first to pick up the project in a new session.
 *
 * Generated parts live between `<!-- plasticity-brief:begin KEY -->` and `<!-- plasticity-brief:end KEY -->`
 * markers and are replaced on every update. Text outside the markers is the user's and is never touched.
 */

export type BriefView = Exclude<ViewName, "current">;
export type BriefLanguage = "en" | "ru";

export interface BriefSectionInput {
  /** Stable slug: the section's marker key and image file prefix. */
  id: string;
  title: string;
  /** Markdown: purpose, how it is made, fasteners, materials, decisions. */
  description: string;
  bodyIds?: number[] | undefined;
  groupIds?: number[] | undefined;
  views?: BriefView[] | undefined;
}

export interface ProjectBriefInput {
  path?: string | undefined;
  title?: string | undefined;
  summary?: string | undefined;
  conventions?: string | undefined;
  openIssues?: string[] | undefined;
  sections?: BriefSectionInput[] | undefined;
  removeSectionIds?: string[] | undefined;
  overviewViews?: BriefView[] | undefined;
  imageWidth?: number | undefined;
  includeInventory?: boolean | undefined;
  language?: BriefLanguage | undefined;
}

export interface BriefOperations {
  state(): Promise<RuntimeState>;
  documentFile(): Promise<string | null>;
  viewImages(views: readonly ViewName[], fit: boolean, maxWidth: number, format: "jpeg" | "png", options?: ViewImageOptions): Promise<{
    images: Array<{ view: ViewName; data: string }>;
  }>;
}

type Body = RuntimeState["bodies"][number];
type Group = NonNullable<RuntimeState["groups"]>[number];
type Bounds = NonNullable<Body["boundsMm"]>;

const LABELS = {
  en: {
    generated: "Generated from", revision: "revision", bodies: "bodies", updated: "updated",
    overview: "Overview", conventions: "Coordinates and conventions", openIssues: "Open issues",
    inventory: "Body inventory", body: "Body", id: "Id", type: "Type", size: "Size X×Y×Z, mm", position: "Bounds min → max, mm",
    material: "Material", group: "Group", count: "Bodies", subgroups: "Sub-assemblies", hidden: "hidden", examples: "Examples", unnamed: "(unnamed)",
    manual: "Notes outside the `plasticity-brief` markers are kept when the brief is regenerated.",
  },
  ru: {
    generated: "Сгенерировано из", revision: "ревизия", bodies: "тел", updated: "обновлено",
    overview: "Общий вид", conventions: "Система координат и соглашения", openIssues: "Открытые вопросы",
    inventory: "Состав модели", body: "Тело", id: "Id", type: "Тип", size: "Габарит X×Y×Z, мм", position: "Границы min → max, мм",
    material: "Материал", group: "Группа", count: "Тел", subgroups: "Подсборки", hidden: "скрыто", examples: "Примеры", unnamed: "(без имени)",
    manual: "Текст вне маркеров `plasticity-brief` сохраняется при повторной генерации.",
  },
} as const;

const SECTION_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MARKER = /<!-- plasticity-brief:(begin|end) ([a-z0-9:-]+) -->/g;

export function briefPathFor(documentFile: string): string {
  return join(dirname(documentFile), `${basename(documentFile, extname(documentFile))}.md`);
}

export function assetDirFor(briefPath: string): string {
  return join(dirname(briefPath), `${basename(briefPath, extname(briefPath))}.assets`);
}

export interface BriefRegion { key: string; content: string }

/** Splits a brief into generated regions and the text between them. Rejects unbalanced markers rather than guessing. */
export function parseBrief(text: string): Array<{ kind: "text"; text: string } | { kind: "region"; key: string; text: string }> {
  const parts: Array<{ kind: "text"; text: string } | { kind: "region"; key: string; text: string }> = [];
  let cursor = 0;
  let open: { key: string; start: number } | null = null;
  for (const match of text.matchAll(MARKER)) {
    const [marker, kind, key] = match as unknown as [string, "begin" | "end", string];
    const index = match.index!;
    if (kind === "begin") {
      if (open) throw new Error(`Brief marker for ${open.key} is not closed before ${key} begins`);
      if (index > cursor) parts.push({ kind: "text", text: text.slice(cursor, index) });
      open = { key, start: index };
    } else {
      if (!open || open.key !== key) throw new Error(`Brief end marker for ${key} has no matching begin marker`);
      const end = index + marker.length;
      parts.push({ kind: "region", key, text: text.slice(open.start, end) });
      cursor = end;
      open = null;
    }
  }
  if (open) throw new Error(`Brief marker for ${open.key} is not closed`);
  if (cursor < text.length) parts.push({ kind: "text", text: text.slice(cursor) });
  return parts;
}

export function region(key: string, content: string): string {
  return `<!-- plasticity-brief:begin ${key} -->\n${content.trim()}\n<!-- plasticity-brief:end ${key} -->`;
}

/**
 * Replaces regions that exist, inserts new ones after the region that precedes them in `order`,
 * drops regions listed in `remove` and keeps every other byte of the existing file.
 */
export function mergeBrief(existing: string | null, regions: readonly BriefRegion[], order: readonly string[], remove: readonly string[] = []): string {
  if (!existing || existing.trim() === "") return `${regions.map((item) => region(item.key, item.content)).join("\n\n")}\n`;
  const generated = new Map(regions.map((item) => [item.key, region(item.key, item.content)]));
  const parts = parseBrief(existing).filter((part) => part.kind === "text" || !remove.includes(part.key));
  const present = new Set(parts.flatMap((part) => part.kind === "region" ? [part.key] : []));
  for (const part of parts) if (part.kind === "region" && generated.has(part.key)) part.text = generated.get(part.key)!;
  for (const item of regions) {
    if (present.has(item.key)) continue;
    const rank = order.indexOf(item.key);
    // Insert after the last present region that comes earlier in the brief's order; otherwise before the first one.
    let insertAt = -1;
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index]!;
      if (part.kind === "region" && order.indexOf(part.key) !== -1 && order.indexOf(part.key) < rank) insertAt = index;
    }
    const block = { kind: "region" as const, key: item.key, text: generated.get(item.key)! };
    if (insertAt === -1) {
      const first = parts.findIndex((part) => part.kind === "region");
      parts.splice(first === -1 ? parts.length : first, 0, block, { kind: "text", text: "\n\n" });
    } else {
      parts.splice(insertAt + 1, 0, { kind: "text", text: "\n\n" }, block);
    }
    present.add(item.key);
  }
  const text = parts.map((part) => part.text).join("").replace(/\n{3,}/g, "\n\n");
  return text.endsWith("\n") ? text : `${text}\n`;
}

const round = (value: number) => Math.round(value * 10) / 10;
const fmt = (values: readonly number[]) => values.map(round).join(", ");

export function size(bounds: Bounds | null): string {
  return bounds ? bounds.max.map((value, index) => round(value - bounds.min[index]!)).join(" × ") : "—";
}

export function unionBounds(bodies: readonly Body[]): Bounds | null {
  const boxes = bodies.flatMap((body) => body.boundsMm ? [body.boundsMm] : []);
  if (boxes.length === 0) return null;
  return {
    min: [0, 1, 2].map((axis) => Math.min(...boxes.map((box) => box.min[axis]!))) as [number, number, number],
    max: [0, 1, 2].map((axis) => Math.max(...boxes.map((box) => box.max[axis]!))) as [number, number, number],
  };
}

const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function bodyTable(bodies: readonly Body[], materials: RuntimeState["materials"], language: BriefLanguage): string {
  const label = LABELS[language];
  const materialName = new Map((materials ?? []).map((material) => [material.id, material.name]));
  const rows = bodies.map((body) => `| ${cell(body.name ?? label.unnamed)}${body.visible === false || body.hidden ? ` _(${label.hidden})_` : ""} | ${body.id} | ${body.type} | ${size(body.boundsMm)} | ${body.boundsMm ? `${fmt(body.boundsMm.min)} → ${fmt(body.boundsMm.max)}` : "—"} | ${cell(body.materialId ? materialName.get(body.materialId) ?? String(body.materialId) : "—")} |`);
  return [`| ${label.body} | ${label.id} | ${label.type} | ${label.size} | ${label.position} | ${label.material} |`, "|---|---|---|---|---|---|", ...rows].join("\n");
}

/** Bodies of the given groups and their descendants, in document order. */
export function groupBodyIds(groups: readonly Group[], groupIds: readonly number[]): number[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const missing = groupIds.filter((id) => !byId.has(id));
  if (missing.length > 0) throw new Error(`Unknown group ids: ${missing.join(", ")}`);
  const result: number[] = [];
  const visit = (id: number) => {
    const group = byId.get(id)!;
    result.push(...group.bodyIds);
    for (const child of group.childGroupIds) if (byId.has(child)) visit(child);
  };
  for (const id of groupIds) visit(id);
  return [...new Set(result)];
}

/**
 * The root groups list their bodies; a nested group whose subtree holds more than listLimit bodies (typically an
 * imported STEP assembly) becomes one line with its count, overall size, sub-assemblies and a few body names.
 */
export function inventory(state: RuntimeState, language: BriefLanguage, listLimit = 12): string {
  const label = LABELS[language];
  const bodies = new Map(state.bodies.map((body) => [body.id, body]));
  const groups = state.groups ?? [];
  const byId = new Map(groups.map((group) => [group.id, group]));
  const subtree = (group: Group): Group[] => [group, ...group.childGroupIds.flatMap((id) => byId.has(id) ? subtree(byId.get(id)!) : [])];
  const membersOf = (list: readonly Group[]) => list.flatMap((group) => group.bodyIds.flatMap((id) => bodies.has(id) ? [bodies.get(id)!] : []));
  const lines: string[] = [];
  const listed = new Set<number>();
  const visit = (group: Group, depth: number) => {
    const tree = subtree(group);
    const all = membersOf(tree);
    if (all.length === 0) return;
    lines.push(`${"#".repeat(Math.min(6, 3 + depth))} ${label.group}: ${cell(group.name ?? label.unnamed)} (id ${group.id})`, "");
    if (depth > 0 && all.length > listLimit) {
      all.forEach((body) => listed.add(body.id));
      const names = [...new Set(all.map((body) => body.name ?? label.unnamed))].slice(0, 3);
      const children = new Map<string, number>();
      for (const child of tree.slice(1)) children.set(child.name ?? label.unnamed, (children.get(child.name ?? label.unnamed) ?? 0) + 1);
      const parts = [
        `${label.count}: ${all.length}, ids ${Math.min(...all.map((body) => body.id))}…${Math.max(...all.map((body) => body.id))}`,
        `${label.size}: ${size(unionBounds(all))}`,
        ...(children.size > 0 ? [`${label.subgroups}: ${[...children].slice(0, 8).map(([name, count]) => count > 1 ? `\`${name}\` ×${count}` : `\`${name}\``).join(", ")}${children.size > 8 ? ", …" : ""}`] : []),
        `${label.examples}: ${names.map((name) => `\`${name}\``).join(", ")}`,
      ];
      lines.push(parts.join("; "), "");
      return;
    }
    const own = membersOf([group]);
    own.forEach((body) => listed.add(body.id));
    if (own.length > 0) lines.push(bodyTable(own, state.materials, language), "");
    for (const child of tree.slice(1).filter((candidate) => candidate.parentId === group.id)) visit(child, depth + 1);
  };
  for (const root of groups.filter((group) => group.parentId === null)) visit(root, 0);
  const loose = state.bodies.filter((body) => !listed.has(body.id));
  if (loose.length > 0) lines.push(bodyTable(loose, state.materials, language), "");
  return `## ${label.inventory}\n\n${lines.join("\n").trim()}`;
}

async function exists(path: string): Promise<boolean> {
  return await access(path).then(() => true, () => false);
}

async function writeAtomically(path: string, data: string | Buffer): Promise<void> {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, data, { flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export interface ProjectBriefResult {
  path: string;
  assetDir: string;
  revision: string;
  images: string[];
  regions: string[];
  bytes: number;
}

export async function writeProjectBrief(operations: BriefOperations, input: ProjectBriefInput, now = new Date()): Promise<ProjectBriefResult> {
  const language = input.language ?? "en";
  const label = LABELS[language];
  const documentFile = await operations.documentFile();
  if (!input.path && !documentFile) throw new Error("The document has no file yet: save it, or pass path for the brief");
  const path = resolve(input.path ?? briefPathFor(documentFile!));
  if (extname(path).toLowerCase() !== ".md") throw new Error("Brief path must end in .md");
  for (const section of input.sections ?? []) if (!SECTION_ID.test(section.id)) throw new Error(`Section id ${section.id} must be a lowercase slug (a-z, 0-9, -)`);
  const sectionIds = (input.sections ?? []).map((section) => section.id);
  if (new Set(sectionIds).size !== sectionIds.length) throw new Error("Section ids must be unique");

  const state = await operations.state();
  const assetDir = assetDirFor(path);
  await mkdir(assetDir, { recursive: true });
  const width = input.imageWidth ?? 1200;
  const images: string[] = [];
  const capture = async (prefix: string, views: readonly BriefView[], options: ViewImageOptions): Promise<string[]> => {
    const captured = await operations.viewImages(views, true, width, "png", { ...options, hideOverlays: true });
    const links: string[] = [];
    for (const image of captured.images) {
      const file = join(assetDir, `${prefix}-${image.view}.png`);
      await writeAtomically(file, Buffer.from(image.data, "base64"));
      images.push(file);
      links.push(`![${prefix} ${image.view}](${encodeURI(relative(dirname(path), file).split("\\").join("/"))})`);
    }
    return links;
  };

  const existing = await exists(path) ? await readFile(path, "utf8") : null;
  const regions: BriefRegion[] = [];
  const name = input.title ?? (documentFile ? basename(documentFile, extname(documentFile)) : basename(path, ".md"));
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  regions.push({
    key: "header",
    content: `# ${name}\n\n> ${label.generated} \`${documentFile ? basename(documentFile) : state.title}\` · ${label.revision} \`${state.revision.split("|").slice(0, 2).join("|")}\` · ${state.bodies.length} ${label.bodies} · ${label.updated} ${date}\n>\n> ${label.manual}`,
  });
  if (input.summary !== undefined || !existing?.includes("plasticity-brief:begin overview")) {
    const pictures = await capture("overview", input.overviewViews ?? ["isometric", "front", "top", "left"], {});
    regions.push({ key: "overview", content: `## ${label.overview}\n\n${(input.summary ?? "").trim()}\n\n${pictures.join("\n")}` });
  }
  if (input.conventions !== undefined) regions.push({ key: "conventions", content: `## ${label.conventions}\n\n${input.conventions.trim()}` });
  const sectionOrder: string[] = [];
  for (const section of input.sections ?? []) {
    const ids = [...new Set([...(section.bodyIds ?? []), ...groupBodyIds(state.groups ?? [], section.groupIds ?? [])])];
    const known = new Map(state.bodies.map((body) => [body.id, body]));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length > 0) throw new Error(`Section ${section.id}: unknown body ids ${missing.join(", ")}`);
    const pictures = ids.length > 0 ? await capture(section.id, section.views ?? ["isometric"], { bodyIds: ids }) : [];
    const members = ids.map((id) => known.get(id)!);
    regions.push({
      key: `section:${section.id}`,
      content: [`## ${section.title}`, pictures.join("\n"), section.description.trim(), members.length > 0 ? bodyTable(members, state.materials, language) : ""].filter(Boolean).join("\n\n"),
    });
    sectionOrder.push(`section:${section.id}`);
  }
  if (input.openIssues !== undefined) {
    regions.push({ key: "open-issues", content: `## ${label.openIssues}\n\n${input.openIssues.map((issue) => `- [ ] ${issue}`).join("\n")}` });
  }
  if (input.includeInventory ?? true) regions.push({ key: "inventory", content: inventory(state, language) });

  // Existing sections keep their place; new ones go after the last existing section.
  const existingSections = existing ? parseBrief(existing).flatMap((part) => part.kind === "region" && part.key.startsWith("section:") ? [part.key] : []) : [];
  const order = ["header", "overview", "conventions", ...new Set([...existingSections, ...sectionOrder]), "open-issues", "inventory"];
  const text = mergeBrief(existing, regions, order, (input.removeSectionIds ?? []).map((id) => `section:${id}`));
  await writeAtomically(path, text);
  return { path, assetDir, revision: state.revision, images, regions: regions.map((item) => item.key), bytes: Buffer.byteLength(text) };
}

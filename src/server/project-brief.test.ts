import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { RuntimeState } from "../plasticity/runtime.ts";
import { groupBodyIds, inventory, mergeBrief, parseBrief, region, writeProjectBrief, type BriefOperations } from "./project-brief.ts";

const body = (id: number, name: string | null, min: [number, number, number], max: [number, number, number], materialId = 0) =>
  ({ id, versionId: id * 10, type: "Solid", name, materialId, boundsMm: { min, max }, faceIds: [], edgeIds: [], faces: [], edges: [] });
const group = (id: number, name: string, parentId: number | null, bodyIds: number[], childGroupIds: number[] = []) =>
  ({ id, name, parentId, childGroupIds, bodyIds, instanceIds: [], referenceMeshIds: [], otherNodeKeys: [], visible: true, hidden: false, locked: false });

function scene(): RuntimeState {
  const motors = Array.from({ length: 20 }, (_, index) => body(100 + index, index % 2 ? "Rotor" : "Stator", [0, 0, 0], [50, 50, 30 + index]));
  return {
    targetId: "t", title: "Drone.plasticity", documentToken: "doc", revision: "doc|42|7|0|bodies:x", dbVersion: 42, undoDepth: 7, redoDepth: 0,
    materials: [{ id: 3, name: "Grey | plastic", colorHex: "#cccccc", roughness: 0.5, metalness: 0, opacity: 1 }],
    construction: { planes: [], activePlaneId: null, planeStateToken: "p", viewStateToken: "v" },
    regions: [],
    groups: [group(0, "Scene", null, [1, 2], [4]), group(4, "Motor STEP", 0, motors.map((item) => item.id))],
    bodies: [body(1, "Frame", [-400, -275, 480], [400, 275, 680]), body(2, "Front body shell", [-505, -275, 470], [-330, 275, 634], 3), ...motors],
  } as unknown as RuntimeState;
}

function fakeOperations(state: RuntimeState, file: string | null) {
  const captures: Array<{ views: readonly string[]; bodyIds?: readonly number[]; hideOverlays?: boolean }> = [];
  const operations: BriefOperations = {
    async state() { return state; },
    async documentFile() { return file; },
    async viewImages(views, _fit, _width, _format, options = {}) {
      captures.push({ views, ...(options.bodyIds ? { bodyIds: options.bodyIds } : {}), ...(options.hideOverlays === undefined ? {} : { hideOverlays: options.hideOverlays }) });
      return { images: views.map((view) => ({ view, data: Buffer.from(`png:${view}`).toString("base64") })) };
    },
  };
  return { operations, captures };
}

test("merging replaces generated regions, keeps the user's notes and inserts new regions in order", () => {
  const existing = `${region("header", "# Old")}\n\nMy own notes stay here.\n\n${region("section:frame", "## Frame v1")}\n\n${region("inventory", "old")}\n`;
  const merged = mergeBrief(existing, [
    { key: "header", content: "# New" },
    { key: "section:legs", content: "## Legs" },
    { key: "inventory", content: "new" },
  ], ["header", "overview", "section:frame", "section:legs", "inventory"]);
  assert.match(merged, /# New/);
  assert.match(merged, /My own notes stay here\./);
  assert.match(merged, /## Frame v1/, "sections not passed are kept");
  assert.ok(merged.indexOf("## Frame v1") < merged.indexOf("## Legs") && merged.indexOf("## Legs") < merged.indexOf("new"));
  assert.doesNotMatch(merged, /old/);
  assert.doesNotMatch(mergeBrief(merged, [], [], ["section:frame"]), /Frame v1/);
});

test("unbalanced markers are refused instead of overwriting the user's text", () => {
  assert.throws(() => parseBrief("<!-- plasticity-brief:begin header -->\nno end"), /not closed/);
  assert.throws(() => parseBrief("<!-- plasticity-brief:end header -->"), /no matching begin/);
});

test("group sections include nested groups and large imported groups are summarized", () => {
  const state = scene();
  assert.deepEqual(groupBodyIds(state.groups!, [0]).slice(0, 3), [1, 2, 100]);
  assert.throws(() => groupBodyIds(state.groups!, [9]), /Unknown group ids: 9/);
  const text = inventory(state, "en");
  assert.match(text, /\| Front body shell \| 2 \| Solid \| 175 × 550 × 164 \|/);
  assert.match(text, /Grey \\\| plastic/, "pipes in names are escaped");
  assert.match(text, /Bodies: 20, ids 100…119/);
  assert.doesNotMatch(text, /\| Rotor \|/, "the imported group is not listed body by body");

  const nested = { ...state, groups: [
    group(0, "Scene", null, [1, 2], [4]),
    group(4, "Motor STEP", 0, [], [5, 6]),
    group(5, "Screw", 4, state.bodies.slice(2, 12).map((item) => item.id)),
    group(6, "Screw", 4, state.bodies.slice(12).map((item) => item.id)),
  ] } as RuntimeState;
  const collapsed = inventory(nested, "en");
  assert.match(collapsed, /Bodies: 20, ids 100…119; Size X×Y×Z, mm: 50 × 50 × 49; Sub-assemblies: `Screw` ×2/);
  assert.doesNotMatch(collapsed, /Group: Screw/, "sub-assemblies of a collapsed group get no headings");
});

test("writes the brief next to the document with isolated section pictures and updates it in place", async () => {
  const directory = await mkdtemp(join(tmpdir(), "brief-"));
  const document = join(directory, "Drone.plasticity");
  const { operations, captures } = fakeOperations(scene(), document);

  const first = await writeProjectBrief(operations, {
    summary: "Agro drone.", conventions: "Front is -X.", openIssues: ["Rear body"], language: "ru",
    sections: [{ id: "front-body", title: "Передний корпус", description: "Печать, стенка 3 мм.", bodyIds: [2] }],
  }, new Date("2026-10-14T10:00:00Z"));
  assert.equal(first.path, join(directory, "Drone.md"));
  assert.deepEqual((await readdir(join(directory, "Drone.assets"))).sort(), [
    "front-body-isometric.png", "overview-front.png", "overview-isometric.png", "overview-left.png", "overview-top.png",
  ]);
  assert.deepEqual(captures[1], { views: ["isometric"], bodyIds: [2], hideOverlays: true });
  let text = await readFile(first.path, "utf8");
  assert.match(text, /## Передний корпус\n\n!\[front-body isometric\]\(Drone\.assets\/front-body-isometric\.png\)/);
  assert.match(text, /- \[ \] Rear body/);
  assert.match(text, /ревизия `doc\|42`/);

  await writeFile(first.path, text.replace("## Общий вид", "Ручная заметка пользователя.\n\n## Общий вид"));
  await writeProjectBrief(operations, { sections: [{ id: "frame", title: "Рама", description: "Профиль 40×80×2.", bodyIds: [1] }], language: "ru" });
  text = await readFile(first.path, "utf8");
  assert.match(text, /Ручная заметка пользователя\./);
  assert.match(text, /Agro drone\./, "omitted summary keeps the previous overview");
  assert.equal(captures.length, 3, "the overview is not recaptured when it is kept");
  assert.ok(text.indexOf("## Передний корпус") < text.indexOf("## Рама") && text.indexOf("## Рама") < text.indexOf("## Открытые вопросы"));
});

test("a document without a file needs an explicit brief path", async () => {
  const { operations } = fakeOperations(scene(), null);
  await assert.rejects(writeProjectBrief(operations, {}), /no file yet/);
  await assert.rejects(writeProjectBrief(operations, { path: "/tmp/x.txt" }), /must end in \.md/);
});

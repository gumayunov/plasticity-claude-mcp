export const EDITOR_PATH_NAMES = [
  "db", "nodes", "groups", "empties", "dbVersion", "lookupStableId", "lookupEmptyById",
  "geometryModel", "automatics", "viewports", "history", "document", "getSketchId",
  "planesSnapshot", "measurementsSnapshot", "measurementsLookupStableId",
  "materialsList", "materialsGet", "curvesRead", "curvesLookup",
] as const;

export type EditorPathName = typeof EDITOR_PATH_NAMES[number];

export interface CompatProfile {
  version: string;
  status: "supported" | "untested";
  bindingAliases: Readonly<Record<string, string>>;
  editorPaths: Readonly<Record<EditorPathName, string>>;
  notes: readonly string[];
}

export interface ResolvedProfile {
  profile: CompatProfile;
  status: "supported" | "untested";
}

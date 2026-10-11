export const MISSING_EDITOR_PATHS_PREFIX = "Plasticity editor paths are unavailable: ";

// Runs inside the Plasticity renderer: resolves dotted paths from the editor and binds methods to their owner.
export const EDITOR_COMPAT_RESOLVER = `function (editor, paths) {
  const compat = {};
  const missing = [];
  for (const [name, path] of Object.entries(paths)) {
    let parent;
    let value = editor;
    for (const key of path.split(".")) {
      parent = value;
      value = value === null || value === undefined ? undefined : value[key];
    }
    if (value === undefined) {
      missing.push(name + "=" + path);
      continue;
    }
    compat[name] = typeof value === "function" ? value.bind(parent) : value;
  }
  if (missing.length > 0) throw new Error(${JSON.stringify(MISSING_EDITOR_PATHS_PREFIX)} + missing.join(", "));
  return compat;
}`;

export function withEditorCompat(functionDeclaration: string, paths: Readonly<Record<string, string>>): string {
  const brace = functionDeclaration.indexOf("{");
  if (brace < 0) throw new Error("Renderer function declaration has no body");
  return `${functionDeclaration.slice(0, brace + 1)}\n  const compat = (${EDITOR_COMPAT_RESOLVER})(this, ${JSON.stringify(paths)});${functionDeclaration.slice(brace + 1)}`;
}

export const MISSING_EDITOR_PATHS_PREFIX = "Plasticity editor paths are unavailable: ";

// Runs inside the Plasticity renderer: resolves dotted paths from the editor lazily, so a missing
// required path fails only when used (like the direct access it replaces), and binds methods to their owner.
export const EDITOR_COMPAT_RESOLVER = `function (editor, paths) {
  const compat = {};
  for (const [name, declared] of Object.entries(paths)) {
    const optional = declared.startsWith("?");
    const path = optional ? declared.slice(1) : declared;
    let resolved = false;
    let cached;
    Object.defineProperty(compat, name, {
      enumerable: true,
      get() {
        if (resolved) return cached;
        let parent;
        let value = editor;
        for (const key of path.split(".")) {
          parent = value;
          value = value === null || value === undefined ? undefined : value[key];
        }
        if (value === undefined && !optional) throw new Error(${JSON.stringify(MISSING_EDITOR_PATHS_PREFIX)} + name + "=" + path);
        cached = typeof value === "function" ? value.bind(parent) : value;
        resolved = true;
        return cached;
      },
    });
  }
  return compat;
}`;

export function withEditorCompat(functionDeclaration: string, paths: Readonly<Record<string, string>>): string {
  const brace = functionDeclaration.indexOf("{");
  if (brace < 0) throw new Error("Renderer function declaration has no body");
  return `${functionDeclaration.slice(0, brace + 1)}\n  const compat = (${EDITOR_COMPAT_RESOLVER})(this, ${JSON.stringify(paths)});${functionDeclaration.slice(brace + 1)}`;
}

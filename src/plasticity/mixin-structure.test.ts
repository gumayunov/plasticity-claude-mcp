import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = fileURLToPath(new URL(".", import.meta.url));
const MIXIN_DIRECTORIES = ["operations", "recipes"];
const NOT_MIXINS = new Set(["base.ts", "index.ts", "types.ts", "helpers.ts", "native-snippets.ts", "errors.ts"]);

test("domain mixin classes declare no instance fields", () => {
  for (const directory of MIXIN_DIRECTORIES) {
    const path = join(here, directory);
    if (!existsSync(path)) continue;
    for (const file of readdirSync(path).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts") && !NOT_MIXINS.has(name))) {
      const source = ts.createSourceFile(file, readFileSync(join(path, file), "utf8"), ts.ScriptTarget.Latest, true);
      for (const statement of source.statements) {
        if (!ts.isClassDeclaration(statement)) continue;
        for (const member of statement.members) {
          if (!ts.isPropertyDeclaration(member)) continue;
          const declared = (ts.getModifiers(member) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword);
          assert.ok(declared, `${directory}/${file}: ${member.name.getText(source)} is an instance field; move it to the base class`);
        }
      }
    }
  }
});

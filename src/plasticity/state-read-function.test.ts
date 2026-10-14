import assert from "node:assert/strict";
import { test } from "node:test";

import { EDITOR_PATH_NAMES } from "./compat/types.ts";
import { STATE_READ_FUNCTION } from "./state-read-function.ts";

test("state reading uses profile paths instead of hard-coded editor paths", () => {
  const direct = STATE_READ_FUNCTION.match(/this\.(db|geo|viewports|history|document|sketches|planes|measurements|materials|curves)\b/g) ?? [];
  assert.deepEqual(direct, []);
});

test("every compat name used by state reading exists in the profile schema", () => {
  const used = new Set([...STATE_READ_FUNCTION.matchAll(/compat\.([a-zA-Z]+)/g)].map((match) => match[1]!));
  const known = new Set<string>(EDITOR_PATH_NAMES);
  assert.deepEqual([...used].filter((name) => !known.has(name)), []);
});

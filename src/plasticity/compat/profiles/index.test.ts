import assert from "node:assert/strict";
import { test } from "node:test";

import type { CompatProfile } from "../types.ts";
import { plasticity26_1_3 } from "./26.1.3.ts";
import { PROFILES, resolveProfile } from "./index.ts";

const profile = (version: string): CompatProfile => ({ ...plasticity26_1_3, version });
const list = [profile("25.3.0"), profile("26.1.3"), profile("26.4.0")];

test("exact version is supported", () => {
  assert.deepEqual(resolveProfile("26.1.3", list), { profile: list[1], status: "supported" });
});

test("in-between version uses the nearest older profile and is untested", () => {
  assert.deepEqual(resolveProfile("26.2.0", list), { profile: list[1], status: "untested" });
  assert.deepEqual(resolveProfile("27.0.0", list), { profile: list[2], status: "untested" });
});

test("versions older than every profile and unknown versions are untested", () => {
  assert.deepEqual(resolveProfile("24.0.0", list), { profile: list[0], status: "untested" });
  assert.deepEqual(resolveProfile(null, list), { profile: list[2], status: "untested" });
});

test("the shipped registry supports 26.1.3", () => {
  assert.equal(resolveProfile("26.1.3").status, "supported");
  assert.ok(PROFILES.length >= 1);
});

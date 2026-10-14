import assert from "node:assert/strict";
import { test } from "node:test";

import { applyMixins } from "./mixins.ts";

abstract class Base {
  readonly name: string;
  constructor(name: string) { this.name = name; }
  async state(): Promise<string> { return this.name; }
}

abstract class Exchange extends Base {
  async saveCopy(path: string): Promise<string> { return `${await this.state()}:${path}`; }
  get kind(): string { return "exchange"; }
}

abstract class Documents extends Base {
  declare saveCopy: Exchange["saveCopy"];
  async open(path: string): Promise<string> { return await this.saveCopy(`${path}.bak`); }
}

class Assembled extends Base {}
interface Assembled extends Exchange, Documents {}
applyMixins(Assembled, [Exchange, Documents]);

test("mixed-in methods call each other through this and keep accessors", async () => {
  const assembled = new Assembled("doc");
  assert.equal(await assembled.open("a"), "doc:a.bak");
  assert.equal(assembled.kind, "exchange");
  assert.ok(assembled instanceof Base);
});

test("applyMixins rejects a member defined by two mixins", () => {
  abstract class First extends Base { run(): number { return 1; } }
  abstract class Second extends Base { run(): number { return 2; } }
  class Target extends Base {}
  assert.throws(() => applyMixins(Target, [First, Second]), /run is defined by both First and Second/);
});

test("applyMixins rejects overriding a member of the target", () => {
  abstract class Mixin extends Base { run(): number { return 1; } }
  class Target extends Base { run(): number { return 0; } }
  assert.throws(() => applyMixins(Target, [Mixin]), /would override Target/);
});

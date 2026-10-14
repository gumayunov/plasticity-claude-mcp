import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { installSignalCleanup } from "./signals.ts";

test("SIGINT, SIGTERM and SIGHUP run the cleanup once and exit with the conventional code", async () => {
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]] as const) {
    const emitter = new EventEmitter();
    let cleanups = 0;
    const exits: number[] = [];
    let done: () => void = () => {};
    const exited = new Promise<void>((resolve) => { done = resolve; });
    installSignalCleanup(async () => { cleanups += 1; }, (exitCode) => { exits.push(exitCode); done(); }, emitter);
    emitter.emit(signal);
    emitter.emit(signal);
    await exited;
    assert.equal(cleanups, 1, signal);
    assert.deepEqual(exits, [code]);
  }
});

test("uninstall removes the handlers", () => {
  const emitter = new EventEmitter();
  const uninstall = installSignalCleanup(async () => {}, () => {}, emitter);
  assert.equal(emitter.listenerCount("SIGTERM"), 1);
  uninstall();
  assert.equal(emitter.listenerCount("SIGTERM"), 0);
});

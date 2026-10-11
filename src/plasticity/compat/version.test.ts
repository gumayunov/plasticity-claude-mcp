import assert from "node:assert/strict";
import { test } from "node:test";

import { compareVersions, detectPlasticityVersion, parsePlistVersion, userAgentVersion } from "./version.ts";

const plist = (version: string) => `<?xml version="1.0"?><plist><dict>
  <key>CFBundleName</key><string>Plasticity</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
</dict></plist>`;

test("parsePlistVersion reads CFBundleShortVersionString", () => {
  assert.equal(parsePlistVersion(plist("26.1.3")), "26.1.3");
  assert.equal(parsePlistVersion("bplist00…"), null);
});

test("userAgentVersion reads Plasticity/x.y.z", () => {
  assert.equal(userAgentVersion("Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Plasticity/26.1.3 Chrome/116 Electron/26.6.9 Safari/537.36"), "26.1.3");
  assert.equal(userAgentVersion("Mozilla/5.0 Chrome/116 Electron/26.6.9"), null);
});

test("compareVersions orders numerically", () => {
  assert.equal(compareVersions("26.1.3", "26.1.3"), 0);
  assert.ok(compareVersions("26.1.10", "26.1.3") > 0);
  assert.ok(compareVersions("25.9.0", "26.0.0") < 0);
  assert.ok(compareVersions("27", "26.9.9") > 0);
});

test("detect prefers the running window's user agent and warns when Info.plist differs", async () => {
  const detected = await detectPlasticityVersion(
    { applicationPath: "/Apps/Plasticity.app", userAgent: "Plasticity/26.2.0 Electron/26" },
    async (path) => { assert.equal(path, "/Apps/Plasticity.app/Contents/Info.plist"); return "26.1.3"; },
  );
  assert.deepEqual(detected, {
    version: "26.2.0",
    source: "user-agent",
    warnings: ["Plasticity version mismatch: the running window reports 26.2.0, /Apps/Plasticity.app/Contents/Info.plist says 26.1.3"],
  });
});

test("userAgentVersion ignores letter case", () => {
  assert.equal(userAgentVersion("Mozilla/5.0 plasticity/26.1.3 Electron/26.6.9"), "26.1.3");
});

test("detect falls back to Info.plist, then to nothing", async () => {
  assert.deepEqual(
    await detectPlasticityVersion({ applicationPath: "/x.app", userAgent: "Mozilla/5.0 Electron/26" }, async () => "26.1.3"),
    { version: "26.1.3", source: "info-plist", warnings: [] },
  );
  const none = await detectPlasticityVersion({ applicationPath: "/x.app", userAgent: null }, async () => null);
  assert.equal(none.version, null);
  assert.equal(none.source, "none");
  assert.match(none.warnings[0] ?? "", /Plasticity version is unknown/);
});

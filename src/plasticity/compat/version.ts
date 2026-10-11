import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DetectedVersion {
  version: string | null;
  source: "info-plist" | "user-agent" | "none";
  warnings: string[];
}

export function parsePlistVersion(xml: string): string | null {
  return /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(xml)?.[1]?.trim() ?? null;
}

export function userAgentVersion(userAgent: string): string | null {
  return /\bPlasticity\/(\d+(?:\.\d+)*)/.exec(userAgent)?.[1] ?? null;
}

export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export async function readInfoPlistVersion(path: string): Promise<string | null> {
  try {
    const fromXml = parsePlistVersion(await readFile(path, "utf8"));
    if (fromXml) return fromXml;
    const { stdout } = await execFileAsync("plutil", ["-extract", "CFBundleShortVersionString", "raw", path]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function detectPlasticityVersion(
  input: { applicationPath: string; userAgent: string | null },
  readPlist: (path: string) => Promise<string | null> = readInfoPlistVersion,
): Promise<DetectedVersion> {
  const plistPath = join(input.applicationPath, "Contents", "Info.plist");
  const fromPlist = await readPlist(plistPath);
  const fromAgent = input.userAgent ? userAgentVersion(input.userAgent) : null;
  if (fromPlist) {
    const warnings = fromAgent && fromAgent !== fromPlist
      ? [`Plasticity version mismatch: Info.plist says ${fromPlist}, renderer user agent says ${fromAgent}`]
      : [];
    return { version: fromPlist, source: "info-plist", warnings };
  }
  if (fromAgent) return { version: fromAgent, source: "user-agent", warnings: [`Could not read ${plistPath}; using the renderer user agent`] };
  return { version: null, source: "none", warnings: [`Plasticity version is unknown: ${plistPath} is unreadable and the user agent has no Plasticity/x.y.z`] };
}

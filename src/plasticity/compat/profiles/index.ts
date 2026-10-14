import type { CompatProfile, ResolvedProfile } from "../types.ts";
import { compareVersions } from "../version.ts";
import { plasticity26_1_3 } from "./26.1.3.ts";

export const PROFILES: readonly CompatProfile[] = [plasticity26_1_3];

export function resolveProfile(version: string | null, profiles: readonly CompatProfile[] = PROFILES): ResolvedProfile {
  const sorted = [...profiles].sort((a, b) => compareVersions(a.version, b.version));
  const newest = sorted.at(-1);
  const oldest = sorted[0];
  if (!newest || !oldest) throw new Error("No Plasticity compatibility profiles are registered");
  if (version === null) return { profile: newest, status: "untested" };
  const exact = sorted.find((profile) => compareVersions(profile.version, version) === 0);
  if (exact) return { profile: exact, status: exact.status };
  const older = sorted.filter((profile) => compareVersions(profile.version, version) < 0).at(-1);
  return { profile: older ?? oldest, status: "untested" };
}

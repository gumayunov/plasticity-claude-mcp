export class CompatibilityError extends Error {
  override name = "CompatibilityError";
  readonly version: string | null;
  readonly profile: string;
  readonly missingBinding?: string;
  readonly missingPaths?: string[];

  constructor(details: { version: string | null; profile: string; missingBinding?: string; missingPaths?: string[] }) {
    const subject = details.missingBinding !== undefined
      ? `native factory ${details.missingBinding} is missing`
      : `editor paths are missing: ${(details.missingPaths ?? []).join(", ")}`;
    super(`Plasticity ${details.version ?? "(unknown version)"} (profile ${details.profile}): ${subject}`);
    this.version = details.version;
    this.profile = details.profile;
    if (details.missingBinding !== undefined) this.missingBinding = details.missingBinding;
    if (details.missingPaths !== undefined) this.missingPaths = details.missingPaths;
  }
}

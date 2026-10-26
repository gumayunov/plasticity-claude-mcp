import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

// Plasticity itself writes STEP, Parasolid and .plasticity files, and macOS privacy rules may deny it
// access to folders such as ~/Documents. Checks therefore work in a temporary directory, and the
// files they produce are copied to the run report afterwards, even when the check fails.
export async function withScratchDirectory<T>(
  scratchRoot: string,
  name: string,
  keepDirectory: string,
  work: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = join(scratchRoot, name);
  await mkdir(directory, { recursive: true });
  try {
    return await work(directory);
  } finally {
    await mkdir(keepDirectory, { recursive: true });
    await cp(directory, keepDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

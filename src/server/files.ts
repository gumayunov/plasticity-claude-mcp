import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";

export async function validatedStepPath(path: string): Promise<string> {
  const input = await realpath(resolve(path));
  if (![".step", ".stp"].includes(extname(input).toLowerCase())) throw new Error("STEP input must end in .step or .stp");
  if (!(await stat(input)).isFile()) throw new Error("STEP input must be a regular file");
  return input;
}

export async function validatedParasolidPath(path: string): Promise<string> {
  const input = await realpath(resolve(path));
  if (![".x_t", ".x_b"].includes(extname(input).toLowerCase())) throw new Error("Parasolid input must end in .x_t or .x_b");
  if (!(await stat(input)).isFile()) throw new Error("Parasolid input must be a regular file");
  return input;
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export function provenanceSafeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of new Set(url.searchParams.keys())) url.searchParams.set(key, "[redacted]");
  return url.href;
}

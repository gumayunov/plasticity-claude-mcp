import type { LiveCheck } from "../types.ts";
import { connectReadScene } from "./connect.ts";

export const smokeChecks: LiveCheck[] = [
  connectReadScene,
];

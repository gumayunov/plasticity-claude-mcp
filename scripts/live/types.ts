export type Tier = "smoke" | "full";
export type CheckStatus = "pass" | "fail" | "error" | "skipped";
export type Evidence = Record<string, unknown>;

export interface CheckResult {
  name: string;
  status: CheckStatus;
  durationMs: number;
  message?: string;
  evidence?: Evidence;
}

export interface RunReport {
  schemaVersion: 1;
  tier: Tier;
  startedAt: string;
  finishedAt: string;
  aborted: boolean;
  results: CheckResult[];
}

export interface McpCaller {
  call(tool: string, args: Record<string, unknown>): Promise<any>;
  close(): Promise<void>;
  stderrTail(): string;
}

export interface CheckContext {
  mcp: McpCaller;
  targetId: string;
  cdpUrl: string;
  workDir: string;
}

export interface LiveCheck {
  name: string;
  run(context: CheckContext): Promise<Evidence>;
}

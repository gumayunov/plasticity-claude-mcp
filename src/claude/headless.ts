import { spawn } from "node:child_process";

const MAX_LINE_BYTES = 16 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;

// Credentials and transport settings a headless `claude` needs; everything
// else (including CLAUDECODE from a parent session) stays out of the child.
const ENVIRONMENT_ALLOWLIST = [
  "HOME", "PATH", "SHELL", "TMPDIR", "USER", "LOGNAME", "LANG", "LC_ALL",
  "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "SSL_CERT_FILE",
  "CLAUDE_CONFIG_DIR", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL",
];

export interface HeadlessRunOptions {
  executable: string;
  executableArgs?: string[];
  args: string[];
  cwd: string;
  input: unknown;
  signal: AbortSignal;
}

export interface HeadlessRun {
  events: Record<string, unknown>[];
  result: Record<string, unknown> | undefined;
  exit: string;
  stderr: string;
}

/** One `claude -p` process with stream-json on both ends; resolves when it exits. */
export function runClaudeHeadless(options: HeadlessRunOptions): Promise<HeadlessRun> {
  return new Promise((resolve, reject) => {
    if (options.signal.aborted) {
      reject(abortError());
      return;
    }
    const child = spawn(options.executable, [...(options.executableArgs ?? []), ...options.args], {
      cwd: options.cwd,
      env: allowedEnvironment(process.env),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const events: Record<string, unknown>[] = [];
    let stdoutBuffer = "";
    let stderr = "";
    let settled = false;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      options.signal.removeEventListener("abort", onAbort);
      action();
    };
    const onAbort = (): void => {
      child.kill("SIGTERM");
      finish(() => reject(abortError()));
    };
    options.signal.addEventListener("abort", onAbort, { once: true });

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      let newline: number;
      while ((newline = stdoutBuffer.indexOf("\n")) >= 0) {
        const line = stdoutBuffer.slice(0, newline).trim();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        if (!line) continue;
        try {
          const event: unknown = JSON.parse(line);
          if (typeof event === "object" && event !== null && !Array.isArray(event)) events.push(event as Record<string, unknown>);
        } catch {
          // Non-JSON diagnostics on stdout are ignored; the result event is authoritative.
        }
      }
      if (stdoutBuffer.length > MAX_LINE_BYTES) {
        child.kill("SIGTERM");
        finish(() => reject(new Error("claude produced an oversized stream-json line")));
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-MAX_STDERR_BYTES);
    });
    child.on("error", (error) => finish(() => reject(new Error(`Failed to start claude: ${error.message}`))));
    child.on("close", (code, signal) => finish(() => resolve({
      events,
      result: events.findLast((event) => event.type === "result"),
      exit: signal ? `signal ${signal}` : `code ${String(code)}`,
      stderr: stderr.trim(),
    })));
    child.stdin.on("error", () => undefined);
    child.stdin.end(`${JSON.stringify(options.input)}\n`);
  });
}

/** Tool names the model tried to call, from assistant messages in the stream. */
export function requestedToolNames(events: Record<string, unknown>[]): string[] {
  const names: string[] = [];
  for (const event of events) {
    if (event.type !== "assistant" || !isRecord(event.message) || !Array.isArray(event.message.content)) continue;
    for (const block of event.message.content) {
      if (isRecord(block) && block.type === "tool_use" && typeof block.name === "string") names.push(block.name);
    }
  }
  return names;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function abortError(): Error {
  const error = new Error("claude run aborted");
  error.name = "AbortError";
  return error;
}

function allowedEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of ENVIRONMENT_ALLOWLIST) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import type { IsolatedInstance } from "./instance.ts";
import type { McpCaller } from "./types.ts";

export interface LiveSession {
  instance: IsolatedInstance;
  mcp: McpCaller;
}

export interface LiveSessionDeps {
  startInstance(registerStop: (stop: () => Promise<void>) => void): Promise<IsolatedInstance>;
  startMcp(instance: IsolatedInstance): Promise<McpCaller>;
  connect(mcp: McpCaller, instance: IsolatedInstance): Promise<void>;
  log(line: string): Promise<void>;
}

// Owns the isolated instance from the moment it starts, so an interrupt during startup still stops it.
export class LiveSessionManager {
  current: LiveSession | undefined;
  private starting: IsolatedInstance | undefined;
  private launchingStop: (() => Promise<void>) | undefined;
  private readonly deps: LiveSessionDeps;

  constructor(deps: LiveSessionDeps) {
    this.deps = deps;
  }

  async open(): Promise<LiveSession> {
    let instance: IsolatedInstance;
    try {
      instance = await this.deps.startInstance((stop) => { this.launchingStop = stop; });
    } finally {
      this.launchingStop = undefined;
    }
    this.starting = instance;
    await this.deps.log(`started instance cdp=${instance.cdpUrl} target=${instance.targetId} profile=${instance.userDataDirectory}`);
    try {
      const mcp = await this.deps.startMcp(instance);
      try {
        await this.deps.connect(mcp, instance);
      } catch (error) {
        await mcp.close().catch(() => undefined);
        throw error;
      }
      if (this.starting !== instance) {
        await mcp.close().catch(() => undefined);
        throw new Error("Live session was closed while it was starting");
      }
      this.current = { instance, mcp };
      return this.current;
    } catch (error) {
      await instance.stop().catch(() => undefined);
      throw error;
    } finally {
      if (this.starting === instance) this.starting = undefined;
    }
  }

  async close(): Promise<void> {
    const live = this.current;
    const starting = this.starting;
    const launchingStop = this.launchingStop;
    this.current = undefined;
    this.starting = undefined;
    this.launchingStop = undefined;
    if (launchingStop) {
      await launchingStop().catch(() => undefined);
      await this.deps.log("stopped instance that was still launching");
    }
    if (live) {
      await live.mcp.close().catch(() => undefined);
      await live.instance.stop().catch(() => undefined);
      await this.deps.log("stopped instance");
    }
    if (starting && starting !== live?.instance) {
      await starting.stop().catch(() => undefined);
      await this.deps.log("stopped instance that was still starting");
    }
  }

  async restart(): Promise<LiveSession> {
    await this.close();
    return await this.open();
  }
}

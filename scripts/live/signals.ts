const EXIT_CODES = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 } as const;

interface SignalSource {
  on(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
}

// The isolated Plasticity is started through `open`, outside this process group, so it survives the
// harness unless cleanup runs on every terminating signal (Ctrl+C, kill, closed terminal).
export function installSignalCleanup(
  cleanup: () => Promise<void>,
  exit: (code: number) => void = (code) => process.exit(code),
  source: SignalSource = process,
): () => void {
  let started = false;
  const handlers = Object.entries(EXIT_CODES).map(([signal, code]) => {
    const handler = () => {
      if (started) return;
      started = true;
      void cleanup().catch(() => undefined).finally(() => exit(code));
    };
    source.on(signal, handler);
    return [signal, handler] as const;
  });
  return () => {
    for (const [signal, handler] of handlers) source.removeListener(signal, handler);
  };
}

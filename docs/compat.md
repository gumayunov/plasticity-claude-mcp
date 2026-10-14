# Compatibility with Plasticity versions

The MCP server works with Plasticity internals through the debugging protocol, so any Plasticity update can break something. This document is the procedure for porting to a new version.

## What is verified

The verified versions are the profiles with status `supported` in `src/plasticity/compat/profiles/`. Currently that is 26.1.3 (macOS, Apple Silicon).

## How to tell that the version changed

- `plasticity_connect` and `plasticity_diagnose` return a `plasticity` field: the version, the status (`supported` / `untested`) and the profile.
- With status `untested`, `warnings` contains a warning, and tools that are missing factories fail with an error naming the factory.

## Porting to a new version

1. Before updating, keep the installer of the current Plasticity version (so you can roll back).
2. Install the new version and run `npm run compat:report -- --isolated`. The report is written to `compat-reports/`.
3. Missing factories: find the new name in the "New factories not used by this server" section and add an alias to a new profile `src/plasticity/compat/profiles/<version>.ts` (copy the previous profile, change `version`, register it in `profiles/index.ts`).
4. Missing editor paths: fix `editorPaths` in the new profile (paths are dotted, relative to the editor object).
5. Repeat step 2 until the "Missing …" sections are empty.
6. Run `npm run test:live:full` and compare with the baseline. Failures unrelated to factories and paths mean that Plasticity behaviour changed; those are separate tasks.
7. Set the new profile to `status: "supported"` and update the harness baselines (`--update-baseline`).

## If the server cannot connect

- "Plasticity rejected the loopback CDP startup hook (Electron X)" — the Electron startup changed. See `unlockMainProcess` in `src/plasticity/launcher.ts`.
- "Plasticity editor was not found (…)" — the window structure changed. See the strategies in `src/plasticity/compat/discovery.ts`; add a new strategy to the `STRATEGIES` list.

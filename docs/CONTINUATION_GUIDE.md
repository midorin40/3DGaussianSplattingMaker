# Continuation Guide

## Start Here

Read these first:

- [README.md](/C:/WebApp/GaussianSplattingMaker/README.md)
- [docs/REQUIREMENTS.md](/C:/WebApp/GaussianSplattingMaker/docs/REQUIREMENTS.md)
- [docs/SPECIFICATION.md](/C:/WebApp/GaussianSplattingMaker/docs/SPECIFICATION.md)
- [docs/OLD_SYSTEM.md](/C:/WebApp/GaussianSplattingMaker/docs/OLD_SYSTEM.md)
- [docs/ARCHITECTURE_V2.md](/C:/WebApp/GaussianSplattingMaker/docs/ARCHITECTURE_V2.md)
- [docs/V2_DATA_MODEL.md](/C:/WebApp/GaussianSplattingMaker/docs/V2_DATA_MODEL.md)
- [docs/V2_SPECIFICATION.md](/C:/WebApp/GaussianSplattingMaker/docs/V2_SPECIFICATION.md)
- [data/local-stack.json](/C:/WebApp/GaussianSplattingMaker/data/local-stack.json)

## Current Position

- The existing runnable app is now the `old` system.
- The migration target is to freeze it into `old_archive` rather than delete it immediately.
- New design work should be evaluated against `v2`.
- The current product concept remains local-first: Web UI as interface, processing on the local machine.

## Old System Notes

- The current runtime is still centered on [server.js](/C:/WebApp/GaussianSplattingMaker/server.js).
- It supports single-image, multi-image, and video input.
- It supports `.splat` export and job pause/resume.
- It should be preserved as the migration baseline.
- Treat it as read-only after `v2` reaches parity.

## V2 Direction

The active redesign direction is:

- split `single` and `multi/video` pipelines early,
- add an input optimizer,
- move toward artifact-based outputs,
- support `ply`, `splat`, and `ksplat`,
- optimize for precision first and speed second.

## V2 Current Reality

What is already implemented in `v2`:

- domain models for `project / job / artifact`
- file-based `v2` persistence
- single and multi/video pipeline planning
- multi/video input optimizer scaffold
- run preparation manifest generation
- canonical artifact bundle scaffold generation
- minimal REST API for project, asset, job, and artifact access
- `pause / resume` state transitions at the API/state level

What is not implemented yet in `v2`:

- real reconstruction execution
- real trainer execution
- real exporter execution
- browser-facing `v2` UI

## Restart Reminder

If [server.js](/C:/WebApp/GaussianSplattingMaker/server.js) is changed, restart the running Node process.

Check the port:

```powershell
netstat -ano | findstr :3100
```

Stop if needed:

```powershell
Stop-Process -Id <PID> -Force
```

Start again:

```powershell
npm start
```

If [v2/server.js](/C:/WebApp/GaussianSplattingMaker/v2/server.js) is being tested directly:

```powershell
npm run start:v2
```

## Local Stack Check

Verify these keys exist in [data/local-stack.json](/C:/WebApp/GaussianSplattingMaker/data/local-stack.json):

- `gaussianSplattingRoot`
- `repoPath`
- `rawDataPath`
- `envPath`
- `scriptsPath`

## Next Recommended Work

1. Add richer `v2` job lifecycle handling beyond simple scaffold state transitions.
2. Implement actual `single` preparation execution inside `v2`.
3. Implement actual `multi/video` preparation execution inside `v2`.
4. Connect reconstruction, training, and exporter adapters to the artifact bundle flow.
5. Add a browser-facing `v2` UI or compatibility API layer once execution paths exist.

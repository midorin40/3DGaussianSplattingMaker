# Old System

## Position

The current implementation in this repository is the `old` system.

It remains runnable as-is, but it is no longer the target architecture for future quality-first work.

During migration, `old` should be treated as a staged archive. The intent is to move it into an `old_archive` state, keep it available for comparison, and delete it only after `v2` is validated.

## Scope

The `old` system consists of:

- [server.js](/C:/WebApp/GaussianSplattingMaker/server.js)
- [public/index.html](/C:/WebApp/GaussianSplattingMaker/public/index.html)
- [public/app.js](/C:/WebApp/GaussianSplattingMaker/public/app.js)
- [public/styles.css](/C:/WebApp/GaussianSplattingMaker/public/styles.css)
- [scripts/prepare_colmap_scene.py](/C:/WebApp/GaussianSplattingMaker/scripts/prepare_colmap_scene.py)
- [scripts/generate_single_views.py](/C:/WebApp/GaussianSplattingMaker/scripts/generate_single_views.py)
- [scripts/gsplat_resume_runner.py](/C:/WebApp/GaussianSplattingMaker/scripts/gsplat_resume_runner.py)

## What It Does Well

- Provides a lightweight Web UI for local execution.
- Supports single-image, multi-image, and video inputs.
- Can run local COLMAP, gsplat training, and `.splat` export.
- Supports pause and resume for long-running jobs.

## Main Limitations

- Web/API/orchestration/pipeline logic are concentrated in `server.js`.
- Single-image and multi-image/video workflows are coupled too early.
- Input quality optimization is minimal.
- Output handling is centered on the current execution path rather than a stable artifact model.
- The system is usable, but not structured for precision-first iteration.

## Migration Rule

From this point forward:

- Bug fixes to keep the current app usable may still be applied to the `old` system.
- New architecture work should be described against the `v2` design.
- New quality-focused pipeline logic should not be added directly into the `old` structure unless required as a temporary bridge.
- Once `v2` is stable, the `old` system should be frozen and treated as `old_archive`.

## Role Of The Old System

The `old` system is now the reference implementation and migration baseline.

It exists to:

- preserve the current working app,
- provide test inputs and behavior references,
- and serve as the source system for gradual migration into `v2`.

Recommended archive state:

- read-only reference,
- comparison target for regression checks,
- temporary fallback until `v2` reaches feature parity.

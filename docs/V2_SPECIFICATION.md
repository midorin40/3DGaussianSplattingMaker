# V2 Specification

## 1. Purpose

`v2` is a local-first generation system for Gaussian Splatting related outputs.

Primary priority:

1. Precision
2. Speed

The Web UI is only an interface. All heavy processing runs on the local machine.

Supported output targets:

- `ply`
- `splat`
- `ksplat`

## 2. Product Concept

This product is not primarily a strict reconstruction tool.

It is a local asset generation system that takes:

- a single image,
- multiple images,
- or a video,

and produces stable output artifacts suitable for viewing, validation, and later export.

## 3. System Structure

### 3.1 Web Layer

Responsibilities:

- project creation
- asset upload
- job start / pause / resume
- progress display
- log display
- artifact download

### 3.2 Local Engine Layer

Responsibilities:

- input optimization
- scene preparation
- reconstruction
- training
- export
- artifact generation

### 3.3 Storage Layer

Responsibilities:

- project metadata
- job metadata
- uploaded assets
- intermediate manifests
- final artifacts
- metrics

## 4. Pipeline Split

`v2` separates pipelines early.

### 4.1 Single Pipeline

Input:

- exactly one image

Main steps:

- validate source image
- optionally normalize background
- generate pseudo multi-view inputs
- prepare single scene bundle
- run reconstruction/training path
- export artifact formats

Design intent:

- single-image mode is treated as its own precision problem
- it is not forced to share early assumptions with multi-image/video

### 4.2 Multi / Video Pipeline

Input:

- multiple images
- or one or more videos

Main steps:

- validate assets
- score inputs
- select inputs / assign frame budget
- prepare reconstruction-ready scene
- run reconstruction/training path
- export artifact formats

Design intent:

- maximize registration quality and training stability
- optimize for useful observations, not raw input count

## 5. Input Optimizer

The input optimizer exists first for the `multi/video` path.

Current responsibilities:

- deduplicate assets
- score inputs
- classify image vs video
- compute selected and discarded inputs
- compute `frameBudgetPerVideo`
- return `inputStats`, warnings, and recommendations

Planned responsibilities:

- blur filtering
- duplicate-frame suppression
- coverage-aware frame selection
- quality diagnostics before reconstruction

## 6. Data Model

`v2` uses three core entities.

### 6.1 Project

Purpose:

- user-facing container for one generation goal

Key fields:

- `id`
- `name`
- `mode`
- `subjectType`
- `qualityPreset`
- `backgroundMode`
- `trainingSteps`
- `videoFrameTarget`
- `status`
- `activeJobId`
- `latestArtifactId`
- `assets`

### 6.2 Job

Purpose:

- one execution attempt for one project

Key fields:

- `id`
- `projectId`
- `pipelineKey`
- `status`
- `progress`
- `currentStage`
- `workDir`
- `sceneDir`
- `logPath`
- `targetIterations`
- `targetVideoFrames`
- `inputStats`
- `artifactId`

### 6.3 Artifact

Purpose:

- canonical result bundle and derived outputs

Key fields:

- `id`
- `projectId`
- `jobId`
- `kind`
- `status`
- `path`
- `format`
- `metadata`

Reference model:

- [docs/V2_DATA_MODEL.md](/C:/WebApp/GaussianSplattingMaker/docs/V2_DATA_MODEL.md)

## 7. Artifact Model

The canonical result is an artifact bundle, not only one export file.

Typical bundle contents:

- `geometry.ply`
- `scene.json`
- `cameras.json`
- `metrics.json`
- `manifest.json`

Derived outputs:

- `.splat`
- `.ksplat`
- preview assets

## 8. Storage Layout

Primary storage root:

- `data/v2/`

Main directories:

- `data/v2/projects/`
- `data/v2/jobs/`
- `data/v2/artifacts/`
- `data/v2/uploads/`
- `data/v2/logs/`
- `data/v2/cache/`

Run preparation manifests are currently written under:

- `data/v2/cache/runs/<jobId>/manifests/`

Current persistence style:

- collection files such as `projects.json`, `jobs.json`, and `artifacts.json`
- per-entity files such as `data/v2/projects/<projectId>.json`
- uploaded binaries under `data/v2/uploads/<projectId>/`

## 9. Current V2 Web API

Current entrypoint:

- [v2/server.js](/C:/WebApp/GaussianSplattingMaker/v2/server.js)

Implemented endpoints:

- `GET /api/status`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects/:id/assets`
- `POST /api/projects/:id/jobs`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs/:id/pause`
- `POST /api/jobs/:id/resume`
- `GET /api/artifacts`
- `GET /api/artifacts/:id`
- `GET /v2/uploads/<projectId>/<fileName>`

Current API scope:

- create and persist `project / job / artifact`
- ingest uploaded assets into `data/v2/uploads/`
- resolve `single` vs `multi/video` pipeline plans
- generate run preparation manifests
- generate canonical artifact bundle scaffolds
- update job/project state for `pause / resume`

Current API non-goals:

- actual reconstruction execution
- actual training execution
- actual exporter execution
- browser UI delivery

## 10. Current V2 Implementation Status

Implemented:

- `project / job / artifact` domain models
- file-based `v2` storage helpers
- single pipeline plan
- multi/video pipeline plan
- multi/video input optimizer scaffold
- single scene bundle scaffold
- run preparation manifest generation
- minimal `v2` REST API
- asset persistence under `data/v2/uploads/`
- artifact bundle scaffold generation
- job pause / resume state transitions

Current preparation outputs:

- `single_scene_bundle`
- `multi_video_preparation`
- artifact bundle scaffold with `manifest.json`, `scene.json`, `cameras.json`, and `metrics.json`

Not yet implemented:

- actual frame extraction inside `v2`
- actual pseudo-view generation inside `v2`
- reconstruction adapter execution
- trainer adapter execution
- exporter execution
- browser-facing `v2` UI
- progress updates beyond scaffold state transitions

## 11. Job Stages

Expected stages include:

- `queued`
- `preparing`
- `optimizing`
- `reconstructing`
- `training`
- `exporting`
- `paused`
- `completed`
- `failed`

Current scaffold behavior:

- `single` job creation enters `preparing`
- `multi/video` job creation enters `optimizing`
- `pause` moves a job to `paused`
- `resume` returns a job to `preparing` or `optimizing` depending on `pipelineKey`

## 12. Current Entry Points

Compatibility entrypoint:

- [server.js](/C:/WebApp/GaussianSplattingMaker/server.js)

Archived old runtime:

- [old_archive/server.js](/C:/WebApp/GaussianSplattingMaker/old_archive/server.js)

V2 scaffold/API entrypoint:

- [v2/server.js](/C:/WebApp/GaussianSplattingMaker/v2/server.js)

## 13. Migration Policy

The current runnable application remains available through `old_archive`.

`v2` is developed in parallel until:

- major workflows are implemented,
- output quality is validated,
- and rollback to the old baseline is no longer required.

Only after that should old runtime data or code be deleted.

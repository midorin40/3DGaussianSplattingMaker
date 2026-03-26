# Legacy V2 Data Model

This document is a historical design reference.

The active implementation now uses the root runtime layout described in [docs/SPECIFICATION.md](/C:/WebApp/GaussianSplattingMaker/docs/SPECIFICATION.md).

## Scope

This document defines the minimal persistent model for `v2`.

The model is centered on three entities:

- `project`
- `job`
- `artifact`

The goal is to keep precision-focused pipeline state explicit and replayable.

## Storage Layout

Target storage is file-based and local-first.

```text
data/
  v2/
    projects/
      <projectId>.json
    jobs/
      <jobId>.json
    artifacts/
      <projectId>/
        <artifactId>/
          manifest.json
          geometry.ply
          cameras.json
          metrics.json
          preview/
          exports/
```

Supporting folders:

```text
data/
  v2/
    uploads/
    logs/
    cache/
```

## Project

`project` is the user-facing container for one generation goal.

### Status

- `draft`
- `queued`
- `running`
- `paused`
- `completed`
- `failed`
- `archived`

### Key Fields

```json
{
  "id": "project-...",
  "name": "My Scan",
  "mode": "single|multi|video",
  "subjectType": "product|figure|person|room|other",
  "qualityPreset": "fast|standard|high",
  "backgroundMode": "keep|remove",
  "trainingSteps": 30000,
  "targetVideoFrames": 96,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "status": "draft",
  "activeJobId": "job-...|null",
  "latestArtifactId": "artifact-...|null",
  "notes": "",
  "tags": [],
  "assets": []
}
```

### Asset Shape

`assets` are metadata only; binary data lives in `data/v2/uploads/`.

```json
{
  "id": "asset-...",
  "kind": "image|video",
  "name": "input.png",
  "mimeType": "image/png",
  "size": 12345,
  "storedPath": "data/v2/uploads/<projectId>/input.png",
  "previewUrl": "/v2/uploads/<projectId>/input.png",
  "uploadedAt": "ISO-8601"
}
```

## Job

`job` is one execution attempt for a project.

### Status

- `queued`
- `preparing`
- `optimizing`
- `reconstructing`
- `training`
- `exporting`
- `paused`
- `completed`
- `failed`
- `canceled`

### Key Fields

```json
{
  "id": "job-...",
  "projectId": "project-...",
  "mode": "single|multi|video",
  "status": "queued",
  "progress": 0,
  "currentStage": "Queued",
  "startedAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "finishedAt": null,
  "sceneDir": "data/v2/runs/<jobId>/scene",
  "workDir": "data/v2/runs/<jobId>",
  "logPath": "data/v2/logs/<jobId>.log",
  "targetIterations": 30000,
  "targetVideoFrames": 96,
  "usedSyntheticViews": false,
  "usedVideoInput": false,
  "inputStats": {},
  "error": null,
  "lastCheckpointPath": null,
  "lastCheckpointIteration": 0,
  "artifactId": "artifact-...|null"
}
```

### Job Semantics

- `queued`: accepted, not started
- `preparing`: input validation and scene setup
- `optimizing`: frame scoring, filtering, or pseudo-view generation
- `reconstructing`: COLMAP or adapter reconstruction
- `training`: GS training in progress
- `exporting`: deriving outputs from the canonical artifact bundle
- `paused`: resumable state after interruption
- `completed`: artifact bundle is finalized
- `failed`: unrecoverable error
- `canceled`: user-terminated and not intended to resume

## Artifact

`artifact` is the canonical output bundle for one successful run.

An artifact can represent the primary training result plus derived exports.

### Status

- `building`
- `ready`
- `partial`
- `failed`
- `archived`

### Key Fields

```json
{
  "id": "artifact-...",
  "projectId": "project-...",
  "jobId": "job-...",
  "status": "ready",
  "canonicalFormat": "ply",
  "availableFormats": ["ply", "splat", "ksplat"],
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "bundlePath": "data/v2/artifacts/<projectId>/<artifactId>",
  "manifestPath": "data/v2/artifacts/<projectId>/<artifactId>/manifest.json",
  "geometryPath": "data/v2/artifacts/<projectId>/<artifactId>/geometry.ply",
  "camerasPath": "data/v2/artifacts/<projectId>/<artifactId>/cameras.json",
  "metricsPath": "data/v2/artifacts/<projectId>/<artifactId>/metrics.json",
  "exports": {
    "splat": "data/v2/artifacts/<projectId>/<artifactId>/exports/model.splat",
    "ksplat": "data/v2/artifacts/<projectId>/<artifactId>/exports/model.ksplat"
  }
}
```

### Manifest Responsibilities

`manifest.json` should record:

- source project and job references,
- input hashes or references,
- pipeline type,
- training parameters,
- metrics snapshot,
- available exports,
- reproducibility notes.

## Relationships

- One `project` can have many `jobs`.
- One `job` belongs to exactly one `project`.
- One `job` produces at most one canonical `artifact`.
- One `artifact` is derived from exactly one successful `job`.

## Minimal Query Rules

- The latest visible state for the UI comes from `project`.
- The most recent execution details come from `job`.
- The downloadable result comes from `artifact`.

## Migration Notes

The current `old` system does not need to match this layout exactly.

This document defines the target `v2` shape so the new implementation can be built cleanly without carrying over the monolithic `server.js` state model.

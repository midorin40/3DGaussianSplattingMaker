# Architecture V2

## Goal

`v2` is a redesign for a local generation system where:

- precision is the highest priority,
- speed is the second priority,
- the Web UI is only an interface,
- and outputs may be `ply`, `splat`, or `ksplat` depending on the project.

This is not a strict reconstruction tool first. It is a quality-first local asset generation system for stable 3DGS-related outputs.

## Core Product Concept

The product is:

- a local processing engine,
- exposed through a Web UI,
- optimized to produce usable output artifacts reliably.

The Web UI is not the processing system itself. It is the operator console.

## System Boundary

### Web Layer

Responsibilities:

- project creation,
- input upload,
- job start/pause/resume,
- progress display,
- log viewing,
- artifact download.

Non-responsibilities:

- reconstruction,
- frame optimization,
- training logic,
- export logic.

### Local Engine Layer

Responsibilities:

- input optimization,
- scene preparation,
- reconstruction,
- training,
- export,
- artifact generation.

### Storage Layer

Responsibilities:

- project metadata,
- job metadata,
- uploaded assets,
- intermediate artifacts,
- final output bundles,
- metrics and manifests.

## Design Principles

1. Split single-image and multi-image/video early.
2. Optimize for output quality, not raw frame count.
3. Keep processing local and explicit.
4. Preserve stable intermediate artifacts.
5. Make exporters and trainers replaceable.
6. Keep the UI thin.

## Top-Level Modules

### 1. Web App

Suggested scope:

- REST API
- project dashboard
- job dashboard
- artifact browser

### 2. Orchestrator

Suggested scope:

- job lifecycle,
- retries,
- resume/pause,
- progress events,
- logging,
- pipeline dispatch.

### 3. Input Optimizer

Suggested scope:

- video frame extraction,
- blur filtering,
- duplicate reduction,
- frame scoring,
- optional segmentation/masking preprocessing,
- quality diagnostics before reconstruction.

This is expected to be the first area with strong real impact on failure rate.

Data model reference: [docs/V2_DATA_MODEL.md](/C:/WebApp/GaussianSplattingMaker/docs/V2_DATA_MODEL.md)

### 4. Scene Pipelines

`v2` has two primary pipelines:

- `single pipeline`
- `multi/video pipeline`

They must not share early-stage assumptions.

#### Single Pipeline

Primary purpose:

- convert one source image into a stable training-ready scene package.

Key steps:

- source validation,
- optional background cleanup,
- mask generation,
- depth/normal estimation,
- pseudo-view generation,
- optional direct single-image path in the future,
- training preparation.

#### Multi/Video Pipeline

Primary purpose:

- maximize registration quality and training stability from multiple observations.

Key steps:

- asset validation,
- frame extraction,
- frame quality scoring,
- downselection by coverage and distinctiveness,
- COLMAP-oriented scene packaging,
- training preparation.

## Reconstruction Adapters

The reconstruction layer is adapter-based.

Initial adapters:

- `colmap adapter`

Planned adapters:

- `single-image direct adapter`

Reason:

- single-image precision work should not remain permanently constrained by COLMAP assumptions.

## Trainer Adapters

The trainer layer is adapter-based.

Initial adapter:

- `gsplat trainer`

Possible future adapters:

- tuned gsplat variants,
- custom rasterizer-backed trainers,
- alternative commercial-safe training stacks.

The trainer boundary exists mainly for long-term flexibility, not immediate quality gain.

## Export Adapters

Outputs are adapter-based.

Supported output families:

- `ply`
- `splat`
- `ksplat`

Exports are derived from a stable artifact bundle, not from UI assumptions.

## Canonical Artifact Bundle

The canonical result is not only `ply`.

It is an artifact bundle with:

- `geometry.ply`
- `scene.json`
- `cameras.json`
- `metrics.json`
- `manifest.json`

Derived outputs:

- `.splat`
- `.ksplat`
- preview assets

This prevents exporter bugs from being confused with training failures.

## Precision-First Evaluation

`v2` must be measured, not only organized.

### Quality Metrics

- camera registration rate,
- training success rate,
- failure rate,
- visible floaters rate,
- visible holes rate,
- blur/artifact severity,
- repeatability across reruns.

### Speed Metrics

- preprocessing time,
- reconstruction time,
- training time,
- export time,
- rerun cost after failure.

### Operational Metrics

- pause success rate,
- resume success rate,
- log diagnosability,
- artifact reproducibility.

## Suggested Directory Shape

This is a target structure, not yet implemented.

```text
apps/
  web/
core/
  orchestrator/
  domain/
  pipelines/
    single/
    multi/
  adapters/
    reconstruction/
    trainers/
    exporters/
  diagnostics/
data/
  projects/
  jobs/
  uploads/
  artifacts/
  logs/
```

## Migration Strategy

Migration should be staged.

### Phase 0

Preserve the current app as `old`, then move it into `old_archive` state during the transition.

### Phase 1

Implement the minimum precision-first split:

- separate `single` and `multi/video` pipeline definitions,
- add input optimization for multi/video,
- add evaluation metrics.

### Phase 2

Introduce canonical artifact bundles and output adapters.

### Phase 3

Move orchestration out of the current monolithic server structure.

### Phase 4

Introduce trainer and reconstruction adapter boundaries for long-term evolution.

### Phase 5

Freeze `old_archive`, keep it only as a comparison baseline, and remove it after `v2` validation is complete.

## Immediate Priorities

`P0`

- single vs multi/video pipeline split
- input optimizer
- metric collection

`P1`

- canonical artifact bundle
- export abstraction for `ply / splat / ksplat`

`P2`

- orchestration split
- trainer/export adapter boundaries

## Rule For New Work

New quality-focused development should target `v2` concepts even if temporary bridge changes are applied to the `old` implementation.

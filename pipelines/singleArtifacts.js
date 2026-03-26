const SINGLE_ARTIFACT_KINDS = Object.freeze([
  "scene_bundle",
  "geometry_ply",
  "splat",
  "ksplat",
  "preview",
  "metrics",
])

function createSingleSceneBundlePlan(project = {}, context = {}) {
  const projectId = project.id || context.projectId || null
  const bundleId = context.bundleId || null
  const assetCount = Array.isArray(project.assets) ? project.assets.length : 0
  const qualityPreset = project.qualityPreset || "standard"

  return {
    bundleKind: "single_scene",
    projectId,
    bundleId,
    rootHint: projectId ? `data/runtime/artifacts/${projectId}` : "data/runtime/artifacts/<projectId>",
    inputShape: {
      assetCount,
      usesSyntheticViews: true,
      usesColmap: true,
      backgroundMode: project.backgroundMode || "keep",
      qualityPreset,
    },
    processingHints: {
      normalizeBackground: project.backgroundMode === "remove",
      preserveForegroundMask: true,
      generateDepthPrior: true,
      generateNormalPrior: true,
    },
  }
}

function planSingleArtifacts(project = {}, job = {}, bundlePlan = {}) {
  const projectId = project.id || job.projectId || bundlePlan.projectId || null
  const artifactBasePath = projectId
    ? `data/runtime/artifacts/${projectId}/<artifactId>`
    : "data/runtime/artifacts/<projectId>/<artifactId>"

  return [
    {
      kind: "scene_bundle",
      canonical: true,
      format: "json",
      path: `${artifactBasePath}/manifest.json`,
      label: "Single-image scene bundle manifest",
    },
    {
      kind: "geometry_ply",
      canonical: true,
      format: "ply",
      path: `${artifactBasePath}/geometry.ply`,
      label: "Training geometry",
    },
    {
      kind: "metrics",
      canonical: false,
      format: "json",
      path: `${artifactBasePath}/metrics.json`,
      label: "Quality metrics snapshot",
    },
    {
      kind: "preview",
      canonical: false,
      format: "bundle",
      path: `${artifactBasePath}/preview`,
      label: "Preview assets",
    },
    {
      kind: "splat",
      canonical: false,
      format: "splat",
      path: `${artifactBasePath}/exports/model.splat`,
      label: "Standard splat export",
    },
    {
      kind: "ksplat",
      canonical: false,
      format: "ksplat",
      path: `${artifactBasePath}/exports/model.ksplat`,
      label: "Compressed ksplat export",
    },
  ]
}

function buildSingleArtifactPlan(project = {}, job = {}, context = {}) {
  const sceneBundle = createSingleSceneBundlePlan(project, context)
  const artifacts = planSingleArtifacts(project, job, sceneBundle)
  return {
    sceneBundle,
    artifacts,
    canonicalFormat: "ply",
    availableFormats: ["ply", "splat", "ksplat"],
    kinds: SINGLE_ARTIFACT_KINDS,
  }
}

module.exports = {
  SINGLE_ARTIFACT_KINDS,
  createSingleSceneBundlePlan,
  planSingleArtifacts,
  buildSingleArtifactPlan,
}

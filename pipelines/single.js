const SINGLE_PIPELINE_STAGES = Object.freeze([
  { key: "prepare_input", label: "Validate single-image input" },
  { key: "generate_views", label: "Generate pseudo multi-view inputs" },
  { key: "prepare_scene", label: "Prepare training scene bundle" },
  { key: "train", label: "Run gsplat training" },
  { key: "export", label: "Export artifact formats" },
]);

const {
  buildSingleArtifactPlan,
  createSingleSceneBundlePlan,
} = require("./singleArtifacts");

function createSinglePipelinePlan(project = {}, context = {}) {
  const sceneBundle = createSingleSceneBundlePlan(project, context);
  const artifactPlan = buildSingleArtifactPlan(project, context.job || {}, context);

  return {
    pipelineKey: "single",
    mode: "single",
    stages: SINGLE_PIPELINE_STAGES,
    optimizer: null,
    flags: {
      usesSyntheticViews: true,
      usesColmap: true,
      precisionFirst: true,
    },
    inputs: {
      assetCount: Array.isArray(project.assets) ? project.assets.length : 0,
      backgroundMode: project.backgroundMode || "keep",
      qualityPreset: project.qualityPreset || "standard",
    },
    sceneBundle,
    artifacts: artifactPlan.artifacts,
    artifactPlan,
    context,
  };
}

module.exports = {
  SINGLE_PIPELINE_STAGES,
  createSingleSceneBundlePlan,
  buildSingleArtifactPlan,
  createSinglePipelinePlan,
};

const { analyzeInputs } = require("../optimizer/multiVideo");

const MULTI_VIDEO_PIPELINE_STAGES = Object.freeze([
  { key: "prepare_input", label: "Validate multi/video input" },
  { key: "optimize_input", label: "Score and select frames/views" },
  { key: "reconstruct", label: "Run reconstruction adapter" },
  { key: "train", label: "Run gsplat training" },
  { key: "export", label: "Export artifact formats" },
]);

function createMultiVideoPipelinePlan(project = {}, context = {}) {
  const optimization = analyzeInputs(project.assets || [], {
    targetFrames: project.videoFrameTarget,
    priority: project.qualityPreset === "fast" ? "speed" : "precision",
  });

  return {
    pipelineKey: "multi_video",
    mode: project.mode || "multi",
    stages: MULTI_VIDEO_PIPELINE_STAGES,
    optimizer: optimization,
    flags: {
      usesSyntheticViews: false,
      usesColmap: true,
      precisionFirst: true,
    },
    inputs: {
      assetCount: Array.isArray(project.assets) ? project.assets.length : 0,
      backgroundMode: project.backgroundMode || "keep",
      qualityPreset: project.qualityPreset || "standard",
      targetVideoFrames: project.videoFrameTarget || 96,
    },
    inputStats: optimization.summary,
    selection: {
      selectedAssets: optimization.selectedAssets,
      discardedAssets: optimization.discardedAssets,
      recommendations: optimization.recommendations,
      warnings: optimization.warnings,
    },
    context,
  };
}

module.exports = {
  MULTI_VIDEO_PIPELINE_STAGES,
  createMultiVideoPipelinePlan,
};

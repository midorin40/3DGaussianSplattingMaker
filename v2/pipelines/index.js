const { createSinglePipelinePlan } = require("./single");
const { createMultiVideoPipelinePlan } = require("./multiVideo");
const {
  createSingleSceneBundlePlan,
  buildSingleArtifactPlan,
} = require("./singleArtifacts");

function resolvePipeline(project = {}, context = {}) {
  if (project.mode === "single") {
    return createSinglePipelinePlan(project, context);
  }
  return createMultiVideoPipelinePlan(project, context);
}

module.exports = {
  createSinglePipelinePlan,
  createSingleSceneBundlePlan,
  buildSingleArtifactPlan,
  createMultiVideoPipelinePlan,
  resolvePipeline,
};

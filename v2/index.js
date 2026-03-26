const { createProject } = require("./domain/project");
const { createJob } = require("./domain/job");
const { createArtifact } = require("./domain/artifact");
const { openV2Storage, getV2Paths, writeJsonFile } = require("./storage");
const {
  createSinglePipelinePlan,
  createSingleSceneBundlePlan,
  buildSingleArtifactPlan,
  createMultiVideoPipelinePlan,
  resolvePipeline,
} = require("./pipelines");
const {
  prepareSingleRun,
  prepareMultiVideoRun,
  prepareRun,
} = require("./run");

module.exports = {
  createProject,
  createJob,
  createArtifact,
  openV2Storage,
  getV2Paths,
  writeJsonFile,
  createSinglePipelinePlan,
  createSingleSceneBundlePlan,
  buildSingleArtifactPlan,
  createMultiVideoPipelinePlan,
  resolvePipeline,
  prepareSingleRun,
  prepareMultiVideoRun,
  prepareRun,
};

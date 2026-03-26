const { prepareSingleRun } = require("./singlePreparation");
const { prepareMultiVideoRun } = require("./multiVideoPreparation");

function prepareRun(project = {}, job = {}, pipelinePlan = {}) {
  if (pipelinePlan.pipelineKey === "single") {
    return prepareSingleRun(project, job, pipelinePlan);
  }
  return prepareMultiVideoRun(project, job, pipelinePlan);
}

module.exports = {
  prepareSingleRun,
  prepareMultiVideoRun,
  prepareRun,
};

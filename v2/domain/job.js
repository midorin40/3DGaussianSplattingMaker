const JOB_STATUSES = Object.freeze([
  "queued",
  "preparing",
  "optimizing",
  "reconstructing",
  "running",
  "training",
  "exporting",
  "paused",
  "completed",
  "failed",
  "canceled",
]);

function createJob(input = {}) {
  const now = new Date().toISOString();
  const pipelineKey = ["single", "multi_video"].includes(input.pipelineKey)
    ? input.pipelineKey
    : input.pipeline === "single"
      ? "single"
      : "multi_video";

  return {
    id: input.id || null,
    projectId: input.projectId || null,
    mode: input.mode || (pipelineKey === "single" ? "single" : "multi"),
    pipelineKey,
    status: input.status && JOB_STATUSES.includes(input.status) ? input.status : "queued",
    progress: Number.isFinite(input.progress) ? input.progress : 0,
    currentStage: input.currentStage || "Queued",
    startedAt: input.startedAt || now,
    updatedAt: input.updatedAt || now,
    finishedAt: input.finishedAt || null,
    pausedAt: input.pausedAt || null,
    workDir: input.workDir || null,
    sceneDir: input.sceneDir || null,
    modelDir: input.modelDir || null,
    logPath: input.logPath || null,
    pid: Number.isInteger(input.pid) ? input.pid : null,
    activeCommand: input.activeCommand || null,
    pausedCommand: input.pausedCommand || null,
    targetIterations: Number.isInteger(input.targetIterations) ? input.targetIterations : 30000,
    targetVideoFrames: Number.isInteger(input.targetVideoFrames) ? input.targetVideoFrames : 96,
    latestPlyPath: input.latestPlyPath || null,
    exportPath: input.exportPath || null,
    exportUrl: input.exportUrl || null,
    lastCheckpointPath: input.lastCheckpointPath || null,
    lastCheckpointIteration: Number.isInteger(input.lastCheckpointIteration) ? input.lastCheckpointIteration : 0,
    errorMessage: input.errorMessage || null,
    extractedFrameCount: Number.isInteger(input.extractedFrameCount) ? input.extractedFrameCount : 0,
    usedVideoInput: !!input.usedVideoInput,
    usedSyntheticViews: !!input.usedSyntheticViews,
    syntheticViewCount: Number.isInteger(input.syntheticViewCount) ? input.syntheticViewCount : 0,
    preparationCompleted: !!input.preparationCompleted,
    trainingCompleted: !!input.trainingCompleted,
    inputStats: input.inputStats && typeof input.inputStats === "object" ? input.inputStats : {},
    artifactId: input.artifactId || null,
  };
}

module.exports = {
  JOB_STATUSES,
  createJob,
};

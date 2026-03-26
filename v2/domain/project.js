const PROJECT_STATUSES = Object.freeze([
  "draft",
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "archived",
]);

function createProject(input = {}) {
  const now = new Date().toISOString();
  const mode = ["single", "multi", "video"].includes(input.mode) ? input.mode : "multi";

  return {
    id: input.id || null,
    name: input.name || "Untitled Project",
    mode,
    subjectType: input.subjectType || "object",
    qualityPreset: input.qualityPreset || "standard",
    backgroundMode: input.backgroundMode || "keep",
    trainingSteps: Number.isInteger(input.trainingSteps) ? input.trainingSteps : 30000,
    videoFrameTarget: Number.isInteger(input.videoFrameTarget) ? input.videoFrameTarget : 96,
    notes: input.notes || "",
    status: input.status && PROJECT_STATUSES.includes(input.status) ? input.status : "draft",
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    activeJobId: input.activeJobId || null,
    latestArtifactId: input.latestArtifactId || null,
    primaryArtifactId: input.primaryArtifactId || null,
    artifactIds: Array.isArray(input.artifactIds) ? input.artifactIds : [],
    assetIds: Array.isArray(input.assetIds) ? input.assetIds : [],
    assets: Array.isArray(input.assets) ? input.assets : [],
    tags: Array.isArray(input.tags) ? input.tags : [],
    output: input.output && typeof input.output === "object" ? input.output : null,
  };
}

module.exports = {
  PROJECT_STATUSES,
  createProject,
};

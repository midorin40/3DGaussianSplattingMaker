const ARTIFACT_KINDS = Object.freeze([
  "scene_bundle",
  "geometry_ply",
  "splat",
  "ksplat",
  "preview",
  "log",
  "metrics",
]);

const ARTIFACT_STATUSES = Object.freeze([
  "pending",
  "ready",
  "failed",
]);

function createArtifact(input = {}) {
  const now = new Date().toISOString();
  return {
    id: input.id || null,
    projectId: input.projectId || null,
    jobId: input.jobId || null,
    kind: input.kind && ARTIFACT_KINDS.includes(input.kind) ? input.kind : "scene_bundle",
    status: input.status && ARTIFACT_STATUSES.includes(input.status) ? input.status : "pending",
    label: input.label || null,
    path: input.path || null,
    url: input.url || null,
    format: input.format || null,
    mimeType: input.mimeType || null,
    size: Number.isInteger(input.size) ? input.size : null,
    checksum: input.checksum || null,
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  };
}

module.exports = {
  ARTIFACT_KINDS,
  ARTIFACT_STATUSES,
  createArtifact,
};

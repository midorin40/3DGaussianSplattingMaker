function normalizeMimeType(mimeType = "") {
  return String(mimeType).toLowerCase().trim();
}

function getAssetKey(asset = {}) {
  return [asset.storedPath || "", asset.previewUrl || "", asset.name || ""].join("|");
}

function tokenizeName(name = "") {
  return String(name)
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function scoreAsset(asset = {}) {
  const mimeType = normalizeMimeType(asset.mimeType);
  const size = Number.isFinite(asset.size) ? asset.size : 0;
  const isVideo = mimeType.startsWith("video/");
  const isImage = mimeType.startsWith("image/");
  const nameTokens = tokenizeName(asset.name);
  const diversityHint = Math.min(0.2, new Set(nameTokens).size * 0.02);

  const baseScore = isVideo ? 0.84 : isImage ? 0.72 : 0.18;
  const sizeScore = Math.min(1, size / (4 * 1024 * 1024));
  const formatBoost = /png$/.test(String(asset.name || "").toLowerCase()) ? 0.04 : 0;
  return Number((baseScore * 0.55 + sizeScore * 0.25 + diversityHint + formatBoost).toFixed(3));
}

function estimateFrameBudget(videoCount, targetFrames) {
  if (!videoCount) return 0;
  const safeTarget = Math.max(12, Number.isInteger(targetFrames) ? targetFrames : 96);
  return Math.max(12, Math.round(safeTarget / videoCount));
}

function buildSelectionReasons(asset, context) {
  const reasons = [];
  const mimeType = normalizeMimeType(asset.mimeType);
  if (mimeType.startsWith("video/")) reasons.push("video_source");
  if (mimeType.startsWith("image/")) reasons.push("image_source");
  if (asset.score >= 0.8) reasons.push("high_quality_score");
  if ((asset.name || "").toLowerCase().includes("frame")) reasons.push("likely_frame_sequence");
  if (context.priority === "precision") reasons.push("precision_first");
  return reasons;
}

function analyzeInputs(assets = [], options = {}) {
  const targetFrames = Number.isInteger(options.targetFrames) ? options.targetFrames : 96;
  const priority = options.priority || "precision";
  const deduped = [];
  const seen = new Set();

  for (const asset of assets) {
    const key = getAssetKey(asset);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(asset);
  }

  const scoredAssets = deduped.map((asset) => ({
    ...asset,
    mimeType: normalizeMimeType(asset.mimeType),
    score: scoreAsset(asset),
    nameTokens: tokenizeName(asset.name),
  }));

  const videoAssets = scoredAssets.filter((asset) => asset.mimeType.startsWith("video/"));
  const imageAssets = scoredAssets.filter((asset) => asset.mimeType.startsWith("image/"));
  const frameBudgetPerVideo = estimateFrameBudget(videoAssets.length, targetFrames);
  const maxImageSelection = Math.max(1, targetFrames - frameBudgetPerVideo * videoAssets.length);

  const prioritizedVideos = [...videoAssets].sort((a, b) => b.score - a.score);
  const prioritizedImages = [...imageAssets].sort((a, b) => b.score - a.score);

  const selectedVideos = prioritizedVideos.map((asset) => ({
    ...asset,
    selectionType: "video",
    estimatedFrameBudget: frameBudgetPerVideo,
    selectionReasons: buildSelectionReasons(asset, { priority }),
  }));

  const selectedImages = prioritizedImages.slice(0, Math.max(0, maxImageSelection)).map((asset) => ({
    ...asset,
    selectionType: "image",
    estimatedFrameBudget: 1,
    selectionReasons: buildSelectionReasons(asset, { priority }),
  }));

  const selectedAssets = [...selectedVideos, ...selectedImages];
  const selectedKeys = new Set(selectedAssets.map(getAssetKey));
  const discardedAssets = scoredAssets
    .filter((asset) => !selectedKeys.has(getAssetKey(asset)))
    .map((asset) => ({
      ...asset,
      selectionType: "discarded",
      selectionReasons: buildSelectionReasons(asset, { priority }),
    }));

  const estimatedFrames = selectedAssets.reduce((sum, asset) => sum + asset.estimatedFrameBudget, 0);
  const selectionRatio = scoredAssets.length ? Number((selectedAssets.length / scoredAssets.length).toFixed(3)) : 0;

  return {
    strategy: videoAssets.length ? "video_sampling" : "image_selection",
    summary: {
      totalAssets: scoredAssets.length,
      imageCount: imageAssets.length,
      videoCount: videoAssets.length,
      selectedCount: selectedAssets.length,
      discardedCount: discardedAssets.length,
      targetFrames,
      estimatedFrames,
      frameBudgetPerVideo,
      selectionRatio,
    },
    selectedAssets,
    discardedAssets,
    warnings: videoAssets.length && imageAssets.length ? ["mixed_input_selected"] : [],
    recommendations: [
      selectedAssets.length === 0 ? "Provide at least one usable image or video." : null,
      videoAssets.length > 1 ? "Prefer the most stable video sources first." : null,
      imageAssets.length > targetFrames ? "Reduce duplicate still images before reconstruction." : null,
    ].filter(Boolean),
  };
}

module.exports = {
  analyzeInputs,
  scoreAsset,
  getAssetKey,
  estimateFrameBudget,
};

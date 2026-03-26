const fs = require("fs")
const path = require("path")

function sanitizeFileName(name = "", fallback = "asset") {
  const ext = path.extname(name || "")
  const base = path.basename(name || fallback, ext).replace(/[^a-zA-Z0-9_-]/g, "-") || fallback
  return `${base}${ext}`
}

function ensureSourceExists(sourcePath) {
  if (!sourcePath || !fs.existsSync(sourcePath) || fs.statSync(sourcePath).isDirectory()) {
    throw new Error(`Source asset is missing: ${sourcePath || "<unknown>"}`)
  }
}

function stageAssetFile({ asset = {}, stagedPath, copy = true }) {
  ensureSourceExists(asset.storedPath)
  fs.mkdirSync(path.dirname(stagedPath), { recursive: true })

  if (copy) {
    fs.copyFileSync(asset.storedPath, stagedPath)
  }

  const size = fs.statSync(stagedPath).size
  return {
    assetId: asset.id || null,
    name: asset.name || path.basename(stagedPath),
    mimeType: asset.mimeType || null,
    sourcePath: asset.storedPath,
    stagedPath,
    size,
    status: "staged",
  }
}

module.exports = {
  sanitizeFileName,
  stageAssetFile,
}

const fs = require("fs")
const path = require("path")
const { getRuntimePaths } = require("../storage")

function ensureRunDirectories(jobId) {
  const runtimePaths = getRuntimePaths()
  const runRoot = path.join(runtimePaths.cacheDir, "runs", jobId)
  const sceneDir = path.join(runRoot, "scene")
  const sourceDir = path.join(sceneDir, "source")
  const generatedDir = path.join(sceneDir, "generated")
  const inputDir = path.join(sceneDir, "input")
  const outputDir = path.join(runRoot, "output")
  const manifestDir = path.join(runRoot, "manifests")

  for (const dir of [runRoot, sceneDir, sourceDir, generatedDir, inputDir, outputDir, manifestDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }

  return {
    ...runtimePaths,
    runRoot,
    sceneDir,
    sourceDir,
    generatedDir,
    inputDir,
    outputDir,
    manifestDir,
  }
}

module.exports = {
  ensureRunDirectories,
}

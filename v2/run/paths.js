const fs = require("fs");
const path = require("path");
const { getV2Paths } = require("../storage");

function ensureRunDirectories(jobId) {
  const v2Paths = getV2Paths();
  const runRoot = path.join(v2Paths.cacheDir, "runs", jobId);
  const sceneDir = path.join(runRoot, "scene");
  const sourceDir = path.join(sceneDir, "source");
  const generatedDir = path.join(sceneDir, "generated");
  const inputDir = path.join(sceneDir, "input");
  const outputDir = path.join(runRoot, "output");
  const manifestDir = path.join(runRoot, "manifests");

  for (const dir of [runRoot, sceneDir, sourceDir, generatedDir, inputDir, outputDir, manifestDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return {
    ...v2Paths,
    runRoot,
    sceneDir,
    sourceDir,
    generatedDir,
    inputDir,
    outputDir,
    manifestDir,
  };
}

module.exports = {
  ensureRunDirectories,
};

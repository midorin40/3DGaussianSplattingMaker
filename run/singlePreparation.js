const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { writeJsonFile, readJsonFile } = require("../storage");
const { ensureRunDirectories } = require("./paths");
const { sanitizeFileName, stageAssetFile } = require("./staging");

function readStackConfig(dataRoot) {
  return readJsonFile(path.join(dataRoot, "local-stack.json"), null);
}

function runCommand(command, args) {
  return spawnSync(command, args, {
    windowsHide: true,
    encoding: "utf8",
  });
}

function generatePseudoViews(stackConfig, imagePath, outputDir, preset) {
  const pythonPath = stackConfig?.envPath ? path.join(stackConfig.envPath, "python.exe") : null;
  const scriptPath = stackConfig?.scriptsPath ? path.join(stackConfig.scriptsPath, "generate_single_views.py") : null;

  let result = null;

  if (pythonPath && scriptPath && fs.existsSync(pythonPath) && fs.existsSync(scriptPath)) {
    result = runCommand(pythonPath, [scriptPath, imagePath, outputDir, String(preset || "standard")]);
  } else if (stackConfig?.scriptsPath) {
    const batchPath = path.join(stackConfig.scriptsPath, "generate_single_scene.bat");
    result = spawnSync(batchPath, [imagePath, outputDir, String(preset || "standard")], {
      shell: true,
      windowsHide: true,
      encoding: "utf8",
    });
  }

  if (!result) {
    throw new Error("Pseudo view generation is not configured.");
  }

  if (result.error) {
    throw new Error(`Pseudo view generation failed. ${result.error.message || String(result.error)}`);
  }

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(details ? `Pseudo view generation failed. ${details}` : "Pseudo view generation failed.");
  }
}

function listGeneratedViews(outputDir) {
  return fs
    .readdirSync(outputDir)
    .filter((name) => /\.(png|jpg|jpeg|webp)$/i.test(name))
    .sort();
}

function stageGeneratedViews(generatedDir, inputDir, sourceAsset) {
  const sourceStem = path.parse(sourceAsset.name || "source").name;
  return listGeneratedViews(generatedDir).map((fileName, index) => {
    const sourcePath = path.join(generatedDir, fileName);
    const stagedPath = path.join(inputDir, `${String(index + 1).padStart(3, "0")}-${sourceStem}-${fileName}`);
    fs.copyFileSync(sourcePath, stagedPath);
    return {
      assetId: sourceAsset.id || null,
      variantName: path.parse(fileName).name,
      sourcePath,
      stagedPath,
      size: fs.statSync(stagedPath).size,
      status: "generated",
    };
  });
}

function prepareSingleRun(project = {}, job = {}, pipelinePlan = {}) {
  const runPaths = ensureRunDirectories(job.id || "job");
  const sourceAsset = Array.isArray(project.assets) ? project.assets[0] || null : null;
  const stackConfig = readStackConfig(runPaths.dataRoot);

  if (!sourceAsset) {
    throw new Error("Single pipeline requires one source asset.");
  }
  if (!stackConfig || (!stackConfig.scriptsPath && !stackConfig.envPath)) {
    throw new Error("Local stack configuration is missing single-image execution paths.");
  }

  const stagedSource = stageAssetFile({
    asset: sourceAsset,
    stagedPath: path.join(runPaths.sourceDir, `001-${sanitizeFileName(sourceAsset.name, "source")}`),
  });

  generatePseudoViews(stackConfig, stagedSource.stagedPath, runPaths.generatedDir, project.qualityPreset || "standard");
  const generatedViews = stageGeneratedViews(runPaths.generatedDir, runPaths.inputDir, sourceAsset);

  const manifest = {
    kind: "single_scene_bundle",
    projectId: project.id || null,
    jobId: job.id || null,
    pipelineKey: pipelinePlan.pipelineKey || "single",
    createdAt: new Date().toISOString(),
    sceneBundle: pipelinePlan.sceneBundle || null,
    artifacts: pipelinePlan.artifacts || [],
    sourceAsset: sourceAsset
      ? {
          assetId: sourceAsset.id || null,
          name: sourceAsset.name || null,
          mimeType: sourceAsset.mimeType || null,
          storedPath: sourceAsset.storedPath || null,
        }
      : null,
    stagedSource,
    generatedViews,
    stagingStats: {
      stagedCount: 1 + generatedViews.length,
      generatedViewCount: generatedViews.length,
      missingCount: 0,
    },
    outputHints: {
      sourceDir: runPaths.sourceDir,
      generatedDir: runPaths.generatedDir,
      sceneInputDir: runPaths.inputDir,
      outputDir: runPaths.outputDir,
      manifestDir: runPaths.manifestDir,
    },
  };

  const manifestPath = path.join(runPaths.manifestDir, "single-scene-bundle.json");
  writeJsonFile(manifestPath, manifest);

  return {
    ...runPaths,
    manifestPath,
    manifest,
    stagedSource,
    generatedViews,
  };
}

module.exports = {
  prepareSingleRun,
};

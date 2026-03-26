const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")
const { writeJsonFile, readJsonFile } = require("../storage")
const { ensureRunDirectories } = require("./paths")
const { sanitizeFileName, stageAssetFile } = require("./staging")

function readStackConfig(dataRoot) {
  return readJsonFile(path.join(dataRoot, "local-stack.json"), null)
}

function runCommand(command, args) {
  return spawnSync(command, args, {
    windowsHide: true,
    encoding: "utf8",
  })
}

function getFrameExtractionFps(project = {}) {
  switch (project.qualityPreset) {
    case "high":
      return 24
    case "fast":
      return 8
    default:
      return 12
  }
}

function extractVideoFrames(stackConfig, videoPath, outputDir, fps) {
  const ffmpegCommand = stackConfig?.ffmpegPath || "ffmpeg"
  let result = runCommand(ffmpegCommand, ["-i", videoPath, "-vf", `fps=${fps}`, path.join(outputDir, "frame_%05d.png")])

  if (result.error && stackConfig?.scriptsPath) {
    const batchPath = path.join(stackConfig.scriptsPath, "extract_frames.bat")
    result = spawnSync(batchPath, [videoPath, outputDir, String(fps)], {
      shell: true,
      windowsHide: true,
      encoding: "utf8",
    })
  }

  if (result.error) {
    throw new Error(`Video frame extraction failed. ${result.error.message || String(result.error)}`)
  }

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim()
    throw new Error(details ? `Video frame extraction failed. ${details}` : "Video frame extraction failed.")
  }
}

function sampleFrameFiles(frameFiles, maxFrames) {
  if (!Array.isArray(frameFiles) || frameFiles.length <= maxFrames) return frameFiles
  const sampled = []
  const lastIndex = frameFiles.length - 1
  for (let i = 0; i < maxFrames; i += 1) {
    const index = Math.round((i * lastIndex) / Math.max(1, maxFrames - 1))
    sampled.push(frameFiles[index])
  }
  return [...new Set(sampled)]
}

function listExtractedFrames(outputDir) {
  return fs
    .readdirSync(outputDir)
    .filter((name) => /\.(png|jpg|jpeg|webp)$/i.test(name))
    .sort()
}

function stageSelectedInputs(selection = {}, runPaths, project = {}) {
  const stackConfig = readStackConfig(runPaths.dataRoot)
  const selectedAssets = selection.selectedAssets || []
  const stagedInputs = []
  const extractedFrames = []
  let extractedFrameCount = 0
  let usedVideoInput = false

  selectedAssets.forEach((asset, index) => {
    const stagedSourcePath = path.join(runPaths.sourceDir, `${String(index + 1).padStart(3, "0")}-${sanitizeFileName(asset.name, "asset")}`)
    const stagedSource = stageAssetFile({ asset, stagedPath: stagedSourcePath })

    if (String(asset.mimeType || "").startsWith("video/")) {
      usedVideoInput = true
      if (!stackConfig) {
        throw new Error("Local stack configuration is missing for video extraction.")
      }

      const assetGeneratedDir = path.join(runPaths.generatedDir, path.parse(stagedSource.name).name)
      fs.mkdirSync(assetGeneratedDir, { recursive: true })
      extractVideoFrames(stackConfig, stagedSource.stagedPath, assetGeneratedDir, getFrameExtractionFps(project))

      const frameFiles = listExtractedFrames(assetGeneratedDir)
      const selectedFrameFiles = sampleFrameFiles(frameFiles, Math.max(1, asset.estimatedFrameBudget || 1))
      selectedFrameFiles.forEach((frameFile, frameIndex) => {
        const sourcePath = path.join(assetGeneratedDir, frameFile)
        const stagedPath = path.join(runPaths.inputDir, `${String(extractedFrames.length + 1).padStart(3, "0")}-${path.parse(stagedSource.name).name}-${frameFile}`)
        fs.copyFileSync(sourcePath, stagedPath)
        extractedFrames.push({
          assetId: asset.id || null,
          sourceAssetName: stagedSource.name,
          sourcePath,
          stagedPath,
          frameIndex,
          size: fs.statSync(stagedPath).size,
          status: "extracted",
        })
      })
      extractedFrameCount += selectedFrameFiles.length
      stagedInputs.push({
        ...asset,
        assetId: asset.id || null,
        selectionType: asset.selectionType || "video",
        sourcePath: asset.storedPath || null,
        stagedPath: stagedSource.stagedPath,
        estimatedFrameBudget: asset.estimatedFrameBudget || 1,
        selectionReasons: asset.selectionReasons || [],
        score: asset.score || 0,
        size: stagedSource.size,
        status: "staged-video-source",
      })
      return
    }

    const stagedInputPath = path.join(runPaths.inputDir, `${String(extractedFrames.length + stagedInputs.filter((item) => item.selectionType === 'image').length + 1).padStart(3, "0")}-${sanitizeFileName(asset.name, "asset")}`)
    fs.copyFileSync(stagedSource.stagedPath, stagedInputPath)
    const stagedInput = {
      ...asset,
      assetId: asset.id || null,
      selectionType: asset.selectionType || "image",
      sourcePath: asset.storedPath || null,
      stagedPath: stagedInputPath,
      estimatedFrameBudget: asset.estimatedFrameBudget || 1,
      selectionReasons: asset.selectionReasons || [],
      score: asset.score || 0,
      size: fs.statSync(stagedInputPath).size,
      status: "staged-image",
      sourceStagedPath: stagedSource.stagedPath,
    }
    stagedInputs.push(stagedInput)
  })

  return {
    stagedInputs,
    extractedFrames,
    extractedFrameCount,
    usedVideoInput,
  }
}

function prepareMultiVideoRun(project = {}, job = {}, pipelinePlan = {}) {
  const runPaths = ensureRunDirectories(job.id || "job")
  const staged = stageSelectedInputs(pipelinePlan.selection || {}, runPaths, project)
  const manifest = {
    kind: "multi_video_preparation",
    projectId: project.id || null,
    jobId: job.id || null,
    pipelineKey: pipelinePlan.pipelineKey || "multi_video",
    createdAt: new Date().toISOString(),
    inputStats: pipelinePlan.inputStats || {},
    recommendations: pipelinePlan.selection?.recommendations || [],
    warnings: pipelinePlan.selection?.warnings || [],
    stagedInputs: staged.stagedInputs,
    extractedFrames: staged.extractedFrames,
    stagingStats: {
      stagedCount: staged.stagedInputs.length + staged.extractedFrames.length,
      extractedFrameCount: staged.extractedFrameCount,
      missingCount: 0,
    },
  }

  const manifestPath = path.join(runPaths.manifestDir, "multi-video-preparation.json")
  writeJsonFile(manifestPath, manifest)

  return {
    ...runPaths,
    manifestPath,
    manifest,
    stagedInputs: staged.stagedInputs,
    extractedFrames: staged.extractedFrames,
    extractedFrameCount: staged.extractedFrameCount,
    usedVideoInput: staged.usedVideoInput,
  }
}

module.exports = {
  prepareMultiVideoRun,
}

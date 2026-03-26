const http = require("http")
const fs = require("fs")
const path = require("path")
const { URL } = require("url")
const {
  createProject,
  createJob,
  createArtifact,
  openRuntimeStorage,
  getRuntimePaths,
  writeJsonFile,
  resolvePipeline,
  prepareRun,
} = require("./index")

const storage = openRuntimeStorage()
const paths = storage.paths

const PORT = Number.parseInt(process.env.PORT || "3200", 10)
const MIME_TYPES = {
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".splat": "application/octet-stream",
  ".ksplat": "application/octet-stream",
  ".ply": "application/octet-stream",
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": MIME_TYPES[".json"] })
  res.end(JSON.stringify(payload, null, 2))
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ""
    req.on("data", (chunk) => {
      raw += chunk
      if (raw.length > 50 * 1024 * 1024) reject(new Error("Payload too large"))
    })
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on("error", reject)
  })
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sanitizeName(value, fallback) {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback
}

function normalizeTrainingSteps(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 30000
}

function normalizeFrameTarget(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 96
}

function sortByUpdated(items) {
  return [...items].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
}

function projectFilePath(paths, projectId) {
  return path.join(paths.projectsDir, `${projectId}.json`)
}

function jobFilePath(paths, jobId) {
  return path.join(paths.jobsDir, `${jobId}.json`)
}

function artifactFilePath(paths, artifactId) {
  return path.join(paths.artifactsDir, `${artifactId}.json`)
}

function updateCollection(store, entity) {
  const current = Array.isArray(store.read()) ? store.read() : []
  const next = current.filter((item) => item.id !== entity.id)
  next.unshift(entity)
  store.write(next)
}

function persistProject(storage, project) {
  updateCollection(storage.projects, project)
  writeJsonFile(projectFilePath(storage.paths, project.id), project)
  return project
}

function persistJob(storage, job) {
  updateCollection(storage.jobs, job)
  writeJsonFile(jobFilePath(storage.paths, job.id), job)
  return job
}

function persistArtifact(storage, artifact) {
  updateCollection(storage.artifacts, artifact)
  writeJsonFile(artifactFilePath(storage.paths, artifact.id), artifact)
  return artifact
}

function findProject(storage, projectId) {
  return (storage.projects.read() || []).find((item) => item.id === projectId) || null
}

function findJob(storage, jobId) {
  return (storage.jobs.read() || []).find((item) => item.id === jobId) || null
}

function findArtifact(storage, artifactId) {
  return (storage.artifacts.read() || []).find((item) => item.id === artifactId) || null
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(String(dataUrl || ""))
  if (!match) throw new Error("Invalid data URL")
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  }
}

function saveAssetFile(storage, projectId, file) {
  const projectUploadDir = path.join(storage.paths.uploadsDir, projectId)
  fs.mkdirSync(projectUploadDir, { recursive: true })
  const baseName = sanitizeName(path.basename(file.name || "asset"), "asset")
  const storedName = `${Date.now()}-${baseName}`
  const absolutePath = path.join(projectUploadDir, storedName)

  if (file.dataUrl) {
    const decoded = decodeDataUrl(file.dataUrl)
    fs.writeFileSync(absolutePath, decoded.buffer)
    return {
      absolutePath,
      storedName,
      mimeType: file.mimeType || decoded.mimeType,
      size: decoded.buffer.length,
    }
  }

  if (file.contentBase64) {
    const buffer = Buffer.from(String(file.contentBase64), "base64")
    fs.writeFileSync(absolutePath, buffer)
    return {
      absolutePath,
      storedName,
      mimeType: file.mimeType || "application/octet-stream",
      size: buffer.length,
    }
  }

  throw new Error("Asset payload requires dataUrl or contentBase64")
}

function createAssetRecord(storage, projectId, file) {
  const saved = saveAssetFile(storage, projectId, file)
  return {
    id: makeId("asset"),
    kind: String(saved.mimeType || "").startsWith("video/") ? "video" : "image",
    name: file.name || saved.storedName,
    mimeType: saved.mimeType,
    size: Number.isInteger(file.size) ? file.size : saved.size,
    storedPath: saved.absolutePath,
    previewUrl: `/uploads/${projectId}/${saved.storedName}`,
    uploadedAt: new Date().toISOString(),
  }
}
function validateProjectForStart(project) {
  if (!project) return "Project not found."
  if (!Array.isArray(project.assets) || project.assets.length === 0) return "Project has no assets."
  if (project.mode === "single") {
    if (project.assets.length !== 1) return "Single mode requires exactly one image asset."
    if (!String(project.assets[0].mimeType || "").startsWith("image/")) return "Single mode requires an image asset."
  }
  return null
}

function createArtifactBundle(storage, project, job, pipelinePlan, runState) {
  const artifactId = makeId("artifact")
  const bundlePath = path.join(storage.paths.artifactsDir, project.id, artifactId)
  const exportsDir = path.join(bundlePath, "exports")
  const previewDir = path.join(bundlePath, "preview")

  fs.mkdirSync(exportsDir, { recursive: true })
  fs.mkdirSync(previewDir, { recursive: true })

  const metrics = {
    createdAt: new Date().toISOString(),
    pipelineKey: pipelinePlan.pipelineKey,
    inputStats: pipelinePlan.inputStats || {},
    warnings: pipelinePlan.selection?.warnings || [],
    recommendations: pipelinePlan.selection?.recommendations || [],
  }
  const scene = {
    projectId: project.id,
    jobId: job.id,
    mode: project.mode,
    pipelineKey: pipelinePlan.pipelineKey,
    runRoot: runState.runRoot,
    sceneDir: runState.sceneDir,
    outputDir: runState.outputDir,
  }
  const cameras = {
    status: "pending",
    source: "preparation-scaffold",
    selectedInputs: runState.selectedInputs || [],
  }
  const manifest = {
    artifactId,
    projectId: project.id,
    jobId: job.id,
    status: "pending",
    canonicalFormat: "ply",
    availableFormats: ["ply", "splat", "ksplat"],
    pipelineKey: pipelinePlan.pipelineKey,
    sourceAssets: (project.assets || []).map((asset) => ({
      assetId: asset.id,
      name: asset.name,
      mimeType: asset.mimeType,
      storedPath: asset.storedPath,
    })),
    preparationManifestPath: runState.manifestPath,
    createdAt: new Date().toISOString(),
  }

  const manifestPath = path.join(bundlePath, "manifest.json")
  const scenePath = path.join(bundlePath, "scene.json")
  const camerasPath = path.join(bundlePath, "cameras.json")
  const metricsPath = path.join(bundlePath, "metrics.json")
  const geometryPath = path.join(bundlePath, "geometry.ply")

  writeJsonFile(manifestPath, manifest)
  writeJsonFile(scenePath, scene)
  writeJsonFile(camerasPath, cameras)
  writeJsonFile(metricsPath, metrics)

  const artifact = createArtifact({
    id: artifactId,
    projectId: project.id,
    jobId: job.id,
    kind: "scene_bundle",
    status: "pending",
    label: `${pipelinePlan.pipelineKey} artifact bundle`,
    path: bundlePath,
    format: "bundle",
    metadata: {
      canonicalFormat: "ply",
      availableFormats: ["ply", "splat", "ksplat"],
      manifestPath,
      scenePath,
      camerasPath,
      metricsPath,
      geometryPath,
      exports: {
        splat: path.join(exportsDir, "model.splat"),
        ksplat: path.join(exportsDir, "model.ksplat"),
      },
    },
  })

  persistArtifact(storage, artifact)
  return artifact
}

function createPreparedJob(storage, project) {
  const pipelinePlan = resolvePipeline(project)
  const job = createJob({
    id: makeId("job"),
    projectId: project.id,
    pipelineKey: pipelinePlan.pipelineKey,
    status: pipelinePlan.pipelineKey === "single" ? "preparing" : "optimizing",
    progress: pipelinePlan.pipelineKey === "single" ? 10 : 15,
    currentStage: pipelinePlan.pipelineKey === "single" ? "Single scene preparation manifest generated" : "Multi/video input optimization manifest generated",
    targetIterations: normalizeTrainingSteps(project.trainingSteps),
    targetVideoFrames: normalizeFrameTarget(project.videoFrameTarget),
    usedVideoInput: (project.assets || []).some((asset) => String(asset.mimeType || "").startsWith("video/")),
    usedSyntheticViews: pipelinePlan.pipelineKey === "single",
    syntheticViewCount: 0,
    inputStats: pipelinePlan.inputStats || {},
  })

  const runState = prepareRun(project, job, pipelinePlan)
  const artifact = createArtifactBundle(storage, project, job, pipelinePlan, runState)

  job.updatedAt = new Date().toISOString()
  job.workDir = runState.runRoot
  job.sceneDir = runState.sceneDir
  job.logPath = path.join(storage.paths.logsDir, `${job.id}.log`)
  job.artifactId = artifact.id
  job.preparationCompleted = true
  job.syntheticViewCount = Array.isArray(runState.generatedViews) ? runState.generatedViews.length : job.syntheticViewCount
  job.usedVideoInput = typeof runState.usedVideoInput === "boolean" ? runState.usedVideoInput : job.usedVideoInput
  job.currentStage = pipelinePlan.pipelineKey === "single" ? "Pseudo multi-view generation completed" : (job.usedVideoInput ? "Video frame extraction completed" : "Multi/video input staging completed")
  job.progress = pipelinePlan.pipelineKey === "single" ? 20 : (job.usedVideoInput ? 25 : 20)
  job.extractedFrameCount = Number.isInteger(runState.extractedFrameCount) ? runState.extractedFrameCount : (pipelinePlan.inputStats?.estimatedFrames || 0)

  persistJob(storage, job)

  const nextProject = {
    ...project,
    status: "queued",
    updatedAt: new Date().toISOString(),
    activeJobId: job.id,
    latestArtifactId: artifact.id,
    primaryArtifactId: artifact.id,
    artifactIds: [artifact.id, ...(project.artifactIds || []).filter((id) => id !== artifact.id)],
  }

  persistProject(storage, nextProject)

  return {
    project: nextProject,
    job,
    artifact,
    pipelinePlan,
    runState: {
      manifestPath: runState.manifestPath,
      outputDir: runState.outputDir,
      sceneDir: runState.sceneDir,
    },
  }
}

function serveUpload(storage, pathname, res) {
  const relativePath = pathname.replace(/^\/uploads\//, "")
  const targetPath = path.normalize(path.join(storage.paths.uploadsDir, relativePath))

  if (!targetPath.startsWith(storage.paths.uploadsDir)) {
    sendJson(res, 403, { error: "Forbidden" })
    return
  }
  if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
    sendJson(res, 404, { error: "Not found" })
    return
  }

  const ext = path.extname(targetPath).toLowerCase()
  res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" })
  fs.createReadStream(targetPath).pipe(res)
}
async function handleRequest(req, res) {
  const storage = openRuntimeStorage()
  const paths = storage.paths
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`)
  const pathname = url.pathname

  if (req.method === "GET" && pathname === "/api/status") {
    sendJson(res, 200, {
      name: "GaussianSplattingMaker",
      version: "runtime-api",
      supports: {
        projectCrud: true,
        assetIngestion: true,
        preparationJobs: true,
        canonicalArtifactScaffold: true,
        reconstructionExecution: true,
        trainingExecution: true,
        exporterExecution: true,
      },
      storage: {
        dataRoot: storage.paths.runtimeDataRoot,
        uploadsDir: storage.paths.uploadsDir,
        cacheDir: storage.paths.cacheDir,
        artifactsDir: storage.paths.artifactsDir,
      },
    })
    return
  }

  if (req.method === "GET" && pathname === "/api/projects") {
    const { projects } = syncJobsAndProjects()
    sendJson(res, 200, { projects: sortByUpdated(projects) })
    return
  }

  if (req.method === "POST" && pathname === "/api/projects") {
    const body = await parseBody(req)
    const project = createProject({
      id: makeId("project"),
      name: body.name,
      mode: body.mode,
      subjectType: body.subjectType,
      qualityPreset: body.qualityPreset,
      backgroundMode: body.backgroundMode,
      trainingSteps: normalizeTrainingSteps(body.trainingSteps),
      videoFrameTarget: normalizeFrameTarget(body.videoFrameTarget),
      notes: body.notes,
      tags: Array.isArray(body.tags) ? body.tags : [],
      assets: [],
    })
    persistProject(storage, project)
    sendJson(res, 201, { project })
    return
  }

  const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/)
  if (req.method === "GET" && projectMatch) {
    const { projects, jobs } = syncJobsAndProjects()
    const project = projects.find((item) => item.id === projectMatch[1])
    if (!project) {
      sendJson(res, 404, { error: "Project not found" })
      return
    }
    const activeJob = project.activeJobId ? jobs.find((item) => item.id === project.activeJobId) : null
    const latestArtifact = project.latestArtifactId ? findArtifact(storage, project.latestArtifactId) : null
    sendJson(res, 200, { project, activeJob: activeJob ? cloneForClient(activeJob) : null, latestArtifact })
    return
  }

  const assetsMatch = pathname.match(/^\/api\/projects\/([^/]+)\/assets$/)
  if (req.method === "POST" && assetsMatch) {
    const project = findProject(storage, assetsMatch[1])
    if (!project) {
      sendJson(res, 404, { error: "Project not found" })
      return
    }

    const body = await parseBody(req)
    const files = Array.isArray(body.files) ? body.files : []
    if (!files.length) {
      sendJson(res, 400, { error: "No files provided" })
      return
    }

    const assets = files.map((file) => createAssetRecord(storage, project.id, file))
    const nextProject = {
      ...project,
      assets: [...(project.assets || []), ...assets],
      assetIds: [...(project.assetIds || []), ...assets.map((asset) => asset.id)],
      updatedAt: new Date().toISOString(),
    }

    persistProject(storage, nextProject)
    sendJson(res, 201, { project: nextProject, assets })
    return
  }

  const jobsForProjectMatch = pathname.match(/^\/api\/projects\/([^/]+)\/(jobs|generate)$/)
  if (req.method === "POST" && jobsForProjectMatch) {
    const project = findProject(storage, jobsForProjectMatch[1])
    const validationError = validateProjectForStart(project)
    if (validationError) {
      sendJson(res, 400, { error: validationError })
      return
    }

    if (project.activeJobId) {
      const activeJob = findJob(storage, project.activeJobId)
      if (activeJob && !["completed", "failed", "canceled"].includes(activeJob.status)) {
        sendJson(res, 409, { error: "Project already has an active job.", job: activeJob })
        return
      }
    }

    const result = createPreparedJob(storage, project)
    const stackConfig = readStackConfig()
    if (!stackConfig) {
      sendJson(res, 500, { error: "Local stack configuration is missing." })
      return
    }
    runPipeline(result.project, result.job, stackConfig)
    const runningJobs = storage.jobs.read() || []
    const runningProjects = storage.projects.read() || []
    const runningJob = runningJobs.find((item) => item.id === result.job.id)
    const runningProject = runningProjects.find((item) => item.id === result.project.id)
    if (runningJob && runningProject) {
      refreshRunningJob(runningJob, runningProject)
      storage.jobs.write(runningJobs)
      storage.projects.write(runningProjects)
    }
    sendJson(res, 201, { job: cloneForClient(runningJob), project: runningProject, stack: stackConfig, artifact: result.artifact, pipelinePlan: result.pipelinePlan })
    return
  }

  if (req.method === "GET" && pathname === "/api/jobs") {
    const { jobs } = syncJobsAndProjects()
    sendJson(res, 200, { jobs: sortByUpdated(jobs).map(cloneForClient) })
    return
  }

  const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/)
  if (req.method === "GET" && jobMatch) {
    const job = findJob(storage, jobMatch[1])
    if (!job) {
      sendJson(res, 404, { error: "Job not found" })
      return
    }
    const project = findProject(storage, job.projectId)
    const artifact = job.artifactId ? findArtifact(storage, job.artifactId) : null
    sendJson(res, 200, { job: cloneForClient(job), project, artifact, stack: readStackConfig() })
    return
  }

  const pauseMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/pause$/)
  if (req.method === "POST" && pauseMatch) {
    const job = findJob(storage, pauseMatch[1])
    if (!job) {
      sendJson(res, 404, { error: "Job not found" })
      return
    }
    if (["paused", "completed", "failed", "canceled"].includes(job.status)) {
      sendJson(res, 409, { error: `Job cannot be paused from status ${job.status}.`, job })
      return
    }

    const project = findProject(storage, job.projectId)
    const nextJob = persistJob(storage, {
      ...job,
      status: "paused",
      pausedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStage: "Paused",
    })

    const nextProject = project
      ? persistProject(storage, {
          ...project,
          status: "paused",
          updatedAt: new Date().toISOString(),
        })
      : null

    sendJson(res, 200, { job: nextJob, project: nextProject })
    return
  }

  const resumeMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/resume$/)
  if (req.method === "POST" && resumeMatch) {
    const job = findJob(storage, resumeMatch[1])
    if (!job) {
      sendJson(res, 404, { error: "Job not found" })
      return
    }
    if (job.status !== "paused") {
      sendJson(res, 409, { error: `Only paused jobs can be resumed. Current status: ${job.status}.`, job })
      return
    }

    const resumedStatus = job.pipelineKey === "single" ? "preparing" : "optimizing"
    const resumedStage = job.pipelineKey === "single" ? "Single scene preparation resumed" : "Multi/video optimization resumed"
    const project = findProject(storage, job.projectId)
    const nextJob = persistJob(storage, {
      ...job,
      status: resumedStatus,
      pausedAt: null,
      updatedAt: new Date().toISOString(),
      currentStage: resumedStage,
    })

    const nextProject = project
      ? persistProject(storage, {
          ...project,
          status: "queued",
          activeJobId: nextJob.id,
          updatedAt: new Date().toISOString(),
        })
      : null

    sendJson(res, 200, { job: nextJob, project: nextProject })
    return
  }
  if (req.method === "GET" && pathname === "/api/artifacts") {
    sendJson(res, 200, { artifacts: sortByUpdated(storage.artifacts.read() || []) })
    return
  }

  const artifactMatch = pathname.match(/^\/api\/artifacts\/([^/]+)$/)
  if (req.method === "GET" && artifactMatch) {
    const artifact = findArtifact(storage, artifactMatch[1])
    if (!artifact) {
      sendJson(res, 404, { error: "Artifact not found" })
      return
    }
    const project = findProject(storage, artifact.projectId)
    const job = findJob(storage, artifact.jobId)
    sendJson(res, 200, { artifact, project, job })
    return
  }

  if (req.method === "GET" && (pathname.startsWith("/uploads/"))) {
    serveUpload(storage, pathname, res)
    return
  }

  if (req.method === "GET" && (pathname.startsWith("/exports/"))) {
    serveExport(pathname, res)
    return
  }

  sendJson(res, 404, { error: "Not found" })
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    sendJson(res, 500, { error: error.message || "Server error" })
  })
})

server.listen(PORT, () => {
  const paths = getRuntimePaths()
  console.log(`GaussianSplattingMaker listening on http://localhost:${PORT}`)
  console.log(`Runtime data root: ${paths.runtimeDataRoot}`)
})













function readStackConfig() {
  try {
    const filePath = path.join(paths.dataRoot, "local-stack.json")
    return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null
  } catch {
    return null
  }
}

function getStages(mode) {
  return JOB_STAGES[mode] || JOB_STAGES.multi
}

function totalDuration(stages) {
  return stages.reduce((sum, stage) => sum + stage.durationMs, 0)
}

function getJobLogTail(logPath, maxChars = 12000) {
  if (!logPath || !fs.existsSync(logPath)) return ""
  const text = fs.readFileSync(logPath, "utf8")
  return text.length > maxChars ? text.slice(-maxChars) : text
}

function cloneForClient(job) {
  return {
    ...job,
    isControllable: RUNNABLE_JOB_STATUSES.has(job.status),
    isResumable: job.status === "paused",
    stages: getStages(job.mode),
    logTail: getJobLogTail(job.logPath),
  }
}

function appendLog(logPath, line) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  fs.appendFileSync(logPath, `${line}\r\n`, "utf8")
}

function buildOutput(project, job) {
  const assetCount = project.assets.length
  const singleMode = project.mode === "single"
  const warnings = []
  if (singleMode) {
    if (job.usedSyntheticViews) warnings.push(`Single-image mode generated ${job.syntheticViewCount || 0} pseudo view(s) before reconstruction.`)
    warnings.push("Single-image mode infers side views from one source image, so hidden surfaces are approximated rather than observed.")
    if (project.backgroundMode === "remove") warnings.push("Background removal can help isolate flat artwork before pseudo view generation.")
  } else {
    if (job.usedVideoInput) warnings.push(`Video input was converted into ${job.extractedFrameCount || 0} frame(s) before reconstruction.`)
    if (assetCount < 12 && !job.usedVideoInput) warnings.push("Multi-image mode works best with 12+ well-overlapped views.")
    if (project.backgroundMode === "remove") warnings.push("Background removal can distort thin edges; review the training result carefully.")
  }
  return {
    generatedAt: new Date().toISOString(),
    quality: singleMode ? (job.exportUrl ? "Synthetic Multi-View" : "Single Source") : assetCount >= 20 ? "High" : "Standard",
    summary: singleMode
      ? job.exportUrl
        ? "A single uploaded image was expanded into pseudo multi-view inputs and exported as a .splat package."
        : "A single uploaded image was expanded into pseudo multi-view inputs and sent through the local GS pipeline."
      : job.exportUrl
        ? "The local COLMAP and gsplat pipeline finished and a .splat package is ready."
        : "The local COLMAP and gsplat pipeline finished running for this project.",
    viewer: { cameraMode: singleMode ? "orbit-artwork" : "orbit-wide", recommendedSpinSeconds: singleMode ? 9 : 14, previewAssets: project.assets.slice(0, 8).map((asset) => asset.previewUrl) },
    packageInfo: {
      mode: project.mode,
      assetCount,
      usedVideoInput: !!job.usedVideoInput,
      extractedFrameCount: job.extractedFrameCount || 0,
      targetVideoFrames: job.targetVideoFrames || null,
      status: job.exportUrl ? "splat-ready" : "local-stack-finished",
      engine: singleMode ? "pseudo-multiview-gsplat" : "nerfstudio-gsplat",
      exportTargets: job.exportUrl ? ["preview", "gsplat-training-output", ".splat"] : ["preview", "gsplat-training-output"],
      sourceJobId: job.id,
      usedSyntheticViews: !!job.usedSyntheticViews,
      syntheticViewCount: job.syntheticViewCount || 0,
      targetIterations: job.targetIterations || 30000,
      sceneDir: job.sceneDir,
      modelDir: job.modelDir,
      plyPath: job.latestPlyPath || null,
      splatPath: job.exportPath || null,
      splatUrl: job.exportUrl || null,
    },
    warnings,
  }
}

function refreshRunningJob(job, project) {
  const stages = getStages(job.mode)
  const startedAt = new Date(job.startedAt).getTime()
  const elapsed = Math.max(0, Date.now() - startedAt)
  const total = totalDuration(stages)
  let consumed = 0
  let currentStage = stages[stages.length - 1]
  for (const stage of stages) {
    if (elapsed < consumed + stage.durationMs) { currentStage = stage; break }
    consumed += stage.durationMs
  }
  const active = activeProcesses.has(job.id)
  if (RUNNABLE_JOB_STATUSES.has(job.status) && !active) {
    job.status = "failed"
    job.progress = Math.min(job.progress || 0, 95)
    job.currentStage = "Worker process not available"
    job.finishedAt = new Date().toISOString()
    job.errorMessage = job.errorMessage || "The local training worker is no longer running."
    project.status = "failed"
    project.updatedAt = new Date().toISOString()
    return
  }
  if (RUNNABLE_JOB_STATUSES.has(job.status)) {
    job.status = "running"
    job.progress = Math.min(95, Math.max(5, Math.round((elapsed / total) * 100)))
    job.currentStage = currentStage.label
    project.status = "processing"
    project.updatedAt = new Date().toISOString()
  }
}

function syncJobsAndProjects() {
  const projects = storage.projects.read() || []
  const jobs = storage.jobs.read() || []
  let dirty = false
  for (const job of jobs) {
    const project = projects.find((item) => item.id === job.projectId)
    if (!project) continue
    const before = `${job.status}:${job.progress}:${job.currentStage}:${project.status}`
    refreshRunningJob(job, project)
    const after = `${job.status}:${job.progress}:${job.currentStage}:${project.status}`
    if (before !== after) dirty = true
  }
  if (dirty) { storage.jobs.write(jobs); storage.projects.write(projects) }
  return { projects, jobs }
}

function findLatestPointCloudPly(modelDir) {
  if (!modelDir || !fs.existsSync(modelDir)) return null
  const matches = []
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && /^point_cloud(?:_\d+)?\.ply$/i.test(entry.name)) {
        const parsedStep = Number.parseInt((entry.name.match(/_(\d+)\.ply$/i) || [])[1] || "0", 10) || 0
        matches.push({ path: full, step: parsedStep, mtimeMs: fs.statSync(full).mtimeMs })
      }
    }
  }
  walk(modelDir)
  matches.sort((a, b) => b.step - a.step || b.mtimeMs - a.mtimeMs)
  return matches[0]?.path || null
}

function findLatestCheckpoint(modelDir) {
  if (!modelDir || !fs.existsSync(modelDir)) return null
  const matches = []
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && /^ckpt_(\d+)_rank\d+\.pt$/i.test(entry.name)) {
        const parsedIteration = Number.parseInt((entry.name.match(/^ckpt_(\d+)_rank\d+\.pt$/i) || [])[1] || "0", 10) || 0
        matches.push({ path: full, iteration: parsedIteration, mtimeMs: fs.statSync(full).mtimeMs })
      }
    }
  }
  walk(modelDir)
  matches.sort((a, b) => b.iteration - a.iteration || b.mtimeMs - a.mtimeMs)
  return matches[0] || null
}
function findJobAndProject(jobId) {
  const jobs = storage.jobs.read() || []
  const projects = storage.projects.read() || []
  const job = jobs.find((item) => item.id === jobId)
  const project = job ? projects.find((item) => item.id === job.projectId) : null
  return { jobs, projects, job, project }
}

function finalizeJob(jobId, result) {
  const { jobs, projects, job, project } = findJobAndProject(jobId)
  if (!job || !project) { activeProcesses.delete(jobId); return }
  job.finishedAt = new Date().toISOString()
  job.progress = result.status === "completed" ? 100 : Math.min(job.progress || 0, 95)
  job.status = result.status
  job.currentStage = result.status === "completed" ? "Completed" : "Failed"
  job.errorMessage = result.errorMessage || null
  job.pid = null
  job.activeCommand = null
  project.status = result.status === "completed" ? "completed" : "failed"
  project.updatedAt = new Date().toISOString()
  project.output = result.status === "completed" ? buildOutput(project, job) : project.output
  if (result.errorMessage) appendLog(job.logPath, `ERROR: ${result.errorMessage}`)
  storage.jobs.write(jobs)
  storage.projects.write(projects)
  activeProcesses.delete(jobId)
}

function updateJobProcessInfo(jobId, processInfo = {}) {
  const jobs = storage.jobs.read() || []
  const job = jobs.find((item) => item.id === jobId)
  if (!job) return
  Object.assign(job, processInfo)
  storage.jobs.write(jobs)
}

function terminateProcessTree(pid) {
  if (!pid) return false
  const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, encoding: "utf8" })
  return result.status === 0
}

function pauseJob(jobId) {
  const { jobs, projects, job, project } = findJobAndProject(jobId)
  if (!job || !project) return { statusCode: 404, payload: { error: "Job not found" } }
  if (TERMINAL_JOB_STATUSES.has(job.status)) return { statusCode: 400, payload: { error: "Completed or failed jobs cannot be paused." } }
  if (job.status === "paused") return { statusCode: 200, payload: { job: cloneForClient(job), project, stack: readStackConfig() } }
  const active = activeProcesses.get(jobId)
  if (!active || !active.pid) {
    job.status = "failed"
    job.currentStage = "Worker process not available"
    job.finishedAt = new Date().toISOString()
    job.errorMessage = "The local worker could not be paused because it is no longer running."
    project.status = "failed"
    project.updatedAt = new Date().toISOString()
    storage.jobs.write(jobs)
    storage.projects.write(projects)
    return { statusCode: 409, payload: { error: job.errorMessage, job: cloneForClient(job), project, stack: readStackConfig() } }
  }
  terminateProcessTree(active.pid)
  activeProcesses.delete(jobId)
  const latestCheckpoint = findLatestCheckpoint(job.modelDir)
  job.status = "paused"
  job.currentStage = "Paused"
  job.finishedAt = new Date().toISOString()
  job.pausedAt = job.finishedAt
  job.errorMessage = null
  job.pid = null
  job.pausedCommand = active.label
  job.activeCommand = null
  job.lastCheckpointPath = latestCheckpoint?.path || job.lastCheckpointPath || null
  job.lastCheckpointIteration = latestCheckpoint?.iteration || job.lastCheckpointIteration || 0
  project.status = "paused"
  project.updatedAt = new Date().toISOString()
  appendLog(job.logPath, `Paused by user during ${active.label}.`)
  storage.jobs.write(jobs)
  storage.projects.write(projects)
  return { statusCode: 200, payload: { job: cloneForClient(job), project, stack: readStackConfig() } }
}

function markJobFields(jobId, fields) {
  const jobs = storage.jobs.read() || []
  const job = jobs.find((item) => item.id === jobId)
  if (!job) return null
  Object.assign(job, fields)
  storage.jobs.write(jobs)
  return job
}

function resumeJob(jobId) {
  const { jobs, projects, job, project } = findJobAndProject(jobId)
  if (!job || !project) return { statusCode: 404, payload: { error: "Job not found" } }
  if (job.status !== "paused") return { statusCode: 400, payload: { error: "Only paused jobs can be resumed." } }
  const stackConfig = readStackConfig()
  if (!stackConfig) return { statusCode: 500, payload: { error: "Local stack configuration is missing." } }
  job.status = "queued"
  job.currentStage = "Queued"
  job.finishedAt = null
  job.pausedAt = null
  job.pausedCommand = null
  job.errorMessage = null
  job.startedAt = new Date().toISOString()
  project.status = "processing"
  project.updatedAt = new Date().toISOString()
  appendLog(job.logPath, "Resume requested by user.")
  storage.jobs.write(jobs)
  storage.projects.write(projects)
  runPipeline(project, job, stackConfig, { resume: true })
  const runningJobs = storage.jobs.read() || []
  const runningProjects = storage.projects.read() || []
  const runningJob = runningJobs.find((item) => item.id === job.id)
  const runningProject = runningProjects.find((item) => item.id === project.id)
  if (runningJob && runningProject) {
    refreshRunningJob(runningJob, runningProject)
    storage.jobs.write(runningJobs)
    storage.projects.write(runningProjects)
  }
  return { statusCode: 202, payload: { job: cloneForClient(runningJob), project: runningProject, stack: stackConfig } }
}

function spawnLoggedProcess(command, args, logPath, jobId, processLabel, onExit) {
  const out = fs.openSync(logPath, "a")
  const child = spawn(command, args, { shell: true, windowsHide: true, stdio: ["ignore", out, out] })
  activeProcesses.set(jobId, { pid: child.pid, label: processLabel, command, args })
  updateJobProcessInfo(jobId, { pid: child.pid, activeCommand: processLabel })
  child.on("exit", (code) => {
    try { fs.closeSync(out) } catch {}
    activeProcesses.delete(jobId)
    updateJobProcessInfo(jobId, { pid: null, activeCommand: null })
    onExit(code)
  })
  child.on("error", (error) => {
    try { fs.closeSync(out) } catch {}
    activeProcesses.delete(jobId)
    updateJobProcessInfo(jobId, { pid: null, activeCommand: null })
    finalizeJob(jobId, { status: "failed", errorMessage: error.message })
  })
}

function startTrainingPhase(project, job, trainScript, exportScript, options = {}) {
  const startCheckpoint = options.startCheckpoint || null
  const trainArgs = [job.sceneDir, job.modelDir, String(job.targetIterations || 30000)]
  if (startCheckpoint) trainArgs.push(startCheckpoint)
  if (startCheckpoint) appendLog(job.logPath, `Resuming training from checkpoint: ${startCheckpoint}`)
  spawnLoggedProcess(trainScript, trainArgs, job.logPath, job.id, "training", (trainCode) => {
    if ((storage.jobs.read() || []).find((item) => item.id === job.id)?.status === "paused") return
    if (trainCode !== 0) { finalizeJob(job.id, { status: "failed", errorMessage: `Training exited with code ${trainCode}.` }); return }
    const latestPlyPath = findLatestPointCloudPly(job.modelDir)
    if (!latestPlyPath) { finalizeJob(job.id, { status: "failed", errorMessage: "Training finished but no point_cloud.ply was found." }); return }
    const exportFileName = `${project.id}.splat`
    const exportPath = path.join(paths.exportsDir, exportFileName)
    job.latestPlyPath = latestPlyPath
    job.exportPath = exportPath
    job.exportUrl = `/exports/${exportFileName}`
    markJobFields(job.id, { latestPlyPath, exportPath, exportUrl: `/exports/${exportFileName}`, trainingCompleted: true, activeCommand: null })
    appendLog(job.logPath, `Training finished. Exporting ${latestPlyPath} to ${exportPath} ...`)
    spawnLoggedProcess(exportScript, [latestPlyPath, exportPath], job.logPath, job.id, "SPLAT export", (exportCode) => {
      if ((storage.jobs.read() || []).find((item) => item.id === job.id)?.status === "paused") return
      if (exportCode === 0 && fs.existsSync(exportPath)) finalizeJob(job.id, { status: "completed" })
      else finalizeJob(job.id, { status: "failed", errorMessage: `SPLAT export exited with code ${exportCode}.` })
    })
  })
}

function runExportPhase(project, job, exportScript) {
  const latestPlyPath = job.latestPlyPath || findLatestPointCloudPly(job.modelDir)
  if (!latestPlyPath) { finalizeJob(job.id, { status: "failed", errorMessage: "Cannot resume export because no point_cloud.ply was found." }); return }
  const exportFileName = `${project.id}.splat`
  const exportPath = path.join(paths.exportsDir, exportFileName)
  markJobFields(job.id, { latestPlyPath, exportPath, exportUrl: `/exports/${exportFileName}` })
  appendLog(job.logPath, `Resuming export from ${latestPlyPath} to ${exportPath} ...`)
  spawnLoggedProcess(exportScript, [latestPlyPath, exportPath], job.logPath, job.id, "SPLAT export", (exportCode) => {
    if ((storage.jobs.read() || []).find((item) => item.id === job.id)?.status === "paused") return
    if (exportCode === 0 && fs.existsSync(exportPath)) finalizeJob(job.id, { status: "completed" })
    else finalizeJob(job.id, { status: "failed", errorMessage: `SPLAT export exited with code ${exportCode}.` })
  })
}

function runPipeline(project, job, stackConfig, options = {}) {
  const prepareScript = path.join(stackConfig.scriptsPath, job.usedSyntheticViews ? "prepare_single_scene.bat" : "prepare_colmap_scene.bat")
  const trainScript = path.join(stackConfig.scriptsPath, "train_scene.bat")
  const exportScript = path.join(stackConfig.scriptsPath, "export_splat.bat")
  if (options.resume && job.trainingCompleted) { runExportPhase(project, job, exportScript); return }
  if (options.resume && job.preparationCompleted) {
    const latestCheckpoint = findLatestCheckpoint(job.modelDir)
    markJobFields(job.id, { lastCheckpointPath: latestCheckpoint?.path || job.lastCheckpointPath || null, lastCheckpointIteration: latestCheckpoint?.iteration || job.lastCheckpointIteration || 0 })
    startTrainingPhase(project, job, trainScript, exportScript, { startCheckpoint: latestCheckpoint?.path || job.lastCheckpointPath || null })
    return
  }
  spawnLoggedProcess(prepareScript, [job.sceneDir], job.logPath, job.id, "COLMAP preparation", (prepareCode) => {
    if ((storage.jobs.read() || []).find((item) => item.id === job.id)?.status === "paused") return
    if (prepareCode !== 0) { finalizeJob(job.id, { status: "failed", errorMessage: `COLMAP preparation exited with code ${prepareCode}.` }); return }
    markJobFields(job.id, { preparationCompleted: true })
    appendLog(job.logPath, "COLMAP preparation finished. Starting Gaussian Splatting training...")
    startTrainingPhase(project, job, trainScript, exportScript)
  })
}
function serveExport(reqPath, res) {
  const relativePath = reqPath.replace(/^\/exports\//, "")
  const targetPath = path.normalize(path.join(paths.exportsDir, relativePath))
  if (!targetPath.startsWith(paths.exportsDir)) { sendJson(res, 403, { error: "Forbidden" }); return }
  if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) { sendJson(res, 404, { error: "Not found" }); return }
  const ext = path.extname(targetPath).toLowerCase()
  res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" })
  fs.createReadStream(targetPath).pipe(res)
}









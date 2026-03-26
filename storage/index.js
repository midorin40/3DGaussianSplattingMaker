const fs = require("fs")
const path = require("path")
const { createProject } = require("../domain/project")
const { createJob } = require("../domain/job")
const { createArtifact } = require("../domain/artifact")
const { ensureRuntimeDirectories, getRuntimePaths } = require("./paths")

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch {
    return fallback
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8")
}

function createJsonStore(filePath, fallbackValue) {
  return {
    filePath,
    fallbackValue,
    read() {
      return readJsonFile(filePath, fallbackValue)
    },
    write(value) {
      writeJsonFile(filePath, value)
    },
  }
}

function copyFileIfExists(sourcePath, targetPath) {
  if (!sourcePath || !targetPath || !fs.existsSync(sourcePath) || fs.statSync(sourcePath).isDirectory()) {
    return false
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(sourcePath, targetPath)
  }
  return true
}

function copyDirectoryTree(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    return 0
  }

  let copied = 0
  fs.mkdirSync(targetDir, { recursive: true })
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      copied += copyDirectoryTree(sourcePath, targetPath)
      continue
    }
    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath)
      copied += 1
    }
  }
  return copied
}

function legacySources(paths) {
  const rootData = paths.dataRoot
  const legacyV2DataRoot = path.join(paths.dataRoot, "v2")
  return [
    {
      name: "root",
      root: rootData,
      projectsFile: path.join(rootData, "projects.json"),
      jobsFile: path.join(rootData, "jobs.json"),
      artifactsFile: path.join(rootData, "artifacts.json"),
      uploadsDir: path.join(rootData, "uploads"),
      logsDir: path.join(rootData, "job-logs"),
      exportsDir: path.join(rootData, "exports"),
    },
    {
      name: "legacy-v2",
      root: legacyV2DataRoot,
      projectsFile: path.join(legacyV2DataRoot, "projects", "projects.json"),
      jobsFile: path.join(legacyV2DataRoot, "jobs", "jobs.json"),
      artifactsFile: path.join(legacyV2DataRoot, "artifacts", "artifacts.json"),
      uploadsDir: path.join(legacyV2DataRoot, "uploads"),
      logsDir: path.join(legacyV2DataRoot, "logs"),
      exportsDir: path.join(legacyV2DataRoot, "exports"),
    },
  ]
}

function dedupeById(items) {
  const seen = new Set()
  const result = []
  for (const item of items) {
    if (!item || !item.id || seen.has(item.id)) continue
    seen.add(item.id)
    result.push(item)
  }
  return result
}

function legacyProjectUploadPath(sourceUploadsDir, projectId, storedName, previewUrl, storedPath) {
  if (storedPath && fs.existsSync(storedPath) && fs.statSync(storedPath).isFile()) {
    return storedPath
  }
  if (storedName) {
    const directPath = path.join(sourceUploadsDir, projectId, storedName)
    if (fs.existsSync(directPath)) return directPath
  }
  const preview = String(previewUrl || "").replace(/^\/(?:v2\/)?uploads\//, "")
  return preview ? path.join(sourceUploadsDir, preview) : null
}

function normalizeImportedProject(project, paths, source) {
  const next = createProject(project)
  next.assets = (Array.isArray(project.assets) ? project.assets : []).map((asset) => {
    const storedName = asset.storedName || path.basename(String(asset.previewUrl || "").replace(/^.*\//, "")) || `${asset.id || "asset"}`
    const relativePath = path.join(project.id, storedName)
    const sourcePath = legacyProjectUploadPath(source.uploadsDir, project.id, storedName, asset.previewUrl, asset.storedPath)
    const targetPath = path.join(paths.uploadsDir, relativePath)
    copyFileIfExists(sourcePath, targetPath)
    return {
      ...asset,
      storedName,
      storedPath: targetPath,
      previewUrl: `/uploads/${project.id}/${storedName}`,
    }
  })
  next.assetIds = next.assets.map((asset) => asset.id).filter(Boolean)
  return next
}

function normalizeImportedJob(job, paths, source) {
  const next = createJob({
    ...job,
    pipelineKey: job.pipelineKey || (job.mode === "single" ? "single" : "multi_video"),
    mode: job.mode || (job.pipelineKey === "single" ? "single" : "multi"),
  })

  next.pid = Number.isInteger(job.pid) ? job.pid : null
  next.activeCommand = job.activeCommand || null
  next.pausedCommand = job.pausedCommand || null

  const logName = job.logPath ? path.basename(job.logPath) : `${job.id}.log`
  const legacyLogPath = job.logPath || path.join(source.logsDir, logName)
  const nextLogPath = path.join(paths.logsDir, logName)
  copyFileIfExists(legacyLogPath, nextLogPath)
  next.logPath = nextLogPath

  if (job.exportPath || job.exportUrl) {
    const exportName = path.basename(job.exportPath || job.exportUrl)
    const legacyExportPath = job.exportPath || path.join(source.exportsDir, exportName)
    const nextExportPath = path.join(paths.exportsDir, exportName)
    copyFileIfExists(legacyExportPath, nextExportPath)
    next.exportPath = nextExportPath
    next.exportUrl = `/exports/${exportName}`
  }

  if (job.latestPlyPath && fs.existsSync(job.latestPlyPath)) {
    next.latestPlyPath = job.latestPlyPath
  }
  if (job.lastCheckpointPath && fs.existsSync(job.lastCheckpointPath)) {
    next.lastCheckpointPath = job.lastCheckpointPath
  }

  return next
}

function importLegacyData(paths) {
  const currentProjects = readJsonFile(path.join(paths.projectsDir, "projects.json"), [])
  const currentJobs = readJsonFile(path.join(paths.jobsDir, "jobs.json"), [])
  const currentArtifacts = readJsonFile(path.join(paths.artifactsDir, "artifacts.json"), [])
  if (Array.isArray(currentProjects) && currentProjects.length > 0) {
    return false
  }

  const importedProjects = []
  const importedJobs = []
  const importedArtifacts = []

  for (const source of legacySources(paths)) {
    if (!fs.existsSync(source.root)) continue

    const sourceProjects = readJsonFile(source.projectsFile, [])
    const sourceJobs = readJsonFile(source.jobsFile, [])
    const sourceArtifacts = readJsonFile(source.artifactsFile, [])

    importedProjects.push(...sourceProjects.map((project) => normalizeImportedProject(project, paths, source)))
    importedJobs.push(...sourceJobs.map((job) => normalizeImportedJob(job, paths, source)))
    importedArtifacts.push(...sourceArtifacts.map((artifact) => createArtifact(artifact)))

    copyDirectoryTree(source.uploadsDir, paths.uploadsDir)
    copyDirectoryTree(source.logsDir, paths.logsDir)
    copyDirectoryTree(source.exportsDir, paths.exportsDir)
  }

  const nextProjects = dedupeById(importedProjects)
  const nextJobs = dedupeById(importedJobs)
  const nextArtifacts = dedupeById(importedArtifacts)

  if (nextProjects.length === 0 && nextJobs.length === 0 && nextArtifacts.length === 0) {
    return false
  }

  writeJsonFile(path.join(paths.projectsDir, "projects.json"), nextProjects)
  writeJsonFile(path.join(paths.jobsDir, "jobs.json"), nextJobs)
  if (!Array.isArray(currentArtifacts) || currentArtifacts.length === 0) {
    writeJsonFile(path.join(paths.artifactsDir, "artifacts.json"), nextArtifacts)
  }

  return true
}

function openRuntimeStorage() {
  const paths = ensureRuntimeDirectories()
  importLegacyData(paths)
  return {
    paths,
    projects: createJsonStore(path.join(paths.projectsDir, "projects.json"), []),
    jobs: createJsonStore(path.join(paths.jobsDir, "jobs.json"), []),
    artifacts: createJsonStore(path.join(paths.artifactsDir, "artifacts.json"), []),
  }
}

module.exports = {
  getRuntimePaths,
  ensureRuntimeDirectories,
  openRuntimeStorage,
  createJsonStore,
  readJsonFile,
  writeJsonFile,
  importLegacyData,
}

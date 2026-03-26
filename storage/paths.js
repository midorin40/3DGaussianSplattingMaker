const fs = require("fs")
const path = require("path")

function resolveRuntimeRoot() {
  return path.resolve(__dirname, "..")
}

function resolveAppRoot() {
  return resolveRuntimeRoot()
}

function resolveDataRoot() {
  return process.env.GSM_DATA_ROOT || path.join(resolveAppRoot(), "data")
}

function getRuntimePaths() {
  const dataRoot = resolveDataRoot()
  const runtimeDataRoot = path.join(dataRoot, "runtime")
  return {
    appRoot: resolveAppRoot(),
    runtimeRoot: resolveRuntimeRoot(),
    dataRoot,
    runtimeDataRoot,
    projectsDir: path.join(runtimeDataRoot, "projects"),
    jobsDir: path.join(runtimeDataRoot, "jobs"),
    artifactsDir: path.join(runtimeDataRoot, "artifacts"),
    uploadsDir: path.join(runtimeDataRoot, "uploads"),
    exportsDir: path.join(runtimeDataRoot, "exports"),
    logsDir: path.join(runtimeDataRoot, "logs"),
    manifestsDir: path.join(runtimeDataRoot, "manifests"),
    cacheDir: path.join(runtimeDataRoot, "cache"),
  }
}

function ensureRuntimeDirectories() {
  const paths = getRuntimePaths()
  for (const key of ["runtimeDataRoot", "projectsDir", "jobsDir", "artifactsDir", "uploadsDir", "exportsDir", "logsDir", "manifestsDir", "cacheDir"]) {
    fs.mkdirSync(paths[key], { recursive: true })
  }
  return paths
}

module.exports = {
  resolveRuntimeRoot,
  resolveAppRoot,
  resolveDataRoot,
  getRuntimePaths,
  ensureRuntimeDirectories,
}

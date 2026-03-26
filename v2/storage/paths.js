const fs = require("fs");
const path = require("path");

function resolveV2Root() {
  return path.resolve(__dirname, "..");
}

function resolveAppRoot() {
  return path.resolve(resolveV2Root(), "..");
}

function resolveDataRoot() {
  return process.env.GSM_DATA_ROOT || path.join(resolveAppRoot(), "data");
}

function getV2Paths() {
  const dataRoot = resolveDataRoot();
  const v2DataRoot = path.join(dataRoot, "v2");
  return {
    appRoot: resolveAppRoot(),
    v2Root: resolveV2Root(),
    dataRoot,
    v2DataRoot,
    projectsDir: path.join(v2DataRoot, "projects"),
    jobsDir: path.join(v2DataRoot, "jobs"),
    artifactsDir: path.join(v2DataRoot, "artifacts"),
    uploadsDir: path.join(v2DataRoot, "uploads"),
    exportsDir: path.join(v2DataRoot, "exports"),
    logsDir: path.join(v2DataRoot, "logs"),
    manifestsDir: path.join(v2DataRoot, "manifests"),
    cacheDir: path.join(v2DataRoot, "cache"),
  };
}

function ensureV2Directories() {
  const paths = getV2Paths();
  for (const key of ["v2DataRoot", "projectsDir", "jobsDir", "artifactsDir", "uploadsDir", "exportsDir", "logsDir", "manifestsDir", "cacheDir"]) {
    fs.mkdirSync(paths[key], { recursive: true });
  }
  return paths;
}

module.exports = {
  resolveV2Root,
  resolveAppRoot,
  resolveDataRoot,
  getV2Paths,
  ensureV2Directories,
};

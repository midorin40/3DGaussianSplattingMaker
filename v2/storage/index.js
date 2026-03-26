const fs = require("fs");
const path = require("path");
const { createProject } = require("../domain/project");
const { createJob } = require("../domain/job");
const { createArtifact } = require("../domain/artifact");
const { ensureV2Directories, getV2Paths } = require("./paths");

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function createJsonStore(filePath, fallbackValue) {
  return {
    filePath,
    fallbackValue,
    read() {
      return readJsonFile(filePath, fallbackValue);
    },
    write(value) {
      writeJsonFile(filePath, value);
    },
  };
}

function copyFileIfExists(sourcePath, targetPath) {
  if (!sourcePath || !targetPath || !fs.existsSync(sourcePath) || fs.statSync(sourcePath).isDirectory()) {
    return false;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(sourcePath, targetPath);
  }
  return true;
}

function copyDirectoryTree(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    return 0;
  }

  let copied = 0;
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copied += copyDirectoryTree(sourcePath, targetPath);
      continue;
    }
    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
      copied += 1;
    }
  }
  return copied;
}

function legacyDataRoot(paths) {
  return path.join(paths.appRoot, "data");
}

function legacyProjectUploadPath(root, projectId, storedName, previewUrl) {
  if (storedName) {
    return path.join(root, "uploads", projectId, storedName);
  }
  const preview = String(previewUrl || "").replace(/^\/(v2\/)?uploads\//, "");
  return preview ? path.join(root, "uploads", preview) : null;
}

function normalizeImportedProject(project, paths, root) {
  const next = createProject(project);
  next.assets = (Array.isArray(project.assets) ? project.assets : []).map((asset) => {
    const storedName = asset.storedName || path.basename(String(asset.previewUrl || "").replace(/^.*\//, "")) || `${asset.id || "asset"}`;
    const relativePath = path.join(project.id, storedName);
    const sourcePath = legacyProjectUploadPath(root, project.id, storedName, asset.previewUrl);
    const targetPath = path.join(paths.uploadsDir, relativePath);
    copyFileIfExists(sourcePath, targetPath);
    return {
      ...asset,
      storedName,
      storedPath: targetPath,
      previewUrl: `/uploads/${project.id}/${storedName}`,
    };
  });
  next.assetIds = next.assets.map((asset) => asset.id).filter(Boolean);
  return next;
}

function normalizeImportedJob(job, paths) {
  const next = createJob({
    ...job,
    pipelineKey: job.pipelineKey || (job.mode === "single" ? "single" : "multi_video"),
    mode: job.mode || (job.pipelineKey === "single" ? "single" : "multi"),
  });

  next.pid = Number.isInteger(job.pid) ? job.pid : null;
  next.activeCommand = job.activeCommand || null;
  next.pausedCommand = job.pausedCommand || null;

  const logName = job.logPath ? path.basename(job.logPath) : `${job.id}.log`;
  const legacyLogPath = job.logPath || path.join(paths.appRoot, "data", "job-logs", logName);
  const nextLogPath = path.join(paths.logsDir, logName);
  copyFileIfExists(legacyLogPath, nextLogPath);
  next.logPath = nextLogPath;

  if (job.exportPath || job.exportUrl) {
    const exportName = path.basename(job.exportPath || job.exportUrl);
    const legacyExportPath = job.exportPath || path.join(paths.appRoot, "data", "exports", exportName);
    const nextExportPath = path.join(paths.exportsDir, exportName);
    copyFileIfExists(legacyExportPath, nextExportPath);
    next.exportPath = nextExportPath;
    next.exportUrl = `/exports/${exportName}`;
  }

  if (job.latestPlyPath && fs.existsSync(job.latestPlyPath)) {
    next.latestPlyPath = job.latestPlyPath;
  }
  if (job.lastCheckpointPath && fs.existsSync(job.lastCheckpointPath)) {
    next.lastCheckpointPath = job.lastCheckpointPath;
  }

  return next;
}

function importLegacyData(paths) {
  const root = legacyDataRoot(paths);
  const legacyProjectsPath = path.join(root, "projects.json");
  const legacyJobsPath = path.join(root, "jobs.json");
  const legacyExportsDir = path.join(root, "exports");
  const legacyUploadsDir = path.join(root, "uploads");
  const legacyLogsDir = path.join(root, "job-logs");

  if (!fs.existsSync(legacyProjectsPath) || !fs.existsSync(legacyJobsPath)) {
    return false;
  }

  const currentProjects = readJsonFile(path.join(paths.projectsDir, "projects.json"), []);
  const currentJobs = readJsonFile(path.join(paths.jobsDir, "jobs.json"), []);
  const currentArtifacts = readJsonFile(path.join(paths.artifactsDir, "artifacts.json"), []);
  if (Array.isArray(currentProjects) && currentProjects.length > 0) {
    return false;
  }

  const legacyProjects = readJsonFile(legacyProjectsPath, []);
  const legacyJobs = readJsonFile(legacyJobsPath, []);
  const importedProjects = legacyProjects.map((project) => normalizeImportedProject(project, paths, root));
  const importedJobs = legacyJobs.map((job) => normalizeImportedJob(job, paths));

  writeJsonFile(path.join(paths.projectsDir, "projects.json"), importedProjects);
  writeJsonFile(path.join(paths.jobsDir, "jobs.json"), importedJobs);
  if (!Array.isArray(currentArtifacts) || currentArtifacts.length === 0) {
    writeJsonFile(path.join(paths.artifactsDir, "artifacts.json"), []);
  }

  copyDirectoryTree(legacyUploadsDir, paths.uploadsDir);
  copyDirectoryTree(legacyLogsDir, paths.logsDir);
  copyDirectoryTree(legacyExportsDir, paths.exportsDir);

  return true;
}

function openV2Storage() {
  const paths = ensureV2Directories();
  importLegacyData(paths);
  return {
    paths,
    projects: createJsonStore(path.join(paths.projectsDir, "projects.json"), []),
    jobs: createJsonStore(path.join(paths.jobsDir, "jobs.json"), []),
    artifacts: createJsonStore(path.join(paths.artifactsDir, "artifacts.json"), []),
  };
}

module.exports = {
  getV2Paths,
  ensureV2Directories,
  openV2Storage,
  createJsonStore,
  readJsonFile,
  writeJsonFile,
  importLegacyData,
};

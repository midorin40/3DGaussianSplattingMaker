const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { spawn, spawnSync } = require("child_process");

const PORT = process.env.PORT || 3100;
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const JOB_LOGS_DIR = path.join(DATA_DIR, "job-logs");
const EXPORTS_DIR = path.join(DATA_DIR, "exports");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
const JOBS_FILE = path.join(DATA_DIR, "jobs.json");
const STACK_CONFIG_FILE = path.join(DATA_DIR, "local-stack.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".splat": "application/octet-stream"
};

const JOB_STAGES = {
  single: [
    { key: "ingest", label: "Input validation", durationMs: 1000 },
    { key: "pseudo", label: "Pseudo multi-view generation", durationMs: 5000 },
    { key: "colmap", label: "COLMAP reconstruction preparation", durationMs: 120000 },
    { key: "train", label: "Gaussian Splatting training", durationMs: 600000 },
    { key: "export", label: "Exporting .splat package", durationMs: 15000 },
    { key: "finalize", label: "Packaging preview output", durationMs: 4000 }
  ],
  multi: [
    { key: "ingest", label: "Input validation", durationMs: 1500 },
    { key: "stage", label: "Scene staging for COLMAP", durationMs: 2500 },
    { key: "colmap", label: "COLMAP reconstruction preparation", durationMs: 120000 },
    { key: "train", label: "Gaussian Splatting training", durationMs: 600000 },
    { key: "export", label: "Exporting .splat package", durationMs: 15000 },
    { key: "finalize", label: "Packaging preview output", durationMs: 4000 }
  ]
};

const activeProcesses = new Map();

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(JOB_LOGS_DIR, { recursive: true });
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  if (!fs.existsSync(PROJECTS_FILE)) fs.writeFileSync(PROJECTS_FILE, "[]", "utf8");
  if (!fs.existsSync(JOBS_FILE)) fs.writeFileSync(JOBS_FILE, "[]", "utf8");
}

function readJson(filePath, fallback) {
  ensureStorage();
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return fallback; }
}
function writeJson(filePath, value) { fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8"); }
function readProjects() { return readJson(PROJECTS_FILE, []); }
function writeProjects(projects) { writeJson(PROJECTS_FILE, projects); }
function readJobs() { return readJson(JOBS_FILE, []); }
function writeJobs(jobs) { writeJson(JOBS_FILE, jobs); }
function readStackConfig() { return readJson(STACK_CONFIG_FILE, null); }
function sendJson(res, statusCode, payload) { res.writeHead(statusCode, { "Content-Type": MIME_TYPES[".json"] }); res.end(JSON.stringify(payload)); }

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 50000000) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

function makeId(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function safeFileName(fileName) {
  const ext = path.extname(fileName || "").toLowerCase();
  const base = path.basename(fileName || "asset", ext).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "asset";
  return `${base}${ext}`;
}
function safeFolderName(value) { return String(value || "scene").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "scene"; }
function decodeDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new Error("Invalid data URL");
  return { mimeType: match[1], buffer: Buffer.from(match[2], "base64") };
}
function assetPublicPath(projectId, fileName) { return `/uploads/${projectId}/${fileName}`; }
function exportPublicPath(fileName) { return `/exports/${fileName}`; }
function isVideoAsset(asset) {
  return /^video\//i.test(asset?.mimeType || "");
}
function getFrameExtractionFps(project) {
  switch (project?.qualityPreset) {
    case "high": return 4;
    case "fast": return 2;
    default: return 3;
  }
}
function extractVideoFrames(stackConfig, videoPath, outputDir, fps) {
  const scriptPath = path.join(stackConfig.scriptsPath, "extract_frames.bat");
  const result = spawnSync(scriptPath, [videoPath, outputDir, String(fps)], {
    shell: true,
    windowsHide: true,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(details ? `Video frame extraction failed. ${details}` : "Video frame extraction failed.");
  }
}
function generatePseudoViews(stackConfig, imagePath, outputDir, preset) {
  const scriptPath = path.join(stackConfig.scriptsPath, "generate_single_scene.bat");
  const result = spawnSync(scriptPath, [imagePath, outputDir, String(preset || "standard")], {
    shell: true,
    windowsHide: true,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(details ? `Pseudo view generation failed. ${details}` : "Pseudo view generation failed.");
  }
}
function getStages(mode) { return JOB_STAGES[mode] || JOB_STAGES.multi; }
function totalDuration(stages) { return stages.reduce((sum, stage) => sum + stage.durationMs, 0); }
function getJobLogTail(logPath, maxChars = 12000) {
  if (!logPath || !fs.existsSync(logPath)) return "";
  const text = fs.readFileSync(logPath, "utf8");
  return text.length > maxChars ? text.slice(-maxChars) : text;
}
function cloneForClient(job) { return { ...job, logTail: getJobLogTail(job.logPath), stages: getStages(job.mode) }; }
function appendLog(logPath, line) { fs.mkdirSync(path.dirname(logPath), { recursive: true }); fs.appendFileSync(logPath, `${line}\r\n`, "utf8"); }

function buildOutput(project, job) {
  const assetCount = project.assets.length;
  const singleMode = project.mode === "single";
  const warnings = [];
  if (singleMode) {
    if (job.usedSyntheticViews) warnings.push(`Single-image mode generated ${job.syntheticViewCount || 0} pseudo view(s) before reconstruction.`);
    warnings.push("Single-image mode infers side views from one source image, so hidden surfaces are approximated rather than observed.");
    if (project.backgroundMode === "remove") warnings.push("Background removal can help isolate flat artwork before pseudo view generation.");
  } else {
    if (job.usedVideoInput) warnings.push(`Video input was converted into ${job.extractedFrameCount || 0} frame(s) before reconstruction.`);
    if (assetCount < 12 && !job.usedVideoInput) warnings.push("Multi-image mode works best with 12+ well-overlapped views.");
    if (project.backgroundMode === "remove") warnings.push("Background removal can distort thin edges; review the training result carefully.");
  }

  return {
    generatedAt: new Date().toISOString(),
    quality: singleMode ? (job.exportUrl ? "Synthetic Multi-View" : "Single Source") : assetCount >= 20 ? "High" : "Standard",
    summary: singleMode
      ? job.exportUrl
        ? "A single uploaded image was expanded into pseudo multi-view inputs and exported as a .splat package."
        : "A single uploaded image was expanded into pseudo multi-view inputs and sent through the local GS pipeline."
      : job.exportUrl
        ? "The local COLMAP and Gaussian Splatting pipeline finished and a .splat package is ready."
        : "The local COLMAP and Gaussian Splatting pipeline finished running for this project.",
    viewer: {
      cameraMode: singleMode ? "orbit-artwork" : "orbit-wide",
      recommendedSpinSeconds: singleMode ? 9 : 14,
      previewAssets: project.assets.slice(0, 8).map((asset) => asset.previewUrl)
    },
    packageInfo: {
      mode: project.mode,
      assetCount,
      usedVideoInput: !!job.usedVideoInput,
      extractedFrameCount: job.extractedFrameCount || 0,
      status: singleMode ? "scaffold-ready" : job.exportUrl ? "splat-ready" : "local-stack-finished",
      engine: singleMode ? "single-image-scaffold" : "graphdeco-inria-gaussian-splatting",
      exportTargets: singleMode ? ["preview"] : job.exportUrl ? ["preview", "gaussian-splatting-training-output", ".splat"] : ["preview", "gaussian-splatting-training-output"],
      sourceJobId: job.id,
      sceneDir: job.sceneDir,
      modelDir: job.modelDir,
      plyPath: job.latestPlyPath || null,
      splatPath: job.exportPath || null,
      splatUrl: job.exportUrl || null
    },
    warnings
  };
}

function refreshRunningJob(job, project) {
  const stages = getStages(job.mode);
  const startedAt = new Date(job.startedAt).getTime();
  const elapsed = Math.max(0, Date.now() - startedAt);
  const total = totalDuration(stages);
  let consumed = 0;
  let currentStage = stages[stages.length - 1];

  for (const stage of stages) {
    if (elapsed < consumed + stage.durationMs) { currentStage = stage; break; }
    consumed += stage.durationMs;
  }

  const active = activeProcesses.has(job.id);
  if ((job.status === "queued" || job.status === "running") && !active) {
    job.status = "failed";
    job.progress = Math.min(job.progress || 0, 95);
    job.currentStage = "Worker process not available";
    job.finishedAt = new Date().toISOString();
    job.errorMessage = job.errorMessage || "The local training worker is no longer running.";
    project.status = "failed";
    project.updatedAt = new Date().toISOString();
    return;
  }

  if (job.status === "queued" || job.status === "running") {
    job.status = "running";
    job.progress = Math.min(95, Math.max(5, Math.round((elapsed / total) * 100)));
    job.currentStage = currentStage.label;
    project.status = "processing";
    project.updatedAt = new Date().toISOString();
  }
}

function syncJobsAndProjects() {
  const projects = readProjects();
  const jobs = readJobs();
  let dirty = false;
  for (const job of jobs) {
    const project = projects.find((item) => item.id === job.projectId);
    if (!project) continue;
    const before = `${job.status}:${job.progress}:${job.currentStage}:${project.status}`;
    refreshRunningJob(job, project);
    const after = `${job.status}:${job.progress}:${job.currentStage}:${project.status}`;
    if (before !== after) dirty = true;
  }
  if (dirty) { writeJobs(jobs); writeProjects(projects); }
  return { projects, jobs };
}

function createProject(payload) {
  const mode = payload.mode === "single" ? "single" : "multi";
  return { id: makeId("project"), name: payload.name || "Untitled Project", mode, subjectType: payload.subjectType || "object", qualityPreset: payload.qualityPreset || "standard", backgroundMode: payload.backgroundMode || "keep", notes: payload.notes || "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "draft", assets: [], output: null };
}

function saveAssets(projectId, files) {
  const projectDir = path.join(UPLOADS_DIR, projectId); fs.mkdirSync(projectDir, { recursive: true });
  return files.map((file) => {
    const { mimeType, buffer } = decodeDataUrl(file.dataUrl);
    const fileName = `${Date.now()}-${safeFileName(file.name)}`;
    fs.writeFileSync(path.join(projectDir, fileName), buffer);
    return { id: makeId("asset"), name: file.name, size: file.size, mimeType: file.type || mimeType, uploadedAt: new Date().toISOString(), previewUrl: assetPublicPath(projectId, fileName), storedName: fileName };
  });
}

function validateGeneration(project) {
  if (!project) return "Project not found";
  if (!project.assets.length) return "Upload at least one image before starting generation.";
  const videoCount = project.assets.filter(isVideoAsset).length;
  const imageCount = project.assets.length - videoCount;
  if (project.mode === "single") {
    if (project.assets.length !== 1) return "Single-image mode requires exactly one uploaded file.";
    if (videoCount > 0) return "Single-image mode does not support video input yet.";
  }
  if (project.mode === "multi") {
    if (videoCount === 0 && imageCount < 2) return "Multi-image mode requires at least two images, or one supported video file.";
  }
  return null;
}

function getAssetDiskPath(projectId, storedName) { return path.join(UPLOADS_DIR, projectId, storedName); }

function stageScene(project, stackConfig) {
  const sceneName = `${project.id}-${safeFolderName(project.name)}`;
  const sceneDir = path.join(stackConfig.rawDataPath, sceneName);
  const inputDir = path.join(sceneDir, "input");
  const modelDir = path.join(sceneDir, "model");
  const extractedFramesDir = path.join(sceneDir, "extracted_frames");
  const syntheticViewsDir = path.join(sceneDir, "synthetic_views");
  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(modelDir, { recursive: true });

  let extractedFrameCount = 0;
  let usedVideoInput = false;
  let usedSyntheticViews = false;
  let syntheticViewCount = 0;

  for (const asset of project.assets) {
    const sourcePath = getAssetDiskPath(project.id, asset.storedName);
    if (project.mode === "single") {
      usedSyntheticViews = true;
      const generatedDir = path.join(syntheticViewsDir, path.parse(asset.storedName).name);
      fs.mkdirSync(generatedDir, { recursive: true });
      generatePseudoViews(stackConfig, sourcePath, generatedDir, project.qualityPreset);
      const generatedFiles = fs.readdirSync(generatedDir).filter((name) => /\.(png|jpg|jpeg|webp)$/i.test(name)).sort();
      for (const generatedFile of generatedFiles) {
        const stagedName = `${path.parse(asset.storedName).name}-${generatedFile}`;
        fs.copyFileSync(path.join(generatedDir, generatedFile), path.join(inputDir, stagedName));
        syntheticViewCount += 1;
      }
      continue;
    }
    if (isVideoAsset(asset)) {
      usedVideoInput = true;
      const assetFrameDir = path.join(extractedFramesDir, path.parse(asset.storedName).name);
      fs.mkdirSync(assetFrameDir, { recursive: true });
      extractVideoFrames(stackConfig, sourcePath, assetFrameDir, getFrameExtractionFps(project));
      const frameFiles = fs.readdirSync(assetFrameDir).filter((name) => /\.(png|jpg|jpeg|webp)$/i.test(name)).sort();
      for (const frameFile of frameFiles) {
        const stagedName = `${path.parse(asset.storedName).name}-${frameFile}`;
        fs.copyFileSync(path.join(assetFrameDir, frameFile), path.join(inputDir, stagedName));
        extractedFrameCount += 1;
      }
    } else {
      fs.copyFileSync(sourcePath, path.join(inputDir, asset.storedName));
    }
  }

  return { sceneDir, modelDir, extractedFrameCount, usedVideoInput, usedSyntheticViews, syntheticViewCount };
}

function findLatestPointCloudPly(modelDir) {
  if (!fs.existsSync(modelDir)) return null;
  const matches = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase() === "point_cloud.ply") {
        matches.push({ path: full, mtimeMs: fs.statSync(full).mtimeMs });
      }
    }
  }
  walk(modelDir);
  matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0]?.path || null;
}

function finalizeJob(jobId, result) {
  const jobs = readJobs();
  const projects = readProjects();
  const job = jobs.find((item) => item.id === jobId);
  const project = job ? projects.find((item) => item.id === job.projectId) : null;
  if (!job || !project) { activeProcesses.delete(jobId); return; }

  job.finishedAt = new Date().toISOString();
  job.progress = result.status === "completed" ? 100 : Math.min(job.progress || 0, 95);
  job.status = result.status;
  job.currentStage = result.status === "completed" ? "Completed" : "Failed";
  job.errorMessage = result.errorMessage || null;

  project.status = result.status === "completed" ? "completed" : "failed";
  project.updatedAt = new Date().toISOString();
  project.output = result.status === "completed" ? buildOutput(project, job) : project.output;

  if (result.errorMessage) appendLog(job.logPath, `ERROR: ${result.errorMessage}`);

  writeJobs(jobs);
  writeProjects(projects);
  activeProcesses.delete(jobId);
}

function spawnLoggedProcess(command, args, logPath, jobId, onExit) {
  const out = fs.openSync(logPath, "a");
  const child = spawn(command, args, { shell: true, windowsHide: true, stdio: ["ignore", out, out] });
  activeProcesses.set(jobId, child);
  child.on("exit", (code) => { fs.closeSync(out); activeProcesses.delete(jobId); onExit(code); });
  child.on("error", (error) => {
    try { fs.closeSync(out); } catch {}
    activeProcesses.delete(jobId);
    finalizeJob(jobId, { status: "failed", errorMessage: error.message });
  });
}

function runMultiImagePipeline(project, job, stackConfig) {
  appendLog(job.logPath, `Starting local Gaussian Splatting pipeline for ${project.name}`);
  appendLog(job.logPath, `Scene: ${job.sceneDir}`);
  appendLog(job.logPath, `Model output: ${job.modelDir}`);
  if (job.usedVideoInput) appendLog(job.logPath, `Video input detected. Extracted ${job.extractedFrameCount || 0} frame(s) for COLMAP.`);
  if (job.usedSyntheticViews) appendLog(job.logPath, `Single-image mode generated ${job.syntheticViewCount || 0} pseudo view(s) for COLMAP.`);

  const prepareScript = path.join(stackConfig.scriptsPath, job.usedSyntheticViews ? "prepare_single_scene.bat" : "prepare_colmap_scene.bat");
  const trainScript = path.join(stackConfig.scriptsPath, "train_scene.bat");
  const exportScript = path.join(stackConfig.scriptsPath, "export_splat.bat");

  spawnLoggedProcess(prepareScript, [job.sceneDir], job.logPath, job.id, (prepareCode) => {
    if (prepareCode !== 0) {
      finalizeJob(job.id, { status: "failed", errorMessage: `COLMAP preparation exited with code ${prepareCode}.` });
      return;
    }

    appendLog(job.logPath, "COLMAP preparation finished. Starting Gaussian Splatting training...");
    spawnLoggedProcess(trainScript, [job.sceneDir, job.modelDir], job.logPath, job.id, (trainCode) => {
      if (trainCode !== 0) {
        finalizeJob(job.id, { status: "failed", errorMessage: `Training exited with code ${trainCode}.` });
        return;
      }

      const latestPlyPath = findLatestPointCloudPly(job.modelDir);
      if (!latestPlyPath) {
        finalizeJob(job.id, { status: "failed", errorMessage: "Training finished but no point_cloud.ply was found." });
        return;
      }

      const exportFileName = `${project.id}.splat`;
      const exportPath = path.join(EXPORTS_DIR, exportFileName);
      job.latestPlyPath = latestPlyPath;
      job.exportPath = exportPath;
      job.exportUrl = exportPublicPath(exportFileName);
      const jobs = readJobs();
      const targetJob = jobs.find((item) => item.id === job.id);
      if (targetJob) {
        targetJob.latestPlyPath = latestPlyPath;
        targetJob.exportPath = exportPath;
        targetJob.exportUrl = exportPublicPath(exportFileName);
        writeJobs(jobs);
      }

      appendLog(job.logPath, `Training finished. Exporting ${latestPlyPath} to ${exportPath} ...`);
      spawnLoggedProcess(exportScript, [latestPlyPath, exportPath], job.logPath, job.id, (exportCode) => {
        if (exportCode === 0 && fs.existsSync(exportPath)) {
          finalizeJob(job.id, { status: "completed" });
        } else {
          finalizeJob(job.id, { status: "failed", errorMessage: `SPLAT export exited with code ${exportCode}.` });
        }
      });
    });
  });
}

function serveStatic(reqPath, res) {
  const requestPath = reqPath === "/" ? "/index.html" : reqPath;
  const normalized = path.normalize(requestPath);
  const safePath = normalized.replace(/^([.][.][/\\])+/, "");
  const stripped = safePath.replace(/^[/\\]+/, "");
  const isUpload = stripped.startsWith("uploads\\") || stripped.startsWith("uploads/");
  const isExport = stripped.startsWith("exports\\") || stripped.startsWith("exports/");
  const filePath = isUpload || isExport
    ? path.join(DATA_DIR, stripped)
    : path.join(PUBLIC_DIR, stripped);

  if (!filePath.startsWith(PUBLIC_DIR) && !filePath.startsWith(DATA_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) { sendJson(res, 404, { error: "Not found" }); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  ensureStorage();
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;

  try {
    if (req.method === "GET" && pathname === "/api/projects") { const { projects } = syncJobsAndProjects(); sendJson(res, 200, { projects }); return; }
    if (req.method === "POST" && pathname === "/api/projects") {
      const body = await parseBody(req); const projects = readProjects(); const project = createProject(body); projects.unshift(project); writeProjects(projects); sendJson(res, 201, { project }); return;
    }
    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (req.method === "GET" && projectMatch) {
      const { projects } = syncJobsAndProjects(); const project = projects.find((item) => item.id === projectMatch[1]); if (!project) return sendJson(res, 404, { error: "Project not found" }); sendJson(res, 200, { project }); return;
    }
    const assetsMatch = pathname.match(/^\/api\/projects\/([^/]+)\/assets$/);
    if (req.method === "POST" && assetsMatch) {
      const body = await parseBody(req); const projects = readProjects(); const project = projects.find((item) => item.id === assetsMatch[1]); if (!project) return sendJson(res, 404, { error: "Project not found" });
      const files = Array.isArray(body.files) ? body.files : []; if (!files.length) return sendJson(res, 400, { error: "No files provided" });
      const assets = saveAssets(project.id, files); project.assets.push(...assets); project.updatedAt = new Date().toISOString(); writeProjects(projects); sendJson(res, 201, { assets, project }); return;
    }
    const generateMatch = pathname.match(/^\/api\/projects\/([^/]+)\/generate$/);
    if (req.method === "POST" && generateMatch) {
      const projects = readProjects(); const jobs = readJobs(); const project = projects.find((item) => item.id === generateMatch[1]); const validationError = validateGeneration(project); if (validationError) return sendJson(res, 400, { error: validationError });
      const existingJob = jobs.find((item) => item.projectId === project.id && ["queued", "running"].includes(item.status));
      if (existingJob) { refreshRunningJob(existingJob, project); writeJobs(jobs); writeProjects(projects); sendJson(res, 200, { job: cloneForClient(existingJob), project, stack: readStackConfig() }); return; }
      const stackConfig = readStackConfig(); if (!stackConfig) return sendJson(res, 500, { error: "Local stack configuration is missing." });
      const { sceneDir, modelDir, extractedFrameCount, usedVideoInput, usedSyntheticViews, syntheticViewCount } = stageScene(project, stackConfig); const logPath = path.join(JOB_LOGS_DIR, `${project.id}.log`); fs.writeFileSync(logPath, "", "utf8");
      const job = { id: makeId("job"), projectId: project.id, mode: project.mode, status: "queued", progress: 0, currentStage: "Queued", startedAt: new Date().toISOString(), finishedAt: null, sceneDir, modelDir, logPath, pid: null, errorMessage: null, latestPlyPath: null, exportPath: null, exportUrl: null, extractedFrameCount, usedVideoInput, usedSyntheticViews, syntheticViewCount };
      jobs.unshift(job); project.status = "processing"; project.updatedAt = new Date().toISOString(); writeJobs(jobs); writeProjects(projects);
      runMultiImagePipeline(project, job, stackConfig);
      const runningJobs = readJobs(); const runningProjects = readProjects(); const runningJob = runningJobs.find((item) => item.id === job.id); const runningProject = runningProjects.find((item) => item.id === project.id); refreshRunningJob(runningJob, runningProject); writeJobs(runningJobs); writeProjects(runningProjects); sendJson(res, 202, { job: cloneForClient(runningJob), project: runningProject, stack: stackConfig }); return;
    }
    const jobsMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
    if (req.method === "GET" && jobsMatch) {
      const { projects, jobs } = syncJobsAndProjects(); const job = jobs.find((item) => item.id === jobsMatch[1]); if (!job) return sendJson(res, 404, { error: "Job not found" }); const project = projects.find((item) => item.id === job.projectId); sendJson(res, 200, { job: cloneForClient(job), project, stack: readStackConfig() }); return;
    }
    if (req.method === "GET" && pathname === "/api/status") {
      sendJson(res, 200, { name: "GaussianSplattingMaker", supports: { singleImageWorkflow: true, singleImageExecution: true, multiImageExecution: true, videoUpload: true, agentConversation: false, splatExport: true }, stack: readStackConfig() }); return;
    }
    serveStatic(pathname, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

ensureStorage();
server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the existing server or start with a different port, for example: $env:PORT=3101; npm start`);
    process.exit(1);
    return;
  }

  console.error(error);
  process.exit(1);
});
server.listen(PORT, () => { console.log(`GaussianSplattingMaker listening on http://localhost:${PORT}`); });













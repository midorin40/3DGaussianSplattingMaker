const form = document.querySelector("#project-form");
const fileInput = document.querySelector("#file-input");
const createProjectButton = document.querySelector("#create-project");
const startJobButton = document.querySelector("#start-job");
const refreshProjectsButton = document.querySelector("#refresh-projects");
const demoButton = document.querySelector("#demo-button");
const uploadGuidance = document.querySelector("#upload-guidance");
const selectedFilesEl = document.querySelector("#selected-files");
const assetGalleryEl = document.querySelector("#asset-gallery");
const projectSummaryEl = document.querySelector("#project-summary");
const outputPanelEl = document.querySelector("#output-panel");
const progressBarEl = document.querySelector("#progress-bar");
const progressLabelEl = document.querySelector("#progress-label");
const progressValueEl = document.querySelector("#progress-value");
const stageListEl = document.querySelector("#stage-list");
const projectsEl = document.querySelector("#projects");
const jobLogEl = document.querySelector("#job-log");
const selectedFileTemplate = document.querySelector("#selected-file-template");
const assetCardTemplate = document.querySelector("#asset-card-template");
const projectCardTemplate = document.querySelector("#project-card-template");

const state = { files: [], currentProject: null, currentJob: null, currentStack: null, pollTimer: null };
const uiText = { noSelectedFiles: "まだファイルは選択されていません。", noAssets: "アップロードされた画像や動画がここに表示されます。", noOutput: "まだ生成結果はありません。", noProjects: "保存済みプロジェクトはまだありません。", noProject: "まだプロジェクトは作成されていません。", noStages: "ジョブを開始するとステージが表示されます。", noLog: "まだログはありません。" };
const demoProject = { name: "Studio Sneaker GS", mode: "multi", subjectType: "product", qualityPreset: "standard", backgroundMode: "remove", notes: "回転台で撮影した複数画像、または短い動画からローカル GS スタックを実行したい。" };

function getFormPayload() { return Object.fromEntries(new FormData(form).entries()); }
function setFormValues(values) { Object.entries(values).forEach(([key, value]) => { const field = form.elements.namedItem(key); if (field) field.value = value; }); updateGuidance(); }
function updateGuidance() {
  const mode = form.elements.namedItem("mode").value;
  uploadGuidance.textContent = mode === "single"
    ? "単画像モードでは 1 枚の画像だけをアップロードしてください。アップロード後、自動で擬似的な別角度画像を生成して GS パイプラインへ渡します。"
    : "複数画像モードでは、被写体を囲むような複数枚画像、または動画1本をアップロードしてください。動画は自動でフレーム抽出され、完了時に .splat を出力します。";
}
function readableSize(size) { return size < 1024 * 1024 ? `${Math.round(size / 1024)} KB` : `${(size / (size ? 1024 * 1024 : 1)).toFixed(1)} MB`; }
function fileToDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }
function renderSelectedFiles() {
  if (!state.files.length) { selectedFilesEl.className = "selected-files empty-state"; selectedFilesEl.textContent = uiText.noSelectedFiles; return; }
  selectedFilesEl.className = "selected-files"; selectedFilesEl.innerHTML = "";
  state.files.forEach((file) => { const node = selectedFileTemplate.content.firstElementChild.cloneNode(true); node.querySelector(".file-name").textContent = file.name; node.querySelector(".file-meta").textContent = `${file.type || "image"} / ${readableSize(file.size)}`; selectedFilesEl.append(node); });
}
function renderAssets(project) {
  if (!project || !project.assets.length) { assetGalleryEl.className = "asset-gallery empty-state"; assetGalleryEl.textContent = uiText.noAssets; return; }
  assetGalleryEl.className = "asset-gallery"; assetGalleryEl.innerHTML = "";
  project.assets.forEach((asset) => {
    const node = assetCardTemplate.content.firstElementChild.cloneNode(true);
    const media = node.querySelector(".asset-image");
    if ((asset.mimeType || "").startsWith("video/")) {
      const placeholder = document.createElement("div");
      placeholder.className = "asset-video-placeholder";
      placeholder.textContent = "VIDEO";
      media.replaceWith(placeholder);
    } else {
      media.src = asset.previewUrl;
    }
    node.querySelector(".asset-name").textContent = asset.name;
    node.querySelector(".asset-meta").textContent = `${asset.mimeType} / ${readableSize(asset.size)}`;
    assetGalleryEl.append(node);
  });
}
function renderProjectSummary(project) {
  if (!project) { projectSummaryEl.className = "summary empty-state"; projectSummaryEl.textContent = uiText.noProject; return; }
  const stackLine = state.currentStack?.gaussianSplattingRoot ? `ローカルGSルート: ${state.currentStack.gaussianSplattingRoot}` : "ローカルGSルート: 未検出";
  projectSummaryEl.className = "summary";
  projectSummaryEl.innerHTML = `<strong>${project.name}</strong><br />モード: ${project.mode === "single" ? "単画像" : "複数画像"}<br />被写体: ${project.subjectType}<br />品質: ${project.qualityPreset}<br />背景処理: ${project.backgroundMode === "remove" ? "背景除去優先" : "背景保持"}<br />画像数: ${project.assets.length} 枚<br />状態: ${project.status}<br />${stackLine}`;
}
function renderOutput(project) {
  if (!project || !project.output) { outputPanelEl.className = "output-panel empty-state"; outputPanelEl.textContent = uiText.noOutput; return; }
  const output = project.output;
  const splatLink = output.packageInfo.splatUrl ? `<a href="${output.packageInfo.splatUrl}" download class="secondary-button">.splat をダウンロード</a>` : "<span class=\"muted\">.splat はまだ生成されていません。</span>";
  outputPanelEl.className = "output-panel";
  outputPanelEl.innerHTML = `
    <section class="output-box">
      <h3>概要</h3>
      <p>${output.summary}</p>
      <p>品質ランク: <strong>${output.quality}</strong></p>
      <p>エンジン種別: ${output.packageInfo.engine}</p>
    </section>
    <section class="output-box">
      <h3>エクスポート</h3>
      <p>状態: ${output.packageInfo.status}</p>
      <p>動画入力: ${output.packageInfo.usedVideoInput ? "あり" : "なし"}</p>
      <p>抽出フレーム数: ${output.packageInfo.extractedFrameCount ?? 0}</p>
      <p>擬似ビュー生成: ${output.packageInfo.usedSyntheticViews ? "あり" : "なし"}</p>
      <p>擬似ビュー数: ${output.packageInfo.syntheticViewCount ?? 0}</p>
      <p>SPLAT: ${output.packageInfo.splatPath || "未生成"}</p>
      <div>${splatLink}</div>
    </section>
    <section class="output-box">
      <h3>パス</h3>
      <p>Scene: ${output.packageInfo.sceneDir || "-"}</p>
      <p>Model: ${output.packageInfo.modelDir || "-"}</p>
      <p>PLY: ${output.packageInfo.plyPath || "-"}</p>
    </section>
    <section class="output-box">
      <h3>注意事項</h3>
      <p>${(output.warnings.length ? output.warnings : ["追加の注意事項はありません。"]).join("<br />")}</p>
    </section>
    <section class="output-box">
      <h3>プレビュー</h3>
      <div class="output-preview-row">${output.viewer.previewAssets.map((url) => `<img src="${url}" alt="preview" />`).join("")}</div>
    </section>
  `;
}
function renderJob(job) {
  if (!job) { progressBarEl.style.width = "0%"; progressLabelEl.textContent = "未開始"; progressValueEl.textContent = "0%"; stageListEl.className = "stage-list empty-state"; stageListEl.textContent = uiText.noStages; return; }
  progressBarEl.style.width = `${job.progress}%`; progressLabelEl.textContent = job.currentStage; progressValueEl.textContent = `${job.progress}%`; stageListEl.className = "stage-list"; stageListEl.innerHTML = "";
  job.stages.forEach((stage, index) => { const li = document.createElement("li"); li.textContent = `${String(index + 1).padStart(2, "0")} ${stage.label}`; if (job.status === "completed") li.classList.add("done"); else if (index < Math.max(0, Math.floor((job.progress / 100) * job.stages.length) - 1)) li.classList.add("done"); else if (stage.label === job.currentStage) li.classList.add("active"); stageListEl.append(li); });
}
function renderJobLog(job) { if (!job || !job.logTail) { jobLogEl.className = "job-log empty-state"; jobLogEl.textContent = uiText.noLog; return; } jobLogEl.className = "job-log"; jobLogEl.textContent = job.logTail; }
function renderProjects(projects) {
  if (!projects.length) { projectsEl.className = "project-list empty-state"; projectsEl.textContent = uiText.noProjects; return; }
  projectsEl.className = "project-list"; projectsEl.innerHTML = "";
  projects.forEach((project) => { const node = projectCardTemplate.content.firstElementChild.cloneNode(true); node.querySelector(".saved-title").textContent = project.name; node.querySelector(".saved-date").textContent = new Date(project.updatedAt).toLocaleString("ja-JP"); node.querySelector(".saved-meta").textContent = `${project.mode === "single" ? "単画像" : "複数画像"} / ${project.assets.length} 枚 / ${project.status}`; projectsEl.append(node); });
}
async function createProject() {
  const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(getFormPayload()) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Project creation failed");
  state.currentProject = data.project; renderProjectSummary(state.currentProject); renderAssets(state.currentProject); renderOutput(state.currentProject); return state.currentProject;
}
async function uploadFiles(projectId) {
  if (!state.files.length) return;
  const files = await Promise.all(state.files.map(async (file) => ({ name: file.name, size: file.size, type: file.type, dataUrl: await fileToDataUrl(file) })));
  const response = await fetch(`/api/projects/${projectId}/assets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Upload failed");
  state.currentProject = data.project; renderProjectSummary(state.currentProject); renderAssets(state.currentProject);
}
async function startJob() {
  const response = await fetch(`/api/projects/${state.currentProject.id}/generate`, { method: "POST" });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Generation failed");
  state.currentProject = data.project; state.currentJob = data.job; state.currentStack = data.stack || state.currentStack;
  renderProjectSummary(state.currentProject); renderJob(state.currentJob); renderJobLog(state.currentJob); renderOutput(state.currentProject); pollJob();
}
async function fetchProjects() { const response = await fetch("/api/projects"); const data = await response.json(); renderProjects(data.projects || []); }
async function fetchStatus() { const response = await fetch("/api/status"); const data = await response.json(); if (response.ok) { state.currentStack = data.stack || null; renderProjectSummary(state.currentProject); } }
async function refreshCurrentJob() {
  if (!state.currentJob) return;
  const response = await fetch(`/api/jobs/${state.currentJob.id}`); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Job refresh failed");
  state.currentJob = data.job; state.currentProject = data.project; state.currentStack = data.stack || state.currentStack;
  renderProjectSummary(state.currentProject); renderAssets(state.currentProject); renderJob(state.currentJob); renderJobLog(state.currentJob); renderOutput(state.currentProject); await fetchProjects();
  if (["completed", "failed"].includes(state.currentJob.status)) { window.clearTimeout(state.pollTimer); state.pollTimer = null; } else pollJob();
}
function pollJob() { window.clearTimeout(state.pollTimer); state.pollTimer = window.setTimeout(() => { refreshCurrentJob().catch((error) => { console.error(error); pollJob(); }); }, 1500); }
fileInput.addEventListener("change", (event) => { state.files = Array.from(event.target.files || []); renderSelectedFiles(); });
form.elements.namedItem("mode").addEventListener("change", updateGuidance);
createProjectButton.addEventListener("click", async () => { createProjectButton.disabled = true; createProjectButton.textContent = "作成中..."; try { const project = await createProject(); await uploadFiles(project.id); await fetchProjects(); } catch (error) { alert(error.message); } finally { createProjectButton.disabled = false; createProjectButton.textContent = "プロジェクトを作成"; } });
startJobButton.addEventListener("click", async () => { if (!state.currentProject) { alert("先にプロジェクトを作成してください。"); return; } startJobButton.disabled = true; startJobButton.textContent = "開始中..."; try { await startJob(); } catch (error) { alert(error.message); } finally { startJobButton.disabled = false; startJobButton.textContent = "GS 生成を開始"; } });
refreshProjectsButton.addEventListener("click", () => { fetchProjects().catch(console.error); });
demoButton.addEventListener("click", () => { setFormValues(demoProject); });
updateGuidance(); renderSelectedFiles(); renderAssets(null); renderProjectSummary(null); renderOutput(null); renderJob(null); renderJobLog(null); fetchStatus().catch(console.error); fetchProjects().catch(console.error);


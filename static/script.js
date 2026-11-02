const imageInput = document.querySelector("#image-input");
const dropzone = document.querySelector("#dropzone");
const previewWrap = document.querySelector("#preview-wrap");
const previewImage = document.querySelector("#preview-image");
const fileName = document.querySelector("#file-name");
const analyzeButton = document.querySelector("#analyze-button");
const uploadError = document.querySelector("#upload-error");
const reportRegion = document.querySelector("#report-region");
const reportState = document.querySelector("#report-state");
const emptyReport = document.querySelector("#empty-report");
const loadingReport = document.querySelector("#loading-report");
const resultReport = document.querySelector("#result-report");
const API_BASE = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  && window.location.port !== "8000"
  ? "http://127.0.0.1:8000"
  : "";
let selectedFile = null;
let previewUrl = null;

function setError(message = "") {
  uploadError.textContent = message;
  uploadError.hidden = !message;
}

function chooseFile(file) {
  setError();
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setError("Choose a supported image file.");
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    setError("This image is over the 12 MB limit.");
    return;
  }
  selectedFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  previewImage.src = previewUrl;
  fileName.textContent = file.name;
  dropzone.hidden = true;
  previewWrap.hidden = false;
  analyzeButton.disabled = false;
  resultReport.hidden = true;
  emptyReport.hidden = false;
  reportState.textContent = "AWAITING ANALYSIS";
}

dropzone.addEventListener("click", () => imageInput.click());
imageInput.addEventListener("change", () => chooseFile(imageInput.files[0]));
for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("drag-over");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("drag-over");
  });
}
dropzone.addEventListener("drop", (event) => chooseFile(event.dataTransfer.files[0]));
document.querySelector("#remove-image").addEventListener("click", () => {
  selectedFile = null;
  imageInput.value = "";
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  previewImage.removeAttribute("src");
  previewWrap.hidden = true;
  dropzone.hidden = false;
  analyzeButton.disabled = true;
  resultReport.hidden = true;
  emptyReport.hidden = false;
  reportState.textContent = "AWAITING IMAGE";
  setError();
});

analyzeButton.addEventListener("click", async () => {
  if (!selectedFile) return;
  const formData = new FormData();
  formData.append("file", selectedFile);
  analyzeButton.disabled = true;
  reportRegion.setAttribute("aria-busy", "true");
  reportState.textContent = "ANALYZING";
  emptyReport.hidden = true;
  resultReport.hidden = true;
  loadingReport.hidden = false;
  setWorkflowStage(0);
  const stageTimer = window.setTimeout(() => setWorkflowStage(1), 650);
  try {
    const response = await fetch(`${API_BASE}/api/analyze`, { method: "POST", body: formData });
    const responseText = await response.text();
    let payload = null;
    if (responseText.trim()) {
      try {
        payload = JSON.parse(responseText);
      } catch {
        throw new Error(response.ok
          ? "The analysis service returned an unreadable response. Please try again."
          : `The analysis service returned an error (${response.status}). Please try again.`);
      }
    }
    if (!response.ok) {
      throw new Error(payload?.detail || `Analysis failed (${response.status}). Please try again.`);
    }
    if (!payload || typeof payload !== "object") {
      throw new Error("The analysis service returned an empty response. Please try again.");
    }
    setWorkflowStage(2);
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    renderReport(payload);
    reportState.textContent = payload.providers?.length ? `${payload.providers.length} PROVIDER${payload.providers.length === 1 ? "" : "S"}` : "METADATA ONLY";
  } catch (error) {
    emptyReport.hidden = false;
    reportState.textContent = "ANALYSIS FAILED";
    const message = error instanceof TypeError
      ? `Cannot reach the analysis API at ${API_BASE || window.location.origin}. Make sure the VeriPixel-AI backend is running.`
      : error.message;
    setError(message || "Unable to reach the analysis service.");
  } finally {
    window.clearTimeout(stageTimer);
    loadingReport.hidden = true;
    analyzeButton.disabled = false;
    reportRegion.setAttribute("aria-busy", "false");
  }
});

function setWorkflowStage(stage) {
  document.querySelectorAll(".workflow-item").forEach((item, index) => {
    item.classList.toggle("active", index === stage);
    item.classList.toggle("done", index < stage);
    item.querySelector(".workflow-state").textContent = index < stage ? "DONE" : index === stage ? "RUNNING" : "QUEUED";
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function listMarkup(items, className = "signal-list") {
  if (!Array.isArray(items) || items.length === 0) return "<span class=\"detail-value\">None reported</span>";
  return `<ul class="${className}">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderReport(report) {
  const verdictLabels = {
    likely_ai_generated: ["Possible AI-generated image", "ai"],
    likely_camera_captured: ["Possible camera-captured image", "camera"],
    inconclusive: ["Origin remains inconclusive", "inconclusive"],
  };
  const [label, verdictClass] = verdictLabels[report.assessment] || verdictLabels.inconclusive;
  const details = report.details || {};
  const providerNames = { openai: "OpenAI origin assessment", anthropic: "Claude visual review" };
  const providerRows = Object.entries(report.provider_assessments || {}).map(([name, result]) => {
    const providerAssessment = verdictLabels[result.assessment]?.[0] || "Description only";
    const confidence = Number.isFinite(result.confidence) ? ` · ${escapeHtml(result.confidence)}%` : "";
    return `<li>${escapeHtml(providerNames[name] || name)}: ${escapeHtml(providerAssessment)}${confidence}</li>`;
  });
  const providerStatusRows = Object.entries(report.provider_status || {}).map(([name, status]) => {
    return `<li>${escapeHtml(providerNames[name] || name)}: ${escapeHtml(status)}</li>`;
  });
  const metadataRows = Object.entries(report.metadata || {}).flatMap(([key, value]) => {
    if (key === "exif" && value && typeof value === "object") {
      return Object.entries(value).map(([exifKey, exifValue]) => [exifKey, exifValue]);
    }
    return [[key, value]];
  });
  resultReport.innerHTML = `
    <div class="result-top"><div><div class="verdict-label">TENTATIVE ORIGIN ASSESSMENT</div><div class="verdict ${verdictClass}">${escapeHtml(label)}</div></div><div class="confidence"><strong>${escapeHtml(report.confidence)}%</strong><span>CONFIDENCE</span></div></div>
    <p class="result-summary">${escapeHtml(report.summary)}</p>
    <div class="detail-grid">
      <div class="detail-item"><span class="detail-label">Visible subjects</span>${listMarkup(details.subjects, "tag-list")}</div>
      <div class="detail-item"><span class="detail-label">Scene</span><span class="detail-value">${escapeHtml(details.scene || "Not described")}</span></div>
      <div class="detail-item"><span class="detail-label">Visual style</span><span class="detail-value">${escapeHtml(details.visual_style || "Not described")}</span></div>
      <div class="detail-item"><span class="detail-label">Visible text</span>${listMarkup(details.visible_text, "signal-list")}</div>
      <div class="detail-item wide"><span class="detail-label">Observed signals</span>${listMarkup(report.signals)}</div>
      ${providerRows.length ? `<div class="detail-item wide"><span class="detail-label">Provider assessments</span><ul class="signal-list">${providerRows.join("")}</ul></div>` : ""}
      ${providerStatusRows.length ? `<div class="detail-item wide"><span class="detail-label">Provider status</span><ul class="signal-list">${providerStatusRows.join("")}</ul></div>` : ""}
    </div>
    <details class="metadata-details"><summary>FILE DETAILS · ${metadataRows.length} FIELDS</summary><table class="metadata-table"><tbody>${metadataRows.map(([key, value]) => `<tr><td>${escapeHtml(key.replaceAll("_", " "))}</td><td>${escapeHtml(typeof value === "object" ? JSON.stringify(value) : value)}</td></tr>`).join("")}</tbody></table></details>
    <div class="report-warning"><strong>Limits:</strong> ${escapeHtml((report.caveats || []).join(" "))}</div>`;
  resultReport.hidden = false;
}

fetch(`${API_BASE}/api/health`).then((response) => response.json()).then((health) => {
  const status = document.querySelector("#service-status");
  const providerLabels = { openai: "OPENAI", anthropic: "CLAUDE" };
  status.textContent = health.providers?.length
    ? health.providers.map((provider) => providerLabels[provider] || provider.toUpperCase()).join(" + ")
    : "METADATA MODE";
}).catch(() => {
  document.querySelector("#service-status").textContent = "SERVICE OFFLINE";
});

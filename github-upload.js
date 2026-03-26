const SETTINGS_STORAGE_KEY = "thairecheckpump-github-upload-settings-v1";
const TOKEN_STORAGE_KEY = "thairecheckpump-github-upload-token-v1";
const DEFAULT_SETTINGS = {
  owner: "tarutklongzing01",
  repo: "thairecheckpump",
  branch: "main",
  message: "chore(data): update station export files",
  rememberToken: false,
  paths: {
    sheet: "stations-for-google-sheet.csv",
    public: "stations-public.json",
  },
};

const FILES = [
  {
    key: "sheet",
    fileName: "stations-for-google-sheet.csv",
    defaultPath: "stations-for-google-sheet.csv",
  },
  {
    key: "public",
    fileName: "stations-public.json",
    defaultPath: "stations-public.json",
  },
];

const state = {
  busy: false,
  cards: new Map(),
};

document.addEventListener("DOMContentLoaded", initializePage);

function initializePage() {
  state.form = document.querySelector("[data-github-upload-form]");
  state.ownerInput = document.querySelector("[data-upload-owner]");
  state.repoInput = document.querySelector("[data-upload-repo]");
  state.branchInput = document.querySelector("[data-upload-branch]");
  state.messageInput = document.querySelector("[data-upload-message-input]");
  state.tokenInput = document.querySelector("[data-upload-token]");
  state.rememberTokenInput = document.querySelector("[data-upload-remember-token]");
  state.clearTokenButton = document.querySelector("[data-upload-clear-token]");
  state.submitButton = document.querySelector("[data-upload-submit]");
  state.resetButton = document.querySelector("[data-upload-reset]");
  state.messageBox = document.querySelector("[data-upload-message]");
  state.resultBox = document.querySelector("[data-upload-result]");
  state.logList = document.querySelector("[data-upload-log]");
  state.summaryRepo = document.querySelector("[data-upload-summary-repo]");
  state.summaryBranch = document.querySelector("[data-upload-summary-branch]");
  state.summaryShortRepo = document.querySelector("[data-upload-summary-short-repo]");
  state.summaryFiles = document.querySelector("[data-upload-summary-files]");

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });

  const savedSettings = loadSavedSettings();
  applySettings(savedSettings);

  FILES.forEach((file) => {
    const card = document.querySelector(`[data-upload-card="${file.key}"]`);
    if (!card) {
      return;
    }

    const fileInput = card.querySelector("[data-file-input]");
    const pathInput = card.querySelector("[data-file-path]");
    const sourceNode = card.querySelector("[data-file-source]");
    const sizeNode = card.querySelector("[data-file-size]");
    const clearButton = card.querySelector("[data-file-clear]");

    const cardState = {
      ...file,
      card,
      fileInput,
      pathInput,
      sourceNode,
      sizeNode,
      clearButton,
    };

    state.cards.set(file.key, cardState);

    fileInput?.addEventListener("change", () => {
      renderCardState(cardState);
      persistSettings();
    });

    pathInput?.addEventListener("input", () => {
      persistSettings();
      renderSummary();
    });

    clearButton?.addEventListener("click", () => {
      if (fileInput) {
        fileInput.value = "";
      }
      renderCardState(cardState);
      persistSettings();
    });

    renderCardState(cardState);
  });

  state.form?.addEventListener("submit", handleSubmit);
  state.resetButton?.addEventListener("click", handleReset);
  state.clearTokenButton?.addEventListener("click", handleClearRememberedToken);

  [state.ownerInput, state.repoInput, state.branchInput, state.messageInput].forEach((input) => {
    input?.addEventListener("input", () => {
      persistSettings();
      renderSummary();
    });
  });

  state.tokenInput?.addEventListener("input", () => {
    persistRememberedToken();
    renderTokenControls();
  });

  state.rememberTokenInput?.addEventListener("change", () => {
    persistSettings();
    persistRememberedToken();
    renderTokenControls();
  });

  renderSummary();
  renderTokenControls();
  setMessage("");
  appendLog("พร้อมอัปโหลดไฟล์ขึ้น GitHub");
}

function loadSavedSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }

    const parsed = JSON.parse(raw);
    return {
      owner: typeof parsed.owner === "string" ? parsed.owner : DEFAULT_SETTINGS.owner,
      repo: typeof parsed.repo === "string" ? parsed.repo : DEFAULT_SETTINGS.repo,
      branch: typeof parsed.branch === "string" ? parsed.branch : DEFAULT_SETTINGS.branch,
      message: typeof parsed.message === "string" ? parsed.message : DEFAULT_SETTINGS.message,
      rememberToken: parsed.rememberToken === true,
      paths: {
        sheet: typeof parsed?.paths?.sheet === "string" ? parsed.paths.sheet : DEFAULT_SETTINGS.paths.sheet,
        public: typeof parsed?.paths?.public === "string" ? parsed.paths.public : DEFAULT_SETTINGS.paths.public,
      },
    };
  } catch (error) {
    console.warn("Failed to load saved GitHub upload settings", error);
    return DEFAULT_SETTINGS;
  }
}

function applySettings(settings) {
  if (state.ownerInput) {
    state.ownerInput.value = settings.owner;
  }
  if (state.repoInput) {
    state.repoInput.value = settings.repo;
  }
  if (state.branchInput) {
    state.branchInput.value = settings.branch;
  }
  if (state.messageInput) {
    state.messageInput.value = settings.message;
  }
  if (state.rememberTokenInput) {
    state.rememberTokenInput.checked = settings.rememberToken === true;
  }
  if (state.tokenInput) {
    state.tokenInput.value = settings.rememberToken ? loadSavedToken() : "";
  }

  const sheetPathInput = document.querySelector('[data-upload-card="sheet"] [data-file-path]');
  const publicPathInput = document.querySelector('[data-upload-card="public"] [data-file-path]');

  if (sheetPathInput) {
    sheetPathInput.value = settings.paths.sheet;
  }
  if (publicPathInput) {
    publicPathInput.value = settings.paths.public;
  }
}

function persistSettings() {
  const settings = {
    owner: state.ownerInput?.value.trim() || DEFAULT_SETTINGS.owner,
    repo: state.repoInput?.value.trim() || DEFAULT_SETTINGS.repo,
    branch: state.branchInput?.value.trim() || DEFAULT_SETTINGS.branch,
    message: state.messageInput?.value.trim() || DEFAULT_SETTINGS.message,
    rememberToken: state.rememberTokenInput?.checked === true,
    paths: {
      sheet: state.cards.get("sheet")?.pathInput?.value.trim() || DEFAULT_SETTINGS.paths.sheet,
      public: state.cards.get("public")?.pathInput?.value.trim() || DEFAULT_SETTINGS.paths.public,
    },
  };

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Failed to persist GitHub upload settings", error);
  }
}

function loadSavedToken() {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  } catch (error) {
    console.warn("Failed to load saved GitHub token", error);
    return "";
  }
}

function persistRememberedToken() {
  const shouldRemember = state.rememberTokenInput?.checked === true;
  const token = state.tokenInput?.value.trim() || "";

  try {
    if (!shouldRemember || !token) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch (error) {
    console.warn("Failed to persist GitHub token", error);
  }
}

function renderTokenControls() {
  const hasRememberedToken = Boolean(loadSavedToken());
  if (state.clearTokenButton) {
    state.clearTokenButton.hidden = !hasRememberedToken;
  }
}

function renderSummary() {
  const owner = state.ownerInput?.value.trim() || DEFAULT_SETTINGS.owner;
  const repo = state.repoInput?.value.trim() || DEFAULT_SETTINGS.repo;
  const branch = state.branchInput?.value.trim() || DEFAULT_SETTINGS.branch;

  if (state.summaryRepo) {
    state.summaryRepo.textContent = `Repo: ${owner}/${repo}`;
  }
  if (state.summaryBranch) {
    state.summaryBranch.textContent = `Branch: ${branch}`;
  }
  if (state.summaryShortRepo) {
    state.summaryShortRepo.textContent = repo || DEFAULT_SETTINGS.repo;
  }
  if (state.summaryFiles) {
    const sheetPath = state.cards.get("sheet")?.pathInput?.value.trim() || DEFAULT_SETTINGS.paths.sheet;
    const publicPath = state.cards.get("public")?.pathInput?.value.trim() || DEFAULT_SETTINGS.paths.public;
    state.summaryFiles.textContent = `${sheetPath} + ${publicPath}`;
  }
}

function renderCardState(cardState) {
  if (!cardState?.sourceNode || !cardState?.sizeNode) {
    return;
  }

  const selectedFile = cardState.fileInput?.files?.[0] || null;
  if (selectedFile) {
    cardState.sourceNode.textContent = `Source: local file ${selectedFile.name}`;
    cardState.sizeNode.textContent = `Size: ${formatBytes(selectedFile.size)}`;
    if (cardState.clearButton) {
      cardState.clearButton.hidden = false;
    }
    return;
  }

  cardState.sourceNode.textContent = `Source: ${cardState.fileName} from current project if reachable`;
  cardState.sizeNode.textContent = "Size: จะตรวจตอนกดอัปโหลด";
  if (cardState.clearButton) {
    cardState.clearButton.hidden = true;
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (state.busy) {
    return;
  }

  const owner = state.ownerInput?.value.trim() || "";
  const repo = state.repoInput?.value.trim() || "";
  const branch = state.branchInput?.value.trim() || "";
  const message = state.messageInput?.value.trim() || DEFAULT_SETTINGS.message;
  const token = state.tokenInput?.value.trim() || "";

  if (!owner || !repo || !branch) {
    setMessage("กรอก owner, repo และ branch ให้ครบก่อน");
    return;
  }

  if (!token) {
    setMessage("ใส่ GitHub token ก่อนอัปโหลด");
    return;
  }

  state.busy = true;
  setBusyState(true);
  setMessage("กำลังเตรียมไฟล์และส่งขึ้น GitHub...");
  state.resultBox.textContent = "";
  clearLog();

  try {
    appendLog(`Preparing files for ${owner}/${repo}@${branch}`);

    const uploadFiles = await Promise.all(FILES.map((file) => resolveUploadFile(state.cards.get(file.key))));
    uploadFiles.forEach((file) => {
      appendLog(`Ready ${file.path} from ${file.sourceLabel} (${formatBytes(file.size)})`);
    });

    const result = await createCommit({
      owner,
      repo,
      branch,
      message,
      token,
      files: uploadFiles,
    });

    setMessage(`อัปโหลดสำเร็จ: commit ${shortSha(result.commitSha)}`);
    state.resultBox.innerHTML = [
      `<a href="${escapeHtml(result.commitUrl)}" target="_blank" rel="noreferrer">เปิด commit ${escapeHtml(shortSha(result.commitSha))}</a>`,
      `<span class="muted">บน ${escapeHtml(owner)}/${escapeHtml(repo)} @ ${escapeHtml(branch)}</span>`,
    ].join(" ");
    appendLog(`Branch updated to ${shortSha(result.commitSha)}`, "success");
  } catch (error) {
    const messageText = normalizeErrorMessage(error);
    setMessage(`อัปโหลดไม่สำเร็จ: ${messageText}`, true);
    appendLog(messageText, "error");
  } finally {
    state.busy = false;
    setBusyState(false);
  }
}

function handleReset() {
  if (state.tokenInput) {
    state.tokenInput.value = "";
  }
  if (state.rememberTokenInput) {
    state.rememberTokenInput.checked = false;
  }

  state.cards.forEach((cardState) => {
    if (cardState.fileInput) {
      cardState.fileInput.value = "";
    }
  });

  window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  applySettings(DEFAULT_SETTINGS);
  state.cards.forEach((cardState) => renderCardState(cardState));
  renderSummary();
  renderTokenControls();
  setMessage("คืนค่า default แล้ว");
  state.resultBox.textContent = "";
  clearLog();
  appendLog("Settings reset to defaults");
}

function handleClearRememberedToken() {
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear saved GitHub token", error);
  }

  if (state.tokenInput) {
    state.tokenInput.value = "";
  }
  if (state.rememberTokenInput) {
    state.rememberTokenInput.checked = false;
  }

  persistSettings();
  renderTokenControls();
  setMessage("ล้าง token ที่จำไว้แล้ว");
}

async function resolveUploadFile(cardState) {
  if (!cardState) {
    throw new Error("Missing upload card configuration");
  }

  const targetPath = cardState.pathInput?.value.trim() || cardState.defaultPath;
  if (!targetPath) {
    throw new Error(`Target path ของ ${cardState.fileName} ว่างอยู่`);
  }

  const selectedFile = cardState.fileInput?.files?.[0] || null;
  let blob = selectedFile;
  let sourceLabel = selectedFile ? `local file ${selectedFile.name}` : cardState.fileName;

  if (!blob) {
    const sourceUrl = new URL(cardState.fileName, window.location.href);
    sourceUrl.searchParams.set("ts", String(Date.now()));

    let response;
    try {
      response = await fetch(sourceUrl.toString(), {
        cache: "no-store",
      });
    } catch (error) {
      throw new Error(`อ่าน ${cardState.fileName} จากหน้าเว็บไม่สำเร็จ กรุณาเลือกไฟล์จากเครื่องแทน`);
    }

    if (!response.ok) {
      throw new Error(`ไม่พบ ${cardState.fileName} บนหน้าเว็บนี้ (${response.status}) กรุณาเลือกไฟล์จากเครื่องแทน`);
    }

    blob = await response.blob();
    sourceLabel = `project file ${cardState.fileName}`;
  }

  const content = await blobToBase64(blob);

  return {
    path: targetPath,
    content,
    size: blob.size,
    sourceLabel,
  };
}

async function createCommit({ owner, repo, branch, message, token, files }) {
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const refPath = encodeURIComponent(branch);

  appendLog("Fetching current branch head");
  const refData = await githubRequest(`${apiBase}/git/ref/heads/${refPath}`, token);
  const parentCommitSha = refData?.object?.sha;
  if (!parentCommitSha) {
    throw new Error(`หา head ของ branch ${branch} ไม่เจอ`);
  }

  appendLog(`Current head ${shortSha(parentCommitSha)}`);

  const parentCommit = await githubRequest(`${apiBase}/git/commits/${parentCommitSha}`, token);
  const baseTreeSha = parentCommit?.tree?.sha;
  if (!baseTreeSha) {
    throw new Error("หา base tree ของ commit ล่าสุดไม่เจอ");
  }

  appendLog(`Base tree ${shortSha(baseTreeSha)}`);

  const treeItems = await Promise.all(
    files.map(async (file) => {
      appendLog(`Creating blob for ${file.path}`);
      const blob = await githubRequest(`${apiBase}/git/blobs`, token, {
        method: "POST",
        body: JSON.stringify({
          content: file.content,
          encoding: "base64",
        }),
      });

      return {
        path: file.path,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      };
    }),
  );

  appendLog("Creating tree");
  const tree = await githubRequest(`${apiBase}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeItems,
    }),
  });

  appendLog("Creating commit");
  const commit = await githubRequest(`${apiBase}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [parentCommitSha],
    }),
  });

  appendLog(`Updating branch ${branch}`);
  await githubRequest(`${apiBase}/git/refs/heads/${refPath}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      sha: commit.sha,
      force: false,
    }),
  });

  return {
    commitSha: commit.sha,
    commitUrl: `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
  };
}

async function githubRequest(url, token, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: options.body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(formatGitHubError(response.status, payload));
  }

  return payload;
}

function formatGitHubError(status, payload) {
  const baseMessage = typeof payload?.message === "string" && payload.message.trim() ? payload.message.trim() : `GitHub API error (${status})`;
  const details = Array.isArray(payload?.errors)
    ? payload.errors
        .map((entry) => {
          if (typeof entry === "string") {
            return entry;
          }
          if (entry?.message) {
            return entry.message;
          }
          const parts = [entry?.resource, entry?.field, entry?.code].filter(Boolean);
          return parts.join(" ");
        })
        .filter(Boolean)
        .join("; ")
    : "";

  if (status === 409) {
    return `${baseMessage}. branch มีการเปลี่ยนล่าสุดระหว่างอัปโหลด ลองใหม่อีกครั้ง`;
  }

  return details ? `${baseMessage}: ${details}` : baseMessage;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => {
      reject(reader.error || new Error("อ่านไฟล์ไม่สำเร็จ"));
    };
    reader.readAsDataURL(blob);
  });
}

function setBusyState(busy) {
  if (state.submitButton) {
    state.submitButton.disabled = busy;
    state.submitButton.textContent = busy ? "กำลังอัปโหลด..." : "อัปทั้ง 2 ไฟล์ขึ้น GitHub";
  }
  if (state.resetButton) {
    state.resetButton.disabled = busy;
  }

  state.cards.forEach((cardState) => {
    if (cardState.fileInput) {
      cardState.fileInput.disabled = busy;
    }
    if (cardState.pathInput) {
      cardState.pathInput.disabled = busy;
    }
    if (cardState.clearButton) {
      cardState.clearButton.disabled = busy;
    }
  });

  [state.ownerInput, state.repoInput, state.branchInput, state.messageInput, state.tokenInput].forEach((input) => {
    if (input) {
      input.disabled = busy;
    }
  });
  if (state.rememberTokenInput) {
    state.rememberTokenInput.disabled = busy;
  }
  if (state.clearTokenButton) {
    state.clearTokenButton.disabled = busy;
  }
}

function setMessage(message, isError = false) {
  if (!state.messageBox) {
    return;
  }
  state.messageBox.textContent = message;
  state.messageBox.style.color = isError ? "#ffd8d8" : "#ffe0cc";
}

function appendLog(message, tone = "info") {
  if (!state.logList) {
    return;
  }
  const item = document.createElement("li");
  item.textContent = `${formatTime(new Date())} ${message}`;
  if (tone === "error") {
    item.classList.add("is-error");
  }
  if (tone === "success") {
    item.classList.add("is-success");
  }
  state.logList.prepend(item);
}

function clearLog() {
  if (state.logList) {
    state.logList.innerHTML = "";
  }
}

function formatTime(date) {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / 1024 ** exponent;
  return `${amount.toFixed(amount >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function shortSha(value) {
  return String(value || "").slice(0, 7);
}

function normalizeErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const $ = (id) => document.getElementById(id);

let pageText = "";

const BACKEND_STORAGE_KEY = "pagmind_backend";
let backendUrl = "";
let useBackend = false;

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (r) => resolve(r));
  });
}

// --- Listen for page changes ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "PAGE_CHANGED") {
    resetChat();
    sendResponse({ ok: true });
  }
  return true;
});

function resetChat() {
  pageText = "";
  $("messages").innerHTML = "";
  $("pageDot").className = "page-dot";
  $("pageIndicator").textContent = "New page detected, reading...";
  readPage();
}

// --- Settings ---

function openSettings() {
  $("settingsPanel").classList.remove("hidden");
  $("settingsOverlay").classList.remove("hidden");
}

function closeSettings() {
  $("settingsPanel").classList.add("hidden");
  $("settingsOverlay").classList.add("hidden");
}

$("openSettings").addEventListener("click", openSettings);
$("closeSettings").addEventListener("click", closeSettings);
$("settingsOverlay").addEventListener("click", closeSettings);

async function loadSettings() {
  const defaults = {
    apiKey: "",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
  };
  const s = await chrome.storage.local.get(["apiKey", "baseUrl", "model"]);
  const apiKey = s.apiKey || defaults.apiKey;
  const baseUrl = s.baseUrl || defaults.baseUrl;
  const model = s.model || defaults.model;
  $("apiKey").value = apiKey;
  $("baseUrl").value = baseUrl;
  $("model").value = model;

  // Backend settings
  const bk = await chrome.storage.local.get([BACKEND_STORAGE_KEY]);
  const cfg = bk[BACKEND_STORAGE_KEY] || { url: "", enabled: false };
  $("backendUrl").value = cfg.url;
  $("useBackend").checked = cfg.enabled;
  backendUrl = cfg.url;
  useBackend = cfg.enabled;
}

$("saveSettings").addEventListener("click", async () => {
  await chrome.storage.local.set({
    apiKey: $("apiKey").value.trim(),
    baseUrl: $("baseUrl").value.trim(),
    model: $("model").value.trim(),
  });

  const cfg = {
    url: $("backendUrl").value.trim(),
    enabled: $("useBackend").checked,
  };
  await chrome.storage.local.set({ [BACKEND_STORAGE_KEY]: cfg });
  backendUrl = cfg.url;
  useBackend = cfg.enabled;

  $("settingsStatus").textContent = "Saved.";
  closeSettings();
});

// --- Backend API helpers ---

async function backendFetch(path, options = {}) {
  const url = `${backendUrl.replace(/\/$/, "")}/api${path}`;
  const res = await send({ type: "BACKEND_FETCH", url, options });
  if (!res.ok) throw new Error(res.error);
  return res;
}

// --- Read page ---

async function readPage() {
  const res = await send({ type: "READ_PAGE" });
  if (!res.ok) {
    $("pageDot").className = "page-dot error";
    $("pageIndicator").textContent = res.error;
    return null;
  }
  pageText = res.text;
  $("pageDot").className = "page-dot loaded";
  $("pageIndicator").textContent = `${res.text.length} chars`;
  return res.text;
}

$("refreshBtn").addEventListener("click", async () => {
  $("pageDot").className = "page-dot";
  $("pageIndicator").textContent = "Reading...";
  await readPage();
});

// --- Messages ---

function isNearBottom() {
  return $("messages").scrollHeight - $("messages").scrollTop - $("messages").clientHeight < 80;
}

function addMessage(role, content, writeText) {
  const el = document.createElement("div");
  el.className = `message ${role}`;
  el.textContent = content;
  const snap = isNearBottom();
  $("messages").appendChild(el);

  if (role === "assistant" && writeText) {
    const btn = document.createElement("button");
    btn.className = "write-btn";
    btn.textContent = "Write to page";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Writing...";
      const r = await send({ type: "WRITE_TO_PAGE", text: writeText });
      if (r.ok) {
        btn.textContent = "✓ Written";
        btn.className = "write-btn done";
      } else {
        btn.textContent = "✗ " + r.error;
        btn.className = "write-btn error";
      }
    });
    el.appendChild(btn);
  }

  if (snap) $("messages").scrollTop = $("messages").scrollHeight;
}

function removeLoading() {
  const el = $("messages").querySelector(".message.loading");
  if (el) el.remove();
}

function showLoading() {
  const el = document.createElement("div");
  el.className = "message loading";
  el.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
  $("messages").appendChild(el);
  $("messages").scrollTop = $("messages").scrollHeight;
}

// --- Send ---

async function handleSend() {
  const text = $("input").value.trim();
  if (!text) return;

  if (!useBackend) {
    const s = await chrome.storage.local.get(["apiKey", "baseUrl", "model"]);
    if (!s.apiKey) {
      addMessage("error", "Set your API key in Settings first.");
      openSettings();
      return;
    }
  }

  $("input").value = "";
  $("input").style.height = "auto";
  $("sendBtn").disabled = true;

  addMessage("user", text);

  if (!pageText) {
    addMessage("system", "Reading page...");
    await readPage();
  }

  showLoading();

  if (!pageText) pageText = "";

  if (useBackend) {
    await handleSendBackend(text);
  } else {
    await handleSendDirect(text);
  }

  removeLoading();
  $("sendBtn").disabled = false;
}

async function handleSendDirect(text) {
  const s = await chrome.storage.local.get(["apiKey", "baseUrl", "model"]);
  const res = await send({
    type: "ASK_AI",
    messages: [
      { role: "system", content: `You are a helpful assistant. Answer the user's question based on the page content below.\n\nPAGE CONTENT:\n${pageText}` },
      { role: "user", content: text },
    ],
    apiKey: s.apiKey,
    baseUrl: s.baseUrl,
    model: s.model,
  });
  if (!res.ok) {
    addMessage("error", res.error);
  } else {
    addMessage("assistant", res.text, res.text);
  }
}

async function handleSendBackend(text) {
  try {
    const data = await backendFetch("/proxy/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [
          { role: "system", content: `You are a helpful assistant. Answer the user's question based on the page content below.\n\nPAGE CONTENT:\n${pageText}` },
          { role: "user", content: text },
        ],
      }),
    });
    addMessage("assistant", data.text, data.text);
  } catch (e) {
    addMessage("error", e.message);
  }
}

$("sendBtn").addEventListener("click", handleSend);

$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

$("input").addEventListener("input", () => {
  $("sendBtn").disabled = !$("input").value.trim();
  $("input").style.height = "auto";
  $("input").style.height = Math.min($("input").scrollHeight, 120) + "px";
});

// --- Init ---

async function init() {
  await loadSettings();
  $("pageIndicator").textContent = "Reading...";
  await readPage();
}

init();

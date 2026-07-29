const $ = (id) => document.getElementById(id);

let pageText = "";
let currentTabId = null;
let currentHostname = "";
let ready = false;

const MAX_CONTEXT_CHARS = 96000;
const MAX_HISTORY_MSGS = 20;
const BACKEND_STORAGE_KEY = "pagmind_backend";
const PROFILE_KEY = "owner_profile";

let backendUrl = "";
let useBackend = false;

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (r) => {
      if (chrome.runtime.lastError) resolve({ ok: false });
      else resolve(r);
    });
  });
}

// --- Profile auto-learning ---

async function getProfile() {
  const data = await chrome.storage.local.get(PROFILE_KEY);
  return data[PROFILE_KEY] || {
    name: "", title: "", skills: [], cv: "", tone: "",
    frequentSites: {}, totalQuestions: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

async function saveProfile(p) {
  p.updatedAt = new Date().toISOString();
  await chrome.storage.local.set({ [PROFILE_KEY]: p });
}

function extractName(text) {
  const patterns = [
    /(?:^|\n)\s*name\s*[:：]\s*(.+)/i,
    /my\s+name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim().slice(0, 80);
  }
  const emailName = text.match(/([A-Z][a-z]+)\s+([A-Z][a-z]+)\s*@/);
  if (emailName) return emailName[1] + " " + emailName[2];
  return null;
}

function extractTitle(text) {
  const patterns = [
    /(?:^|\n)\s*(?:title|role|position)\s*[:：]\s*(.+)/i,
    /\b(Software Engineer|Developer|Full.?Stack|Frontend|Backend|DevOps|Data Scientist|ML Engineer|Architect|Designer|Product Manager|Engineer)\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1] || m[0];
  }
  return null;
}

const COMMON_SKILLS = [
  "React", "Node", "Python", "TypeScript", "JavaScript", "Go", "Rust",
  "AWS", "Docker", "Kubernetes", "PostgreSQL", "MongoDB", "Redis",
  "GraphQL", "REST", "NestJS", "Express", "Next.js", "Vue", "Angular",
  "TensorFlow", "PyTorch", "LangChain", "OpenAI", "LLM", "AI",
  "Machine Learning", "Deep Learning", "SQL", "NoSQL", "Git",
];

function extractSkills(text) {
  const found = [];
  for (const skill of COMMON_SKILLS) {
    const re = new RegExp("\\b" + skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
    if (re.test(text) && !found.includes(skill)) found.push(skill);
  }
  return found;
}

function isResumeLike(text) {
  const markers = ["experience", "education", "skills", "work history", "employment",
    "summary", "objective", "projects", "certifications", "languages"];
  let count = 0;
  for (const m of markers) {
    if (new RegExp("\\b" + m + "\\b", "i").test(text)) count++;
  }
  return count >= 3;
}

async function learnFromPage(text, hostname) {
  if (!text || text.length < 50) return;
  const profile = await getProfile();

  const name = extractName(text);
  const title = extractTitle(text);
  const skills = extractSkills(text);
  const isCV = isResumeLike(text);
  let changed = false;

  if (name && !profile.name) { profile.name = name; changed = true; }
  if (title && !profile.title) { profile.title = title; changed = true; }
  if (skills.length > 0) {
    const before = profile.skills.length;
    profile.skills = [...new Set([...profile.skills, ...skills])];
    if (profile.skills.length !== before) changed = true;
  }
  if (isCV && text.length > profile.cv.length) {
    profile.cv = text.slice(0, 10000);
    changed = true;
  }

  if (hostname) {
    if (!profile.frequentSites[hostname]) {
      profile.frequentSites[hostname] = { count: 0, tasks: [] };
    }
    profile.frequentSites[hostname].count++;
    changed = true;
  }

  if (changed) await saveProfile(profile);
}

function detectTone(text) {
  const lower = text.toLowerCase();
  if (/\b(professional|formal|business)\b/.test(lower)) return "professional";
  if (/\b(casual|friendly|informal|chatty)\b/.test(lower)) return "casual";
  if (/\b(creative|fun|playful|humorous)\b/.test(lower)) return "creative";
  if (/\b(brief|short|concise|quick)\b/.test(lower)) return "concise";
  if (/\b(detailed|elaborate|thorough|in.?depth)\b/.test(lower)) return "detailed";
  return null;
}

function inferTask(text) {
  if (/\b(cover letter|proposal|gig|hire|freelance|bid)\b/i.test(text)) return "freelance proposals";
  if (/\b(linkedin|connection|network|recommend)\b/i.test(text)) return "networking";
  if (/\b(apply|application|resume|job|interview|hiring)\b/i.test(text)) return "job applications";
  if (/\b(email|reply|message|outreach|inmail)\b/i.test(text)) return "outreach messages";
  if (/\b(rewrite|improve|edit|revise|polish)\b/i.test(text)) return "content editing";
  if (/\b(summarize|summary|tl;dr|condense)\b/i.test(text)) return "summarization";
  return null;
}

async function learnFromPrompt(text, hostname) {
  if (!text) return;
  const profile = await getProfile();
  let changed = false;

  if (hostname && profile.frequentSites[hostname]) {
    const site = profile.frequentSites[hostname];
    const task = inferTask(text);
    if (task && !site.tasks.includes(task)) {
      site.tasks.push(task);
      if (site.tasks.length > 5) site.tasks.shift();
      changed = true;
    }
  }

  if (hostname && !profile.frequentSites[hostname]) {
    profile.frequentSites[hostname] = { count: 1, tasks: [] };
    const task = inferTask(text);
    if (task) profile.frequentSites[hostname].tasks.push(task);
    changed = true;
  }

  const tone = detectTone(text);
  if (tone && !profile.tone) { profile.tone = tone; changed = true; }

  profile.totalQuestions = (profile.totalQuestions || 0) + 1;
  changed = true;

  if (changed) await saveProfile(profile);
}

function buildProfileContext(profile, hostname) {
  const parts = [];
  if (profile.name) parts.push(`- Name: ${profile.name}`);
  if (profile.title) parts.push(`- Role: ${profile.title}`);
  if (profile.skills?.length) parts.push(`- Skills: ${profile.skills.join(", ")}`);
  if (profile.tone) parts.push(`- Preferred tone: ${profile.tone}`);

  if (hostname && profile.frequentSites?.[hostname]) {
    const site = profile.frequentSites[hostname];
    parts.push(`- Current site: ${hostname} (visited ${site.count} times)`);
    if (site.tasks?.length) {
      parts.push(`- Typical tasks on this site: ${site.tasks.join(", ")}`);
    }
  }

  if (profile.totalQuestions > 5) {
    parts.push(`- Extension usage: ${profile.totalQuestions} questions asked total`);
  }

  return parts.length > 0 ? "\n\nUSER PROFILE:\n" + parts.join("\n") : "";
}

// --- Session ---

function serializeMessages() {
  return Array.from($("messages").children)
    .filter((el) => !el.classList.contains("loading") && !el.classList.contains("welcome"))
    .map((el) => ({
      role: el.classList.contains("user") ? "user"
        : el.classList.contains("assistant") ? "assistant"
        : el.classList.contains("error") ? "error" : "system",
      content: el.textContent,
    }));
}

function getIndicatorState() {
  return {
    text: $("pageIndicator").textContent,
    dotClass: $("pageDot").className,
  };
}

function applyIndicatorState(state) {
  $("pageIndicator").textContent = state.text;
  $("pageDot").className = state.dotClass;
}

function updateTabIdDisplay() {
  $("tabIdDisplay").textContent = currentTabId ? `tab:${currentTabId}` : "";
}

async function saveSession() {
  if (!currentTabId) return;
  await send({
    type: "SAVE_SESSION",
    tabId: currentTabId,
    session: { pageText, messages: serializeMessages(), indicator: getIndicatorState() },
  });
}

function renderMessages(messages) {
  $("messages").innerHTML = "";
  const wel = document.createElement("div");
  wel.className = "welcome";
  wel.innerHTML = "<p>Open this panel on any page<br/>and ask me anything about it.</p>";
  $("messages").appendChild(wel);
  for (const m of messages || []) {
    const el = document.createElement("div");
    el.className = `message ${m.role}`;
    el.textContent = m.content;
    $("messages").appendChild(el);
  }
}

async function loadSession() {
  if (!currentTabId) return false;
  const res = await send({ type: "GET_SESSION", tabId: currentTabId });
  const s = res.session;
  if (!s) return false;
  pageText = s.pageText || "";
  renderMessages(s.messages);
  if (s.indicator) applyIndicatorState(s.indicator);
  if ($("messages").children.length > 1) {
    $("messages").scrollTop = $("messages").scrollHeight;
  }
  return true;
}

async function readAndSave() {
  $("pageDot").className = "page-dot";
  $("pageIndicator").textContent = "Reading...";
  await readPage();
  await saveSession();
}

// --- Build AI context with profile + conversation memory ---

async function buildChatMessages(userText, prevMessages) {
  const profile = await getProfile();
  const profileCtx = buildProfileContext(profile, currentHostname);

  const systemContent = `You are a helpful assistant. Answer the user's question based on the page content below.${profileCtx}\n\nPAGE CONTENT:\n${pageText || "(none)"}`;

  const history = (prevMessages || [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-MAX_HISTORY_MSGS * 2);

  const budget = MAX_CONTEXT_CHARS - systemContent.length - userText.length - 2000;
  const trimmed = [];
  let used = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const next = used + history[i].content.length;
    if (next > budget && trimmed.length > 0) break;
    trimmed.unshift(history[i]);
    used += history[i].content.length;
  }

  return [
    { role: "system", content: systemContent },
    ...trimmed,
    { role: "user", content: userText },
  ];
}

// --- Tab switch handler ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "tabChanged") return true;
  if (msg.url) {
    try { currentHostname = new URL(msg.url).hostname; } catch (_) {}
  }
  sendResponse({ ok: true });
  if (!ready) return true;

  if (msg.urlChanged && msg.tabId === currentTabId) {
    send({ type: "DELETE_SESSION", tabId: currentTabId });
    $("messages").innerHTML = "";
    pageText = "";
    updateTabIdDisplay();
    readAndSave();
    return true;
  }

  if (msg.tabId === currentTabId) return true;

  saveSession().then(() => {
    currentTabId = msg.tabId;
    updateTabIdDisplay();
    loadSession().then((found) => {
      if (!found) readAndSave();
    });
  });
  return true;
});

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
  const s = await chrome.storage.local.get(["apiKey", "baseUrl", "model"]);
  $("apiKey").value = s.apiKey || "";
  $("baseUrl").value = s.baseUrl || "https://api.openai.com/v1/chat/completions";
  $("model").value = s.model || "gpt-4o-mini";

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
  const cfg = { url: $("backendUrl").value.trim(), enabled: $("useBackend").checked };
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

  // Auto-learn from page content
  learnFromPage(pageText, currentHostname);

  return res.text;
}

$("refreshBtn").addEventListener("click", readAndSave);

// --- Messages ---

function isNearBottom() {
  return $("messages").scrollHeight - $("messages").scrollTop - $("messages").clientHeight < 80;
}

function addMessage(role, content, writeText) {
  const wel = $("messages").querySelector(".welcome");
  if (wel) wel.remove();

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

// --- Send with conversation memory + auto-learn ---

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

  // Learn from prompt before anything else
  learnFromPrompt(text, currentHostname);

  // Get previous messages for context
  const res = await send({ type: "GET_SESSION", tabId: currentTabId });
  const prevMessages = (res.session?.messages || []);

  if (!pageText) {
    addMessage("system", "Reading page...");
    await readPage();
  }

  $("input").value = "";
  $("input").style.height = "auto";
  $("sendBtn").disabled = true;

  addMessage("user", text);
  showLoading();

  if (!pageText) pageText = "";
  const context = await buildChatMessages(text, prevMessages);

  if (useBackend) {
    await handleSendBackend(context);
  } else {
    await handleSendDirect(context);
  }

  removeLoading();
  $("sendBtn").disabled = false;
  await saveSession();
}

async function handleSendDirect(context) {
  const s = await chrome.storage.local.get(["apiKey", "baseUrl", "model"]);
  const res = await send({
    type: "ASK_AI", messages: context,
    apiKey: s.apiKey, baseUrl: s.baseUrl, model: s.model,
  });
  if (!res.ok) addMessage("error", res.error);
  else addMessage("assistant", res.text, res.text);
}

async function handleSendBackend(context) {
  try {
    const data = await backendFetch("/proxy/chat", {
      method: "POST", body: JSON.stringify({ messages: context }),
    });
    addMessage("assistant", data.text, data.text);
  } catch (e) {
    addMessage("error", e.message);
  }
}

$("sendBtn").addEventListener("click", handleSend);
$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
});
$("input").addEventListener("input", () => {
  $("sendBtn").disabled = !$("input").value.trim();
  $("input").style.height = "auto";
  $("input").style.height = Math.min($("input").scrollHeight, 120) + "px";
});

// --- Init ---

async function init() {
  await loadSettings();
  const tab = await send({ type: "GET_ACTIVE_TAB" });
  currentTabId = tab.tabId;
  if (tab.url) {
    try { currentHostname = new URL(tab.url).hostname; } catch (_) {}
  }
  updateTabIdDisplay();

  const found = await loadSession();
  if (!found) {
    await readAndSave();
  } else {
    // Even if session loaded, learn from the page text
    learnFromPage(pageText, currentHostname);
  }
  ready = true;
}

init();

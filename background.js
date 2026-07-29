const SESSION_PREFIX = "session_";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

// --- Session helpers (chrome.storage.session) ---

function sessionKey(tabId) {
  return SESSION_PREFIX + tabId;
}

async function getSession(tabId) {
  const key = sessionKey(tabId);
  const data = await chrome.storage.session.get(key);
  return data[key] || null;
}

async function setSession(tabId, session) {
  await chrome.storage.session.set({ [sessionKey(tabId)]: session });
}

async function deleteSession(tabId) {
  await chrome.storage.session.remove(sessionKey(tabId));
}

// --- Detect tab switches & URL changes ---

chrome.tabs.onActivated.addListener(({ tabId }) => {
  notifySidePanel(tabId, false);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]?.id === tabId) notifySidePanel(tabId, true);
    });
  }
});

function notifySidePanel(tabId, urlChanged) {
  chrome.runtime.sendMessage({ type: "tabChanged", tabId, urlChanged }).catch(() => {});
}

// --- Message handling ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg)
    .then((r) => sendResponse({ ok: true, ...r }))
    .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
  return true;
});

async function handleMessage(msg) {
  switch (msg.type) {
    case "READ_PAGE":
      return readActivePage();
    case "ASK_AI":
      return askAI(msg.messages, msg.apiKey, msg.baseUrl, msg.model);
    case "WRITE_TO_PAGE":
      return sendToActiveTab({ type: "WRITE_TO_PAGE", text: msg.text });
    case "BACKEND_FETCH":
      return backendFetch(msg.url, msg.options);
    case "GET_SESSION":
      return { session: await getSession(msg.tabId) };
    case "SAVE_SESSION":
      await setSession(msg.tabId, msg.session);
      return { ok: true };
    case "DELETE_SESSION":
      await deleteSession(msg.tabId);
      return { ok: true };
    case "GET_ACTIVE_TAB": {
      const tab = await getActiveTab();
      return { tabId: tab.id };
    }
    default:
      throw new Error("Unknown type: " + msg.type);
  }
}

async function backendFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backend error (${res.status}): ${text}`);
  }
  return res.json();
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");
  return tab;
}

async function readActivePage() {
  const tab = await getActiveTab();
  try {
    const msg = await sendToTab(tab.id, { type: "READ_PAGE" });
    return { text: msg.text };
  } catch (_) {}
  const result = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
    world: "ISOLATED",
  });
  const text = result?.[0]?.result;
  if (!text && text !== "") throw new Error("Could not read page content.");
  return { text };
}

async function sendToActiveTab(msg) {
  const tab = await getActiveTab();
  return sendToTab(tab.id, msg);
}

function sendToTab(tabId, msg) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, (r) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (!r?.ok) reject(new Error(r?.error || "No response"));
      else resolve(r);
    });
  });
}

async function askAI(messages, apiKey, baseUrl, model) {
  if (!apiKey) throw new Error("No API key set.");
  const url = baseUrl || "https://api.openai.com/v1/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || "gpt-4o-mini", messages, temperature: 0.3 }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API error (${res.status}): ${t}`);
  }
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content || "" };
}

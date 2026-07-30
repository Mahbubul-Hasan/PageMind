import type { BackgroundRequest, BackgroundResponse, TabSession, TabSessionData } from '../types';
import { STORAGE_KEYS } from '../types';

function notifySidePanel(tabId: number, urlChanged: boolean, url?: string): void {
  chrome.runtime.sendMessage({ type: 'tabChanged', tabId, urlChanged, url }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel!.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then((tab) => {
    notifySidePanel(tabId, false, tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]?.id === tabId) notifySidePanel(tabId, true, tab.url);
    });
  }
});

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');
  return tab;
}

function sendToTab(tabId: number, msg: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, (r) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (!r?.ok) reject(new Error(r?.error as string ?? 'No response'));
      else resolve(r);
    });
  });
}

async function sendToTabWithInject(
  tabId: number,
  msg: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    return await sendToTab(tabId, msg);
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
      world: 'ISOLATED',
    });
    await new Promise((r) => setTimeout(r, 100));
    return await sendToTab(tabId, msg);
  }
}

// --- Session store ---

function sessionsKey(): string {
  return STORAGE_KEYS.SESSIONS;
}

async function getTabData(tabId: number): Promise<TabSessionData> {
  const data = await chrome.storage.session.get(sessionsKey());
  const all = (data[sessionsKey()] ?? {}) as Record<string, TabSessionData>;
  return all[tabId] ?? { activeIdx: 0, sessions: [] };
}

async function setTabData(tabId: number, d: TabSessionData): Promise<void> {
  const data = await chrome.storage.session.get(sessionsKey());
  const all = (data[sessionsKey()] ?? {}) as Record<string, TabSessionData>;
  all[tabId] = d;
  await chrome.storage.session.set({ [sessionsKey()]: all });
}

function makeSession(messages?: TabSession['messages']): TabSession {
  return {
    id: crypto.randomUUID().slice(0, 8),
    label: 'Chat ' + Date.now().toString(36).slice(-4),
    createdAt: Date.now(),
    messages: messages ?? [],
    pageText: '',
    pageStructure: '',
    indicator: { text: 'Not read', dotClass: 'page-dot' },
  };
}

async function handleSessions(tabId: number): Promise<TabSessionData> {
  const d = await getTabData(tabId);
  if (d.sessions.length === 0) {
    d.sessions = [makeSession()];
    d.activeIdx = 0;
    await setTabData(tabId, d);
  }
  return d;
}

// --- Message handling ---

async function readActivePage(): Promise<{ text: string }> {
  const tab = await getActiveTab();
  const msg = await sendToTabWithInject(tab.id!, { type: 'READ_PAGE' });
  if (!msg.text && msg.text !== '') throw new Error('Could not read page content.');
  return { text: msg.text as string };
}

async function askAI(
  messages: unknown[],
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<{ text: string }> {
  if (!apiKey) throw new Error('No API key set.');
  const url = baseUrl || 'https://api.openai.com/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API error (${res.status}): ${t}`);
  }
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? '' };
}

async function backendFetch(
  url: string,
  options: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.headers && typeof options.headers === 'object') {
    Object.assign(headers, options.headers);
  }
  const res = await fetch(url, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backend error (${res.status}): ${text}`);
  }
  return res.json();
}

async function handleMessage(msg: BackgroundRequest): Promise<Record<string, unknown>> {
  switch (msg.type) {
    case 'READ_PAGE':
      return readActivePage();
    case 'ASK_AI':
      return askAI(msg.messages, msg.apiKey, msg.baseUrl, msg.model);
    case 'WRITE_TO_PAGE':
      return sendToTabWithInject((await getActiveTab()).id!, { type: 'WRITE_TO_PAGE', text: msg.text });
    case 'GET_PAGE_STRUCTURE':
      return sendToTabWithInject((await getActiveTab()).id!, { type: 'GET_PAGE_STRUCTURE' });
    case 'EXECUTE_ACTIONS':
      return sendToTabWithInject((await getActiveTab()).id!, { type: 'EXECUTE_ACTIONS', actions: msg.actions });
    case 'BACKEND_FETCH':
      return backendFetch(msg.url, msg.options);
    case 'GET_SESSIONS':
      return { sessions: await handleSessions(msg.tabId) };
    case 'SAVE_SESSION': {
      const d = await getTabData(msg.tabId);
      const idx = d.sessions.findIndex((s) => s.id === msg.session.id);
      if (idx >= 0) d.sessions[idx] = msg.session;
      await setTabData(msg.tabId, d);
      return { ok: true };
    }
    case 'CREATE_SESSION': {
      const d = await getTabData(msg.tabId);
      d.sessions.push(makeSession());
      d.activeIdx = d.sessions.length - 1;
      await setTabData(msg.tabId, d);
      return { sessions: d };
    }
    case 'DELETE_SESSION': {
      const d = await getTabData(msg.tabId);
      const idx = d.sessions.findIndex((s) => s.id === msg.sessionId);
      if (idx >= 0) {
        d.sessions.splice(idx, 1);
        if (d.sessions.length === 0) d.sessions.push(makeSession());
        if (d.activeIdx >= d.sessions.length) d.activeIdx = d.sessions.length - 1;
      }
      await setTabData(msg.tabId, d);
      return { sessions: d };
    }
    case 'RENAME_SESSION': {
      const d = await getTabData(msg.tabId);
      const s = d.sessions.find((s) => s.id === msg.sessionId);
      if (s) s.label = msg.label.slice(0, 60);
      await setTabData(msg.tabId, d);
      return { ok: true };
    }
    case 'SWITCH_SESSION': {
      const d = await getTabData(msg.tabId);
      const idx = d.sessions.findIndex((s) => s.id === msg.sessionId);
      if (idx >= 0) d.activeIdx = idx;
      await setTabData(msg.tabId, d);
      return { sessions: d };
    }
    case 'GET_ACTIVE_TAB': {
      const tab = await getActiveTab();
      return { tabId: tab.id!, url: tab.url };
    }
    default:
      throw new Error('Unknown message type');
  }
}

chrome.runtime.onMessage.addListener(
  (msg: BackgroundRequest, _sender: chrome.runtime.MessageSender, sendResponse: (r: BackgroundResponse) => void) => {
    handleMessage(msg)
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((e: Error) => sendResponse({ ok: false, error: e.message ?? String(e) }));
    return true;
  },
);

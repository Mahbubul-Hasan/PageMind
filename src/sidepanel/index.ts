import '../styles/sidepanel.css';
import type { ChatMessage, BackgroundResponse, Session } from '../types';
import { CONSTANTS } from '../types';
import { pageText, currentTabId, currentHostname, ready, setPageText, setCurrentTabId, setCurrentHostname, setReady } from './state';
import { getProfile, learnFromPage, learnFromPrompt, buildProfileContext } from './profile';
import { loadSettings, openSettings, closeSettings, renderProfileEditor, saveSettings, handleClearProfile, getBackendUrl, isBackendEnabled } from './settings';
import { serializeMessages, getIndicatorState, applyIndicatorState, addMessage, removeLoading, showLoading, renderMessages } from './chat';

// --- DOM refs ---
const $ = (id: string) => document.getElementById(id)!;

const messagesEl = $('messages') as HTMLElement;
const inputEl = $('input') as HTMLTextAreaElement;
const sendBtn = $('sendBtn') as HTMLButtonElement;
const refreshBtn = $('refreshBtn') as HTMLButtonElement;
const pageDot = $('pageDot') as HTMLElement;
const pageIndicator = $('pageIndicator') as HTMLElement;
const tabIdDisplay = $('tabIdDisplay') as HTMLElement;
const settingsPanel = $('settingsPanel') as HTMLElement;
const settingsOverlay = $('settingsOverlay') as HTMLElement;
const openSettingsBtn = $('openSettings') as HTMLButtonElement;
const closeSettingsBtn = $('closeSettings') as HTMLButtonElement;
const saveSettingsBtn = $('saveSettings') as HTMLButtonElement;
const clearProfileBtn = $('clearProfile') as HTMLButtonElement;
const settingsStatus = $('settingsStatus') as HTMLElement;

// Settings inputs
const apiKeyEl = $('apiKey') as HTMLInputElement;
const baseUrlEl = $('baseUrl') as HTMLInputElement;
const modelEl = $('model') as HTMLInputElement;
const backendUrlEl = $('backendUrl') as HTMLInputElement;
const useBackendEl = $('useBackend') as HTMLInputElement;
const profileNameEl = $('profileName') as HTMLInputElement;
const profileStatsEl = $('profileStats') as HTMLElement;

// --- Messaging ---

function send(msg: Record<string, unknown>): Promise<BackgroundResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (r) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message ?? 'Unknown error' });
      else resolve(r as BackgroundResponse);
    });
  });
}

// --- Session ---

async function saveSession(): Promise<void> {
  if (!currentTabId) return;
  await send({
    type: 'SAVE_SESSION',
    tabId: currentTabId,
    session: {
      pageText,
      messages: serializeMessages(messagesEl),
      indicator: getIndicatorState(pageDot, pageIndicator),
    } as Session,
  });
}

async function loadSession(): Promise<boolean> {
  if (!currentTabId) return false;
  const res = await send({ type: 'GET_SESSION', tabId: currentTabId } as Record<string, unknown>);
  const s = res.session as Session | undefined;
  if (!s) return false;
  setPageText(s.pageText || '');
  renderMessages(messagesEl, s.messages);
  if (s.indicator) applyIndicatorState(pageDot, pageIndicator, s.indicator);
  if (messagesEl.children.length > 1) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  return true;
}

function updateTabIdDisplay(): void {
  tabIdDisplay.textContent = currentTabId ? `tab:${currentTabId}` : '';
}

async function readAndSave(): Promise<void> {
  pageDot.className = 'page-dot';
  pageIndicator.textContent = 'Reading...';
  await readPage();
  await saveSession();
}

// --- Read page ---

async function readPage(): Promise<string | null> {
  const res = await send({ type: 'READ_PAGE' });
  if (!res.ok) {
    pageDot.className = 'page-dot error';
    pageIndicator.textContent = res.error ?? 'Failed';
    return null;
  }
  const text = (res.text as string) ?? '';
  setPageText(text);
  pageDot.className = 'page-dot loaded';
  pageIndicator.textContent = `${text.length} chars`;

  learnFromPage(text, currentHostname);

  return text;
}

// --- Build AI context ---

async function buildChatMessages(
  userText: string,
  prevMessages: ChatMessage[],
): Promise<ChatMessage[]> {
  const profile = await getProfile();
  const profileCtx = buildProfileContext(profile, currentHostname);

  const systemContent = `You are a helpful assistant. Answer the user's question based on the page content below.${profileCtx}\n\nPAGE CONTENT:\n${pageText || '(none)'}`;

  const history = (prevMessages ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-CONSTANTS.MAX_HISTORY_MSGS * 2);

  const budget = CONSTANTS.MAX_CONTEXT_CHARS - systemContent.length - userText.length - 2000;
  const trimmed: ChatMessage[] = [];
  let used = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    const next = used + history[i].content.length;
    if (next > budget && trimmed.length > 0) break;
    trimmed.unshift(history[i]);
    used += history[i].content.length;
  }

  return [
    { role: 'system', content: systemContent },
    ...trimmed,
    { role: 'user', content: userText },
  ];
}

// --- AI calls ---

async function handleSendDirect(context: ChatMessage[]): Promise<void> {
  const s = await chrome.storage.local.get(['apiKey', 'baseUrl', 'model']);
  const res = await send({
    type: 'ASK_AI',
    messages: context,
    apiKey: s.apiKey ?? '',
    baseUrl: s.baseUrl ?? '',
    model: s.model ?? '',
  });
  if (!res.ok) addMessage(messagesEl, 'error', res.error ?? 'Request failed');
  else addMessage(messagesEl, 'assistant', res.text as string, res.text as string);
}

async function handleSendBackend(context: ChatMessage[]): Promise<void> {
  try {
    const url = `${getBackendUrl().replace(/\/$/, '')}/api/proxy/chat`;
    const res = await send({
      type: 'BACKEND_FETCH',
      url,
      options: { method: 'POST', body: JSON.stringify({ messages: context }) },
    });
    if (!res.ok) throw new Error(res.error ?? 'Backend error');
    addMessage(messagesEl, 'assistant', res.text as string, res.text as string);
  } catch (e) {
    addMessage(messagesEl, 'error', (e as Error).message);
  }
}

// --- Send handler ---

async function handleSend(): Promise<void> {
  const text = inputEl.value.trim();
  if (!text) return;

  if (!isBackendEnabled()) {
    const s = await chrome.storage.local.get(['apiKey']);
    if (!s.apiKey) {
      addMessage(messagesEl, 'error', 'Set your API key in Settings first.');
      openSettings(settingsPanel, settingsOverlay, () => renderProfileEditor(profileNameEl, profileStatsEl));
      return;
    }
  }

  learnFromPrompt(text, currentHostname);

  const res = await send({ type: 'GET_SESSION', tabId: currentTabId } as Record<string, unknown>);
  const prevMessages = ((res.session as Session)?.messages ?? []) as ChatMessage[];

  if (!pageText) {
    addMessage(messagesEl, 'system', 'Reading page...');
    await readPage();
  }

  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendBtn.disabled = true;

  addMessage(messagesEl, 'user', text);
  showLoading(messagesEl);

  if (!pageText) setPageText('');
  const context = await buildChatMessages(text, prevMessages);

  if (isBackendEnabled()) {
    await handleSendBackend(context);
  } else {
    await handleSendDirect(context);
  }

  removeLoading(messagesEl);
  sendBtn.disabled = false;
  await saveSession();
}

// --- Tab switch ---

chrome.runtime.onMessage.addListener((msg: Record<string, unknown>) => {
  if (msg.type !== 'tabChanged') return;
  const url = msg.url as string | undefined;
  if (url) {
    try { setCurrentHostname(new URL(url).hostname); } catch { /* ignore */ }
  }
  if (!ready) return;

  if (msg.urlChanged && msg.tabId === currentTabId) {
    send({ type: 'DELETE_SESSION', tabId: currentTabId });
    messagesEl.innerHTML = '';
    setPageText('');
    updateTabIdDisplay();
    readAndSave();
    return;
  }

  if (msg.tabId === currentTabId) return;

  saveSession().then(() => {
    setCurrentTabId(msg.tabId as number);
    updateTabIdDisplay();
    loadSession().then((found) => {
      if (!found) readAndSave();
    });
  });
});

// --- Event listeners ---

refreshBtn.addEventListener('click', readAndSave);

sendBtn.addEventListener('click', handleSend);
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
});
inputEl.addEventListener('input', () => {
  sendBtn.disabled = !inputEl.value.trim();
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
});

openSettingsBtn.addEventListener('click', () =>
  openSettings(settingsPanel, settingsOverlay, () => renderProfileEditor(profileNameEl, profileStatsEl)));
closeSettingsBtn.addEventListener('click', () => closeSettings(settingsPanel, settingsOverlay));
settingsOverlay.addEventListener('click', () => closeSettings(settingsPanel, settingsOverlay));

saveSettingsBtn.addEventListener('click', async () => {
  await saveSettings(apiKeyEl, baseUrlEl, modelEl, backendUrlEl, useBackendEl, profileNameEl);
  settingsStatus.textContent = 'Saved.';
  closeSettings(settingsPanel, settingsOverlay);
});

clearProfileBtn.addEventListener('click', async () => {
  await handleClearProfile(profileNameEl, profileStatsEl);
  settingsStatus.textContent = 'Profile cleared.';
});

// --- Init ---

async function init(): Promise<void> {
  await loadSettings(apiKeyEl, baseUrlEl, modelEl, backendUrlEl, useBackendEl);
  const res = await send({ type: 'GET_ACTIVE_TAB' });
  if (res.tabId != null) setCurrentTabId(res.tabId as number);
  if (res.url) {
    try { setCurrentHostname(new URL(res.url as string).hostname); } catch { /* ignore */ }
  }
  updateTabIdDisplay();

  const found = await loadSession();
  if (!found) {
    await readAndSave();
  } else {
    learnFromPage(pageText, currentHostname);
  }
  setReady(true);
}

init();

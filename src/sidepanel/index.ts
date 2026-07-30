import '../styles/sidepanel.css';
import type { ChatMessage, BackgroundResponse, TabSession, TabSessionData, PageStructure, ActionResult } from '../types';
import { CONSTANTS } from '../types';
import { pageText, currentTabId, currentHostname, ready, setPageText, setCurrentTabId, setCurrentHostname, setReady } from './state';
import { getProfile, learnFromPage, learnFromPrompt, buildProfileContext } from './profile';
import { loadSettings, openSettings, closeSettings, renderProfileEditor, saveSettings, handleClearProfile, getBackendUrl, isBackendEnabled } from './settings';
import { serializeMessages, getIndicatorState, applyIndicatorState, addMessage, removeLoading, showLoading, renderMessages, addActionStep, updateActionStep } from './chat';
import { parseActions, formatStructure } from './actions-util';

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

const apiKeyEl = $('apiKey') as HTMLInputElement;
const baseUrlEl = $('baseUrl') as HTMLInputElement;
const modelEl = $('model') as HTMLInputElement;
const backendUrlEl = $('backendUrl') as HTMLInputElement;
const useBackendEl = $('useBackend') as HTMLInputElement;
const profileNameEl = $('profileName') as HTMLInputElement;
const profileStatsEl = $('profileStats') as HTMLElement;
const suggestionsEl = $('suggestions') as HTMLElement;

// Session bar
const sessionLabel = $('sessionLabel') as HTMLElement;
const prevSessionBtn = $('prevSession') as HTMLButtonElement;
const nextSessionBtn = $('nextSession') as HTMLButtonElement;
const newSessionBtn = $('newSession') as HTMLButtonElement;
const deleteSessionBtn = $('deleteSession') as HTMLButtonElement;
const renameSessionBtn = $('renameSessionBtn') as HTMLButtonElement;

let pageStructureStr = '';
let sessionsData: TabSessionData = { activeIdx: 0, sessions: [] };
let activeSession: TabSession | null = null;

// --- Messaging ---

function send(msg: Record<string, unknown>): Promise<BackgroundResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (r) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message ?? 'Unknown error' });
      else resolve(r as BackgroundResponse);
    });
  });
}

// --- Page structure ---

async function getPageStructure(): Promise<PageStructure | null> {
  const res = await send({ type: 'GET_PAGE_STRUCTURE' });
  if (!res.ok || !res.structure) {
    pageDot.className = 'page-dot error';
    pageIndicator.textContent = res.error ?? 'Failed to read page';
    return null;
  }
  const s = res.structure as PageStructure;
  pageDot.className = 'page-dot loaded';
  pageIndicator.textContent = `${s.interactive.length} elements, ${s.visibleText.length} chars`;
  return s;
}

async function updatePageContext(): Promise<boolean> {
  const structure = await getPageStructure();
  if (!structure) return false;
  pageStructureStr = formatStructure(structure);
  setPageText(structure.visibleText || '');
  learnFromPage(pageText, currentHostname);
  return true;
}

// --- Session management ---

function syncActiveSession(): void {
  activeSession = sessionsData.sessions[sessionsData.activeIdx] ?? null;
}

function renderSessionBar(): void {
  const total = sessionsData.sessions.length;
  if (activeSession) {
    sessionLabel.textContent = activeSession.label;
  } else {
    sessionLabel.textContent = 'No sessions';
  }
  prevSessionBtn.disabled = sessionsData.activeIdx <= 0;
  nextSessionBtn.disabled = sessionsData.activeIdx >= total - 1;
  deleteSessionBtn.disabled = total <= 1;
}

function copyUItoSession(s: TabSession): void {
  s.messages = serializeMessages(messagesEl);
  s.pageText = pageText;
  s.pageStructure = pageStructureStr;
  s.indicator = getIndicatorState(pageDot, pageIndicator);
}

function loadSessionToUI(s: TabSession): void {
  setPageText(s.pageText || '');
  pageStructureStr = s.pageStructure || '';
  renderMessages(messagesEl, s.messages);
  if (s.indicator) applyIndicatorState(pageDot, pageIndicator, s.indicator);
  if (messagesEl.children.length > 1) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

async function getSessionsData(): Promise<void> {
  if (!currentHostname) {
    sessionsData = { activeIdx: 0, sessions: [] };
    activeSession = null;
    return;
  }
  const res = await send({ type: 'GET_SESSIONS', hostname: currentHostname });
  if (res.ok && res.sessions) {
    sessionsData = res.sessions as TabSessionData;
  } else {
    sessionsData = { activeIdx: 0, sessions: [] };
  }
  syncActiveSession();
}

async function saveCurrentSessionToBg(host?: string): Promise<void> {
  const h = host ?? currentHostname;
  if (!activeSession || !h) return;
  copyUItoSession(activeSession);
  await send({ type: 'SAVE_SESSION', hostname: h, session: activeSession });
}

async function readAndSaveNoUpdate(): Promise<void> {
  pageDot.className = 'page-dot';
  pageIndicator.textContent = 'Reading...';
  const ok = await updatePageContext();
  if (!activeSession) {
    await getSessionsData();
    if (!activeSession) return;
  }
  activeSession.pageText = pageText;
  activeSession.pageStructure = pageStructureStr;
  if (ok) {
    await send({ type: 'SAVE_SESSION', hostname: currentHostname, session: activeSession });
  }
}

async function readAndSave(): Promise<void> {
  pageDot.className = 'page-dot';
  pageIndicator.textContent = 'Reading...';
  await updatePageContext();
  await saveCurrentSessionToBg();
}

function updateTabIdDisplay(): void {
  tabIdDisplay.textContent = currentTabId ? `tab:${currentTabId}` : '';
}

// --- Session actions ---

async function switchToSession(sessionId: string): Promise<void> {
  if (!currentHostname) return;
  await saveCurrentSessionToBg();
  const res = await send({ type: 'SWITCH_SESSION', hostname: currentHostname, sessionId });
  if (res.ok && res.sessions) {
    sessionsData = res.sessions as TabSessionData;
    syncActiveSession();
    suggestionsEl.classList.toggle('hidden', (activeSession?.messages?.length ?? 0) > 0);
    loadSessionToUI(activeSession!);
    renderSessionBar();
  }
}

async function createNewSession(): Promise<void> {
  if (!currentHostname) return;
  await saveCurrentSessionToBg();
  const res = await send({ type: 'CREATE_SESSION', hostname: currentHostname });
  if (res.ok && res.sessions) {
    sessionsData = res.sessions as TabSessionData;
    syncActiveSession();
    suggestionsEl.classList.remove('hidden');
    renderMessages(messagesEl);
    pageStructureStr = '';
    setPageText('');
    renderSessionBar();
    await readAndSaveNoUpdate();
  }
}

async function deleteCurrentSession(): Promise<void> {
  if (!activeSession || !currentHostname) return;
  const total = sessionsData.sessions.length;
  if (total <= 1) return;
  const res = await send({ type: 'DELETE_SESSION', hostname: currentHostname, sessionId: activeSession.id });
  if (res.ok && res.sessions) {
    sessionsData = res.sessions as TabSessionData;
    syncActiveSession();
    suggestionsEl.classList.toggle('hidden', (activeSession?.messages?.length ?? 0) > 0);
    loadSessionToUI(activeSession!);
    renderSessionBar();
  }
}

async function renameSession(sessionId: string, label: string): Promise<void> {
  if (!currentHostname) return;
  await send({ type: 'RENAME_SESSION', hostname: currentHostname, sessionId, label });
  await getSessionsData();
  renderSessionBar();
}

// --- Inline rename ---

function startRename(): void {
  if (!activeSession) return;
  const current = activeSession.label;
  sessionLabel.contentEditable = 'true';
  sessionLabel.classList.add('editing');
  sessionLabel.textContent = current;
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(sessionLabel);
  sel?.removeAllRanges();
  sel?.addRange(range);
  sessionLabel.focus();
}

function finishRename(): void {
  sessionLabel.contentEditable = 'false';
  sessionLabel.classList.remove('editing');
  if (!activeSession) return;
  const newLabel = (sessionLabel.textContent ?? '').trim().slice(0, 60) || activeSession.label;
  sessionLabel.textContent = newLabel;
  if (newLabel !== activeSession.label) {
    renameSession(activeSession.id, newLabel);
  }
}

// --- Build AI context ---

async function buildChatMessages(
  userText: string,
  prevMessages: ChatMessage[],
): Promise<ChatMessage[]> {
  const profile = await getProfile();
  const profileCtx = buildProfileContext(profile, currentHostname);

  const systemContent = `You are a browser assistant with page awareness.${profileCtx}

PAGE STRUCTURE:
${pageStructureStr || '(no page loaded)'}

You can take actions on the page by including commands in your response.
Available commands:
TYPE "text" INTO "element label"  — Type into a field (use exact label from structure)
CLICK "button/link text"          — Click a button or link
SELECT "option" FROM "select label" — Choose a dropdown option
SCROLL DOWN / SCROLL UP           — Scroll the page
WAIT 2000                         — Wait milliseconds
READ PAGE                         — Re-read the page structure
DONE                              — All done, show summary

Example:
User: Fill in the email field with test@example.com
Assistant: Typing into the email field.
TYPE "test@example.com" INTO "Email"

User: Click the submit button
Assistant:
CLICK "Submit"
WAIT 1000
DONE
Done! I clicked Submit.

User: Go to the Actions tab
Assistant:
CLICK "Actions"
DONE
Navigated to the Actions tab.

Rules:
- Put each command on its own line
- Use the exact element labels shown in the structure (by index or label text)
- For forms, send multiple TYPE commands together
- Respond naturally AND include commands when actions are needed
- When finished, write DONE then your summary`;

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

// --- Action loop ---

async function executeActionLoop(context: ChatMessage[]): Promise<void> {
  let currentContext = context;
  let done = false;
  let loopCount = 0;
  const maxLoops = 10;

  while (!done && loopCount < maxLoops) {
    loopCount++;

    const res = await callAI(currentContext);
    if (!res.ok) {
      addMessage(messagesEl, 'error', res.error ?? 'Request failed');
      return;
    }

    const aiText = (res.text as string) ?? '';
    const actions = parseActions(aiText);
    const hasActions = actions.length > 0 && !(actions.length === 1 && actions[0].command === 'DONE');

    const cleanText = aiText.replace(/^(TYPE|CLICK|SELECT|SCROLL|WAIT|READ|DONE).*/gm, '').trim();
    if (cleanText) {
      addMessage(messagesEl, 'assistant', cleanText);
    }

    if (!hasActions) {
      done = true;
      continue;
    }

    for (const action of actions) {
      if (action.command === 'DONE') {
        done = true;
        break;
      }

      if (action.command === 'READ') {
        await updatePageContext();
        const readMsg: ChatMessage = { role: 'system', content: '[Page re-read after action]' };
        currentContext = [...currentContext, { role: 'assistant', content: aiText }, readMsg];
        continue;
      }

      const stepEl = addActionStep(messagesEl, action);
      const execRes = await send({ type: 'EXECUTE_ACTIONS', actions: [action] });
      const results = (execRes.results as ActionResult[]) ?? [];
      const result = results[0] ?? { command: action.command, success: false, error: 'No result' };
      updateActionStep(stepEl, result);

      if (result.success && (action.command === 'CLICK' || action.command === 'SELECT')) {
        await new Promise((r) => setTimeout(r, 500));
        await updatePageContext();
      }
    }

    currentContext = await buildChatMessages(
      'Continue with the task based on the current page state.',
      serializeMessages(messagesEl),
    );
  }

  if (loopCount >= maxLoops) {
    addMessage(messagesEl, 'error', 'Reached maximum action steps. Task may be incomplete.');
  }
}

async function callAI(context: ChatMessage[]): Promise<BackgroundResponse> {
  if (isBackendEnabled()) {
    try {
      const url = `${getBackendUrl().replace(/\/$/, '')}/api/proxy/chat`;
      return await send({
        type: 'BACKEND_FETCH',
        url,
        options: { method: 'POST', body: JSON.stringify({ messages: context }) },
      });
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  const s = await chrome.storage.local.get(['apiKey', 'baseUrl', 'model']);
  return await send({
    type: 'ASK_AI',
    messages: context,
    apiKey: s.apiKey ?? '',
    baseUrl: s.baseUrl ?? '',
    model: s.model ?? '',
  });
}

// --- Send handler ---

async function handleSend(): Promise<void> {
  const text = inputEl.value.trim();
  if (!text) return;
  suggestionsEl.classList.add('hidden');

  if (!isBackendEnabled()) {
    const s = await chrome.storage.local.get(['apiKey']);
    if (!s.apiKey) {
      addMessage(messagesEl, 'error', 'Set your API key in Settings first.');
      openSettings(settingsPanel, settingsOverlay, () => renderProfileEditor(profileNameEl, profileStatsEl));
      return;
    }
  }

  learnFromPrompt(text, currentHostname);

  if (!activeSession || !currentHostname) return;

  const prevMessages = activeSession.messages ?? [];

  if (!pageStructureStr) {
    addMessage(messagesEl, 'system', 'Reading page...');
    const ok = await updatePageContext();
    if (!ok) {
      addMessage(messagesEl, 'error', 'Could not read page. Make sure you are on a web page.');
      return;
    }
    if (activeSession) {
      activeSession.pageText = pageText;
      activeSession.pageStructure = pageStructureStr;
    }
  }

  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendBtn.disabled = true;

  addMessage(messagesEl, 'user', text);
  showLoading(messagesEl);

  const context = await buildChatMessages(text, prevMessages);
  await executeActionLoop(context);

  removeLoading(messagesEl);
  sendBtn.disabled = false;
  if (activeSession) {
    copyUItoSession(activeSession);
    await send({ type: 'SAVE_SESSION', hostname: currentHostname, session: activeSession });
  }
}

// --- Tab switch ---

chrome.runtime.onMessage.addListener((msg: Record<string, unknown>) => {
  if (msg.type !== 'tabChanged') return;
  if (!ready) return;

  const newTabId = msg.tabId as number;
  const urlChanged = msg.urlChanged as boolean;
  const url = msg.url as string | undefined;
  const newHost = url ? urlHostname(url) : '';

  // Same tab, URL changed — reread page, sessions stay
  if (urlChanged && newTabId === currentTabId) {
    setCurrentHostname(newHost);
    suggestionsEl.classList.remove('hidden');
    readAndSave();
    return;
  }

  // Different tab — save old session under old hostname, then switch
  if (newTabId === currentTabId) return;

  const oldHostname = currentHostname;
  saveCurrentSessionToBg(oldHostname).then(() => {
    setCurrentTabId(newTabId);
    setCurrentHostname(newHost);
    updateTabIdDisplay();
    getSessionsData().then(() => {
      if (activeSession) {
        suggestionsEl.classList.toggle('hidden', (activeSession.messages?.length ?? 0) > 0);
        loadSessionToUI(activeSession);
        renderSessionBar();
      }
      if (!activeSession?.messages?.length && !pageStructureStr) {
        readAndSaveNoUpdate();
      }
    });
  });
});

function urlHostname(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

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

suggestionsEl.addEventListener('click', (e) => {
  const chip = (e.target as HTMLElement).closest('.chip') as HTMLButtonElement | null;
  if (!chip) return;
  inputEl.value = chip.dataset.prompt ?? '';
  handleSend();
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

// Session bar events
prevSessionBtn.addEventListener('click', () => {
  if (!activeSession || sessionsData.activeIdx <= 0) return;
  const prev = sessionsData.sessions[sessionsData.activeIdx - 1];
  if (prev) switchToSession(prev.id);
});

nextSessionBtn.addEventListener('click', () => {
  if (!activeSession || sessionsData.activeIdx >= sessionsData.sessions.length - 1) return;
  const next = sessionsData.sessions[sessionsData.activeIdx + 1];
  if (next) switchToSession(next.id);
});

newSessionBtn.addEventListener('click', createNewSession);

deleteSessionBtn.addEventListener('click', () => {
  if (!activeSession || sessionsData.sessions.length <= 1) return;
  if (confirm(`Delete "${activeSession.label}"?`)) {
    deleteCurrentSession();
  }
});

renameSessionBtn.addEventListener('click', startRename);

sessionLabel.addEventListener('click', startRename);

sessionLabel.addEventListener('blur', finishRename);

sessionLabel.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sessionLabel.blur();
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (activeSession) sessionLabel.textContent = activeSession.label;
    finishRename();
  }
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

  await getSessionsData();

  if (activeSession) {
    suggestionsEl.classList.toggle('hidden', (activeSession.messages?.length ?? 0) > 0);
    loadSessionToUI(activeSession);
    renderSessionBar();
  }

  if (!activeSession?.messages?.length && !pageStructureStr) {
    await readAndSaveNoUpdate();
  } else {
    if (pageText) learnFromPage(pageText, currentHostname);
  }
  setReady(true);
}

init();

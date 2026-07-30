import '../styles/sidepanel.css';
import type { ChatMessage, BackgroundResponse, Session, PageStructure, ActionResult } from '../types';
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

// Settings inputs
const apiKeyEl = $('apiKey') as HTMLInputElement;
const baseUrlEl = $('baseUrl') as HTMLInputElement;
const modelEl = $('model') as HTMLInputElement;
const backendUrlEl = $('backendUrl') as HTMLInputElement;
const useBackendEl = $('useBackend') as HTMLInputElement;
const profileNameEl = $('profileName') as HTMLInputElement;
const profileStatsEl = $('profileStats') as HTMLElement;
const suggestionsEl = $('suggestions') as HTMLElement;

let pageStructureStr = '';

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

// --- Session ---

async function saveSession(): Promise<void> {
  if (!currentTabId) return;
  await send({
    type: 'SAVE_SESSION',
    tabId: currentTabId,
    session: {
      pageText,
      pageStructure: pageStructureStr,
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
  pageStructureStr = s.pageStructure || '';
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
  await updatePageContext();
  await saveSession();
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

    // Call AI
    const res = await callAI(currentContext);
    if (!res.ok) {
      addMessage(messagesEl, 'error', res.error ?? 'Request failed');
      return;
    }

    const aiText = (res.text as string) ?? '';
    const actions = parseActions(aiText);
    const hasActions = actions.length > 0 && !(actions.length === 1 && actions[0].command === 'DONE');

    // Show AI response
    const cleanText = aiText.replace(/^(TYPE|CLICK|SELECT|SCROLL|WAIT|READ|DONE).*/gm, '').trim();
    if (cleanText) {
      addMessage(messagesEl, 'assistant', cleanText);
    }

    if (!hasActions) {
      done = true;
      continue;
    }

    // Execute actions
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

      // If READ was requested after WAIT/CLICK
      if (result.success && (action.command === 'CLICK' || action.command === 'SELECT')) {
        await new Promise((r) => setTimeout(r, 500));
        await updatePageContext();
      }
    }

    // Build next context with updated page
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

  const res = await send({ type: 'GET_SESSION', tabId: currentTabId } as Record<string, unknown>);
  const prevMessages = ((res.session as Session)?.messages ?? []) as ChatMessage[];

  if (!pageStructureStr) {
    addMessage(messagesEl, 'system', 'Reading page...');
    const ok = await updatePageContext();
    if (!ok) {
      addMessage(messagesEl, 'error', 'Could not read page. Make sure you are on a web page.');
      return;
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
    pageStructureStr = '';
    updateTabIdDisplay();
    suggestionsEl.classList.remove('hidden');
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
    if (pageText) learnFromPage(pageText, currentHostname);
  }
  setReady(true);
}

init();

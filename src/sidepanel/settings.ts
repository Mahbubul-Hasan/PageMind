import { STORAGE_KEYS } from '../types';
import type { BackendConfig } from '../types';
import { getProfile, saveProfile, clearProfile } from './profile';

let backendUrl = '';
let useBackend = false;

export function getBackendUrl(): string {
  return backendUrl;
}

export function isBackendEnabled(): boolean {
  return useBackend;
}

export async function loadSettings(
  apiKeyEl: HTMLInputElement,
  baseUrlEl: HTMLInputElement,
  modelEl: HTMLInputElement,
  backendUrlEl: HTMLInputElement,
  useBackendEl: HTMLInputElement,
): Promise<void> {
  const s = await chrome.storage.local.get([
    STORAGE_KEYS.API_KEY,
    STORAGE_KEYS.BASE_URL,
    STORAGE_KEYS.MODEL,
    STORAGE_KEYS.BACKEND,
  ]);
  if (s[STORAGE_KEYS.API_KEY]) apiKeyEl.value = s[STORAGE_KEYS.API_KEY];
  if (s[STORAGE_KEYS.BASE_URL]) baseUrlEl.value = s[STORAGE_KEYS.BASE_URL];
  if (s[STORAGE_KEYS.MODEL]) modelEl.value = s[STORAGE_KEYS.MODEL];
  const cfg = (s[STORAGE_KEYS.BACKEND] ?? {}) as BackendConfig;
  if (cfg.url) backendUrlEl.value = cfg.url;
  if (cfg.enabled) useBackendEl.checked = true;
  backendUrl = cfg.url || '';
  useBackend = cfg.enabled || false;
}

export function openSettings(
  panel: HTMLElement,
  overlay: HTMLElement,
  renderCb: () => Promise<void>,
): void {
  renderCb().then(() => {
    panel.classList.remove('hidden');
    overlay.classList.remove('hidden');
  });
}

export function closeSettings(
  panel: HTMLElement,
  overlay: HTMLElement,
): void {
  panel.classList.add('hidden');
  overlay.classList.add('hidden');
}

export async function renderProfileEditor(
  nameEl: HTMLInputElement,
  statsEl: HTMLElement,
): Promise<void> {
  const profile = await getProfile();
  nameEl.value = profile.name || '';

  const entries = Object.entries(profile.frequentSites ?? {})
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)
    .map(([host, data]) => `${host} (${data.count}x)`)
    .join(', ');

  const lines: string[] = [];
  if (profile.title) lines.push(`Title: ${profile.title}`);
  if (profile.skills?.length) lines.push(`Skills: ${profile.skills.join(', ')}`);
  if (profile.tone) lines.push(`Tone: ${profile.tone}`);
  if (profile.totalQuestions) lines.push(`Questions asked: ${profile.totalQuestions}`);
  if (entries) lines.push(`Top sites: ${entries}`);
  statsEl.innerHTML = lines.length
    ? lines.map((l) => `<span>${l}</span>`).join('')
    : '<span style="color:var(--text-muted)">No profile data yet</span>';
}

export async function saveSettings(
  apiKeyEl: HTMLInputElement,
  baseUrlEl: HTMLInputElement,
  modelEl: HTMLInputElement,
  backendUrlEl: HTMLInputElement,
  useBackendEl: HTMLInputElement,
  nameEl: HTMLInputElement,
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.API_KEY]: apiKeyEl.value.trim(),
    [STORAGE_KEYS.BASE_URL]: baseUrlEl.value.trim(),
    [STORAGE_KEYS.MODEL]: modelEl.value.trim(),
  });

  const profile = await getProfile();
  profile.name = nameEl.value.trim();
  await saveProfile(profile);

  const cfg: BackendConfig = {
    url: backendUrlEl.value.trim(),
    enabled: useBackendEl.checked,
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.BACKEND]: cfg });
  backendUrl = cfg.url;
  useBackend = cfg.enabled;
}

export async function handleClearProfile(
  nameEl: HTMLInputElement,
  statsEl: HTMLElement,
): Promise<void> {
  await clearProfile();
  await renderProfileEditor(nameEl, statsEl);
}

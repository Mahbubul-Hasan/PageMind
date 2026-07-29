import type { Profile } from '../types';
import { STORAGE_KEYS, RESUME_MARKERS, COMMON_SKILLS, CONSTANTS } from '../types';

export function createDefaultProfile(): Profile {
  return {
    name: '',
    title: '',
    skills: [],
    cv: '',
    tone: '',
    frequentSites: {},
    totalQuestions: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function getProfile(): Promise<Profile> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.PROFILE);
  return (data[STORAGE_KEYS.PROFILE] as Profile) ?? createDefaultProfile();
}

export async function saveProfile(p: Profile): Promise<void> {
  p.updatedAt = new Date().toISOString();
  await chrome.storage.local.set({ [STORAGE_KEYS.PROFILE]: p });
}

export async function clearProfile(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.PROFILE);
}

export function extractName(text: string): string | null {
  const patterns = [
    /(?:^|\n)\s*name\s*[:：]\s*(.+)/i,
    /my\s+name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim().slice(0, CONSTANTS.NAME_MAX_LENGTH);
  }
  return null;
}

export function extractTitle(text: string): string | null {
  const patterns = [
    /(?:^|\n)\s*(?:title|role|position)\s*[:：]\s*(.+)/i,
    /\b(Software Engineer|Developer|Full.?Stack|Frontend|Backend|DevOps|Data Scientist|ML Engineer|Architect|Designer|Product Manager|Engineer)\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1] ?? m[0];
  }
  return null;
}

export function extractSkills(text: string): string[] {
  const found: string[] = [];
  for (const skill of COMMON_SKILLS) {
    const re = new RegExp('\\b' + skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (re.test(text) && !found.includes(skill)) found.push(skill);
  }
  return found;
}

export function isResumeLike(text: string): boolean {
  let count = 0;
  for (const m of RESUME_MARKERS) {
    if (new RegExp('\\b' + m + '\\b', 'i').test(text)) count++;
  }
  return count >= 3;
}

export function trackSite(profile: Profile, hostname: string): void {
  if (!hostname) return;
  if (!profile.frequentSites[hostname]) {
    profile.frequentSites[hostname] = { count: 0, tasks: [] };
  }
  profile.frequentSites[hostname].count++;
}

export function detectTone(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\b(professional|formal|business)\b/.test(lower)) return 'professional';
  if (/\b(casual|friendly|informal|chatty)\b/.test(lower)) return 'casual';
  if (/\b(creative|fun|playful|humorous)\b/.test(lower)) return 'creative';
  if (/\b(brief|short|concise|quick)\b/.test(lower)) return 'concise';
  if (/\b(detailed|elaborate|thorough|in.?depth)\b/.test(lower)) return 'detailed';
  return null;
}

export function inferTask(text: string): string | null {
  if (/\b(cover letter|proposal|gig|hire|freelance|bid)\b/i.test(text)) return 'freelance proposals';
  if (/\b(linkedin|connection|network|recommend)\b/i.test(text)) return 'networking';
  if (/\b(apply|application|resume|job|interview|hiring)\b/i.test(text)) return 'job applications';
  if (/\b(email|reply|message|outreach|inmail)\b/i.test(text)) return 'outreach messages';
  if (/\b(rewrite|improve|edit|revise|polish)\b/i.test(text)) return 'content editing';
  if (/\b(summarize|summary|tl;dr|condense)\b/i.test(text)) return 'summarization';
  return null;
}

export function learnNameFromConversation(text: string): string | null {
  const patterns = [
    /(?:my\s+name\s+is|i'?m\s+called|call\s+me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    /i\s+am\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
    /nickname\s+(\w+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim().slice(0, CONSTANTS.NAME_MAX_LENGTH);
  }
  return null;
}

export async function learnFromPage(text: string, hostname: string): Promise<void> {
  if (!text || text.length < 50) return;
  if (!isResumeLike(text)) return;

  const profile = await getProfile();
  const name = extractName(text);
  const title = extractTitle(text);
  const skills = extractSkills(text);
  let changed = false;

  if (name && !profile.name) {
    profile.name = name;
    changed = true;
  }
  if (title && !profile.title) {
    profile.title = title;
    changed = true;
  }
  if (skills.length > 0) {
    const before = profile.skills.length;
    profile.skills = [...new Set([...profile.skills, ...skills])];
    if (profile.skills.length !== before) changed = true;
  }
  if (text.length > profile.cv.length) {
    profile.cv = text.slice(0, CONSTANTS.PROFILE_CV_MAX_CHARS);
    changed = true;
  }

  trackSite(profile, hostname);
  if (changed) await saveProfile(profile);
}

export async function learnFromPrompt(text: string, hostname: string): Promise<void> {
  if (!text) return;
  const profile = await getProfile();
  let changed = false;

  const name = learnNameFromConversation(text);
  if (name && name !== profile.name) {
    profile.name = name;
    changed = true;
  }

  trackSite(profile, hostname);

  if (hostname && profile.frequentSites[hostname]) {
    const task = inferTask(text);
    const site = profile.frequentSites[hostname];
    if (task && !site.tasks.includes(task)) {
      site.tasks.push(task);
      if (site.tasks.length > CONSTANTS.MAX_SITE_TASKS) site.tasks.shift();
    }
  }

  const tone = detectTone(text);
  if (tone && !profile.tone) {
    profile.tone = tone;
    changed = true;
  }

  profile.totalQuestions = (profile.totalQuestions ?? 0) + 1;

  if (changed) await saveProfile(profile);
}

export function buildProfileContext(profile: Profile, hostname: string): string {
  const parts: string[] = [];
  if (profile.name) parts.push(`- Name: ${profile.name}`);
  if (profile.title) parts.push(`- Role: ${profile.title}`);
  if (profile.skills?.length) parts.push(`- Skills: ${profile.skills.join(', ')}`);
  if (profile.tone) parts.push(`- Preferred tone: ${profile.tone}`);

  if (hostname && profile.frequentSites?.[hostname]) {
    const site = profile.frequentSites[hostname];
    parts.push(`- Current site: ${hostname} (visited ${site.count} times)`);
    if (site.tasks?.length) {
      parts.push(`- Typical tasks on this site: ${site.tasks.join(', ')}`);
    }
  }

  if (profile.totalQuestions > 5) {
    parts.push(`- Extension usage: ${profile.totalQuestions} questions asked`);
  }

  return parts.length > 0 ? '\n\nUSER PROFILE:\n' + parts.join('\n') : '';
}

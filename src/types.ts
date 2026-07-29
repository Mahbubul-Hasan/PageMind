export interface Profile {
  name: string;
  title: string;
  skills: string[];
  cv: string;
  tone: string;
  frequentSites: Record<string, { count: number; tasks: string[] }>;
  totalQuestions: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
}

export interface IndicatorState {
  text: string;
  dotClass: string;
}

export interface Session {
  pageText: string;
  messages: ChatMessage[];
  indicator: IndicatorState;
}

export interface BackendConfig {
  url: string;
  enabled: boolean;
}

export const STORAGE_KEYS = {
  BACKEND: 'pagmind_backend',
  PROFILE: 'owner_profile',
  API_KEY: 'apiKey',
  BASE_URL: 'baseUrl',
  MODEL: 'model',
} as const;

export const CONSTANTS = {
  MAX_CONTEXT_CHARS: 96000,
  MAX_HISTORY_MSGS: 20,
  PROFILE_CV_MAX_CHARS: 10000,
  PAGE_TEXT_MAX_CHARS: 30000,
  MAX_SITE_TASKS: 5,
  NAME_MAX_LENGTH: 80,
} as const;

export const RESUME_MARKERS = [
  'experience',
  'education',
  'skills',
  'work history',
  'employment',
  'summary',
  'objective',
  'projects',
  'certifications',
  'languages',
] as const;

export const COMMON_SKILLS = [
  'React', 'Node', 'Python', 'TypeScript', 'JavaScript', 'Go', 'Rust',
  'AWS', 'Docker', 'Kubernetes', 'PostgreSQL', 'MongoDB', 'Redis',
  'GraphQL', 'REST', 'NestJS', 'Express', 'Next.js', 'Vue', 'Angular',
  'TensorFlow', 'PyTorch', 'LangChain', 'OpenAI', 'LLM', 'AI',
  'Machine Learning', 'Deep Learning', 'SQL', 'NoSQL', 'Git',
] as const;

export type BackgroundRequest =
  | { type: 'READ_PAGE' }
  | { type: 'ASK_AI'; messages: ChatMessage[]; apiKey: string; baseUrl: string; model: string }
  | { type: 'WRITE_TO_PAGE'; text: string }
  | { type: 'BACKEND_FETCH'; url: string; options: Record<string, unknown> }
  | { type: 'GET_SESSION'; tabId: number }
  | { type: 'SAVE_SESSION'; tabId: number; session: Session }
  | { type: 'DELETE_SESSION'; tabId: number }
  | { type: 'GET_ACTIVE_TAB' };

export type SidepanelRequest =
  | { type: 'WRITE_TO_PAGE'; text: string }
  | { type: 'READ_PAGE' };

export interface BackgroundResponse {
  ok: boolean;
  error?: string;
  text?: string;
  session?: Session | null;
  tabId?: number;
  url?: string;
}

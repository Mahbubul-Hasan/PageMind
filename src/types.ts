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
  role: 'user' | 'assistant' | 'system' | 'error' | 'action';
  content: string;
}

export interface IndicatorState {
  text: string;
  dotClass: string;
}

export interface TabSession {
  id: string;
  label: string;
  createdAt: number;
  messages: ChatMessage[];
  pageText: string;
  pageStructure: string;
  indicator: IndicatorState;
}

export interface TabSessionData {
  activeIdx: number;
  sessions: TabSession[];
}

export interface BackendConfig {
  url: string;
  enabled: boolean;
}

export const STORAGE_KEYS = {
  BACKEND: 'pagmind_backend',
  PROFILE: 'owner_profile',
  SESSIONS: 'tab_sessions_data',
  API_KEY: 'apiKey',
  BASE_URL: 'baseUrl',
  MODEL: 'model',
} as const;

export const CONSTANTS = {
  MAX_CONTEXT_CHARS: 40000,
  MAX_HISTORY_MSGS: 20,
  PROFILE_CV_MAX_CHARS: 10000,
  PAGE_TEXT_MAX_CHARS: 30000,
  MAX_SITE_TASKS: 5,
  NAME_MAX_LENGTH: 80,
  MAX_VISIBLE_TEXT_CHARS: 8000,
  MAX_STRUCTURE_ELEMENTS: 80,
  SESSION_LABEL_MAX: 60,
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

// --- Page structure & actions ---

export type ElementType =
  | 'text-input'
  | 'textarea'
  | 'select'
  | 'button'
  | 'checkbox'
  | 'radio'
  | 'link'
  | 'contenteditable'
  | 'file-input';

export interface InteractiveElement {
  id: string;
  index: number;
  type: ElementType;
  label: string;
  placeholder: string;
  value: string;
  required: boolean;
  disabled: boolean;
  tag: string;
  name: string;
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
  options?: string[];
}

export interface HeadingInfo {
  level: number;
  text: string;
}

export interface LinkInfo {
  text: string;
  href: string;
}

export interface PageStructure {
  url: string;
  title: string;
  visibleText: string;
  interactive: InteractiveElement[];
  headings: HeadingInfo[];
  links: LinkInfo[];
}

export type ActionCommand =
  | 'TYPE'
  | 'CLICK'
  | 'SELECT'
  | 'READ'
  | 'SCROLL'
  | 'WAIT'
  | 'DONE';

export interface Action {
  command: ActionCommand;
  args: string[];
  raw: string;
}

export interface ActionResult {
  command: ActionCommand;
  success: boolean;
  error?: string;
  value?: string;
}

// --- Messaging ---

export type BackgroundRequest =
  | { type: 'READ_PAGE' }
  | { type: 'ASK_AI'; messages: ChatMessage[]; apiKey: string; baseUrl: string; model: string }
  | { type: 'WRITE_TO_PAGE'; text: string }
  | { type: 'GET_PAGE_STRUCTURE' }
  | { type: 'EXECUTE_ACTIONS'; actions: Action[] }
  | { type: 'BACKEND_FETCH'; url: string; options: Record<string, unknown> }
  | { type: 'GET_SESSIONS'; hostname: string }
  | { type: 'SAVE_SESSION'; hostname: string; session: TabSession }
  | { type: 'CREATE_SESSION'; hostname: string }
  | { type: 'DELETE_SESSION'; hostname: string; sessionId: string }
  | { type: 'RENAME_SESSION'; hostname: string; sessionId: string; label: string }
  | { type: 'SWITCH_SESSION'; hostname: string; sessionId: string }
  | { type: 'GET_ACTIVE_TAB' };

export type ContentRequest =
  | { type: 'WRITE_TO_PAGE'; text: string }
  | { type: 'READ_PAGE' }
  | { type: 'GET_PAGE_STRUCTURE' }
  | { type: 'EXECUTE_ACTIONS'; actions: Action[] };

export interface BackgroundResponse {
  ok: boolean;
  error?: string;
  text?: string;
  structure?: PageStructure;
  results?: ActionResult[];
  sessions?: TabSessionData;
  session?: TabSession;
  tabId?: number;
  url?: string;
}

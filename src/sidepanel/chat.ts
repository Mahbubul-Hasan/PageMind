import type { ChatMessage, IndicatorState } from '../types';

export function serializeMessages(container: HTMLElement): ChatMessage[] {
  return Array.from(container.children)
    .filter((el) => !el.classList.contains('loading') && !el.classList.contains('welcome'))
    .map((el) => ({
      role: el.classList.contains('user')
        ? 'user'
        : el.classList.contains('assistant')
          ? 'assistant'
          : el.classList.contains('error')
            ? 'error'
            : 'system',
      content: el.textContent ?? '',
    }));
}

export function getIndicatorState(
  dot: HTMLElement,
  indicator: HTMLElement,
): IndicatorState {
  return {
    text: indicator.textContent ?? '',
    dotClass: dot.className,
  };
}

export function applyIndicatorState(
  dot: HTMLElement,
  indicator: HTMLElement,
  state: IndicatorState,
): void {
  indicator.textContent = state.text;
  dot.className = state.dotClass;
}

export function isNearBottom(container: HTMLElement): boolean {
  return container.scrollHeight - container.scrollTop - container.clientHeight < 80;
}

export function addMessage(
  container: HTMLElement,
  role: string,
  content: string,
  writeText?: string,
): void {
  const wel = container.querySelector('.welcome');
  if (wel) wel.remove();

  const el = document.createElement('div');
  el.className = `message ${role}`;
  el.textContent = content;
  const snap = isNearBottom(container);
  container.appendChild(el);

  if (role === 'assistant' && writeText) {
    const btn = document.createElement('button');
    btn.className = 'write-btn';
    btn.textContent = 'Write to page';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Writing...';
      try {
        const r = await chrome.runtime.sendMessage({ type: 'WRITE_TO_PAGE', text: writeText });
        if (r?.ok) {
          btn.textContent = '\u2713 Written';
          btn.className = 'write-btn done';
        } else {
          btn.textContent = '\u2717 ' + (r?.error ?? 'Failed');
          btn.className = 'write-btn error';
        }
      } catch {
        btn.textContent = '\u2717 Error';
        btn.className = 'write-btn error';
      }
    });
    el.appendChild(btn);
  }

  if (snap) container.scrollTop = container.scrollHeight;
}

export function removeLoading(container: HTMLElement): void {
  const el = container.querySelector('.message.loading');
  if (el) el.remove();
}

export function showLoading(container: HTMLElement): void {
  const el = document.createElement('div');
  el.className = 'message loading';
  el.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

export function renderMessages(
  container: HTMLElement,
  messages?: ChatMessage[],
): void {
  container.innerHTML = '';
  const wel = document.createElement('div');
  wel.className = 'welcome';
  wel.innerHTML = '<p>Open this panel on any page<br/>and ask me anything about it.</p>';
  container.appendChild(wel);
  for (const m of messages ?? []) {
    const el = document.createElement('div');
    el.className = `message ${m.role}`;
    el.textContent = m.content;
    container.appendChild(el);
  }
}

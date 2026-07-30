import type { ChatMessage, IndicatorState, Action, ActionResult } from '../types';

export function serializeMessages(container: HTMLElement): ChatMessage[] {
  return Array.from(container.children)
    .filter((el) => !el.classList.contains('loading') && !el.classList.contains('welcome'))
    .map((el) => {
      const role =
        el.classList.contains('user') ? 'user' :
        el.classList.contains('assistant') ? 'assistant' :
        el.classList.contains('error') ? 'error' :
        el.classList.contains('action-step') ? 'action' :
        'system';
      const stepLabel = el.querySelector('.action-label');
      return { role, content: stepLabel?.textContent ?? el.textContent ?? '' };
    });
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

export function addActionStep(
  container: HTMLElement,
  action: Action,
  result?: ActionResult,
): HTMLElement {
  const wel = container.querySelector('.welcome');
  if (wel) wel.remove();

  let stepsEl = container.querySelector('.action-steps:last-child') as HTMLElement | null;
  if (!stepsEl) {
    const msgEl = document.createElement('div');
    msgEl.className = 'message assistant';
    stepsEl = document.createElement('div');
    stepsEl.className = 'action-steps';
    msgEl.appendChild(stepsEl);
    container.appendChild(msgEl);
  }

  const step = document.createElement('div');
  step.className = 'action-step';

  const icon = document.createElement('span');
  icon.className = 'action-icon';
  icon.textContent = result ? (result.success ? '\u2713' : '\u2717') : '\u23F3';
  step.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'action-label';
  label.textContent = action.raw;
  step.appendChild(label);

  if (result && !result.success && result.error) {
    const err = document.createElement('span');
    err.className = 'action-error';
    err.textContent = result.error;
    step.appendChild(err);
  }

  stepsEl.appendChild(step);
  container.scrollTop = container.scrollHeight;
  return step;
}

export function updateActionStep(
  stepEl: HTMLElement,
  result: ActionResult,
): void {
  const icon = stepEl.querySelector('.action-icon')!;
  icon.textContent = result.success ? '\u2713' : '\u2717';
  if (!result.success && result.error) {
    const err = document.createElement('span');
    err.className = 'action-error';
    err.textContent = result.error;
    stepEl.appendChild(err);
  }
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

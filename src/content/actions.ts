import type { Action, ActionCommand, ActionResult } from '../types';

function findElements(label: string): Element[] {
  const trimmed = label.trim();

  // By index
  if (/^\d+$/.test(trimmed)) {
    return [];
  }

  // By visible text / label text (most natural for AI)
  const candidates: Element[] = [];
  const labels = document.querySelectorAll('label');
  for (const lbl of labels) {
    if (lbl.textContent?.trim().toLowerCase().includes(trimmed.toLowerCase())) {
      const forId = lbl.getAttribute('for');
      if (forId) {
        const el = document.getElementById(forId);
        if (el) candidates.push(el);
      } else {
        const input = lbl.querySelector('input, textarea, select');
        if (input) candidates.push(input);
      }
    }
  }

  // By placeholder
  const byPlaceholder = document.querySelector<HTMLElement>(
    `[placeholder="${CSS.escape(trimmed)}"], [placeholder*="${CSS.escape(trimmed)}"]`,
  );
  if (byPlaceholder) candidates.push(byPlaceholder);

  // By aria-label
  const byAria = document.querySelector<HTMLElement>(
    `[aria-label="${CSS.escape(trimmed)}"], [aria-label*="${CSS.escape(trimmed)}"]`,
  );
  if (byAria) candidates.push(byAria);

  // By name
  const byName = document.querySelector<HTMLElement>(
    `[name="${CSS.escape(trimmed)}"], [name*="${CSS.escape(trimmed)}"]`,
  );
  if (byName) candidates.push(byName);

  // By button/link text
  const buttons = document.querySelectorAll<HTMLElement>(
    'button, a, [role="button"], [role="link"], input[type="submit"], input[type="button"]',
  );
  for (const btn of buttons) {
    const t = btn.textContent?.trim().toLowerCase() ?? '';
    if (t === trimmed.toLowerCase() || t.includes(trimmed.toLowerCase())) {
      candidates.push(btn);
    }
  }

  return candidates;
}

function focusAndScroll(el: Element): void {
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (el instanceof HTMLElement) el.focus({ preventScroll: true });
}

async function executeType(args: string[]): Promise<ActionResult> {
  const text = args[0] ?? '';
  const label = args[1] ?? '';

  const els = findElements(label);
  if (els.length === 0) {
    return { command: 'TYPE', success: false, error: `Element "${label}" not found` };
  }

  const el = els[0];
  focusAndScroll(el);

  await new Promise((r) => setTimeout(r, 200));

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { command: 'TYPE', success: true, value: `Typed into "${label}"` };
  }

  if ((el as HTMLElement).isContentEditable) {
    el.textContent = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { command: 'TYPE', success: true, value: `Typed into contenteditable "${label}"` };
  }

  return { command: 'TYPE', success: false, error: `Element "${label}" is not editable` };
}

async function executeClick(args: string[]): Promise<ActionResult> {
  const label = args[0] ?? '';

  const els = findElements(label);
  if (els.length === 0) {
    return { command: 'CLICK', success: false, error: `Element "${label}" not found` };
  }

  const el = els[0] as HTMLElement;
  focusAndScroll(el);
  await new Promise((r) => setTimeout(r, 200));
  el.click();
  return { command: 'CLICK', success: true, value: `Clicked "${label}"` };
}

async function executeSelect(args: string[]): Promise<ActionResult> {
  const option = args[0] ?? '';
  const label = args[1] ?? '';

  const els = findElements(label);
  if (els.length === 0) {
    return { command: 'SELECT', success: false, error: `Select "${label}" not found` };
  }

  const el = els[0];
  if (!(el instanceof HTMLSelectElement)) {
    return { command: 'SELECT', success: false, error: `"${label}" is not a select element` };
  }

  focusAndScroll(el);
  await new Promise((r) => setTimeout(r, 200));

  for (const opt of el.options) {
    if (opt.text.toLowerCase().includes(option.toLowerCase()) || opt.value.toLowerCase() === option.toLowerCase()) {
      el.value = opt.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { command: 'SELECT', success: true, value: `Selected "${option}" from "${label}"` };
    }
  }

  return { command: 'SELECT', success: false, error: `Option "${option}" not found in "${label}"` };
}

function executeDone(): ActionResult {
  return { command: 'DONE', success: true, value: 'All actions completed.' };
}

export function parseActions(text: string): Action[] {
  const actions: Action[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const typeMatch = trimmed.match(/^(TYPE|CLICK|SELECT|READ|SCROLL\s*(DOWN|UP)?|WAIT|DONE)/i);
    if (!typeMatch) continue;

    const cmd = typeMatch[1].toUpperCase() as ActionCommand;

    if (cmd === 'DONE') {
      actions.push({ command: 'DONE', args: [], raw: trimmed });
      continue;
    }

    if (cmd === 'READ') {
      actions.push({ command: cmd, args: [], raw: trimmed });
      continue;
    }

    if (cmd === 'SCROLL') {
      actions.push({ command: 'SCROLL', args: [typeMatch[2]?.trim() || 'DOWN'], raw: trimmed });
      continue;
    }

    if (cmd === 'WAIT') {
      const ms = trimmed.match(/WAIT\s+(\d+)/i);
      actions.push({ command: 'WAIT', args: [ms?.[1] ?? '1000'], raw: trimmed });
      continue;
    }

    // TYPE "text" INTO "label"
    if (cmd === 'TYPE') {
      const match = trimmed.match(/TYPE\s+"([^"]*)"\s+INTO\s+"([^"]*)"/i);
      if (match) {
        actions.push({ command: 'TYPE', args: [match[1], match[2]], raw: trimmed });
      } else {
        const fallback = trimmed.replace(/^TYPE\s+/i, '').trim();
        actions.push({ command: 'TYPE', args: [fallback, ''], raw: trimmed });
      }
      continue;
    }

    // CLICK "label"
    if (cmd === 'CLICK') {
      const match = trimmed.match(/CLICK\s+"([^"]*)"/i);
      if (match) {
        actions.push({ command: 'CLICK', args: [match[1]], raw: trimmed });
      } else {
        actions.push({ command: 'CLICK', args: [trimmed.replace(/^CLICK\s+/i, '')], raw: trimmed });
      }
      continue;
    }

    // SELECT "option" FROM "label"
    if (cmd === 'SELECT') {
      const match = trimmed.match(/SELECT\s+"([^"]*)"\s+FROM\s+"([^"]*)"/i);
      if (match) {
        actions.push({ command: 'SELECT', args: [match[1], match[2]], raw: trimmed });
      }
      continue;
    }

    actions.push({ command: 'TYPE', args: [trimmed, ''], raw: trimmed });
  }

  return actions;
}

export async function executeActions(actions: Action[]): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  for (const action of actions) {
    let result: ActionResult;

    switch (action.command) {
      case 'TYPE':
        result = await executeType(action.args);
        break;
      case 'CLICK':
        result = await executeClick(action.args);
        break;
      case 'SELECT':
        result = await executeSelect(action.args);
        break;
      case 'READ':
        result = { command: 'READ', success: true, value: 'Page read requested' };
        break;
      case 'SCROLL': {
        const dir = action.args[0]?.toLowerCase() === 'up' ? -1 : 1;
        window.scrollBy({ top: dir * 600, behavior: 'smooth' });
        await new Promise((r) => setTimeout(r, 300));
        result = { command: 'SCROLL', success: true };
        break;
      }
      case 'WAIT': {
        const ms = parseInt(action.args[0] ?? '1000', 10);
        await new Promise((r) => setTimeout(r, ms));
        result = { command: 'WAIT', success: true };
        break;
      }
      case 'DONE':
        result = executeDone();
        break;
      default:
        result = { command: action.command, success: false, error: `Unknown command` };
    }

    results.push(result);
    if (!result.success) break;
  }

  return results;
}

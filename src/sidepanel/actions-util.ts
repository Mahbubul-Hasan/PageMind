import type { Action, ActionCommand, PageStructure } from '../types';

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

    if (cmd === 'TYPE') {
      const match = trimmed.match(/TYPE\s+"([^"]*)"\s+INTO\s+"([^"]*)"/i);
      if (match) {
        actions.push({ command: 'TYPE', args: [match[1], match[2]], raw: trimmed });
      } else {
        actions.push({ command: 'TYPE', args: [trimmed.replace(/^TYPE\s+/i, ''), ''], raw: trimmed });
      }
      continue;
    }

    if (cmd === 'CLICK') {
      const match = trimmed.match(/CLICK\s+"([^"]*)"/i);
      if (match) {
        actions.push({ command: 'CLICK', args: [match[1]], raw: trimmed });
      } else {
        actions.push({ command: 'CLICK', args: [trimmed.replace(/^CLICK\s+/i, '')], raw: trimmed });
      }
      continue;
    }

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

export function formatStructure(s: PageStructure): string {
  const lines: string[] = [];
  lines.push(`PAGE: ${s.title}`);
  lines.push(`URL: ${s.url}`);
  lines.push('');

  const byType: Record<string, typeof s.interactive> = {};
  for (const el of s.interactive) {
    const key = el.type;
    if (!byType[key]) byType[key] = [];
    byType[key].push(el);
  }

  for (const [type, els] of Object.entries(byType)) {
    lines.push(`[${type.toUpperCase()}]`);
    for (const el of els) {
      const parts: string[] = [`#${el.index} "${el.label}"`];
      if (el.placeholder) parts.push(`placeholder="${el.placeholder}"`);
      if (el.value) parts.push(`value="${el.value.slice(0, 50)}"`);
      if (el.required) parts.push('required');
      if (el.disabled) parts.push('disabled');
      if (el.options) parts.push(`options=[${el.options.join(', ')}]`);
      lines.push(`  ${parts.join(' ')}`);
    }
    lines.push('');
  }

  if (s.headings.length > 0) {
    lines.push('[HEADINGS]');
    for (const h of s.headings.slice(0, 20)) {
      lines.push(`  ${'  '.repeat(h.level - 1)}H${h.level}: ${h.text}`);
    }
    lines.push('');
  }

  if (s.visibleText) {
    lines.push('[TEXT]');
    lines.push(s.visibleText.slice(0, 3000));
  }

  return lines.join('\n');
}

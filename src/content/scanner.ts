import type { ElementType, InteractiveElement, HeadingInfo, LinkInfo, PageStructure } from '../types';
import { CONSTANTS } from '../types';

function getLabel(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) return label.textContent?.trim() ?? '';
    }
    const parent = el.closest('label');
    if (parent) return parent.textContent?.trim() ?? '';
  }
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder;
  const name = el.getAttribute('name');
  if (name) return name.replace(/[-_]/g, ' ');
  const title = el.getAttribute('title');
  if (title) return title;
  const text = el.textContent?.trim();
  if (text && text.length < 100) return text;
  return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '');
}

function getSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.getAttribute('name') && el instanceof HTMLInputElement) {
    return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
  }
  let path = el.tagName.toLowerCase();
  let parent = el.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
    const idx = siblings.indexOf(el) + 1;
    if (siblings.length > 1) path += `:nth-child(${idx})`;
  }
  return path;
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return true;
}

function getElementType(el: Element): ElementType {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') return 'checkbox';
    if (el.type === 'radio') return 'radio';
    if (el.type === 'file') return 'file-input';
    if (el.type === 'submit' || el.type === 'button' || el.type === 'reset') return 'button';
    return 'text-input';
  }
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLButtonElement) return 'button';
  if (el instanceof HTMLAnchorElement) return 'link';
  if ((el as HTMLElement).isContentEditable) return 'contenteditable';
  if (el.getAttribute('role') === 'button' || el.getAttribute('role') === 'combobox') return 'button';
  if (el.tagName === 'A' || el.getAttribute('role') === 'link') return 'link';
  return 'button';
}

function collectInteractive(): InteractiveElement[] {
  const elements: InteractiveElement[] = [];
  const selectors = [
    'input:not([type="hidden"])',
    'textarea',
    'select',
    'button',
    'a[href]',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="combobox"]',
    '[role="link"]',
    '[tabindex]:not([tabindex="-1"])',
  ];

  const candidates = document.querySelectorAll<HTMLElement>(selectors.join(','));
  let index = 0;

  for (const el of candidates) {
    if (!isVisible(el)) continue;
    if (elements.length >= CONSTANTS.MAX_STRUCTURE_ELEMENTS) break;

    const rect = el.getBoundingClientRect();
    const type = getElementType(el);
    let value = '';
    let options: string[] | undefined;

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      value = el.value;
    } else if (el instanceof HTMLSelectElement) {
      value = el.value;
      options = Array.from(el.options).map((o) => o.text);
    } else if ((el as HTMLElement).isContentEditable) {
      value = (el as HTMLElement).textContent ?? '';
    }

    elements.push({
      id: el.id || `e${index}`,
      index,
      type,
      label: getLabel(el),
      placeholder: el.getAttribute('placeholder') ?? '',
      value,
      required: el.matches('[required]'),
      disabled: el.matches('[disabled], [aria-disabled="true"]'),
      tag: el.tagName.toLowerCase(),
      name: el.getAttribute('name') ?? '',
      selector: getSelector(el),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      options,
    });
    index++;
  }
  return elements;
}

function collectHeadings(): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  for (let lvl = 1; lvl <= 6; lvl++) {
    for (const el of document.querySelectorAll(`h${lvl}`)) {
      const text = el.textContent?.trim();
      if (text) headings.push({ level: lvl, text });
    }
  }
  return headings;
}

function collectLinks(): LinkInfo[] {
  const links: LinkInfo[] = [];
  const seen = new Set<string>();
  for (const el of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const text = el.textContent?.trim();
    if (!text || !el.href) continue;
    const key = text + el.href;
    if (seen.has(key)) continue;
    seen.add(key);
    if (links.length >= 50) break;
    links.push({ text, href: el.href });
  }
  return links;
}

function getVisibleText(): string {
  const body = document.body;
  if (!body) return '';
  return body.innerText.slice(0, CONSTANTS.MAX_VISIBLE_TEXT_CHARS);
}

export function scanPage(): PageStructure {
  return {
    url: location.href,
    title: document.title,
    visibleText: getVisibleText(),
    interactive: collectInteractive(),
    headings: collectHeadings(),
    links: collectLinks(),
  };
}

export function formatStructure(s: PageStructure): string {
  const lines: string[] = [];
  lines.push(`PAGE: ${s.title}`);
  lines.push(`URL: ${s.url}`);
  lines.push('');

  const byType: Record<string, InteractiveElement[]> = {};
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

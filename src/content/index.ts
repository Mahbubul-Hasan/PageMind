import type { SidepanelRequest } from '../types';

const PAGE_TEXT_LIMIT = 30000;

function isGoogleDocs(): boolean {
  return (
    location.hostname === 'docs.google.com' &&
    location.pathname.startsWith('/document/')
  );
}

function readGoogleDocs(): string | null {
  try {
    const iframe = document.querySelector('iframe.docs-texteventtarget-iframe') as HTMLIFrameElement | null;
    if (!iframe) return null;
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (!doc) return null;
    const editable = doc.querySelector('[contenteditable]');
    if (!editable) return null;
    return editable.textContent ?? '';
  } catch {
    return null;
  }
}

function readPage(): string {
  if (isGoogleDocs()) {
    const docText = readGoogleDocs();
    if (docText) return docText.slice(0, PAGE_TEXT_LIMIT);
  }

  const el = document.activeElement;
  const isEditable =
    el &&
    (el.tagName === 'TEXTAREA' ||
      el.tagName === 'INPUT' ||
      (el as HTMLElement).isContentEditable);

  if (isEditable && el) {
    const text =
      el.tagName === 'TEXTAREA' || el.tagName === 'INPUT'
        ? (el as HTMLInputElement).value
        : (el as HTMLElement).textContent ?? (el as HTMLElement).innerText ?? '';
    return text.slice(0, PAGE_TEXT_LIMIT);
  }

  const body = document.body;
  return body ? body.innerText.slice(0, PAGE_TEXT_LIMIT) : '';
}

function writeToPage(text: string): void {
  const el = document.activeElement;
  if (!el) throw new Error('No element focused.');

  const isEditable =
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'INPUT' ||
    (el as HTMLElement).isContentEditable;
  if (!isEditable) throw new Error('Focused element is not editable.');

  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    const input = el as HTMLInputElement;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const before = input.value.substring(0, start);
    const after = input.value.substring(end);
    input.value = before + text + after;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } else if ((el as HTMLElement).isContentEditable) {
    (el as HTMLElement).focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    const ev = new ClipboardEvent('paste', {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    const cancelled = !(el as HTMLElement).dispatchEvent(ev);
    if (!cancelled || !(el as HTMLElement).textContent?.includes(text)) {
      document.execCommand('insertText', false, text);
    }
  }
}

chrome.runtime.onMessage.addListener(
  (msg: SidepanelRequest, _sender: chrome.runtime.MessageSender, sendResponse: (r: Record<string, unknown>) => void) => {
    if (msg.type === 'READ_PAGE') {
      sendResponse({ ok: true, text: readPage() });
    } else if (msg.type === 'WRITE_TO_PAGE') {
      try {
        writeToPage(msg.text);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: (e as Error).message });
      }
    }
    return true;
  },
);

readPage();

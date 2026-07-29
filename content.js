function readPage() {
  if (isGoogleDocs()) {
    const docText = readGoogleDocs();
    if (docText) return docText.slice(0, 30000);
  }

  const el = document.activeElement;
  const isEditable =
    el &&
    (el.tagName === "TEXTAREA" ||
      el.tagName === "INPUT" ||
      el.isContentEditable);

  if (isEditable) {
    const text =
      el.tagName === "TEXTAREA" || el.tagName === "INPUT"
        ? el.value
        : el.textContent || el.innerText || "";
    return text.slice(0, 30000);
  }

  const body = document.body;
  return body ? body.innerText.slice(0, 30000) : "";
}

function isGoogleDocs() {
  return (
    location.hostname === "docs.google.com" &&
    location.pathname.startsWith("/document/")
  );
}

function readGoogleDocs() {
  try {
    const iframe = document.querySelector("iframe.docs-texteventtarget-iframe");
    if (!iframe) return null;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return null;
    const editable = doc.querySelector("[contenteditable]");
    if (!editable) return null;
    return editable.textContent || "";
  } catch {
    return null;
  }
}

function writeToPage(text) {
  const el = document.activeElement;
  if (!el) throw new Error("No element focused.");

  const isEditable =
    el.tagName === "TEXTAREA" ||
    el.tagName === "INPUT" ||
    el.isContentEditable;
  if (!isEditable) throw new Error("Focused element is not editable.");

  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const before = el.value.substring(0, start);
    const after = el.value.substring(end);
    el.value = before + text + after;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (el.isContentEditable) {
    el.focus();
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    const ev = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    const cancelled = !el.dispatchEvent(ev);
    if (!cancelled || !el.textContent.includes(text)) {
      document.execCommand("insertText", false, text);
    }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "READ_PAGE") {
    sendResponse({ ok: true, text: readPage() });
  } else if (msg.type === "WRITE_TO_PAGE") {
    try {
      writeToPage(msg.text);
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  }
  return true;
});

readPage();

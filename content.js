chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleContentMessage(msg)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true;
});

async function handleContentMessage(msg) {
  switch (msg.type) {
    case "READ_PAGE":
      return readPage(msg.mode);
    case "WRITE_TO_PAGE":
      return writeToPage(msg.text, msg.writeMode);
    default:
      throw new Error("Unknown content message type: " + msg.type);
  }
}

function readPage(mode = "auto") {
  const el = document.activeElement;
  const isEditable =
    el &&
    (el.tagName === "TEXTAREA" ||
      el.tagName === "INPUT" ||
      el.isContentEditable);

  if (mode === "focused" || (mode === "auto" && isEditable)) {
    return { text: readElementText(el), source: "focused" };
  }

  const body = document.body;
  if (!body) throw new Error("No document body found.");
  return { text: body.innerText.slice(0, 50000), source: "page" };
}

function readElementText(el) {
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    return el.value;
  }
  return el.textContent || el.innerText || "";
}

function writeToPage(text, writeMode = "replace") {
  const el = document.activeElement;
  if (!el) throw new Error("No element focused on the page.");

  const isEditable =
    el.tagName === "TEXTAREA" ||
    el.tagName === "INPUT" ||
    el.isContentEditable;

  if (!isEditable) throw new Error("Focused element is not editable.");

  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    writeToInput(el, text, writeMode);
  } else if (el.isContentEditable) {
    writeToContentEditable(el, text, writeMode);
  }

  return { written: true };
}

function writeToInput(el, text, writeMode) {
  el.focus();

  if (writeMode === "replace") {
    el.value = text;
  } else {
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const before = el.value.substring(0, start);
    const after = el.value.substring(end);
    el.value = before + text + after;
  }

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function writeToContentEditable(el, text, writeMode) {
  el.focus();

  if (writeMode === "replace") {
    el.textContent = "";
  }

  const dt = new DataTransfer();
  dt.setData("text/plain", text);
  const pasteEvent = new ClipboardEvent("paste", {
    clipboardData: dt,
    bubbles: true,
    cancelable: true,
  });

  const cancelled = !el.dispatchEvent(pasteEvent);

  if (cancelled && el.textContent.includes(text)) {
    return;
  }

  document.execCommand("insertText", false, text);
}

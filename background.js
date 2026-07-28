const API_BASE_URLS = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true;
});

async function handleMessage(msg, _sender) {
  switch (msg.type) {
    case "READ_PAGE":
      return sendToActiveTab({ type: "READ_PAGE", mode: msg.mode });
    case "WRITE_TO_PAGE":
      return sendToActiveTab({
        type: "WRITE_TO_PAGE",
        text: msg.text,
        writeMode: msg.writeMode,
      });
    case "GENERATE_TEXT":
      return generateText(msg.messages, msg.apiKey, msg.model, msg.provider);
    default:
      throw new Error("Unknown message type: " + msg.type);
  }
}

async function sendToActiveTab(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response?.ok) {
        reject(new Error(response?.error || "Content script did not respond"));
      } else {
        resolve(response);
      }
    });
  });
}

async function generateText(messages, apiKey, model, provider = "openai") {
  if (!apiKey) throw new Error("No API key set.");
  if (!messages || !messages.length) throw new Error("No messages provided.");

  const url = API_BASE_URLS[provider] || API_BASE_URLS.openai;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || (provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini"),
      messages,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${provider} API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";

  return { text: content };
}

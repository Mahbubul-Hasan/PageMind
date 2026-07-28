const $ = (id) => document.getElementById(id);

let state = {
  cvText: "",
  pageText: "",
  pageSource: "",
  generatedText: "",
};

function log(msg) {
  const el = $("log");
  const time = new Date().toLocaleTimeString();
  el.textContent = `[${time}] ${msg}\n` + el.textContent;
}

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => resolve(response));
  });
}

// ---------- Settings ----------

$("settingsToggle").addEventListener("click", () => {
  $("settingsPanel").classList.toggle("hidden");
});

async function loadSettings() {
  const stored = await chrome.storage.local.get(["openaiApiKey", "openaiModel", "cvText"]);
  if (stored.openaiApiKey) $("apiKey").value = stored.openaiApiKey;
  if (stored.openaiModel) $("model").value = stored.openaiModel;
  if (stored.cvText) {
    state.cvText = stored.cvText;
    $("cvStatus").textContent = `CV loaded (${stored.cvText.length} characters).`;
  }
  if (!stored.openaiApiKey) $("settingsPanel").classList.remove("hidden");
}

$("saveSettings").addEventListener("click", async () => {
  await chrome.storage.local.set({
    openaiApiKey: $("apiKey").value.trim(),
    openaiModel: $("model").value,
  });
  log("Settings saved.");
  $("settingsPanel").classList.add("hidden");
});

// ---------- CV ----------

$("setCv").addEventListener("click", async () => {
  $("setCv").disabled = true;
  $("cvStatus").textContent = "Reading page...";
  log("Reading current page as CV...");

  const res = await send({ type: "READ_PAGE", mode: "page" });
  if (!res.ok) {
    $("cvStatus").textContent = "Error: " + res.error;
    log("Error: " + res.error);
    $("setCv").disabled = false;
    return;
  }

  state.cvText = res.text;
  await chrome.storage.local.set({ cvText: res.text });
  $("cvStatus").textContent = `CV loaded from page (${res.text.length} characters).`;
  log(`CV set from page (${res.text.length} chars).`);
  $("setCv").disabled = false;
});

$("clearCv").addEventListener("click", async () => {
  state.cvText = "";
  await chrome.storage.local.remove("cvText");
  $("cvStatus").textContent = "No CV set.";
  log("CV cleared.");
});

// ---------- Page context ----------

async function readPageContext() {
  const res = await send({ type: "READ_PAGE", mode: "auto" });
  if (!res.ok) {
    $("pageStatus").textContent = "Error: " + res.error;
    return;
  }
  state.pageText = res.text;
  state.pageSource = res.source;
  $("pageStatus").textContent = `Read from ${res.source} (${res.text.length} characters).`;
  $("pagePreview").textContent = res.text.slice(0, 2000);
}

$("refreshPage").addEventListener("click", async () => {
  $("pageStatus").textContent = "Reading...";
  await readPageContext();
  log("Page context refreshed.");
});

// ---------- Generate ----------

$("generate").addEventListener("click", async () => {
  const promptText = $("prompt").value.trim();
  const settings = await chrome.storage.local.get(["openaiApiKey", "openaiModel"]);

  if (!settings.openaiApiKey) {
    $("genStatus").textContent = "Add your OpenAI API key in settings (⚙️).";
    $("settingsPanel").classList.remove("hidden");
    return;
  }
  if (!promptText) {
    $("genStatus").textContent = "Enter what you want to write.";
    return;
  }

  const systemParts = [];
  systemParts.push("You are an expert writing assistant. The user has a CV and is viewing a target page. Use the CV to accurately reflect the user's background and expertise. Use the page context to understand the target audience or requirements.");

  if (state.cvText) {
    systemParts.push(`\n\nUSER'S CV:\n${state.cvText}`);
  }
  if (state.pageText) {
    systemParts.push(`\n\nPAGE CONTEXT:\n${state.pageText}`);
  }

  $("generate").disabled = true;
  $("genStatus").textContent = "Generating...";
  log("Calling OpenAI...");

  const res = await send({
    type: "GENERATE_TEXT",
    messages: [
      { role: "system", content: systemParts.join("") },
      { role: "user", content: promptText },
    ],
    apiKey: settings.openaiApiKey,
    model: settings.openaiModel,
  });

  $("generate").disabled = false;

  if (!res.ok) {
    $("genStatus").textContent = "Error: " + res.error;
    log("Error generating: " + res.error);
    return;
  }

  state.generatedText = res.text;
  $("resultText").textContent = res.text;
  $("genStatus").textContent = "Generated.";
  $("resultSection").classList.remove("hidden");
  $("writeToPage").disabled = false;
  log("Text generated.");
});

// ---------- Write to page ----------

$("writeToPage").addEventListener("click", async () => {
  if (!state.generatedText) return;

  $("writeToPage").disabled = true;
  const writeMode = $("writeMode").value;
  log(`Writing to page (${writeMode})...`);

  const res = await send({
    type: "WRITE_TO_PAGE",
    text: state.generatedText,
    writeMode,
  });

  if (!res.ok) {
    log("Error writing: " + res.error);
    $("writeToPage").disabled = false;
    return;
  }

  log("Written to page successfully.");
});

// ---------- Init ----------

loadSettings();

// Auto-read page context on open
async function initPageRead() {
  $("pageStatus").textContent = "Reading page...";
  await readPageContext();
  log("Page auto-read on open.");
}

initPageRead();

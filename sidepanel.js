const $ = (id) => document.getElementById(id);

let state = {
  docId: null,
  docTitle: "",
  cvText: "",
  edits: []
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
  const stored = await chrome.storage.local.get(["openaiApiKey", "openaiModel"]);
  if (stored.openaiApiKey) $("apiKey").value = stored.openaiApiKey;
  if (stored.openaiModel) $("model").value = stored.openaiModel;
  if (!stored.openaiApiKey) $("settingsPanel").classList.remove("hidden");
}

$("saveSettings").addEventListener("click", async () => {
  await chrome.storage.local.set({
    openaiApiKey: $("apiKey").value.trim(),
    openaiModel: $("model").value
  });
  log("Settings saved.");
  $("settingsPanel").classList.add("hidden");
});

// ---------- Load CV from active Google Doc ----------

$("loadDoc").addEventListener("click", async () => {
  $("docStatus").textContent = "Loading...";
  const idRes = await send({ type: "GET_ACTIVE_DOC_ID" });
  if (!idRes.ok) {
    $("docStatus").textContent = idRes.error;
    log("Error: " + idRes.error);
    return;
  }
  state.docId = idRes.docId;

  const docRes = await send({ type: "FETCH_DOC", docId: state.docId });
  if (!docRes.ok) {
    $("docStatus").textContent = docRes.error;
    log("Error: " + docRes.error);
    return;
  }
  state.cvText = docRes.plainText;
  state.docTitle = docRes.title;
  $("docStatus").textContent = `Loaded "${docRes.title}" (${docRes.plainText.length} characters).`;
  log(`Loaded doc: ${docRes.title}`);
});

// ---------- Job description ----------

$("fetchJdUrl").addEventListener("click", async () => {
  const url = $("jdUrl").value.trim();
  if (!url) return;
  log("Fetching job description from URL...");
  const res = await send({ type: "FETCH_JD_FROM_URL", url });
  if (!res.ok) {
    log("Error fetching JD: " + res.error);
    return;
  }
  $("jdText").value = res.jdText;
  log("Job description fetched from URL.");
});

// ---------- Generate edits ----------

$("generate").addEventListener("click", async () => {
  const jdText = $("jdText").value.trim();
  if (!state.cvText) {
    $("genStatus").textContent = "Load your CV first (step 1).";
    return;
  }
  if (!jdText) {
    $("genStatus").textContent = "Paste or fetch a job description first (step 2).";
    return;
  }

  const settings = await chrome.storage.local.get(["openaiApiKey", "openaiModel"]);
  if (!settings.openaiApiKey) {
    $("genStatus").textContent = "Add your OpenAI API key in settings (⚙️).";
    $("settingsPanel").classList.remove("hidden");
    return;
  }

  $("generate").disabled = true;
  $("genStatus").textContent = "Generating suggestions...";
  log("Calling OpenAI for edit suggestions...");

  const res = await send({
    type: "GENERATE_EDITS",
    cvText: state.cvText,
    jdText,
    apiKey: settings.openaiApiKey,
    model: settings.openaiModel
  });

  $("generate").disabled = false;

  if (!res.ok) {
    $("genStatus").textContent = "Error: " + res.error;
    log("Error generating edits: " + res.error);
    return;
  }

  state.edits = res.edits.map((e, i) => ({ ...e, id: i, status: "pending" }));
  $("genStatus").textContent = `${state.edits.length} suggested edit(s)${res.dropped ? ` (${res.dropped} dropped — text didn't match verbatim)` : ""}.`;
  log(`Received ${state.edits.length} verified edit(s).`);
  renderEdits();
});

function renderEdits() {
  const section = $("editsSection");
  const list = $("editsList");
  list.innerHTML = "";

  if (state.edits.length === 0) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");

  for (const edit of state.edits) {
    const card = document.createElement("div");
    card.className = "edit-card" + (edit.status !== "pending" ? " applied" : "");
    card.dataset.id = edit.id;

    const reason = document.createElement("div");
    reason.className = "reason";
    reason.textContent = edit.reason || "";
    card.appendChild(reason);

    const diff = document.createElement("div");
    diff.className = "diff";

    const findEl = document.createElement("span");
    findEl.className = "find";
    findEl.textContent = edit.find;
    diff.appendChild(findEl);

    const replaceEl = document.createElement("span");
    replaceEl.className = "replace";
    replaceEl.textContent = edit.replace;
    diff.appendChild(replaceEl);

    card.appendChild(diff);

    if (edit.status === "pending") {
      const actions = document.createElement("div");
      actions.className = "edit-actions";

      const acceptBtn = document.createElement("button");
      acceptBtn.className = "accept";
      acceptBtn.textContent = "Accept";
      acceptBtn.addEventListener("click", () => applyEdit(edit.id));

      const rejectBtn = document.createElement("button");
      rejectBtn.className = "reject";
      rejectBtn.textContent = "Reject";
      rejectBtn.addEventListener("click", () => rejectEdit(edit.id));

      actions.appendChild(acceptBtn);
      actions.appendChild(rejectBtn);
      card.appendChild(actions);
    } else {
      const statusEl = document.createElement("div");
      statusEl.className = "hint";
      statusEl.textContent = edit.status === "applied" ? "✓ Applied" : "✗ Rejected";
      card.appendChild(statusEl);
    }

    list.appendChild(card);
  }
}

async function applyEdit(id) {
  const edit = state.edits.find((e) => e.id === id);
  if (!edit || !state.docId) return;

  log(`Applying edit #${id}...`);
  const res = await send({
    type: "APPLY_EDIT",
    docId: state.docId,
    find: edit.find,
    replace: edit.replace,
    matchCase: true
  });

  if (!res.ok) {
    log(`Error applying edit #${id}: ` + res.error);
    return;
  }

  edit.status = "applied";
  log(`Edit #${id} applied (${res.occurrences} occurrence(s) changed).`);
  renderEdits();
}

function rejectEdit(id) {
  const edit = state.edits.find((e) => e.id === id);
  if (!edit) return;
  edit.status = "rejected";
  renderEdits();
}

loadSettings();

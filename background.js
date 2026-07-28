// background.js — service worker (MV3)

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true; // keep the message channel open for the async response
});

async function handleMessage(msg) {
  switch (msg.type) {
    case "GET_ACTIVE_DOC_ID":
      return getActiveDocId();
    case "FETCH_DOC":
      return fetchDoc(msg.docId);
    case "FETCH_JD_FROM_URL":
      return fetchJdFromUrl(msg.url);
    case "GENERATE_EDITS":
      return generateEdits(msg.cvText, msg.jdText, msg.apiKey, msg.model);
    case "APPLY_EDIT":
      return applyEdit(msg.docId, msg.find, msg.replace, msg.matchCase);
    default:
      throw new Error("Unknown message type: " + msg.type);
  }
}

// ---------- Google Doc access ----------

async function getActiveDocId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) throw new Error("No active tab found.");
  const match = tab.url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error("Active tab is not a Google Doc. Open your CV in Google Docs, then reopen the side panel.");
  }
  return { docId: match[1], title: tab.title || "" };
}

function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(
          new Error(
            chrome.runtime.lastError?.message ||
              "Failed to get Google auth token. Check that oauth2.client_id is set correctly in manifest.json."
          )
        );
      } else {
        resolve(token);
      }
    });
  });
}

async function fetchDoc(docId) {
  const token = await getAuthToken(true);
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Docs API error (${res.status}): ${text}`);
  }
  const doc = await res.json();
  const plainText = extractPlainText(doc);
  return { plainText, title: doc.title };
}

function extractPlainText(doc) {
  let text = "";
  const walkParagraph = (paragraph) => {
    for (const pe of paragraph.elements || []) {
      if (pe.textRun?.content) text += pe.textRun.content;
    }
  };
  const content = doc.body?.content || [];
  for (const el of content) {
    if (el.paragraph) {
      walkParagraph(el.paragraph);
    } else if (el.table) {
      for (const row of el.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          for (const cellEl of cell.content || []) {
            if (cellEl.paragraph) walkParagraph(cellEl.paragraph);
          }
        }
      }
    }
  }
  return text;
}

async function applyEdit(docId, find, replace, matchCase = true) {
  const token = await getAuthToken(true);
  const res = await fetch(`https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      requests: [
        {
          replaceAllText: {
            containsText: { text: find, matchCase },
            replaceText: replace
          }
        }
      ]
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to apply edit (${res.status}): ${text}`);
  }
  const result = await res.json();
  const occurrences = result.replies?.[0]?.replaceAllText?.occurrencesChanged || 0;
  return { occurrences };
}

// ---------- Job description from URL ----------

async function fetchJdFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch job posting (${res.status}). Try pasting the text instead.`);
  const html = await res.text();
  const text = stripHtml(html);
  return { jdText: text.slice(0, 20000) };
}

function stripHtml(html) {
  const noScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  return noScripts
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- OpenAI ----------

async function generateEdits(cvText, jdText, apiKey, model) {
  if (!apiKey) throw new Error("No OpenAI API key set. Add it in the side panel settings.");
  if (!cvText || !cvText.trim()) throw new Error("CV text is empty — load your doc first.");
  if (!jdText || !jdText.trim()) throw new Error("Job description is empty.");

  const systemPrompt = `You are an expert resume editor. You will be given a candidate's current CV (plain text extracted from a Google Doc) and a target job description.

Propose a small set of TARGETED edits that better align the CV to the job description. Rules:
- Never fabricate employers, titles, dates, degrees, or skills the candidate doesn't already mention or clearly imply.
- Prefer rewording, reprioritizing, and emphasizing existing relevant experience/keywords over adding new claims.
- Each edit must be a find/replace pair where "find" is an EXACT, VERBATIM substring copied from the provided CV text (unique enough to match only the intended location — use a full sentence or bullet point, not a short fragment).
- "replace" is the improved text for that same span, matching the candidate's voice, tense, and formatting style.
- Return 3 to 10 edits, ordered by impact (most impactful first).

Respond with ONLY a JSON array, no prose, no markdown fences, in this exact shape:
[{"find": "...", "replace": "...", "reason": "..."}]`;

  const userPrompt = `JOB DESCRIPTION:\n${jdText}\n\nCURRENT CV TEXT:\n${cvText}`;

  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.4
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "[]";
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

  let edits;
  try {
    edits = JSON.parse(cleaned);
  } catch (e) {
    throw new Error("Could not parse model response as JSON: " + cleaned.slice(0, 300));
  }

  // Safety check: only keep edits whose "find" text actually exists verbatim in the CV.
  const verified = edits.filter((e) => typeof e.find === "string" && cvText.includes(e.find));
  return { edits: verified, dropped: edits.length - verified.length };
}

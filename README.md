# CV Tailor for Google Docs

A Chrome extension that reads your CV from an open Google Doc, compares it to a job
description, and proposes targeted edits. Every edit is shown in a side panel as a
find/replace diff — nothing is written to your doc until you click **Accept**.

## How it works

- Reads your doc through the official **Google Docs API** (not screen-scraping), so it
  works reliably regardless of how Google Docs renders on screen.
- Sends your CV text + job description to **OpenAI** to generate suggestions.
- Applies accepted edits back to the doc via the Docs API's `replaceAllText`, so accepted
  edits show up as a normal (non-destructive, undoable with Ctrl+Z) text replacement.
- Before showing you a suggestion, it verifies the "find" text exists **verbatim** in your
  CV — if the model invents something that doesn't match, it's silently dropped rather than
  shown as a broken suggestion.

## One-time setup

You need your own Google OAuth client ID (free) so the extension can read/write your Doc
on your behalf, and your own OpenAI API key.

### 1. Load the extension (get its ID first)

1. Go to `chrome://extensions`, enable **Developer mode** (top right).
2. Click **Load unpacked**, select this folder.
3. Copy the **extension ID** shown on the card (looks like `abcdefghijklmnop...`).

### 2. Create a Google OAuth client

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create a new project
   (or use an existing one).
2. **APIs & Services → Library** → enable **Google Docs API**.
3. **APIs & Services → OAuth consent screen** → set up as "External" (or "Internal" if
   you're on Google Workspace), add your own email as a test user if prompted.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
   - Application type: **Chrome extension**
   - Item ID: paste the extension ID you copied in step 1.
5. Copy the generated **Client ID**.

### 3. Wire the client ID into the extension

1. Open `manifest.json` in this folder.
2. Replace `REPLACE_WITH_YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com` with the client
   ID from step 2.
3. Go back to `chrome://extensions` and click the reload icon on the extension card.

### 4. Add your OpenAI API key

1. Click the extension icon to open the side panel.
2. Click the ⚙️ icon, paste your OpenAI API key, choose a model, click **Save**.
   - Key is stored only in this browser's local extension storage and sent directly to
     OpenAI — never anywhere else.

## Using it

1. Open your CV in a Google Docs tab.
2. Open the side panel, click **Load CV from active Google Doc tab**.
3. Paste a job posting URL and click **Fetch from URL**, or paste the job description text
   directly.
4. Click **Generate suggested edits**.
5. Review each suggestion — **Accept** writes it to the doc, **Reject** dismisses it.

## Notes & limitations

- `replaceAllText` matches are literal text matches. If the model proposes very short
  "find" text, it could match more than one spot in the doc — the model is instructed to
  avoid this by preferring full sentences/bullets, but double-check occurrence counts in
  the log at the bottom of the panel.
- This only works on Google Docs (`docs.google.com/document/...`), not Word Online or PDFs.
- Google's OAuth consent screen may show an "unverified app" warning since this is your own
  personal-use OAuth client — that's expected and safe to proceed through for an app only
  you use.

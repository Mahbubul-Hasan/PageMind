# CV Tailor

A Chrome extension that reads your CV from any page, understands the page context, and writes AI-generated content anywhere — no OAuth setup needed.

## How it works

- **Content script** is injected on every page you visit. It reads page text and writes back to focused input fields, textareas, and contenteditable elements.
- **No OAuth, no API keys to configure** — just add your own OpenAI API key in settings.
- Your **CV** is read once from a page (e.g., a Google Doc with your resume), stored locally, and reused.
- **Page context** is auto-read when you open the side panel — the focused field or the whole page.
- **Prompt** what you want to write (cover letter, LinkedIn message, rewrite a paragraph).
- **AI generates** the text using your CV + page context + prompt.
- **Write to page** inserts at cursor or replaces the focused field.

## Setup

### 1. Load the extension

1. Go to `chrome://extensions`, enable **Developer mode** (top right).
2. Click **Load unpacked**, select this folder.

### 2. Add your OpenAI API key

1. Click the extension icon to open the side panel.
2. Click the ⚙️ icon, paste your OpenAI API key, choose a model, click **Save**.

## Using it

1. Navigate to your CV (e.g., a Google Doc with your resume), click **Read CV from current page**.
2. Navigate to the target page (job posting, LinkedIn, Fiverr, etc.) — context auto-loads.
3. Type what you want to write in the prompt.
4. Click **Generate**, review the result.
5. Choose **Insert at cursor** or **Replace all**, click **Write to page**.

## Limitations

- **Google Docs**: Reading text from a canvas-rendered Google Doc may not capture the full document. If the auto-read misses content, copy-paste your CV text directly — or open the extension on a page where the CV text is visible as regular HTML.
- Works on any site with standard text inputs, textareas, or contenteditable fields.

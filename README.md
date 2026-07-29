# PageMind

Read, chat, and write on any page.

A Chrome extension + NestJS backend that reads page content, understands context, and generates AI-powered responses.

## Chrome Extension

### How it works

- **Content script** is injected on every page you visit. It reads page text and writes back to focused input fields, textareas, and contenteditable elements.
- **No OAuth, no API keys to configure** — just add your own OpenAI/Groq/etc. API key in settings.
- **Page context** is auto-read when you open the side panel — the focused field or the whole page.
- **Prompt what you want**: AI generates the response using page context.
- **Write to page** inserts at cursor or replaces the focused field.
- **Optional backend**: Enable the backend for proxied API calls (hide API key from page context) + cross-device sync of documents and conversations.

### Setup (standalone mode — no backend needed)

1. Go to `chrome://extensions`, enable **Developer mode** (top right).
2. Click **Load unpacked**, select this folder (`pagmind-backend` not needed).
3. Click the extension icon to open the side panel, go to ⚙️ Settings, paste your API key, click **Save**.

### Setup (with backend)

1. Start the backend (see below).
2. In the extension settings, enter the backend URL (e.g. `http://localhost:3000`) and check **Use backend**.
 3. The extension will proxy API calls through the backend and store documents/conversations on the server.

## Backend (`pagmind-backend/`)

Built with [NestJS](https://nestjs.com) + TypeORM + SQLite.

### Features

| Endpoint | Description |
|---|---|
| `POST /api/proxy/chat` | Proxy LLM calls (OpenAI/Anthropic/Groq) |
| `GET /api/documents` | List saved documents |
| `POST /api/documents` | Save page content (CV, notes, article, etc.) |
| `GET /api/documents/:id` | Get a document |
| `PUT /api/documents/:id` | Update a document |
| `DELETE /api/documents/:id` | Delete a document |
| `GET /api/conversations` | List conversations |
| `POST /api/conversations` | Create a conversation |
| `GET /api/conversations/:id` | Get conversation with messages |
| `DELETE /api/conversations/:id` | Delete a conversation |
| `POST /api/conversations/:id/messages` | Add a message |

Full Swagger docs at `/docs` when running.

### Quick start

```bash
cd pagmind-backend
npm install
npm run start:dev
```

### Environment

Configure via `.env` file:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `DATABASE_PATH` | `./data/pagmind.db` | SQLite database path |
| `CORS_ORIGIN` | `*` | CORS origin |

### Build for production

```bash
npm run build
npm run start:prod
```

## Tech Stack

- **Extension**: Vanilla JS, Chrome Extension Manifest V3
- **Backend**: NestJS, TypeORM, SQLite (better-sqlite3), Swagger/OpenAPI

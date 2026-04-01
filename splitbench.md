# Split Bench — Project Overview

Split Bench is a local web app that routes every prompt through a multi-model deliberation pipeline. Instead of querying one LLM, a council of models answers independently, peer-reviews each other, and produces a ranked or synthesised final answer.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.10+, FastAPI, uvicorn, httpx (async), python-dotenv, pydantic |
| Frontend | React 18, Vite, ReactMarkdown |
| LLM Gateway | OpenRouter (all model calls go through `backend/openrouter.py`) |
| Storage | JSON files on disk in `data/` (no database) |

**Ports:** Backend `8001` · Frontend `5173`

---

## How It Works

Every user prompt goes through three stages, streamed back to the UI via Server-Sent Events (SSE):

### Stage 1 — Independent Answers
All council models answer the prompt in parallel. Results are collected and shown in a tab view. Failed models are flagged but do not block the pipeline.

### Stage 2 — Peer Review
Each council model receives the other models' responses, anonymised as "Response A", "Response B", etc. to prevent brand bias. Each model produces a ranking. The backend aggregates rankings and computes a winner.

### Stage 3 — Final Answer
Two modes selectable per message:

| Mode | Behaviour |
|------|-----------|
| **Best** | Returns the Stage 1 response with the highest aggregate peer rank. No extra LLM call. |
| **Merged** | A designated chairman model reads all Stage 1 responses and Stage 2 rankings and writes a synthesis. |

---

## Features

### Conversation Management
- Conversations created lazily on first send; titles auto-generated in parallel with Stage 1 (no latency cost)
- Edit conversation from sidebar (pre-fills composer with original prompt)
- Inline edit of the latest user message; re-runs from that point
- Delete conversation (removes file from disk)

### Model Configuration
- Council models (min 2) + chairman model configured via a modal
- Searchable list of all OpenRouter models, cached 1 hour in memory
- Config saved to `data/model_config.json`; mtime-based cache means external edits are picked up automatically

### Prompt Templates
- 15 built-in templates across four categories: Creative Writing, Coding, Reasoning, Analysis
- Templates support `{{variable}}` placeholders with fill-in UI before insertion
- Users can create, edit, and delete custom templates; built-ins are read-only
- Usage count tracked per template
- Open with `⌘K` / `Ctrl+K`, sidebar "Templates" button, or composer bar link

### Prompt History
- Every submitted prompt saved automatically (capped at 20 most recent)
- Accessible from the Prompt Library modal; items can be deleted individually or cleared entirely

### File Attachments
- Up to 6 files per message, 5 MB each; read client-side as Data URLs
- Image thumbnails in composer and message history
- Drag-and-drop anywhere on the window
- Attachments preserved on message edit/re-run

### Streaming & Progressive UI
- SSE event sequence: `stage1_start → stage1_complete → stage2_start → stage2_complete → stage3_start → stage3_complete → title_complete → complete`
- Each stage renders incrementally; per-stage spinners while in-flight
- Stop button aborts the stream at any time via `AbortController`
- Optimistic UI: skeleton assistant message appears immediately on send; rolled back on error or abort

### Sidebar
- Resizable (drag divider) and collapsible to icon rail; both states persisted in `localStorage`
- Mobile (< 960 px): slide-in drawer with hamburger toggle; Escape or backdrop tap closes it
- Per-conversation kebab menu for Edit and Delete
- OpenRouter account balance widget at the bottom

### Chat Interface
- `Enter` submits; `Shift+Enter` inserts a newline
- Process panels (Stage 1 + 2) collapsed by default once final answer is ready; toggle to expand
- Collapsed state shows a summary chip row: response count, failure count, eval count, top-ranked model
- ReactMarkdown renders all model and user content
- Token usage tracked per message via `UsageBadge`

---

## Architectural Choices

### De-anonymisation
Models see "Response A/B/C" in Stage 2 to prevent bias toward known model names. The backend includes a `label_to_model` map in the `stage2_complete` SSE event; the frontend uses it to display real names. This mapping is ephemeral — not persisted to disk.

### SSE Metadata
Stage-complete events carry richer metadata beyond raw results (`council_model_count`, `stage1_failed_models`, `label_to_model`, `aggregate_rankings`, `stage2_insights`). Only the final ranked result is persisted; metadata is UI-only.

### Async + Per-Conversation Locks
Storage writes use `asyncio.Lock` keyed by conversation ID, preventing concurrent write corruption. Reads are synchronous (JSON files, local disk).

### Shared HTTP Client
A single `httpx.AsyncClient` is shared across all OpenRouter calls (lazy init, closed on shutdown). Avoids connection overhead on every request.

### Relative Imports
All backend modules use `from .module import …`. The app is always run as `python -m uvicorn backend.main:app` from the project root.

### Sidebar State Persistence
Width and collapsed state stored in `localStorage` under `splitbench.sidebar.*` keys, restored on mount.

### React Hooks Rule
All hooks declared before any early returns (historical bug in `ModelSelector.jsx` that had to be fixed manually).

---

## Data Layout

```
data/                          # gitignored, created at runtime
├── conversations/{id}.json    # one file per conversation
├── model_config.json          # selected council + chairman models
└── prompts/
    ├── templates.json         # user-created templates
    └── history.json           # recent prompt history
```

---

## API Surface

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/conversations` | List conversations |
| POST | `/api/conversations` | Create conversation |
| GET | `/api/conversations/{id}` | Get full conversation |
| DELETE | `/api/conversations/{id}` | Delete conversation |
| POST | `/api/conversations/{id}/clear-messages` | Clear messages (edit flow) |
| POST | `/api/conversations/{id}/message/stream` | Send message, SSE stream |
| GET | `/api/balance` | OpenRouter account balance |
| GET | `/api/models` | Available models (cached 1 hr) |
| GET/PUT | `/api/config/models` | Get/update model config |
| GET | `/api/prompts/categories` | Template categories |
| GET/POST | `/api/prompts/templates` | List/create templates |
| GET/PUT/DELETE | `/api/prompts/templates/{id}` | Get/update/delete template |
| POST | `/api/prompts/templates/{id}/use` | Increment usage count |
| GET/POST/DELETE | `/api/prompts/history` | History list/add/clear |
| DELETE | `/api/prompts/history/{id}` | Delete single history item |

---

## Known Debt

- `Stage2.jsx StructuredEvaluation` — unused component kept for future structured output support
- `storage.py list_conversations` — reads every JSON file on each call; no index; degrades with many conversations
- No test suite — manual testing only
- JSON file storage sufficient for local use; consider SQLite/PostgreSQL for multi-user deployment

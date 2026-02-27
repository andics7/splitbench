# CLAUDE.md - Architecture & Dev Notes

Technical infrastructure, design decisions, and dev workflow for LLM Council (Split Bench). For the full feature catalogue see `feature.md`.

---

## Stack

- **Backend**: Python 3.10+, FastAPI, uvicorn, httpx (async), python-dotenv, pydantic
- **Frontend**: React 18, Vite, ReactMarkdown
- **LLM Gateway**: OpenRouter (all model calls go through `openrouter.py`)
- **Storage**: JSON files on disk (no database)

## Ports

- Backend: **8001** | Frontend: **5173** (Vite default)

## Running

```bash
# From llm-council/ root:
./start.sh
# Or manually:
python -m uvicorn backend.main:app --reload --port 8001
cd frontend && npm run dev
```

## Environment

`.env` file in `llm-council/`:
```
OPENROUTER_API_KEY=...
OPENROUTER_MGMT_KEY=...
```

---

## Backend Module Map

| File | Responsibility |
|------|----------------|
| `main.py` | FastAPI app, CORS, lifespan, all routes, SSE streaming |
| `council.py` | 3-stage council logic, ranking calculation, title generation |
| `openrouter.py` | Shared `httpx.AsyncClient` (lazy init, closed on shutdown), model queries, balance, model list cache |
| `storage.py` | JSON persistence; async writes with per-conversation `asyncio.Lock`; sync reads |
| `model_config.py` | Load/save `data/model_config.json`; mtime-based cache so external edits are picked up |
| `prompts.py` | 15 built-in templates (lazy init); template CRUD; prompt history |
| `config.py` | Env vars (`OPENROUTER_API_KEY`, `OPENROUTER_MGMT_KEY`), constants (`DATA_DIR`) |

## Frontend Module Map

| File | Responsibility |
|------|----------------|
| `main.jsx` | Entry point, ErrorBoundary |
| `App.jsx` | Conversation state, SSE event dispatch, sidebar resize/collapse/mobile logic |
| `api.js` | All API calls; SSE streaming via `ReadableStream` + `TextDecoder`; base URL from `VITE_API_URL` or `http://localhost:8001` |
| `components/ChatInterface.jsx` | Composer, message list, stage panels, attachment handling, edit-in-place |
| `components/Stage1.jsx` | Tab view of individual model responses |
| `components/Stage2.jsx` | Peer rankings with client-side de-anonymisation, aggregate results |
| `components/Stage3.jsx` | Final answer with mode badge |
| `components/Sidebar.jsx` | Conversation list, nav, balance widget, resize/collapse/mobile drawer |
| `components/ModelSelector.jsx` | Modal for council/chairman model selection |
| `components/PromptLibrary.jsx` | Template browser with category filter and variable fill UI |
| `components/PromptEditor.jsx` | Custom template creator with live preview |
| `components/UsageBadge.jsx` | Token usage display |

---

## Key Design Decisions

### De-anonymisation
Models receive "Response A/B/C…" in Stage 2 to prevent bias. The backend creates a `label_to_model` map sent in the `stage2_complete` SSE metadata. The frontend uses it to display real model names.

### SSE Metadata
Stage-complete events include richer metadata beyond raw results (`council_model_count`, `stage1_failed_models`, `label_to_model`, `aggregate_rankings`, `stage2_insights`). This metadata is **ephemeral** — it is not persisted to storage JSON, only used for UI rendering.

### Optimistic UI
On message send, a user message and a skeleton assistant message are immediately appended to local state. Each incoming SSE event mutates the skeleton via `updateLastAssistant` (shallow-copy pattern, no direct state mutation). On abort or error, the optimistic messages are rolled back.

### Sidebar State Persistence
Sidebar width and collapsed state are stored in `localStorage` under `splitbench.sidebar.*` keys and restored on mount.

### Relative Imports
All backend modules use relative imports (`from .config import …`). Run as `python -m uvicorn backend.main:app` from the project root, not from inside `backend/`.

### React Hooks Rule
All hooks must be declared before any early returns. (Past bug in `ModelSelector.jsx`.)

---

## Data Directory

```
data/                         # gitignored, created at runtime
├── conversations/{id}.json   # one file per conversation
├── model_config.json         # selected models
└── prompts/
    ├── templates.json        # user-created templates (built-ins are in-memory)
    └── history.json          # recent prompt history
```

---

## Known Technical Debt

1. **`Stage2.jsx` `StructuredEvaluation` component** – unused, kept for future structured output support.
2. **`storage.py` `list_conversations`** – reads every JSON file on every call; no index. Degrades with many conversations.
3. **No test suite** – manual testing only. Consider pytest + vitest.
4. **JSON file storage** – sufficient for local use; consider SQLite/PostgreSQL for multi-user or production.

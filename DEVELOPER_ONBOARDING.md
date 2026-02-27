# Developer Onboarding

This document is a practical onboarding guide for the current codebase state.

## 1. What This App Is

Split Bench (LLM Council) is a 3-stage multi-model deliberation app:

1. Stage 1: Multiple council models answer a user prompt in parallel.
2. Stage 2: Models rank anonymized responses (Response A/B/C...), then aggregate ranking is computed.
3. Stage 3: Final output is either:
- `best`: top-ranked Stage 1 response directly, or
- `synthesize`: chairman model synthesizes from Stage 1 + Stage 2.

Frontend renders each stage and streams progress in real time via SSE.

## 2. Stack and Tooling

### Backend
- Python >= 3.10
- FastAPI + Uvicorn
- httpx for OpenRouter API calls
- pydantic models for request typing

Defined in `pyproject.toml`.

### Frontend
- React 19 + Vite 7
- `react-markdown` for response rendering
- ESLint flat config

Defined in `frontend/package.json`.

## 3. Local Setup and Run

## Prerequisites
- Python environment with `uv` available (project uses `uv run` in `start.sh`)
- Node/npm for frontend
- OpenRouter API key

## Environment
Create/update `.env` in repo root:

```env
OPENROUTER_API_KEY=...
# Optional, for credits endpoint:
OPENROUTER_MGMT_KEY=...
```

## Start both services

```bash
./start.sh
```

Default ports:
- Backend: `http://localhost:8001`
- Frontend: `http://localhost:5173`

### Manual start (alternative)

Backend:
```bash
uv run python -m backend.main
```

Frontend:
```bash
cd frontend
npm run dev
```

## 4. Repository Map

```text
backend/
  main.py          FastAPI routes, SSE endpoint, request orchestration
  council.py       3-stage orchestration and ranking logic
  openrouter.py    OpenRouter API client + models cache + balance
  storage.py       Conversation JSON persistence
  model_config.py  Dynamic model configuration persistence
  prompts.py       Prompt template and history persistence
  config.py        Env loading + API URL + legacy defaults

frontend/src/
  App.jsx                          Top-level state + stream event handling
  api.js                           HTTP/SSE API client
  main.jsx                         React root + ErrorBoundary
  components/
    Sidebar.jsx                    Conversations + account widget
    ChatInterface.jsx              Input + answer mode + message/stage rendering
    Stage1.jsx                     Individual response cards
    Stage2.jsx                     Aggregate ranking + optional evaluations
    Stage3.jsx                     Final answer card
    ModelSelector.jsx              Model library/filter/selection modal
    PromptLibrary.jsx              Template browser/use modal
    PromptEditor.jsx               Create/edit templates
    UsageBadge.jsx                 Token/cost UI utilities

data/
  conversations/*.json             Stored conversations
  model_config.json                Selected council/chairman models
  prompts/templates.json           Built-in + custom templates
  prompts/history.json             Prompt history
```

## 5. Architecture: Runtime Flow

## Message send flow

1. Frontend calls `api.sendMessageStream(conversationId, content, synthesisMode, onEvent)`.
2. Backend endpoint: `POST /api/conversations/{id}/message/stream`.
3. Backend emits SSE events in sequence:
- `stage1_start`
- `stage1_complete`
- `stage2_start`
- `stage2_complete`
- `stage3_start`
- `stage3_complete`
- optional `title_complete` (first message in conversation)
- `complete`
- or `error`
4. Frontend updates the last assistant message incrementally as each event arrives.
5. Backend persists final assistant message after stages complete.

## Stage internals (`backend/council.py`)

- `stage1_collect_responses(user_query)`
  - calls all council models in parallel via `query_models_parallel`.
- `stage2_collect_rankings(user_query, stage1_results)`
  - assigns anonymous labels `Response A/B/...`.
  - requests ranking format from each model.
  - parses rankings with `parse_ranking_from_text`.
- `calculate_aggregate_rankings(stage2_results, label_to_model)`
  - computes average rank position per model.
- Stage 3 selection in `backend/main.py` streaming endpoint:
  - `best` -> `get_best_response(...)`
  - `synthesize` -> `stage3_synthesize_final(...)`

## 6. API Surface (Current)

## Conversations
- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/{conversation_id}`
- `DELETE /api/conversations/{conversation_id}`
- `POST /api/conversations/{conversation_id}/clear-messages`
- `POST /api/conversations/{conversation_id}/message` (non-streaming legacy)
- `POST /api/conversations/{conversation_id}/message/stream` (SSE)

## Models / OpenRouter
- `GET /api/models` (cached)
- `GET /api/config/models`
- `PUT /api/config/models`
- `GET /api/balance`

## Prompt templates
- `GET /api/prompts/categories`
- `GET /api/prompts/templates`
- `POST /api/prompts/templates`
- `GET /api/prompts/templates/{template_id}`
- `PUT /api/prompts/templates/{template_id}`
- `DELETE /api/prompts/templates/{template_id}`
- `POST /api/prompts/templates/{template_id}/use`

## Prompt history
- `GET /api/prompts/history?limit=N`
- `POST /api/prompts/history`
- `DELETE /api/prompts/history/{item_id}`
- `DELETE /api/prompts/history`

## 7. Data Contracts

## User message request

```json
{
  "content": "...",
  "synthesis_mode": "best" | "synthesize"
}
```

## Assistant message shape in conversation storage

```json
{
  "role": "assistant",
  "stage1": [{ "model": "...", "response": "...", "usage": {} }],
  "stage2": [{ "model": "...", "ranking": "...", "parsed_ranking": [], "usage": {} }],
  "stage3": { "model": "...", "response": "...", "usage": {}, "mode": "best|synthesize" }
}
```

## SSE event payload examples

```text
data: {"type":"stage1_start"}

data: {"type":"stage1_complete","data":[...]}

data: {"type":"stage2_complete","data":[...],"metadata":{"label_to_model":{...},"aggregate_rankings":[...]}}

data: {"type":"stage3_complete","data":{...}}
```

## 8. Persistence Model

Storage is JSON-file based (no DB yet).

- Conversations: one JSON file per conversation in `data/conversations/`.
- Model config: `data/model_config.json`.
- Prompt templates/history: `data/prompts/`.

Important: some metadata sent to frontend during streaming is ephemeral (not fully persisted with conversation metadata objects).

## 9. Frontend State Boundaries

- `App.jsx` owns:
- conversations list
- current conversation selection/data
- global loading state
- modal visibility
- balance and model config fetches

- `ChatInterface.jsx` owns:
- input text
- synthesis mode selector
- local modal for mode info
- rendering of stage components

- Stage components are mostly presentational and consume already-shaped data.

## 10. Implementation Conventions and Gotchas

- Run backend with module form to preserve relative imports:
  - `python -m backend.main`
- CORS currently allows only localhost dev origins in backend.
- Ranking parser expects a `FINAL RANKING:` section; includes regex fallback.
- `ModelSelector.jsx` follows React hooks rules strictly (all hooks before early return).
- Global markdown spacing depends on `.markdown-content` styles in `frontend/src/index.css`.

## 11. First Tasks for a New Contributor

1. Run app locally and send one message using both `best` and `synthesize` modes.
2. Inspect one stored conversation JSON in `data/conversations/`.
3. Create a custom prompt template and use it from the Evals Library.
4. Change council/chairman models in Model Selector and verify persisted config updates.
5. Trace one full request from `frontend/src/api.js` -> `backend/main.py` -> `backend/council.py`.

## 12. Recommended Near-Term Improvements

1. Add automated tests for ranking parsing and aggregate ranking logic.
2. Add end-to-end tests for SSE event order and frontend progressive render.
3. Harden SSE parser in frontend (`api.js`) for multi-line/chunk boundary edge cases.
4. Add structured logging around per-stage timings and model failures.
5. Replace JSON file storage with SQLite once concurrency/history volume grows.

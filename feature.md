# feature.md - LLM Council Feature Reference

Complete catalogue of implemented features, user-facing behaviours, and component responsibilities. For infra, architecture, and dev workflow see `CLAUDE.md`.

---

## Core Concept

**Split Bench** sends every user prompt through a 3-stage council deliberation:

1. **Stage 1** – All council models answer the prompt independently and in parallel.
2. **Stage 2** – Each council model peer-reviews the other responses (anonymised as "Response A/B/C…") and produces a ranking. Anonymisation prevents bias toward known models.
3. **Stage 3** – Either the top-ranked response is returned directly ("Best" mode) or a chairman model synthesises all responses + rankings into one final answer ("Merged" mode).

---

## Answer Modes

| Mode | Behaviour | Cost |
|------|-----------|------|
| **Best** | Returns Stage 1 response with highest aggregate peer rank. No Stage 3 LLM call. | Cheaper, faster |
| **Merged** | Chairman model reads all Stage 1 responses + Stage 2 rankings and writes a comprehensive synthesis. | More tokens, richer answer |

The mode is chosen per-message via the "Best / Merged" toggle in the UI. It is stored alongside the Stage 3 result so historical messages show the correct badge.

---

## Streaming & Progressive UI

- The backend streams Server-Sent Events (SSE) as each stage completes.
- SSE event sequence: `stage1_start` → `stage1_complete` → `stage2_start` → `stage2_complete` → `stage3_start` → `stage3_complete` → `title_complete` → `complete` (or `error`).
- The frontend renders each stage incrementally: Stage 1 tab results appear before Stage 2 rankings, which appear before the final answer.
- Per-stage loading spinners show while a stage is in-flight.
- `stage1_complete` and `stage2_complete` events carry a `metadata` payload with model counts, failure details, `label_to_model` mapping, aggregate rankings, and stage insights. This metadata is ephemeral (not persisted to disk).
- A **Stop** button aborts the in-flight stream at any time via `AbortController`.

---

## Conversation Management

- Conversations are created lazily on first message send.
- Titles are auto-generated from the first message (using `gemini-2.5-flash` in parallel with Stage 1 so there is no added latency).
- **Edit (sidebar kebab menu)** – Clears all messages from a conversation and pre-fills the prompt textarea with the original first message, keeping the same conversation ID.
- **Edit inline (within chat)** – An "Edit" button appears on the latest user message. Clicking it opens an inline textarea; submitting clears the conversation's messages and re-runs with the edited text.
- **Delete** – Removes the conversation file from disk and clears it from the UI.
- The sidebar shows title, message count, and current balance. Conversations are listed newest-first.

---

## Sidebar

- Resizable (drag the divider) on desktop, with width persisted to `localStorage`.
- Collapsible to an icon-only rail (state persisted to `localStorage`).
- On mobile (viewport < 960 px) the sidebar becomes a slide-in drawer opened by a hamburger button. Escape key or backdrop tap closes it.
- Each conversation item has a kebab (⋮) menu with **Edit** and **Delete** options. The menu closes when clicking outside it.
- Bottom of sidebar shows the OpenRouter account balance widget (expandable/collapsible).
- Sidebar nav buttons: **New Chat**, **Models** (opens Model Selector modal), **Templates** (opens Prompt Library modal).

---

## Model Configuration

- Council models (minimum 2) and a chairman model are configured through the **Model Selector** modal.
- The modal fetches all available OpenRouter models (cached 1 hr in-memory) and provides a searchable list.
- Configuration is saved to `data/model_config.json` and read back with mtime-based cache invalidation, so external edits to the file are picked up automatically.

---

## Prompt Templates

- 15 built-in templates across four categories: **Creative Writing**, **Coding**, **Reasoning**, **Analysis**.
- Templates support `{{variable}}` placeholders with named variables and optional descriptions.
- The **Prompt Library** modal provides category filtering, a search bar, and a variable fill UI before inserting the filled template into the composer.
- Users can create, edit, and delete custom templates via the **Prompt Editor** (built-in templates cannot be deleted).
- Usage count per template is tracked and incremented on use.
- Opening the library: sidebar "Templates" button, "Templates" link in the bottom composer bar, or `⌘K` / `Ctrl+K` from the textarea.

---

## Prompt History

- Every submitted prompt is automatically added to history (stored in `data/prompts/history.json`, capped via the `get_history(limit)` call, default 20 most recent).
- History is accessible from the Prompt Library modal.
- Individual history items can be deleted; the entire history can be cleared.

---

## File Attachments

- Up to 6 files per message, max 5 MB each.
- Files are read client-side as Data URLs and sent as part of the message payload.
- Images show a thumbnail preview in both the composer and the message history.
- Drag-and-drop onto the window activates a drop overlay.
- Attachments are preserved when editing/re-running a message.

---

## Chat Interface Details

- Empty state shows a centred prompt screen with the Best/Merged toggle and `⌘K` hint.
- After the first message, a compact bottom composer bar is shown.
- `Enter` submits; `Shift+Enter` inserts a newline.
- Once a final answer exists, Stage 1 + Stage 2 process panels are collapsed by default. A **Show/Hide process** toggle expands them.
- When collapsed, a summary chip row shows: model response count, failure count, peer evaluation count, and top-ranked model short name.
- ReactMarkdown renders all model responses and user messages.
- Token usage per message is tracked and available via `UsageBadge`.

---

## API Surface (Backend)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/conversations` | List conversations (metadata) |
| POST | `/api/conversations` | Create conversation |
| GET | `/api/conversations/{id}` | Get full conversation |
| DELETE | `/api/conversations/{id}` | Delete conversation |
| POST | `/api/conversations/{id}/clear-messages` | Clear messages (edit flow) |
| POST | `/api/conversations/{id}/message/stream` | Send message, SSE stream |
| GET | `/api/balance` | OpenRouter account balance |
| GET | `/api/models` | Available OpenRouter models (cached 1 hr) |
| GET/PUT | `/api/config/models` | Get/update model config |
| GET | `/api/prompts/categories` | Template categories |
| GET/POST | `/api/prompts/templates` | List/create templates |
| GET/PUT/DELETE | `/api/prompts/templates/{id}` | Get/update/delete template |
| POST | `/api/prompts/templates/{id}/use` | Increment usage count |
| GET/POST/DELETE | `/api/prompts/history` | History list/add/clear |
| DELETE | `/api/prompts/history/{id}` | Delete single history item |

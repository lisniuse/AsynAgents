# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install all dependencies (both server and app)
npm run install:all

# Development (run both server and frontend)
npm run dev:server   # Express server on port 6868
npm run dev:app      # Vite dev server on port 2323

# Build
npm run build        # Builds both server and app

# Tests (run from root or server/)
npm test                    # Run all tests once
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage

# Run a single test file
cd server && npx vitest run tests/math.test.ts
cd server && npx vitest run ../tests/api/chat.test.ts
```

## Configuration

All configuration lives in the **root `config.ts`** (not server/ or app/). Edit this file directly to change providers, ports, API keys, and logging. It exports `config` and `activeModel()`.

- Set `config.provider` to `'anthropic'` or `'openai'` to switch providers
- OpenAI provider also works with OpenAI-compatible APIs (e.g., Alibaba DashScope, Ollama) via `baseUrl`
- Server port defaults to `6868`, frontend to `2323`

## Architecture

This is a **monorepo** with two packages: `server/` (Express + TypeScript ESM) and `app/` (React + Vite).

### Backend (`server/`)

**Request flow:**
1. `POST /api/chat` → `routes/chat.ts` creates a `SubAgent`, registers it by `threadId`, returns `threadId`
2. Client connects `GET /api/events/:sessionId` → SSE stream
3. `SubAgent.run()` loops up to 20 iterations, streaming events to `MessageQueue`
4. `MessageQueue` (EventEmitter) routes events to the matching SSE connection by `sessionId`
5. `POST /api/chat/stop` → stops the agent by `threadId`

**Provider abstraction** (`src/agent/providers/`):
- `base.ts` defines `LLMProvider` interface (`doTurn()`, `addToolResults()`) and the global `SYSTEM_PROMPT`
- `anthropic.ts` and `openai.ts` each manage their own message history format
- `SubAgent` creates the correct provider via factory based on `config.provider`

**Tools** (`src/agent/tools.ts`):
- Defined once in Anthropic format; `openAITools` is a converted version
- Available: `bash`, `write_file`, `read_file`, `list_directory`
- Output truncated at 12,000 chars

**SSE event types:** `connected` | `agent_start` | `text_delta` | `tool_call` | `tool_result` | `agent_done` | `error`

### Frontend (`app/`)

React + Zustand. State is in `src/stores/appStore.ts`. The `useSSE` hook (`src/hooks/useSSE.ts`) manages the SSE connection. Conversation history is stored client-side in localStorage — the server is stateless.

Key components: `ChatView` (main UI), `MessageItem` (message rendering with marked.js + highlight.js), `ToolCard` (tool execution display), `Sidebar` (navigation + theme toggle).

## Testing

Tests live in two locations, both picked up by vitest:
- `server/tests/` — unit tests
- `tests/api/` — integration tests (root level, require server running)

Vitest config is in `server/vitest.config.ts`.

<div align="center">

<img src="./app/public/favicon.svg" width="80" height="80" alt="AsynAgents Logo" />

# AsynAgents

**AI Agent Platform — Every message spawns an independent agent thread that streams results back in real time via SSE.**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org)

[English](./README.md) | [简体中文](./README_CN.md)

</div>

---

## ✨ Features

- 🤖 **Multi-model support** — OpenAI-compatible API and Anthropic Claude
- ⚡ **Real-time streaming** — Server-Sent Events (SSE) push responses token by token
- 🛠️ **Built-in tools** — Shell execution, file read/write, directory listing
- 🔌 **Skills system** — Drop a `SKILL.md` into `skills/` to give agents new capabilities
- 🎨 **Polished UI** — React + Vite + Less, supports light / dark / system theme
- 💾 **Persistent history** — Conversations stored as JSON in `~/.asynagents/`
- 📝 **Structured logging** — Winston with file rotation and level control

## 📁 Project Structure

```
asyn-agents/
├── app/                    # Frontend (React + Vite + TypeScript)
│   └── src/
│       ├── components/     # UI components
│       ├── hooks/          # Custom hooks (useSSE)
│       ├── stores/         # Zustand state management
│       └── types/          # TypeScript type definitions
├── server/                 # Backend (Express + TypeScript)
│   └── src/
│       ├── agent/          # SubAgent loop + LLM providers
│       │   ├── providers/  # Anthropic / OpenAI adapters
│       │   └── tools.ts    # Tool definitions & execution
│       ├── skills/         # SkillLoader — reads SKILL.md files
│       ├── queue/          # In-memory EventEmitter message queue
│       ├── routes/         # REST API routes
│       └── storage/        # Conversation JSON persistence
├── skills/                 # System skills (SKILL.md per subdirectory)
├── config.ts               # Config schema (source of truth)
└── config.example.json     # Template — copy to ~/.asynagents/config.json
```

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install          # root
cd app && npm install
cd ../server && npm install
```

### 2. Configure

Copy the template and fill in your API credentials:

```bash
cp config.example.json ~/.asynagents/config.json
```

Edit `~/.asynagents/config.json`:

```json
{
  "provider": "openai",
  "openai": {
    "apiKey": "sk-xxx",
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o"
  },
  "anthropic": {
    "apiKey": "sk-ant-xxx",
    "model": "claude-opus-4-6"
  },
  "server": { "port": 6868 },
  "app": { "port": 2323 },
  "workspace": "~/.asynagents/workspace"
}
```

### 3. Start dev servers

```bash
npm run dev          # starts both frontend and backend concurrently

# or separately:
npm run dev:server   # backend  →  http://localhost:6868
npm run dev:app      # frontend →  http://localhost:2323
```

Open **http://localhost:2323**

## 🏗️ Architecture

```
┌───────────────┐     SSE / REST     ┌───────────────┐
│  Frontend App │ ◄─────────────────► │  Express API  │
│  (React/Vite) │                     │  port 6868    │
└───────────────┘                     └──────┬────────┘
                                             │
                                   ┌─────────▼─────────┐
                                   │   MessageQueue    │
                                   │  (EventEmitter)   │
                                   └─────────┬─────────┘
                                             │  one thread per message
                                   ┌─────────▼─────────┐
                                   │     SubAgent      │
                                   │  loop (max 20)    │
                                   └──┬────────────┬───┘
                                      │            │
                           ┌──────────▼──┐   ┌─────▼──────┐
                           │ LLM Provider│   │   Tools    │
                           │ Anthropic / │   │ bash / file│
                           │   OpenAI    │   │ get_skill  │
                           └─────────────┘   └────────────┘
```

## 🔌 Skills System

Skills extend the agent's capabilities without modifying code. Each skill lives in its own subdirectory containing a `SKILL.md` file:

```
skills/
└── my-skill/
    └── SKILL.md        # YAML front matter + usage instructions
```

`SKILL.md` format:
```markdown
---
name: my-skill
description: One-line description of when to use this skill.
---

## Usage

\`\`\`bash
python /path/to/script.py --option value
\`\`\`
```

**Loading order:**
1. `{project_root}/skills/` — system skills (bundled with the repo)
2. `~/.asynagents/skills/` — user skills (override system skills by name)

The agent sees only names + descriptions in its system prompt. When it decides to use a skill, it calls the built-in `get_skill` tool to fetch full instructions, then executes the skill.

## 🛠️ Built-in Tools

| Tool | Description |
|------|-------------|
| `bash` | Execute any shell command |
| `write_file` | Create or overwrite a file |
| `read_file` | Read file contents |
| `list_directory` | List directory contents |
| `get_skill` | Fetch full usage docs for a skill |

## 📡 API

### `POST /api/chat`
Start an agent run.

```bash
curl -X POST http://localhost:6868/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"s1","message":"Hello","conversationHistory":[]}'
# → {"threadId":"<uuid>"}
```

### `GET /api/events/:sessionId`
SSE stream — connect once per browser tab.

Event types: `connected` · `agent_start` · `text_delta` · `tool_call` · `tool_result` · `agent_done` · `agent_stopped` · `error`

### `GET /health`
Returns provider, model, config status, and workspace path.

## 🧪 Testing

```bash
npm run test           # run all tests
npm run test:watch     # watch mode
npm run test:coverage  # coverage report
```

## ⚠️ Security Note

The agent can execute arbitrary shell commands and modify files. Run it in a sandboxed or trusted environment, and review AI-generated commands before deploying to production.

## 📦 Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React 18, TypeScript 5, Vite 6, Less, Zustand, Lucide |
| Backend | Express 4, TypeScript 5, Winston |
| AI | Anthropic SDK, OpenAI SDK |
| Testing | Vitest, Supertest |

## 👥 Contributors

<a href="https://github.com/lisniuse/AsynAgents/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=lisniuse/AsynAgents" alt="Contributors" />
</a>

## ⭐ Star History

<a href="https://www.star-history.com/#lisniuse/AsynAgents&Date">
  <img src="https://api.star-history.com/svg?repos=lisniuse/AsynAgents&type=Date" alt="Star History Chart" width="600" />
</a>

---

<div align="center">Made with ❤️ by the AsynAgents Team · <a href="./LICENSE">Apache 2.0 License</a></div>

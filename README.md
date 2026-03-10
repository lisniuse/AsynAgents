<div align="center">

<img src="./app/public/favicon.svg" width="88" height="88" alt="AsynAgents Logo" />

# AsynAgents

**An agent-first desktop web app where every user message becomes its own runnable agent thread.**

Not a thin chat wrapper. Not a toy prompt box.  
AsynAgents is built for long-running, tool-using, file-editing agent work with real-time streaming, persistent local memory, reusable skills, and now reusable experience notes.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org)

[**English**](./README.md) | [简体中文](./README_CN.md)

</div>

## Why It Stands Out

Most AI apps treat a conversation as one fuzzy session.

AsynAgents treats **each message as an independent agent run**:
- A new message creates a dedicated backend `SubAgent`
- The agent can think, call tools, read and write files, and stream progress live
- The UI can reconnect and replay buffered SSE events instead of losing the run state
- Conversation history is persisted locally as real files, not hidden in a browser-only cache

That architecture gives this project a very different feel from normal chatbot UIs:
- Better control over long-running jobs
- Cleaner stop / resume / replay behavior
- Easier debugging of agent execution
- A natural place to accumulate reusable skills and reusable experiences

## What Is Unique Here

### 1. One Message, One Agent Thread

Every `POST /api/chat` request starts a fresh `SubAgent` run.  
This keeps each task isolated and makes tool execution, stopping, logging, and replay much easier to reason about.

### 2. Real-Time Streaming With Replay

The backend uses SSE plus an in-memory event buffer:
- token streaming
- thinking streaming
- tool call streaming
- tool result streaming
- late reconnect replay

If the frontend reconnects, it can rebuild the current message from buffered events instead of pretending nothing happened.

### 3. Local-First Agent Memory

AsynAgents stores real data under `~/.asynagents/`:
- `conversations/` for chat history
- `skills/` for user-installed skills
- `experiences/` for distilled lessons from old conversations
- `workspace/` for agent file operations
- `logs/` for structured runtime logs

This makes the app inspectable, scriptable, and hackable.

### 4. Skills and Experiences Are Separate

Most projects stop at prompt templates.

AsynAgents has two different reusable knowledge layers:
- **Skills**: explicit instruction packs loaded from `SKILL.md`
- **Experiences**: lessons automatically or manually summarized from previous conversations

Skills teach the agent how to do something.  
Experiences help the agent avoid re-learning the same lesson twice.

### 5. Configurable Tooling for Real Machines

Built-in tools are aimed at actual work, not demos:
- `bash`
- `python`
- `write_file`
- `read_file`
- `list_directory`
- `get_skill`
- `get_experience`

Python is configurable from the UI and only injected into the model when the configured interpreter is actually available.

### 6. Works With OpenAI-Compatible APIs and Anthropic

You can switch providers without rewriting the app:
- OpenAI-compatible endpoints
- Anthropic Claude

This makes it practical for local deployments, self-hosted gateways, and regional providers.

## Core Features

- Independent agent run per message
- Live SSE streaming for text, thinking, tool calls, and results
- Tool-using agent loop with file system access
- Configurable Python execution tool
- Skill system based on `SKILL.md`
- Experience system with `get_experience`
- Automatic experience summarization for idle conversations
- Manual conversation summarization via `/summarize`
- Persistent local conversation history
- Light / dark / system theme UI
- Structured logging
- OpenAI-compatible and Anthropic provider support

## Experience System

This project now includes an **experience system** designed specifically for agent workflows.

When a conversation becomes idle and the agent is no longer running, AsynAgents can summarize that conversation into a reusable experience note stored in:

```text
~/.asynagents/experiences/
```

Each experience is a Markdown file with metadata:
- `title`
- `summary`
- `keywords`
- `source_conversations`
- `updated_at`

The agent only sees the experience index in the system prompt.  
If one looks relevant, it can call `get_experience` to read the full note.

This keeps prompts compact while still giving the model access to durable lessons from past work.

## Architecture

```text
Frontend (React + Zustand + Vite)
        |
        | REST + SSE
        v
Express API
        |
        +-- /api/chat -> create one SubAgent per message
        +-- /api/events/:conversationId -> stream + replay buffered events
        +-- /api/conversations -> persist local chat history
        +-- /api/config -> runtime config updates
        |
        v
SubAgent Loop
        |
        +-- OpenAI-compatible provider
        +-- Anthropic provider
        +-- Tool execution
        +-- Skills prompt injection
        +-- Experiences prompt injection
        |
        v
Local storage in ~/.asynagents/
```

## Project Structure

```text
asyn-agents/
|-- app/                        # React frontend
|   `-- src/
|       |-- components/
|       |-- hooks/
|       |-- stores/
|       `-- types/
|-- server/                     # Express backend
|   `-- src/
|       |-- agent/              # SubAgent loop, tools, providers
|       |-- experience/         # Experience storage, loader, scheduler, summarizer
|       |-- queue/              # SSE replay buffer
|       |-- routes/             # API routes
|       |-- skills/             # Skill loader
|       |-- storage/            # Conversation persistence
|       `-- types/
|-- skills/                     # Built-in skills
|-- config.ts                   # Config schema and defaults
`-- config.example.json         # Example runtime config
```

## Quick Start

### 1. Install

```bash
npm install
cd server && npm install
cd ../app && npm install
```

### 2. Create Config

The runtime config file lives here:

```text
~/.asynagents/config.json
```

You can start from:

```bash
cp config.example.json ~/.asynagents/config.json
```

Example:

```json
{
  "provider": "openai",
  "python": {
    "path": "python"
  },
  "experience": {
    "idleMinutes": 20,
    "scanIntervalMs": 60000,
    "maxEntriesInPrompt": 50
  },
  "openai": {
    "apiKey": "your-api-key",
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o"
  },
  "anthropic": {
    "apiKey": "",
    "model": "claude-opus-4-6"
  },
  "server": {
    "port": 6868
  },
  "app": {
    "port": 2323
  }
}
```

### 3. Run

```bash
npm run dev:server
npm run dev:app
```

Open:

```text
http://localhost:2323
```

## Built-In Tools

| Tool | Purpose |
|------|---------|
| `bash` | Execute shell commands |
| `python` | Execute Python code with the configured interpreter |
| `write_file` | Create or overwrite files |
| `read_file` | Read file contents |
| `list_directory` | Inspect directories |
| `get_skill` | Read a skill's full `SKILL.md` |
| `get_experience` | Read a saved experience note |

## Skills

Skills are instruction packs stored as `SKILL.md`.

Example layout:

```text
skills/
`-- my-skill/
   `-- SKILL.md
```

Minimal example:

```md
---
name: my-skill
description: When to use this skill.
---

## Usage

Run these commands when the task matches this skill.
```

Load order:
- `{project_root}/skills/`
- `~/.asynagents/skills/`

User skills override bundled skills with the same name.

## API Overview

### `POST /api/chat`

Start a new agent run for one message.

### `POST /api/chat/stop`

Stop a running agent thread.

### `GET /api/events/:conversationId`

Subscribe to streamed events for a conversation.

### `GET /api/conversations`

List locally persisted conversations.

### `POST /api/conversations/:id/summarize`

Manually summarize a conversation into an experience note.

### `GET /health`

Return provider, model, config status, Python availability, and experience count.

## Development

```bash
npm run test
npm run build
```

## Security

This project can execute shell commands, write files, and run Python.  
Treat it like a real agent runtime, not a harmless chatbot.

Use it in:
- a trusted local environment
- a sandboxed machine
- or a workspace you are comfortable letting an agent modify

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React 18, TypeScript, Vite, Less, Zustand |
| Backend | Express, TypeScript, Winston |
| AI Providers | OpenAI SDK, Anthropic SDK |
| Testing | Vitest, Supertest |

## Best Fit

AsynAgents is a strong fit if you want:
- an inspectable local agent app
- a UI that exposes tool execution instead of hiding it
- a project you can extend with custom tools, skills, and prompt layers
- an agent runtime that accumulates reusable operational experience over time

It is especially good for coding, local automation, and desktop task workflows.

## License

[Apache 2.0](./LICENSE)

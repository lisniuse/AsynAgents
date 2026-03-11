<div align="center">

<img src="./app/public/favicon.svg" width="88" height="88" alt="AsynAgents Logo" />

# AsynAgents

**An agent-first desktop web app where every user message becomes its own runnable agent thread.**

Not a thin chat wrapper. Not a toy prompt box.  
AsynAgents is built for real agent work: long-running tasks, tool calls, file edits, local persistence, reusable skills, reusable experience notes, and standalone release builds.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org)

[**English**](./README.md) | [简体中文](./README_CN.md)

</div>

## Why It Feels Different

Most AI apps treat a conversation as one fuzzy session.

AsynAgents treats **every message as a separate agent run**:
- a new backend `SubAgent` starts for each user message
- the run can think, call tools, stream progress, stop cleanly, and persist its result
- the frontend can reconnect and replay buffered SSE events
- chat history is stored as local files under `~/.asynagents/`

That architecture makes the app much better suited for real execution-heavy work than a normal chatbot shell.

## What Stands Out

### 1. One Message, One Agent Thread

Every `POST /api/chat` starts a fresh `SubAgent` run.  
That keeps tool execution, logging, stop control, and event replay isolated and understandable.

### 2. Real-Time Streaming With Replay

The backend streams:
- text deltas
- thinking deltas
- tool call state
- tool results
- completion and error events

If the UI reconnects, it can rebuild the current run from buffered events instead of losing context.

### 3. Local-First Runtime

AsynAgents stores inspectable data under `~/.asynagents/`:
- `conversations/`
- `skills/`
- `experiences/`
- `workspace/`
- `logs/`

Nothing important is trapped inside browser-only storage.

### 4. Skills and Experiences Are Different Layers

AsynAgents has two reusable knowledge systems:
- **Skills**: explicit instruction packs loaded from `SKILL.md`
- **Experiences**: distilled lessons summarized from past conversations

Skills tell the agent how to do something.  
Experiences help the agent avoid repeating the same analysis.

### 5. Tooling Built For Real Machines

Built-in tools are designed for actual work:
- `bash`
- `python`
- `write_file`
- `read_file`
- `list_directory`
- `get_skill`
- `get_experience`
- `send_image`

Python is configurable from the UI and only exposed to the model when the configured interpreter is actually available.

### 6. Image Delivery Is First-Class

Agents can send images back into the chat:
- remote image URLs
- local image files
- base64 image payloads

Images are copied into the static `images/` directory, rendered in chat, and support:
- click-to-open preview
- drag
- wheel zoom
- pinch zoom on mobile
- localized error fallback when loading fails

### 7. Standalone Release Builds

The app can be packaged without Electron:
- frontend builds to static assets
- backend is bundled and compiled into a standalone executable with `pkg`
- target machines do not need Node.js or npm installed

## Core Features

- Independent agent run per message
- Live SSE streaming and replay
- Tool-using agent loop with file system access
- Configurable Python execution tool
- Image sending tool for agents
- Skill system based on `SKILL.md`
- Experience system with `get_experience`
- Automatic experience summarization for idle conversations
- Manual summarization via `/summarize`
- Settings-based enable/disable management for skills and experiences
- Local conversation persistence
- Light / dark / system theme UI
- Structured logs
- OpenAI-compatible and Anthropic provider support
- Standalone `win-x64`, `linux-x64`, and `macos-x64` release builds

## Experience System

AsynAgents includes a built-in **experience system** for agent workflows.

When a conversation becomes idle and no agent is running, the system can summarize that conversation into a reusable experience note stored in:

```text
~/.asynagents/experiences/
```

Each experience is a Markdown file with metadata such as:
- `title`
- `summary`
- `keywords`
- `source_conversations`
- `updated_at`

The agent only receives the experience index in the prompt.  
If a note looks relevant, it calls `get_experience` to load the full content.

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
| `send_image` | Send a remote, local, or base64 image into the chat |

## Release Build

Build a standalone executable for the current platform:

```bash
npm run build:release
```

Build specific targets:

```bash
npm run build:release:win-x64
npm run build:release:linux-x64
npm run build:release:macos-x64
```

Example release layout:

```text
release/win-x64/
|-- asynagents-server.exe
|-- public/
`-- skills/
```

## Quick Start

### 1. Install

```bash
npm install
cd server && npm install
cd ../app && npm install
```

### 2. Create Config

Runtime config lives at:

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
  "server": {
    "hostname": "127.0.0.1",
    "port": 6868
  },
  "openai": {
    "apiKey": "your-api-key",
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o"
  },
  "anthropic": {
    "apiKey": "",
    "model": "claude-opus-4-6"
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

## API Overview

### `POST /api/chat`

Start a new agent run for one message.

### `POST /api/chat/stop`

Stop a running agent thread.

### `GET /api/events/:conversationId`

Subscribe to streamed conversation events.

### `GET /api/conversations`

List locally persisted conversations.

### `POST /api/conversations/:id/summarize`

Manually summarize a conversation into an experience note.

### `GET /health`

Return provider, model, config status, hostname, Python availability, and experience count.

## Skills

Skills are instruction packs stored as `SKILL.md`.

Example:

```text
skills/
`-- my-skill/
    `-- SKILL.md
```

Minimal format:

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

## Development

```bash
npm run test
npm run build
```

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | React 18, TypeScript, Vite, Less, Zustand |
| Backend | Express, TypeScript, Winston |
| AI Providers | OpenAI SDK, Anthropic SDK |
| Packaging | esbuild, pkg |
| Testing | Vitest, Supertest |

## Security

This project can execute shell commands, write files, run Python, and modify the local workspace.  
Treat it like a real agent runtime, not a harmless chatbot.

Use it in:
- a trusted local environment
- a sandboxed machine
- or a workspace you are comfortable letting an agent modify

## Best Fit

AsynAgents is a strong fit if you want:
- an inspectable local agent app
- a UI that exposes tool execution instead of hiding it
- a system that accumulates reusable skills and experiences
- a release model without Electron
- an agent runtime aimed at coding, automation, and desktop workflows

## License

[Apache 2.0](./LICENSE)

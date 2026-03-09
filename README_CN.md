<div align="center">

<img src="./app/public/favicon.svg" width="80" height="80" alt="AsynAgents Logo" />

# AsynAgents

**AI 智能体平台 — 每条消息创建独立的智能体线程，通过 SSE 实时流式推送响应。**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org)

[English](./README.md) | [简体中文](./README_CN.md)

</div>

---

## ✨ 特性

- 🤖 **多模型支持** — 兼容 OpenAI API 格式及 Anthropic Claude
- ⚡ **实时流式响应** — 基于 Server-Sent Events (SSE)，逐 token 推送
- 🛠️ **内置工具** — Shell 执行、文件读写、目录浏览
- 🔌 **Skills 系统** — 在 `skills/` 目录下放置 `SKILL.md` 即可扩展能力
- 🎨 **精美界面** — React + Vite + Less，支持浅色 / 深色 / 跟随系统主题
- 💾 **持久化历史** — 对话以 JSON 文件保存在 `~/.asynagents/`
- 📝 **结构化日志** — Winston，支持文件轮转与级别控制

## 📁 项目结构

```
asyn-agents/
├── app/                    # 前端应用 (React + Vite + TypeScript)
│   └── src/
│       ├── components/     # UI 组件
│       ├── hooks/          # 自定义 Hooks (useSSE)
│       ├── stores/         # Zustand 状态管理
│       └── types/          # TypeScript 类型定义
├── server/                 # 后端服务 (Express + TypeScript)
│   └── src/
│       ├── agent/          # SubAgent 循环 + LLM 提供商
│       │   ├── providers/  # Anthropic / OpenAI 适配器
│       │   └── tools.ts    # 工具定义与执行
│       ├── skills/         # SkillLoader — 读取 SKILL.md 文件
│       ├── queue/          # 基于 EventEmitter 的内存消息队列
│       ├── routes/         # REST API 路由
│       └── storage/        # 对话 JSON 持久化
├── skills/                 # 系统技能（每个子目录一个技能）
├── config.ts               # 配置类型定义
└── config.example.json     # 配置模板，复制到 ~/.asynagents/config.json
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install          # 根目录
cd app && npm install
cd ../server && npm install
```

### 2. 配置

复制模板并填写 API 凭据：

```bash
cp config.example.json ~/.asynagents/config.json
```

编辑 `~/.asynagents/config.json`：

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

### 3. 启动开发服务器

```bash
npm run dev          # 同时启动前端和后端

# 或分别启动：
npm run dev:server   # 后端  →  http://localhost:6868
npm run dev:app      # 前端  →  http://localhost:2323
```

访问 **http://localhost:2323**

## 🏗️ 架构

```
┌───────────────┐     SSE / REST     ┌───────────────┐
│   前端应用     │ ◄─────────────────► │   Express API │
│  (React/Vite) │                     │   端口 6868   │
└───────────────┘                     └──────┬────────┘
                                             │
                                   ┌─────────▼─────────┐
                                   │    消息队列        │
                                   │  (EventEmitter)   │
                                   └─────────┬─────────┘
                                             │  每条消息独立线程
                                   ┌─────────▼─────────┐
                                   │     SubAgent      │
                                   │   循环（最多20轮）  │
                                   └──┬────────────┬───┘
                                      │            │
                           ┌──────────▼──┐   ┌─────▼──────┐
                           │  LLM 提供商  │   │    工具     │
                           │ Anthropic / │   │ bash / 文件 │
                           │   OpenAI    │   │ get_skill  │
                           └─────────────┘   └────────────┘
```

## 🔌 Skills 系统

Skills 可以在不修改代码的情况下扩展智能体能力。每个 Skill 是一个包含 `SKILL.md` 文件的子目录：

```
skills/
└── my-skill/
    └── SKILL.md        # YAML front matter + 使用说明
```

`SKILL.md` 格式：
```markdown
---
name: my-skill
description: 一句话描述该技能的使用场景。
---

## 使用方法

\`\`\`bash
python /path/to/script.py --option value
\`\`\`
```

**加载顺序：**
1. `{项目根目录}/skills/` — 系统技能（随仓库发布）
2. `~/.asynagents/skills/` — 用户技能（同名时覆盖系统技能）

智能体系统提示词中只包含技能的名称和描述。当它决定使用某个技能时，会调用内置的 `get_skill` 工具获取完整说明，再执行对应操作。

## 🛠️ 内置工具

| 工具 | 描述 |
|------|------|
| `bash` | 执行任意 Shell 命令 |
| `write_file` | 创建或覆盖文件 |
| `read_file` | 读取文件内容 |
| `list_directory` | 列出目录内容 |
| `get_skill` | 获取某个技能的完整使用文档 |

## 📡 API

### `POST /api/chat`
启动智能体运行。

```bash
curl -X POST http://localhost:6868/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"s1","message":"你好","conversationHistory":[]}'
# → {"threadId":"<uuid>"}
```

### `GET /api/events/:sessionId`
SSE 流 — 每个浏览器标签页连接一次。

事件类型：`connected` · `agent_start` · `text_delta` · `tool_call` · `tool_result` · `agent_done` · `agent_stopped` · `error`

### `GET /health`
返回提供商、模型、配置状态和工作目录信息。

## 🧪 测试

```bash
npm run test           # 运行全部测试
npm run test:watch     # 监视模式
npm run test:coverage  # 覆盖率报告
```

## ⚠️ 安全提示

智能体可以执行任意 Shell 命令并修改文件。请在沙箱或受信任的环境中运行，生产环境部署前请审查 AI 生成的命令。

## 📦 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18、TypeScript 5、Vite 6、Less、Zustand、Lucide |
| 后端 | Express 4、TypeScript 5、Winston |
| AI | Anthropic SDK、OpenAI SDK |
| 测试 | Vitest、Supertest |

## 👥 贡献者

<a href="https://github.com/lisniuse/AsynAgents/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=lisniuse/AsynAgents" alt="Contributors" />
</a>

## ⭐ Star 趋势

<a href="https://www.star-history.com/#lisniuse/AsynAgents&Date">
  <img src="https://api.star-history.com/svg?repos=lisniuse/AsynAgents&type=Date" alt="Star History Chart" width="600" />
</a>

---

<div align="center">Made with ❤️ by the AsynAgents Team · <a href="./LICENSE">Apache 2.0 License</a></div>

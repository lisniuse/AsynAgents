<div align="center">

<img src="./app/public/favicon.svg" width="88" height="88" alt="AsynAgents Logo" />

# AsynAgents

**一个真正以 Agent 为中心的桌面 Web 应用：每一条用户消息，都会变成一个可运行、可停止、可回放的独立 Agent 线程。**

不是简单聊天壳。不是只有一个输入框的 Prompt UI。  
AsynAgents 面向的是长任务、工具调用、文件修改、本地持久化和经验积累这类真正的 Agent 工作流。

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org)

[English](./README.md) | **简体中文**

</div>

## 这个项目为什么不一样

很多 AI 项目把“一个对话”当成一个模糊的大 session。

AsynAgents 不是这样。  
它把**每一条消息都视为一次独立 Agent 运行**：

- 新消息会在后端创建一个独立 `SubAgent`
- Agent 可以思考、调用工具、读写文件、持续流式输出
- 前端断开重连后，可以基于 SSE 缓冲回放当前执行过程
- 对话历史会落盘到本地文件，而不是只存在浏览器内存里

这种设计带来的区别很明显：
- 更适合长时间运行任务
- 更容易控制停止、重连和回放
- 更方便排查 Agent 做了什么
- 更容易积累可复用的技能和经验

## 项目独有的亮点

### 1. 每条消息都是独立 Agent

每次调用 `POST /api/chat`，都会创建一次新的 `SubAgent` 运行。  
这意味着工具执行、日志、停止信号、流式过程和最终结果，都有清晰边界。

### 2. SSE 流式输出 + 可回放

后端不是只做一次性响应，而是通过 SSE 持续推送：
- 文本增量
- 思考增量
- 工具调用
- 工具结果
- 完成状态

如果前端刷新或重连，可以基于缓冲事件恢复现场，而不是直接丢状态。

### 3. 本地优先，所有数据都可见

AsynAgents 会把数据保存到 `~/.asynagents/`：
- `conversations/`：对话历史
- `skills/`：用户技能
- `experiences/`：历史经验
- `workspace/`：Agent 工作区
- `logs/`：结构化日志

你可以直接查看、备份、清理、迁移这些文件。

### 4. Skills 和 Experiences 是两套不同层次

这个项目不是只有 Prompt 模板。

它有两层可复用知识：
- **Skills**：告诉 Agent “怎么做”
- **Experiences**：告诉 Agent “以前踩过什么坑、总结过什么经验”

这两层是分开的：
- Skill 更像显式能力包
- Experience 更像系统自动积累出来的工作记忆

### 5. 工具是为真实任务设计的

内置工具不是演示级玩具，而是直接面向本地任务：
- `bash`
- `python`
- `write_file`
- `read_file`
- `list_directory`
- `get_skill`
- `get_experience`

其中 Python 路径可以在前端设置，服务端检测不可用时不会注入给模型。

### 6. 支持 OpenAI 兼容接口和 Anthropic

你可以根据环境自由切换：
- OpenAI-compatible API
- Anthropic Claude

这对自建网关、区域模型服务、企业代理环境都更友好。

## 核心能力

- 每条消息独立 Agent 运行
- SSE 实时流式输出
- 可停止的工具调用型 Agent 循环
- 可配置 Python 执行工具
- 基于 `SKILL.md` 的技能系统
- 基于历史会话沉淀的经验系统
- `get_experience` 经验读取工具
- 空闲会话自动总结经验
- `/summarize` 手动总结经验
- 本地持久化对话历史
- 浅色 / 深色 / 跟随系统主题
- 结构化日志
- OpenAI-compatible / Anthropic 双 provider 支持

## 经验系统

这是这次版本里非常关键的一点。

AsynAgents 现在支持把历史会话沉淀成经验文件，目录在：

```text
~/.asynagents/experiences/
```

每条经验都是一个 Markdown 文件，包含这些头信息：
- `title`
- `summary`
- `keywords`
- `source_conversations`
- `updated_at`

系统提示词里只注入经验索引，不注入全文。  
当模型发现某条经验相关时，会调用 `get_experience` 再读取详细内容。

这样做的好处是：
- 不会把 prompt 撑爆
- 经验可以长期积累
- Agent 不需要反复思考已经总结过的问题

## 架构概览

```text
Frontend (React + Zustand + Vite)
        |
        | REST + SSE
        v
Express API
        |
        +-- /api/chat -> 每条消息启动一个 SubAgent
        +-- /api/events/:conversationId -> 事件流 + 回放
        +-- /api/conversations -> 本地对话持久化
        +-- /api/config -> 运行时配置更新
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

## 项目结构

```text
asyn-agents/
|-- app/                        # React 前端
|   `-- src/
|       |-- components/
|       |-- hooks/
|       |-- stores/
|       `-- types/
|-- server/                     # Express 后端
|   `-- src/
|       |-- agent/              # SubAgent、tools、providers
|       |-- experience/         # 经验系统
|       |-- queue/              # SSE 回放缓冲
|       |-- routes/             # API 路由
|       |-- skills/             # Skill loader
|       |-- storage/            # 对话持久化
|       `-- types/
|-- skills/                     # 内置技能
|-- config.ts                   # 配置定义
`-- config.example.json         # 配置示例
```

## 快速开始

### 1. 安装依赖

```bash
npm install
cd server && npm install
cd ../app && npm install
```

### 2. 准备配置

运行时配置文件位于：

```text
~/.asynagents/config.json
```

可以先从示例复制：

```bash
cp config.example.json ~/.asynagents/config.json
```

示例：

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

### 3. 启动

```bash
npm run dev:server
npm run dev:app
```

打开：

```text
http://localhost:2323
```

## 内置工具

| 工具 | 作用 |
|------|------|
| `bash` | 执行 shell 命令 |
| `python` | 用已配置解释器执行 Python 代码 |
| `write_file` | 写文件 |
| `read_file` | 读文件 |
| `list_directory` | 查看目录 |
| `get_skill` | 读取技能全文 |
| `get_experience` | 读取经验全文 |

## Skills 技能系统

Skill 是一个带有 `SKILL.md` 的目录。

示例：

```text
skills/
`-- my-skill/
    `-- SKILL.md
```

最小格式：

```md
---
name: my-skill
description: 这个技能适合在什么场景使用
---

## Usage

Run these commands when the task matches this skill.
```

加载顺序：
- `{project_root}/skills/`
- `~/.asynagents/skills/`

如果同名，用户技能覆盖内置技能。

## API 概览

### `POST /api/chat`

为一条消息启动一次 Agent 运行。

### `POST /api/chat/stop`

停止正在运行的 Agent。

### `GET /api/events/:conversationId`

订阅某个会话的 SSE 事件流。

### `GET /api/conversations`

读取本地持久化会话。

### `POST /api/conversations/:id/summarize`

手动将某个会话总结成经验。

### `GET /health`

返回 provider、model、配置状态、Python 可用性和经验数量。

## 开发

```bash
npm run test
npm run build
```

## 安全提示

这个项目可以：
- 执行 shell 命令
- 写文件
- 运行 Python

所以请把它当成一个真正有执行能力的 Agent 运行时，而不是普通聊天工具。

建议运行在：
- 可信的本地环境
- 沙箱环境
- 或者你允许 Agent 修改的工作目录里

## 技术栈

| 层 | 技术 |
|----|------|
| Frontend | React 18, TypeScript, Vite, Less, Zustand |
| Backend | Express, TypeScript, Winston |
| AI Providers | OpenAI SDK, Anthropic SDK |
| Testing | Vitest, Supertest |

## 适合什么场景

如果你想要的是下面这些东西，AsynAgents 会很合适：
- 一个本地优先、可检查的 Agent 应用
- 一个能看见工具执行过程的 UI，而不是黑盒聊天
- 一个能不断扩展 tools、skills、prompt layers 的项目骨架
- 一个能随着使用不断积累“经验”的 Agent 运行时

它特别适合：
- 编码任务
- 本地自动化
- 桌面工作流
- 工具调用型 Agent 场景

## License

[Apache 2.0](./LICENSE)

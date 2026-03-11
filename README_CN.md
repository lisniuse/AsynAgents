<div align="center">

<img src="./app/public/favicon.svg" width="88" height="88" alt="AsynAgents Logo" />

# AsynAgents

**一个真正以 Agent 为中心的桌面 Web 应用：每一条用户消息，都会变成一个可运行的独立 Agent 线程。**

不是普通聊天壳。不是只会发 Prompt 的输入框。  
AsynAgents 面向的是长任务、工具调用、文件修改、本地持久化、技能复用、经验沉淀，以及无需 Electron 的独立发布。

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org)

[English](./README.md) | [**简体中文**](./README_CN.md)

</div>

## 为什么这个项目不一样

很多 AI 项目把“一段对话”当作一个模糊的 session。

AsynAgents 不是这样。  
它把**每一条消息都当成一次独立的 Agent 运行**：
- 新消息会在后端创建一个新的 `SubAgent`
- Agent 可以思考、调用工具、读写文件，并持续流式输出
- 前端断开后可以基于 SSE 缓冲回放当前执行过程
- 对话历史会持久化到 `~/.asynagents/`，而不是只存在浏览器里

这让它更像一个可观察、可调试、可积累经验的 Agent 运行时，而不是普通聊天 UI。

## 核心亮点

### 1. 每条消息都是独立 Agent

每次调用 `POST /api/chat`，都会启动一次新的 `SubAgent`。  
工具执行、日志、停止控制、事件回放和最终结果都有清晰边界。

### 2. SSE 流式输出 + 可回放

后端会持续推送：
- 文本增量
- 思考增量
- 工具调用状态
- 工具结果
- 完成事件和错误事件

如果前端刷新或重连，可以基于缓冲事件恢复执行现场。

### 3. 本地优先的数据落盘

AsynAgents 会把关键数据保存在 `~/.asynagents/`：
- `conversations/`：对话历史
- `skills/`：用户技能
- `experiences/`：经验文件
- `workspace/`：Agent 工作目录
- `logs/`：结构化日志

这些都是真实文件，便于检查、备份、迁移和二次处理。

### 4. Skills 和 Experiences 是两套体系

AsynAgents 不是只有 Prompt 模板。

它有两层可复用知识：
- **Skills**：基于 `SKILL.md` 的显式能力包
- **Experiences**：从历史会话中总结出来的经验

Skill 负责“怎么做”。  
Experience 负责“以前已经总结过什么，不要再重复思考”。

### 5. 工具面向真实任务

内置工具不是演示玩具，而是直接服务本地工作流：
- `bash`
- `python`
- `write_file`
- `read_file`
- `list_directory`
- `get_skill`
- `get_experience`
- `send_image`

其中 `python` 路径可以在设置页配置，服务端检测不可用时不会注入给模型。

### 6. 图片返回是一级能力

Agent 现在可以把图片直接发回聊天窗口：
- 网络图片 URL
- 本地图片文件
- base64 图片数据

图片会被复制到静态目录 `images/` 下，并在聊天中支持：
- 点击放大
- 鼠标左键拖拽
- 鼠标滚轮缩放
- 移动端单指拖动
- 移动端双指捏合缩放
- 图片加载失败时的占位替代

### 7. 不用 Electron 的独立发布

这个项目支持独立发布：
- 前端打包成静态资源
- 服务端 bundle 后再编译成独立可执行文件
- 目标机器不需要安装 Node.js 或 npm

## 核心能力

- 每条消息独立 Agent 运行
- SSE 实时流式输出与回放
- 带工具调用的 Agent 循环
- 可配置的 Python 执行工具
- Agent 图片发送工具
- 基于 `SKILL.md` 的技能系统
- 基于历史会话沉淀的经验系统
- `get_experience` 经验读取工具
- 空闲会话自动总结经验
- `/summarize` 手动总结经验
- 设置页对技能和经验的启用/禁用管理
- 本地持久化对话历史
- 浅色 / 深色 / 跟随系统主题
- 结构化日志
- OpenAI-compatible / Anthropic provider 支持
- `win-x64` / `linux-x64` / `macos-x64` 独立发布

## 经验系统

AsynAgents 内置了一套面向 Agent 工作流的**经验系统**。

当一个会话空闲且当前没有 Agent 运行时，系统可以把这个会话总结成经验文件，目录为：

```text
~/.asynagents/experiences/
```

每条经验都是一个 Markdown 文件，包含这些元信息：
- `title`
- `summary`
- `keywords`
- `source_conversations`
- `updated_at`

系统提示词里只注入经验索引，不会注入全文。  
当模型判断某条经验相关时，再调用 `get_experience` 读取详细内容。

这样既能控制 prompt 体积，也能持续积累长期可复用经验。

## 内置工具

| 工具 | 作用 |
|------|------|
| `bash` | 执行 shell 命令 |
| `python` | 用已配置解释器执行 Python 代码 |
| `write_file` | 创建或覆盖文件 |
| `read_file` | 读取文件内容 |
| `list_directory` | 查看目录结构 |
| `get_skill` | 读取技能全文 |
| `get_experience` | 读取经验全文 |
| `send_image` | 把网络、本地或 base64 图片发送到聊天窗口 |

## 独立发布

构建当前平台的独立发布包：

```bash
npm run build:release
```

构建指定平台：

```bash
npm run build:release:win-x64
npm run build:release:linux-x64
npm run build:release:macos-x64
```

发布目录示例：

```text
release/win-x64/
|-- asynagents-server.exe
|-- public/
`-- skills/
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

### 3. 启动

```bash
npm run dev:server
npm run dev:app
```

打开：

```text
http://localhost:2323
```

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

手动将一个会话总结为经验。

### `GET /health`

返回 provider、model、配置状态、hostname、Python 可用性和经验数量。

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

如果同名，用户技能会覆盖内置技能。

## 开发

```bash
npm run test
npm run build
```

## 技术栈

| 层 | 技术 |
|----|------|
| Frontend | React 18, TypeScript, Vite, Less, Zustand |
| Backend | Express, TypeScript, Winston |
| AI Providers | OpenAI SDK, Anthropic SDK |
| Packaging | esbuild, pkg |
| Testing | Vitest, Supertest |

## 安全提示

这个项目可以执行 shell 命令、写文件、运行 Python，并修改本地工作区。  
请把它当作一个真正有执行能力的 Agent 运行时，而不是普通聊天工具。

建议运行在：
- 可信的本地环境
- 沙箱环境
- 或者你允许 Agent 修改的工作目录中

## 适合什么场景

如果你想要的是下面这些东西，AsynAgents 会很合适：
- 一个本地优先、可检查、可调试的 Agent 应用
- 一个能展示工具执行过程而不是黑盒回复的 UI
- 一个能不断扩展 tools、skills、experiences 的项目骨架
- 一个不用 Electron 也能独立发布的 Agent 应用
- 一个适合编码、自动化和桌面工作流的运行时

## License

[Apache 2.0](./LICENSE)

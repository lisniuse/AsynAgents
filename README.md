# Asyn Agents

AI 智能体平台 — 每次对话创建独立线程，子智能体循环执行直到完成任务，通过 SSE 实时推送消息到前端。

## ✨ 特性

- 🤖 **多模型支持**: 支持 OpenAI 兼容 API 和 Anthropic Claude
- ⚡ **实时流式响应**: 使用 Server-Sent Events (SSE) 实时推送消息
- 🛠️ **代码执行**: 内置代码执行、文件读写、目录浏览等工具
- 🎨 **精美界面**: React + Vite + Less，支持浅色/深色/跟随系统主题
- 📝 **专业日志**: Winston 日志库，支持文件轮转和级别控制
- 🧪 **完整测试**: Vitest + Supertest API 测试覆盖

## 📁 项目结构

```
asyn-agents/
├── app/                    # 前端应用 (React + Vite + TypeScript)
│   ├── src/
│   │   ├── components/     # UI 组件
│   │   ├── hooks/          # 自定义 Hooks
│   │   ├── stores/         # Zustand 状态管理
│   │   ├── styles/         # Less 样式文件
│   │   └── types/          # TypeScript 类型定义
│   └── package.json
├── server/                 # 后端服务 (Express + TypeScript)
│   ├── src/
│   │   ├── agent/          # AI Agent 实现
│   │   │   ├── providers/  # LLM 提供商 (OpenAI/Anthropic)
│   │   │   └── tools.ts    # 工具定义
│   │   ├── queue/          # 消息队列
│   │   ├── routes/         # API 路由
│   │   ├── utils/          # 工具函数
│   │   └── server.ts       # 服务入口
│   └── package.json
├── tests/                  # 测试文件
│   └── api/                # API 测试
├── config.ts               # 全局配置文件
└── package.json            # 根 package.json
```

## 🚀 快速开始

### 1. 安装依赖

```bash
# 安装根依赖
npm install

# 安装前端依赖
cd app && npm install

# 安装后端依赖
cd ../server && npm install
```

### 2. 配置

编辑根目录下的 `config.ts` 文件：

```typescript
export const config: Config = {
  // 选择 API 提供商: 'anthropic' 或 'openai'
  provider: 'openai',

  // Anthropic 配置
  anthropic: {
    apiKey: 'your_anthropic_api_key_here',
    model: 'claude-opus-4-6',
  },

  // OpenAI 配置
  openai: {
    apiKey: 'your_openai_api_key_here',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4',
  },

  // 端口配置
  server: { port: 6868 },
  app: { port: 2323 },

  // 日志配置
  logging: {
    enabled: true,
    level: 'info',
    directory: '~/.asynagent/logs',
    maxFiles: 5,
    maxSize: '10m',
  },
};
```

### 3. 启动开发服务器

```bash
# 同时启动前端和后端
npm run dev

# 或分别启动
npm run dev:server  # 后端 http://localhost:6868
npm run dev:app     # 前端 http://localhost:2323
```

访问 http://localhost:2323

## 🏗️ 架构

```
┌─────────────┐      SSE      ┌─────────────┐
│   前端 App   │ ◄────────────► │   后端服务   │
│  (React)    │               │  (Express)  │
└─────────────┘               └──────┬──────┘
                                     │
                        ┌────────────┼────────────┐
                        ▼            ▼            ▼
                   ┌─────────┐ ┌──────────┐ ┌──────────┐
                   │Chat API │ │Events API│ │Health API│
                   └────┬────┘ └────┬─────┘ └──────────┘
                        │           │
                        ▼           ▼
                   ┌─────────────────────────┐
                   │      MessageQueue       │
                   │    (EventEmitter)       │
                   └───────────┬─────────────┘
                               │
                               ▼
                   ┌─────────────────────────┐
                   │       SubAgent          │
                   │  (独立线程/对话)         │
                   └───────────┬─────────────┘
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
              ┌─────────┐ ┌────────┐ ┌──────────┐
              │OpenAI   │ │Claude  │ │  Tools   │
              │Provider │ │Provider│ │(bash等)  │
              └─────────┘ └────────┘ └──────────┘
```

### 核心组件

- **前端**: React 18 + Vite + Less，Claude 风格设计，支持主题切换
- **后端**: Express + TypeScript，RESTful API + SSE
- **SubAgent**: 每条消息创建独立线程，循环执行直到任务完成
- **消息队列**: 基于 Node.js EventEmitter 的内存队列
- **LLM 提供商**: 支持 OpenAI 兼容 API 和 Anthropic Claude

## 🛠️ 工具

| 工具 | 描述 | 示例 |
|------|------|------|
| `bash` | 执行 Shell 命令 | `bash -c "ls -la"` |
| `write_file` | 写入文件 | `write_file path content` |
| `read_file` | 读取文件 | `read_file path` |
| `list_directory` | 列出目录 | `list_directory path` |

## 🧪 测试

```bash
# 运行所有测试
npm run test

# 监视模式
npm run test:watch

# 覆盖率报告
npm run test:coverage
```

## 📝 日志

日志文件默认存放在 `~/.asynagent/logs/`：

```
~/.asynagent/logs/
├── app.log        # 所有日志
├── error.log      # 错误日志
├── exceptions.log # 未捕获异常
└── rejections.log # 未处理 Promise 拒绝
```

日志配置在 `config.ts` 中：
- `enabled`: 是否启用日志
- `level`: 日志级别 (error/warn/info/debug)
- `directory`: 日志目录
- `maxFiles`: 保留文件数
- `maxSize`: 单个文件大小限制

## 🎨 主题

前端支持三种主题模式：
- ☀️ **浅色模式**: 明亮的界面风格
- 🌙 **深色模式**: 暗色护眼风格
- 🖥️ **跟随系统**: 自动适配系统主题

点击右上角主题切换按钮进行切换。

## 📡 API

### POST /api/chat
发送消息启动对话。

```bash
curl -X POST http://localhost:6868/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session_xxx",
    "message": "你好",
    "conversationHistory": []
  }'
```

响应：
```json
{ "threadId": "uuid" }
```

### GET /api/events/:sessionId
建立 SSE 连接接收实时消息。

```javascript
const eventSource = new EventSource('/api/events/session_xxx');
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.type, data.data);
};
```

事件类型：
- `agent_start`: 智能体开始工作
- `text_delta`: 文本片段（流式）
- `tool_call`: 工具调用
- `tool_result`: 工具执行结果
- `agent_done`: 智能体完成
- `error`: 错误信息

### GET /health
健康检查。

```bash
curl http://localhost:6868/health
```

## ⚙️ 配置选项

### API 提供商

**OpenAI 兼容 API**:
```typescript
provider: 'openai',
openai: {
  apiKey: 'sk-xxx',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4',
}
```

**Anthropic Claude**:
```typescript
provider: 'anthropic',
anthropic: {
  apiKey: 'sk-ant-xxx',
  model: 'claude-opus-4-6',
}
```

### 端口配置

```typescript
server: { port: 6868 },  // 后端端口
app: { port: 2323 },     // 前端端口
```

## 📦 技术栈

### 前端
- React 18
- TypeScript 5
- Vite 6
- Less
- Zustand (状态管理)
- Lucide React (图标)

### 后端
- Express 4
- TypeScript 5
- Winston (日志)
- OpenAI SDK
- Anthropic SDK

### 测试
- Vitest
- Supertest

## 🔒 安全提示

⚠️ **注意**: AI 智能体可以执行系统命令和修改文件，请确保：

1. 在受控环境中运行
2. 审查 AI 生成的命令
3. 避免在生产环境直接执行未验证的代码
4. 配置合适的 API Key 权限

## 📄 许可证

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

Made with ❤️ by Asyn Agents Team

export default {
  // Sidebar
  newChat: '新建对话',
  history: '历史对话',
  noConversations: '暂无对话记录',
  settings: '设置',
  yesterday: '昨天',

  // Delete popover
  confirmDelete: '确定删除？',
  cancel: '取消',
  delete: '删除',

  // Message
  assistant: 'ASSISTANT',
  toolCallProcess: '工具调用过程',
  collapseToolCalls: '收起工具调用过程',
  expandToolCalls: '展开工具调用过程',
  stop: '停止',
  stopping: '停止中...',
  stopped: '[已停止]',

  // Welcome
  welcomeSubtitle: 'AI 智能体系统 · 每次对话创建独立线程 · 可执行代码、读写文件、安装包',
  inputPlaceholder: '描述你想完成的任务... (Shift+Enter 换行，Enter 发送)',
  inputHint: 'AI 智能体可以执行命令和修改文件，请确认操作安全',
  welcomePrompts: [
    { emoji: '🐍', text: '写一个 Python 的 Hello World 并运行它' },
    { emoji: '🌐', text: '用 Node.js 创建一个简单的 HTTP 服务器' },
    { emoji: '📂', text: '查看当前目录的文件结构并说明用途' },
    { emoji: '🔢', text: '帮我写一个 Fibonacci 数列计算器并测试' },
    { emoji: '💻', text: '查看系统信息（操作系统、内存、CPU 等）' },
    { emoji: '📝', text: '用 bash 写一个文件批量重命名脚本' },
  ],

  // Theme
  themeLight: '浅色模式',
  themeDark: '深色模式',
  themeSystem: '跟随系统',

  // Settings
  settingsTitle: '设置',
  modelConfig: '模型配置',
  apiProvider: 'API 提供商',
  openaiCompatible: 'OpenAI 兼容',
  anthropicProvider: 'Anthropic',
  apiKey: 'API Key',
  baseUrl: 'Base URL',
  modelField: '模型',
  optional: '（可选）',
  workspaceSection: '工作区',
  workspaceDir: '工作目录',
  workspaceDirHint: '智能体创建和修改文件的默认目录',
  uiSection: '界面',
  showToolCallsByDefault: '默认展开工具调用过程',
  showToolCallsByDefaultHint: '每条消息的工具调用区域是否默认展开',
  interfaceLanguage: '界面语言',
  userLanguageLabel: 'AI 回复语言',
  userLanguageHint: '指定 AI 优先使用的回复语言',
  langZh: '中文',
  langEn: 'English',
  langAuto: '自动（跟随用户输入）',
  restartHint: '修改模型配置后需重启服务器生效',
  save: '保存',
  saved: '已保存 ✓',
  saving: '保存中...',
} as const;

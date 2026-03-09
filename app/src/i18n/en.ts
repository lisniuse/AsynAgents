export default {
  // Sidebar
  newChat: 'New Chat',
  history: 'Conversations',
  noConversations: 'No conversations yet',
  settings: 'Settings',
  yesterday: 'Yesterday',

  // Delete popover
  confirmDelete: 'Delete this chat?',
  cancel: 'Cancel',
  delete: 'Delete',

  // Message
  assistant: 'ASSISTANT',
  toolCallProcess: 'Tool Calls',
  collapseToolCalls: 'Collapse tool calls',
  expandToolCalls: 'Expand tool calls',
  stop: 'Stop',
  stopping: 'Stopping...',
  stopped: '[Stopped]',

  // Welcome
  welcomeSubtitle: 'AI Agent Platform · Independent thread per message · Run code, read/write files, install packages',
  inputPlaceholder: 'Describe the task you want to accomplish... (Shift+Enter for newline)',
  inputHint: 'The AI agent can execute commands and modify files — confirm actions are safe',
  welcomePrompts: [
    { emoji: '🐍', text: 'Write a Python Hello World and run it' },
    { emoji: '🌐', text: 'Create a simple HTTP server with Node.js' },
    { emoji: '📂', text: 'Show the current directory structure and explain each item' },
    { emoji: '🔢', text: 'Write a Fibonacci calculator and test it' },
    { emoji: '💻', text: 'Show system info (OS, memory, CPU, etc.)' },
    { emoji: '📝', text: 'Write a bash script to batch rename files' },
  ],

  // Theme
  themeLight: 'Light',
  themeDark: 'Dark',
  themeSystem: 'System',

  // Settings
  settingsTitle: 'Settings',
  modelConfig: 'Model Configuration',
  apiProvider: 'API Provider',
  openaiCompatible: 'OpenAI Compatible',
  anthropicProvider: 'Anthropic',
  apiKey: 'API Key',
  baseUrl: 'Base URL',
  modelField: 'Model',
  optional: '(optional)',
  workspaceSection: 'Workspace',
  workspaceDir: 'Workspace Directory',
  workspaceDirHint: 'Default directory for agent file operations',
  uiSection: 'Interface',
  showToolCallsByDefault: 'Expand tool calls by default',
  showToolCallsByDefaultHint: 'Whether the tool call section is expanded by default',
  interfaceLanguage: 'Interface Language',
  userLanguageLabel: 'AI Response Language',
  userLanguageHint: 'Language the AI should prioritize when responding',
  langZh: 'Chinese (中文)',
  langEn: 'English',
  langAuto: 'Auto (follow user input)',
  restartHint: 'Server restart required for model config changes to take effect',
  save: 'Save',
  saved: 'Saved ✓',
  saving: 'Saving...',
} as const;

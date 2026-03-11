import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

export type ApiProvider = 'anthropic' | 'openai';

export interface Config {
  provider: ApiProvider;
  python: {
    path: string;
  };
  experience: {
    idleMinutes: number;
    scanIntervalMs: number;
    maxEntriesInPrompt: number;
  };
  anthropic: {
    apiKey: string;
    baseUrl?: string;
    model: string;
  };
  openai: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  server: {
    port: number;
    hostname: string;
  };
  app: {
    port: number;
  };
  workspace: string;
  logging: {
    enabled: boolean;
    level: 'error' | 'warn' | 'info' | 'debug';
    maxFiles: number;
    maxSize: string;
  };
  ui: {
    showToolCalls: boolean;
    autoCollapseToolCalls: boolean;
    language: 'zh' | 'en';
    userLanguage: 'zh' | 'en' | 'auto';
  };
  persona: {
    aiName: string;
    userName: string;
    aiAvatar: string;
    userAvatar: string;
    personality: string;
  };
  maxIterations: number; // 0 = unlimited
}

export const CONFIG_DIR = join(homedir(), '.asynagents');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const defaultConfig: Config = {
  provider: 'openai',
  python: {
    path: 'python',
  },
  experience: {
    idleMinutes: 20,
    scanIntervalMs: 60000,
    maxEntriesInPrompt: 50,
  },
  anthropic: {
    apiKey: '',
    model: 'claude-opus-4-6',
  },
  openai: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  },
  server: {
    port: 6868,
    hostname: '',
  },
  app: {
    port: 2323,
  },
  workspace: join(homedir(), '.asynagents', 'workspace'),
  logging: {
    enabled: true,
    level: 'info',
    maxFiles: 5,
    maxSize: '10m',
  },
  ui: {
    showToolCalls: true,
    autoCollapseToolCalls: false,
    language: 'zh',
    userLanguage: 'auto',
  },
  persona: {
    aiName: '',
    userName: '',
    aiAvatar: '',
    userAvatar: '',
    personality: '',
  },
  maxIterations: 0,
};

function loadConfig(): Config {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    return { ...defaultConfig };
  }

  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8');
    const userConfig = JSON.parse(content);
    return {
      ...defaultConfig,
      ...userConfig,
      python: { ...defaultConfig.python, ...userConfig.python },
      experience: { ...defaultConfig.experience, ...userConfig.experience },
      anthropic: { ...defaultConfig.anthropic, ...userConfig.anthropic },
      openai: { ...defaultConfig.openai, ...userConfig.openai },
      server: { ...defaultConfig.server, ...userConfig.server },
      app: { ...defaultConfig.app, ...userConfig.app },
      logging: { ...defaultConfig.logging, ...userConfig.logging },
      ui: { ...defaultConfig.ui, ...userConfig.ui },
      persona: { ...defaultConfig.persona, ...userConfig.persona },
    };
  } catch {
    return { ...defaultConfig };
  }
}

export const config: Config = loadConfig();

export function activeModel(): string {
  return config.provider === 'anthropic'
    ? config.anthropic.model
    : config.openai.model;
}

export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.provider === 'anthropic') {
    if (!config.anthropic.apiKey) {
      errors.push('Anthropic API key 未配置，请在 ~/.asynagents/config.json 中设置 "anthropic.apiKey"');
    }
  } else {
    if (!config.openai.apiKey) {
      errors.push('OpenAI API key 未配置，请在 ~/.asynagents/config.json 中设置 "openai.apiKey"');
    }
  }

  return { valid: errors.length === 0, errors };
}

// vite.config.ts 兼容导出
export const serverConfig = config.server;
export const appConfig = config.app;

// 日志目录（固定在 ~/.asynagents/logs）
export const logDir = join(CONFIG_DIR, 'logs');

// workspace 目录
export const workspaceDir: string = config.workspace || join(CONFIG_DIR, 'workspace');

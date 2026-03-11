export interface SSEEvent {
  type:
    | 'connected'
    | 'agent_start'
    | 'thinking_delta'
    | 'text_delta'
    | 'tool_call'
    | 'tool_result'
    | 'agent_done'
    | 'agent_stopped'
    | 'error';
  threadId: string;
  data: unknown;
  timestamp: number;
  index?: number; // position in per-conversation buffer
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ChatRequest {
  conversationId: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  message: string;
  messageId?: string;
  images?: string[]; // base64 data URLs
}

export interface ChatResponse {
  threadId: string;
  checkpointId?: string;
}

export interface ToolCallData {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultData {
  id: string;
  toolName: string;
  result: string;
  isError: boolean;
  changedPaths?: string[];
}

export interface ManagedProcessInfo {
  id: string;
  conversationId: string;
  name: string;
  command: string;
  cwd: string;
  pid: number;
  status: 'running' | 'stopped' | 'exited' | 'failed';
  startedAt: number;
  endedAt?: number;
  exitCode?: number | null;
  signal?: string | null;
  ports: number[];
  urls: string[];
  recentOutput: string;
  logFile: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  checkpointId?: string;
  thinking?: string;
  timestamp: number;
  toolCalls?: ToolCallState[];
  isStreaming?: boolean;
  threadId?: string;
  kind?: 'chat' | 'summary_note';
}

export interface ToolCallState {
  id: string;
  name: string;
  input: Record<string, unknown>;
  preText?: string;
  result?: string;
  isError?: boolean;
  status: 'running' | 'done' | 'error';
}

export interface Conversation {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  pinned?: boolean;
  bold?: boolean;
  projectSession?: {
    mode: 'project';
    projectPath: string;
    projectName: string;
    selectedAt: number;
  } | null;
}

export interface AgentState {
  threadId: string;
  isRunning: boolean;
  abortController?: AbortController;
}

export interface SkillItem {
  name: string;
  description: string;
  source: 'system' | 'user';
  enabled: boolean;
}

export interface ExperienceItem {
  fileName: string;
  title: string;
  summary: string;
  keywords: string[];
  enabled: boolean;
}

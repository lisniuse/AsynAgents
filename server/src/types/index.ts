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

export interface AssistantImage {
  url: string;
  alt?: string;
}

export interface StoredToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  preText?: string;
  result?: string;
  isError?: boolean;
  status: 'done' | 'error';
}

export interface ProjectSessionSummary {
  mode: 'project';
  projectPath: string;
  projectName: string;
  selectedAt: number;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  checkpointId?: string;
  thinking?: string;
  toolCalls?: StoredToolCall[];
  timestamp: number;
  threadId?: string;
  kind?: 'chat' | 'summary_note';
}

export interface StoredConversation {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  pinned?: boolean;
  bold?: boolean;
  projectSession?: ProjectSessionSummary | null;
}

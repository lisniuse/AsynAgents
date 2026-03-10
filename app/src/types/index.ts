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
  images?: string[]; // base64 data URLs
}

export interface ChatResponse {
  threadId: string;
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

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[]; // base64 data URLs (user messages only)
  thinking?: string;
  timestamp: number;
  toolCalls?: ToolCallState[];
  isStreaming?: boolean;
  threadId?: string;
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
}

export interface AgentState {
  threadId: string;
  isRunning: boolean;
  abortController?: AbortController;
}

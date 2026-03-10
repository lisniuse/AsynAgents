export interface SSEEvent {
  type:
    | 'connected'
    | 'agent_start'
    | 'text_delta'
    | 'tool_call'
    | 'tool_result'
    | 'agent_done'
    | 'error';
  threadId: string;
  data: unknown;
  timestamp: number;
}

export interface ChatRequest {
  sessionId: string;
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

export interface StoredToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  preText?: string;
  result?: string;
  isError?: boolean;
  status: 'done' | 'error';
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  toolCalls?: StoredToolCall[];
  timestamp: number;
  threadId?: string;
}

export interface StoredConversation {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
  pinned?: boolean;
  bold?: boolean;
}

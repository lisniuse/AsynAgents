import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/stores/appStore';
import type { SSEEvent, ToolCallData, ToolResultData } from '@/types';

const API_BASE = '/api';
const SUMMARY_COMMANDS = new Set(['/summarize']);

// ─── Per-conversation session state in localStorage ───────────────────────────
// Tracks lastIndex (next event to request on reconnect) and whether an agent
// is currently in-progress (so we know to replay from 0 to reconstruct state).

interface SessionState {
  threadId: string;
  inProgress: boolean;
  lastIndex: number;
}

const SESSIONS_KEY = 'sse_sessions';

function readSessions(): Record<string, SessionState> {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeSessions(sessions: Record<string, SessionState>): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {}
}

function getSession(conversationId: string): SessionState | null {
  return readSessions()[conversationId] ?? null;
}

function updateSession(conversationId: string, patch: Partial<SessionState>): void {
  const sessions = readSessions();
  sessions[conversationId] = { ...sessions[conversationId], ...patch } as SessionState;
  writeSessions(sessions);
}

// ──────────────────────────────────────────────────────────────────────────────

export const useSSE = () => {
  const navigate = useNavigate();
  const eventSourceRef = useRef<EventSource | null>(null);
  const currentThreadIdRef = useRef<string | null>(null);

  const {
    activeConversationId,
    conversationsLoaded,
    addMessage,
    updateMessage,
    appendToMessage,
    appendToThinking,
    addToolCall,
    updateToolCall,
    registerAgent,
    unregisterAgent,
  } = useAppStore();

  // ── Event handler ──────────────────────────────────────────────────────────
  const handleEvent = useCallback(
    (event: SSEEvent, conversationId: string) => {
      // Update replay index
      if (typeof event.index === 'number') {
        updateSession(conversationId, { lastIndex: event.index + 1 });
      }

      const conversation = useAppStore.getState().conversations.find(c => c.id === conversationId);
      if (!conversation) return;

      switch (event.type) {
        case 'agent_start': {
          updateSession(conversationId, {
            threadId: event.threadId,
            inProgress: true,
            lastIndex: 0,
          });
          currentThreadIdRef.current = event.threadId;

          // On replay, always reset content so events don't accumulate across
          // multiple reconnects or React StrictMode double-invocations.
          const existing = conversation.messages.find(m => m.threadId === event.threadId);
          if (!existing) {
            const assistantMsgId = 'msg_' + Math.random().toString(36).substring(2, 15);
            addMessage(conversationId, {
              id: assistantMsgId,
              role: 'assistant',
              content: '',
              thinking: '',
              timestamp: Date.now(),
              isStreaming: true,
              toolCalls: [],
              threadId: event.threadId,
            });
          } else {
            // Reset so replayed text_delta events start from a clean slate
            updateMessage(conversationId, existing.id, {
              isStreaming: true,
              content: '',
              thinking: '',
              toolCalls: [],
            });
          }
          registerAgent(event.threadId, new AbortController());
          break;
        }

        case 'thinking_delta': {
          const msg = useAppStore.getState().conversations
            .find(c => c.id === conversationId)
            ?.messages.find(m => m.role === 'assistant' && m.threadId === event.threadId);
          if (msg) {
            appendToThinking(conversationId, msg.id, (event.data as { text: string }).text);
          }
          break;
        }

        case 'text_delta': {
          const msg = useAppStore.getState().conversations
            .find(c => c.id === conversationId)
            ?.messages.find(m => m.role === 'assistant' && m.threadId === event.threadId);
          if (msg) {
            appendToMessage(conversationId, msg.id, (event.data as { text: string }).text);
          }
          break;
        }

        case 'tool_call': {
          const toolData = event.data as ToolCallData;
          const msg = useAppStore.getState().conversations
            .find(c => c.id === conversationId)
            ?.messages.find(m => m.role === 'assistant' && m.threadId === event.threadId);
          if (msg) {
            // Avoid duplicate tool calls on replay
            const already = msg.toolCalls?.find(tc => tc.id === toolData.id);
            if (!already) {
              const preText = msg.content || undefined;
              if (preText) updateMessage(conversationId, msg.id, { content: '' });
              addToolCall(conversationId, msg.id, {
                id: toolData.id,
                name: toolData.name,
                input: toolData.input,
                preText,
                status: 'running',
              });
            }
          }
          break;
        }

        case 'tool_result': {
          const resultData = event.data as ToolResultData;
          const msg = useAppStore.getState().conversations
            .find(c => c.id === conversationId)
            ?.messages.find(m => m.role === 'assistant' && m.threadId === event.threadId);
          if (msg) {
            updateToolCall(conversationId, msg.id, resultData.id, {
              result: resultData.result,
              isError: resultData.isError,
              status: resultData.isError ? 'error' : 'done',
            });
          }
          break;
        }

        case 'agent_done': {
          updateSession(conversationId, { inProgress: false });
          const msg = useAppStore.getState().conversations
            .find(c => c.id === conversationId)
            ?.messages.find(m => m.role === 'assistant' && m.threadId === event.threadId);
          if (msg) {
            const doneData = event.data as { text?: string; thinking?: string };
            updateMessage(conversationId, msg.id, {
              isStreaming: false,
              ...(doneData.text && doneData.text.length > (msg.content?.length ?? 0)
                ? { content: doneData.text }
                : {}),
              ...(doneData.thinking && doneData.thinking.length > (msg.thinking?.length ?? 0)
                ? { thinking: doneData.thinking }
                : {}),
            });
          }

          // Save conversation to backend
          const updatedConversation = useAppStore.getState().conversations.find(c => c.id === conversationId);
          if (updatedConversation) {
            const messagesToSave = updatedConversation.messages.map(({ isStreaming: _, ...m }) => m);
            fetch(`/api/conversations/${updatedConversation.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: messagesToSave, name: updatedConversation.name }),
            }).catch(console.error);
          }

          unregisterAgent(event.threadId);
          if (currentThreadIdRef.current === event.threadId) currentThreadIdRef.current = null;
          break;
        }

        case 'agent_stopped': {
          updateSession(conversationId, { inProgress: false });
          const msg = useAppStore.getState().conversations
            .find(c => c.id === conversationId)
            ?.messages.find(m => m.role === 'assistant' && m.threadId === event.threadId);
          if (msg) {
            updateMessage(conversationId, msg.id, {
              isStreaming: false,
              content: msg.content + '\n\n[已停止]',
            });
          }
          unregisterAgent(event.threadId);
          if (currentThreadIdRef.current === event.threadId) currentThreadIdRef.current = null;
          break;
        }

        case 'error': {
          console.error('Agent error:', event.data);
          updateSession(conversationId, { inProgress: false });
          if (currentThreadIdRef.current) {
            unregisterAgent(currentThreadIdRef.current);
            currentThreadIdRef.current = null;
          }
          break;
        }

        case 'connected':
          console.log('SSE connected to conversation:', conversationId);
          break;
      }
    },
    [addMessage, updateMessage, appendToMessage, appendToThinking, addToolCall, updateToolCall, registerAgent, unregisterAgent]
  );

  // ── Connect / reconnect ────────────────────────────────────────────────────
  const connect = useCallback((conversationId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const session = getSession(conversationId);
    // If agent was in-progress, replay from 0 to reconstruct message state.
    // Otherwise, replay from where we left off (skips already-processed events).
    const fromIndex = session?.inProgress ? 0 : (session?.lastIndex ?? 0);

    const url = `${API_BASE}/events/${conversationId}?from=${fromIndex}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const sseEvent: SSEEvent = JSON.parse(e.data);
        handleEvent(sseEvent, conversationId);
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    es.onerror = () => {
      console.error('SSE connection error, reconnecting...');
      setTimeout(() => {
        if (eventSourceRef.current === es) {
          connect(conversationId);
        }
      }, 3000);
    };
  }, [handleEvent]);

  // Stable ref so the effect below doesn't re-run when connect identity changes
  const connectRef = useRef(connect);
  connectRef.current = connect;

  // Connect only after conversations are loaded from server.
  // This ensures replayed events can find their target conversation in the store.
  useEffect(() => {
    if (!activeConversationId || !conversationsLoaded) {
      return;
    }
    connectRef.current(activeConversationId);
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [activeConversationId, conversationsLoaded]);

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (message: string, images?: string[]) => {
      let conversationId = activeConversationId;
      const trimmedMessage = message.trim();

      if (SUMMARY_COMMANDS.has(trimmedMessage)) {
        if (!conversationId) {
          return;
        }

        const conversation = useAppStore.getState().conversations.find((c) => c.id === conversationId);
        if (!conversation || conversation.messages.filter((msg) => msg.kind !== 'summary_note').length === 0) {
          return;
        }

        try {
          const response = await fetch(`${API_BASE}/conversations/${conversationId}/summarize`, {
            method: 'POST',
          });
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Failed to summarize conversation');
          }

          useAppStore.getState().addMessage(conversationId, {
            id: 'msg_' + Math.random().toString(36).substring(2, 15),
            role: 'assistant',
            content: data.message,
            timestamp: Date.now(),
            kind: 'summary_note',
          });

          const updatedConversation = useAppStore.getState().conversations.find((c) => c.id === conversationId);
          if (updatedConversation) {
            const messagesToSave = updatedConversation.messages.map(({ isStreaming: _, ...msg }) => msg);
            fetch(`${API_BASE}/conversations/${conversationId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: messagesToSave, name: updatedConversation.name }),
            }).catch(console.error);
          }
        } catch (err) {
          console.error('Summarize conversation error:', err);
        }
        return;
      }

      if (!conversationId) {
        conversationId = await useAppStore.getState().createConversation();
        navigate(`/c/${conversationId}`);
      }

      const existingConversation = useAppStore.getState().conversations.find(c => c.id === conversationId);
      const conversationHistory = existingConversation?.messages
        .filter((msg) => msg.kind !== 'summary_note')
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        })) ?? [];

      const userMsgId = 'msg_' + Math.random().toString(36).substring(2, 15);
      useAppStore.getState().addMessage(conversationId, {
        id: userMsgId,
        role: 'user',
        content: message,
        images,
        timestamp: Date.now(),
      });

      const conversation = useAppStore.getState().conversations.find(c => c.id === conversationId);

      // Persist user message immediately so it survives a page refresh
      if (conversation) {
        const messagesToSave = conversation.messages.map(({ isStreaming: _, ...m }) => m);
        fetch(`${API_BASE}/conversations/${conversationId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: messagesToSave, name: conversation.name }),
        }).catch(console.error);
      }

      try {
        const response = await fetch(`${API_BASE}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            conversationHistory,
            message,
            images,
          }),
        });

        if (!response.ok) throw new Error('Failed to send message');

        const data = await response.json();
        if (data.threadId) {
          registerAgent(data.threadId, new AbortController());
          currentThreadIdRef.current = data.threadId;
        }
      } catch (err) {
        console.error('Send message error:', err);
      }
    },
    [activeConversationId, navigate, registerAgent]
  );

  // ── Stop current agent ─────────────────────────────────────────────────────
  const stopCurrentAgent = useCallback(async () => {
    if (!currentThreadIdRef.current) return false;
    const { stopAgent } = useAppStore.getState();
    const success = await stopAgent(currentThreadIdRef.current);
    if (success) currentThreadIdRef.current = null;
    return success;
  }, []);

  return { sendMessage, stopCurrentAgent };
};

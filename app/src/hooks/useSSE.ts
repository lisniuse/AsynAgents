import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/stores/appStore';
import type { SSEEvent, ToolCallData, ToolResultData } from '@/types';

const API_BASE = '/api';

export const useSSE = () => {
  const navigate = useNavigate();
  const eventSourceRef = useRef<EventSource | null>(null);
  const sessionIdRef = useRef<string>(generateSessionId());
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentThreadIdRef = useRef<string | null>(null);

  const {
    activeConversationId,
    addMessage,
    updateMessage,
    appendToMessage,
    appendToThinking,
    addToolCall,
    updateToolCall,
    registerAgent,
    unregisterAgent,
  } = useAppStore();

  function generateSessionId(): string {
    return 'session_' + Math.random().toString(36).substring(2, 15);
  }

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const sessionId = sessionIdRef.current;
    const eventSource = new EventSource(`${API_BASE}/events/${sessionId}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const sseEvent: SSEEvent = JSON.parse(event.data);
        handleEvent(sseEvent);
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    eventSource.onerror = () => {
      console.error('SSE connection error');
      setTimeout(() => {
        if (eventSourceRef.current === eventSource) {
          connect();
        }
      }, 3000);
    };
  }, []);

  const handleEvent = useCallback(
    (event: SSEEvent) => {
      // 使用 getActiveConversation 获取当前活动对话，而不是依赖 activeConversationId
      const conversation = useAppStore.getState().getActiveConversation();
      if (!conversation) {
        console.warn('No active conversation, ignoring event:', event.type);
        return;
      }

      const conversationId = conversation.id;

      switch (event.type) {
        case 'agent_start': {
          const assistantMsgId = 'msg_' + Math.random().toString(36).substring(2, 15);
          currentThreadIdRef.current = event.threadId;
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
          break;
        }

        case 'thinking_delta': {
          const msg = conversation.messages.find((m) => m.role === 'assistant' && m.threadId === event.threadId);
          if (msg) {
            appendToThinking(conversationId, msg.id, (event.data as { text: string }).text);
          }
          break;
        }

        case 'text_delta': {
          const msg = conversation.messages.find((m) => m.role === 'assistant' && m.threadId === event.threadId);
          if (msg) {
            appendToMessage(conversationId, msg.id, (event.data as { text: string }).text);
          }
          break;
        }

        case 'tool_call': {
          const toolData = event.data as ToolCallData;
          const msg = conversation.messages.find((m) => m.role === 'assistant' && m.threadId === event.threadId);
          if (msg) {
            const preText = msg.content || undefined;
            if (preText) {
              updateMessage(conversationId, msg.id, { content: '' });
            }
            addToolCall(conversationId, msg.id, {
              id: toolData.id,
              name: toolData.name,
              input: toolData.input,
              preText,
              status: 'running',
            });
          }
          break;
        }

        case 'tool_result': {
          const resultData = event.data as ToolResultData;
          const msg = conversation.messages.find((m) => m.role === 'assistant' && m.threadId === event.threadId);
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
          const msg = conversation.messages.find((m) => m.role === 'assistant' && m.threadId === event.threadId);
          if (msg) {
            updateMessage(conversationId, msg.id, { isStreaming: false });
          }

          // Save conversation to backend
          const updatedConversation = useAppStore.getState().getActiveConversation();
          if (updatedConversation) {
            const messagesToSave = updatedConversation.messages.map(({ isStreaming: _, ...m }) => m);
            fetch(`/api/conversations/${updatedConversation.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages: messagesToSave, name: updatedConversation.name }),
            }).catch(console.error);
          }

          unregisterAgent(event.threadId);
          if (currentThreadIdRef.current === event.threadId) {
            currentThreadIdRef.current = null;
          }
          break;
        }

        case 'agent_stopped': {
          const msg = conversation.messages.find((m) => m.role === 'assistant' && m.threadId === event.threadId);
          if (msg) {
            updateMessage(conversationId, msg.id, {
              isStreaming: false,
              content: msg.content + '\n\n[已停止]',
            });
          }

          unregisterAgent(event.threadId);
          if (currentThreadIdRef.current === event.threadId) {
            currentThreadIdRef.current = null;
          }
          break;
        }

        case 'error': {
          console.error('Agent error:', event.data);
          
          if (currentThreadIdRef.current) {
            unregisterAgent(currentThreadIdRef.current);
            currentThreadIdRef.current = null;
          }
          break;
        }

        case 'connected': {
          // SSE 连接成功，可以忽略或记录
          console.log('SSE connected:', event.data);
          break;
        }
      }
    },
    [addMessage, updateMessage, appendToMessage, appendToThinking, addToolCall, updateToolCall, unregisterAgent]
  );

  const sendMessage = useCallback(
    async (message: string) => {
      let conversationId = activeConversationId;
      
      if (!conversationId) {
        conversationId = await useAppStore.getState().createConversation();
        navigate(`/c/${conversationId}`);
      }

      const userMsgId = 'msg_' + Math.random().toString(36).substring(2, 15);
      addMessage(conversationId, {
        id: userMsgId,
        role: 'user',
        content: message,
        timestamp: Date.now(),
      });

      const conversation = useAppStore
        .getState()
        .conversations.find((c) => c.id === conversationId);

      // 创建新的 AbortController
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(`${API_BASE}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortControllerRef.current.signal,
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            conversationHistory: conversation?.messages.map((m) => ({
              role: m.role,
              content: m.content,
            })) ?? [],
            message,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to send message');
        }

        const data = await response.json();
        
        // 注册 Agent
        if (data.threadId && abortControllerRef.current) {
          registerAgent(data.threadId, abortControllerRef.current);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          console.log('Message sending aborted');
        } else {
          console.error('Send message error:', err);
        }
      }
    },
    [activeConversationId, addMessage, registerAgent]
  );

  const stopCurrentAgent = useCallback(async () => {
    if (currentThreadIdRef.current) {
      const { stopAgent } = useAppStore.getState();
      const success = await stopAgent(currentThreadIdRef.current);
      
      if (success) {
        abortControllerRef.current?.abort();
        currentThreadIdRef.current = null;
      }
      
      return success;
    }
    return false;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connect]);

  return {
    sendMessage,
    stopCurrentAgent,
    currentThreadId: currentThreadIdRef.current,
  };
};

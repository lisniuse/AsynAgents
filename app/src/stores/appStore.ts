import { create } from 'zustand';
import type { Message, Conversation, ToolCallState, ThemeMode, AgentState } from '@/types';
import { getStoredTheme, setStoredTheme, applyTheme } from '@/utils/theme';

const API_BASE = '/api';

export interface AppSettings {
  provider: string;
  python: { path: string };
  anthropic: { apiKey: string; baseUrl?: string; model: string };
  openai: { apiKey: string; baseUrl: string; model: string };
  workspace: string;
  ui: {
    showToolCalls: boolean;
    language?: 'zh' | 'en';
    userLanguage?: 'zh' | 'en' | 'auto';
  };
  persona: { aiName: string; userName: string; personality: string };
  maxIterations: number;
}

export interface ConfigSaveResult {
  ok: boolean;
  pythonAvailable?: boolean;
  pythonPath?: string;
  pythonError?: string;
}

interface AppState {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  effectiveTheme: 'light' | 'dark';

  settings: AppSettings | null;
  loadSettings: () => Promise<void>;
  saveSettings: (patch: Partial<AppSettings>) => Promise<ConfigSaveResult | null>;

  conversationsLoaded: boolean;

  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;

  conversations: Conversation[];
  activeConversationId: string | null;
  runningAgents: Map<string, AgentState>;

  loadConversations: () => Promise<void>;
  createConversation: () => Promise<string>;
  deleteConversation: (id: string) => void;
  deleteConversations: (ids: string[]) => void;
  setActiveConversation: (id: string | null) => void;
  updateConversationName: (id: string, name: string) => void;
  updateConversation: (id: string, patch: Partial<Conversation>) => Promise<boolean>;

  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  appendToMessage: (conversationId: string, messageId: string, content: string) => void;
  appendToThinking: (conversationId: string, messageId: string, thinking: string) => void;

  addToolCall: (conversationId: string, messageId: string, toolCall: ToolCallState) => void;
  updateToolCall: (
    conversationId: string,
    messageId: string,
    toolCallId: string,
    updates: Partial<ToolCallState>
  ) => void;

  getActiveConversation: () => Conversation | undefined;

  registerAgent: (threadId: string, abortController: AbortController) => void;
  unregisterAgent: (threadId: string) => void;
  stopAgent: (threadId: string) => Promise<boolean>;
  isAgentRunning: (threadId: string) => boolean;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

export const useAppStore = create<AppState>()(
  (set, get) => ({
    themeMode: getStoredTheme(),
    effectiveTheme: applyTheme(getStoredTheme()),

    setThemeMode: (mode) => {
      setStoredTheme(mode);
      const effective = applyTheme(mode);
      set({ themeMode: mode, effectiveTheme: effective });
    },

    settings: null,
    sidebarCollapsed: false,
    setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

    loadSettings: async () => {
      try {
        const res = await fetch(`${API_BASE}/config`);
        if (!res.ok) return;
        const data = await res.json();
        set({ settings: data as AppSettings });
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    },

    saveSettings: async (patch) => {
      try {
        const res = await fetch(`${API_BASE}/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) return null;
        const result = await res.json() as ConfigSaveResult;
        set((state) => ({
          settings: state.settings ? { ...state.settings, ...patch } : null,
        }));
        return result;
      } catch (err) {
        console.error('Failed to save settings:', err);
        return null;
      }
    },

    conversations: [],
    conversationsLoaded: false,
    activeConversationId: null,
    runningAgents: new Map(),

    loadConversations: async () => {
      try {
        const res = await fetch(`${API_BASE}/conversations`);
        if (!res.ok) { set({ conversationsLoaded: true }); return; }
        const serverConversations: Conversation[] = await res.json();
        set((state) => {
          // Don't overwrite conversations that have in-progress streaming messages
          // (can happen when React StrictMode double-invokes this and SSE has already started)
          const merged = serverConversations.map((sc) => {
            const existing = state.conversations.find((c) => c.id === sc.id);
            if (existing?.messages.some((m) => m.isStreaming)) return existing;
            return sc;
          });
          return { conversations: merged, conversationsLoaded: true };
        });
      } catch (err) {
        console.error('Failed to load conversations:', err);
        set({ conversationsLoaded: true });
      }
    },

    createConversation: async () => {
      try {
        const res = await fetch(`${API_BASE}/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: '新对话' }),
        });
        const conversation: Conversation = await res.json();
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: conversation.id,
        }));
        return conversation.id;
      } catch (err) {
        console.error('Failed to create conversation:', err);
        // fallback: create locally
        const id = generateId();
        const conversation: Conversation = {
          id,
          name: '新对话',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
        };
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          activeConversationId: id,
        }));
        return id;
      }
    },

    deleteConversation: (id) => {
      fetch(`${API_BASE}/conversations/${id}`, { method: 'DELETE' }).catch(console.error);
      set((state) => {
        const newConversations = state.conversations.filter((c) => c.id !== id);
        const newActiveId =
          state.activeConversationId === id
            ? newConversations[0]?.id ?? null
            : state.activeConversationId;
        return { conversations: newConversations, activeConversationId: newActiveId };
      });
    },

    deleteConversations: (ids) => {
      const idSet = new Set(ids);
      ids.forEach((id) =>
        fetch(`${API_BASE}/conversations/${id}`, { method: 'DELETE' }).catch(console.error)
      );
      set((state) => {
        const newConversations = state.conversations.filter((c) => !idSet.has(c.id));
        const newActiveId = idSet.has(state.activeConversationId ?? '')
          ? newConversations[0]?.id ?? null
          : state.activeConversationId;
        return { conversations: newConversations, activeConversationId: newActiveId };
      });
    },

    setActiveConversation: (id) => {
      set({ activeConversationId: id });
    },

    updateConversationName: (id, name) => {
      fetch(`${API_BASE}/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).catch(console.error);
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, name, updatedAt: Date.now() } : c
        ),
      }));
    },

    updateConversation: async (id, patch) => {
      const previous = get().conversations.find((c) => c.id === id);
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, ...patch } : c
        ),
      }));

      try {
        const response = await fetch(`${API_BASE}/conversations/${id}/meta`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
          keepalive: true,
        });

        if (!response.ok) {
          throw new Error('Failed to persist conversation meta');
        }

        return true;
      } catch (err) {
        console.error('Failed to update conversation meta:', err);
        if (previous) {
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === id ? previous : c
            ),
          }));
        }
        return false;
      }
    },

    addMessage: (conversationId, message) => {
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: [...c.messages, message],
                updatedAt: Date.now(),
                name: c.messages.length === 0 && message.role === 'user'
                  ? message.content
                  : c.name,
              }
            : c
        ),
      }));
    },

    updateMessage: (conversationId, messageId, updates) => {
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === messageId ? { ...m, ...updates } : m
                ),
                updatedAt: Date.now(),
              }
            : c
        ),
      }));
    },

    appendToMessage: (conversationId, messageId, content) => {
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === messageId
                    ? { ...m, content: m.content + content }
                    : m
                ),
                updatedAt: Date.now(),
              }
            : c
        ),
      }));
    },

    appendToThinking: (conversationId, messageId, thinking) => {
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === messageId
                    ? { ...m, thinking: (m.thinking || '') + thinking }
                    : m
                ),
                updatedAt: Date.now(),
              }
            : c
        ),
      }));
    },

    addToolCall: (conversationId, messageId, toolCall) => {
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === messageId
                    ? { ...m, toolCalls: [...(m.toolCalls || []), toolCall] }
                    : m
                ),
              }
            : c
        ),
      }));
    },

    updateToolCall: (conversationId, messageId, toolCallId, updates) => {
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === messageId
                    ? {
                        ...m,
                        toolCalls: m.toolCalls?.map((tc) =>
                          tc.id === toolCallId ? { ...tc, ...updates } : tc
                        ),
                      }
                    : m
                ),
              }
            : c
        ),
      }));
    },

    getActiveConversation: () => {
      const state = get();
      return state.conversations.find((c) => c.id === state.activeConversationId);
    },

    registerAgent: (threadId, abortController) => {
      set((state) => {
        const newAgents = new Map(state.runningAgents);
        newAgents.set(threadId, { threadId, isRunning: true, abortController });
        return { runningAgents: newAgents };
      });
    },

    unregisterAgent: (threadId) => {
      set((state) => {
        const newAgents = new Map(state.runningAgents);
        newAgents.delete(threadId);
        return { runningAgents: newAgents };
      });
    },

    stopAgent: async (threadId) => {
      const state = get();
      const agent = state.runningAgents.get(threadId);
      if (!agent) return false;
      try {
        const response = await fetch('/api/chat/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threadId }),
        });
        if (response.ok) {
          agent.abortController?.abort();
          set((state) => {
            const newAgents = new Map(state.runningAgents);
            newAgents.delete(threadId);
            return { runningAgents: newAgents };
          });
          return true;
        }
        return false;
      } catch (err) {
        console.error('Failed to stop agent:', err);
        return false;
      }
    },

    isAgentRunning: (threadId) => {
      const state = get();
      return state.runningAgents.has(threadId);
    },
  })
);

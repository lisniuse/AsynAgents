import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/stores/appStore';
import { useSSE } from '@/hooks/useSSE';
import { MessageItem } from './MessageItem';
import { ProjectPanel } from './ProjectPanel';
import { BoltIcon, CheckIcon, CloseIcon, FolderIcon, PlusIcon, SendIcon } from '@/components/icons';
import { useT } from '@/i18n';
import type { ToolCallState } from '@/types';
import './ChatView.less';

interface ProjectCandidate {
  name: string;
  path: string;
}

interface StoredProjectPanelState {
  open: boolean;
  width: number;
}

const PROJECT_PANEL_MIN = 320;
const CHAT_MAIN_MIN = 250;
const PROJECT_PANEL_DEFAULT = 520;
const CLOSE_ANIMATION_MS = 180;
const PROJECT_PANEL_STORAGE_KEY = 'asynagents.projectPanelState';

function readStoredProjectPanelState(conversationId: string): StoredProjectPanelState | null {
  try {
    const raw = window.localStorage.getItem(PROJECT_PANEL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, StoredProjectPanelState>;
    const state = parsed[conversationId];
    if (!state || typeof state.open !== 'boolean' || typeof state.width !== 'number') {
      return null;
    }
    return {
      open: state.open,
      width: Math.max(PROJECT_PANEL_MIN, Math.round(state.width)),
    };
  } catch {
    return null;
  }
}

function writeStoredProjectPanelState(
  conversationId: string,
  patch: Partial<StoredProjectPanelState>
): void {
  try {
    const raw = window.localStorage.getItem(PROJECT_PANEL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, StoredProjectPanelState> : {};
    const current = parsed[conversationId] ?? {
      open: false,
      width: PROJECT_PANEL_DEFAULT,
    };
    parsed[conversationId] = {
      open: typeof patch.open === 'boolean' ? patch.open : current.open,
      width: typeof patch.width === 'number'
        ? Math.max(PROJECT_PANEL_MIN, Math.round(patch.width))
        : current.width,
    };
    window.localStorage.setItem(PROJECT_PANEL_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Ignore local storage failures.
  }
}

export const ChatView: React.FC = () => {
  const t = useT();
  const navigate = useNavigate();
  const {
    activeConversationId,
    conversations,
    conversationsLoaded,
    createConversation,
    loadConversations,
  } = useAppStore();
  const { sendMessage, stopCurrentAgent } = useSSE();
  const [inputValue, setInputValue] = useState('');
  const [isStopping, setIsStopping] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectPickerClosing, setProjectPickerClosing] = useState(false);
  const [projectCandidates, setProjectCandidates] = useState<ProjectCandidate[]>([]);
  const [projectPathInput, setProjectPathInput] = useState('');
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectPanelOpen, setProjectPanelOpen] = useState(false);
  const [projectRefreshToken, setProjectRefreshToken] = useState(0);
  const [projectActionError, setProjectActionError] = useState<string | null>(null);
  const [rollingBackMessageId, setRollingBackMessageId] = useState<string | null>(null);
  const [rollbackConfirmMessageId, setRollbackConfirmMessageId] = useState<string | null>(null);
  const [rollbackConfirmClosing, setRollbackConfirmClosing] = useState(false);
  const [applyingProject, setApplyingProject] = useState(false);
  const [projectPanelWidth, setProjectPanelWidth] = useState(PROJECT_PANEL_DEFAULT);
  const [projectChangedFilesCount, setProjectChangedFilesCount] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const chatShellRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const previousStreamingThreadRef = useRef<string | null>(null);
  const projectDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const projectPanelWidthRef = useRef(PROJECT_PANEL_DEFAULT);
  const projectPanelRafRef = useRef<number | null>(null);
  const processedWriteToolCallsRef = useRef<Set<string>>(new Set());
  const projectPickerCloseTimerRef = useRef<number | null>(null);
  const rollbackCloseTimerRef = useRef<number | null>(null);
  const restoredProjectPanelConversationRef = useRef<string | null>(null);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);
  const messages = activeConversation?.messages ?? [];
  const activeProject = activeConversation?.projectSession ?? null;
  const streamingMessage = messages.find((message) => message.isStreaming && message.role === 'assistant');
  const conversationLocked = Boolean(streamingMessage) || isStopping;

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const onWheel = () => {
      isNearBottomRef.current = false;
    };

    container.addEventListener('wheel', onWheel, { passive: true });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container && isNearBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!attachMenuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!attachMenuRef.current?.contains(event.target as Node)) {
        setAttachMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [attachMenuOpen]);

  useEffect(() => {
    return () => {
      if (projectPickerCloseTimerRef.current !== null) {
        window.clearTimeout(projectPickerCloseTimerRef.current);
      }
      if (rollbackCloseTimerRef.current !== null) {
        window.clearTimeout(rollbackCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    projectPanelWidthRef.current = projectPanelWidth;
    chatShellRef.current?.style.setProperty('--project-panel-width', `${projectPanelWidth}px`);
  }, [projectPanelWidth]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!projectDragRef.current) {
        return;
      }

      const shellWidth = chatShellRef.current?.clientWidth ?? window.innerWidth;
      const panelMax = Math.max(PROJECT_PANEL_MIN, shellWidth - CHAT_MAIN_MIN);
      const delta = projectDragRef.current.startX - event.clientX;
      const nextWidth = Math.min(
        panelMax,
        Math.max(PROJECT_PANEL_MIN, projectDragRef.current.startWidth + delta)
      );
      projectPanelWidthRef.current = nextWidth;
      if (projectPanelRafRef.current !== null) {
        cancelAnimationFrame(projectPanelRafRef.current);
      }
      projectPanelRafRef.current = requestAnimationFrame(() => {
        chatShellRef.current?.style.setProperty('--project-panel-width', `${projectPanelWidthRef.current}px`);
        projectPanelRafRef.current = null;
      });
    };

    const onMouseUp = () => {
      if (!projectDragRef.current) {
        return;
      }

      projectDragRef.current = null;
      if (projectPanelRafRef.current !== null) {
        cancelAnimationFrame(projectPanelRafRef.current);
        projectPanelRafRef.current = null;
      }
      setProjectPanelWidth(projectPanelWidthRef.current);
      if (activeConversationId && activeProject) {
        writeStoredProjectPanelState(activeConversationId, { width: projectPanelWidthRef.current });
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (projectPanelRafRef.current !== null) {
        cancelAnimationFrame(projectPanelRafRef.current);
      }
    };
  }, [activeConversationId, activeProject]);

  useEffect(() => {
    if (!activeProject) {
      setProjectPanelOpen(false);
      setProjectPanelWidth(PROJECT_PANEL_DEFAULT);
      setProjectChangedFilesCount(0);
      setProjectActionError(null);
      processedWriteToolCallsRef.current.clear();
      restoredProjectPanelConversationRef.current = null;
      return;
    }

    if (!activeConversationId) {
      return;
    }

    if (restoredProjectPanelConversationRef.current === activeConversationId) {
      return;
    }

    const storedState = readStoredProjectPanelState(activeConversationId);
    setProjectPanelOpen(storedState?.open ?? true);
    setProjectPanelWidth(storedState?.width ?? PROJECT_PANEL_DEFAULT);
    restoredProjectPanelConversationRef.current = activeConversationId;
  }, [activeConversationId, activeProject]);

  useEffect(() => {
    if (!activeConversationId || !activeProject) {
      return;
    }

    writeStoredProjectPanelState(activeConversationId, {
      open: projectPanelOpen,
      width: projectPanelWidth,
    });
  }, [activeConversationId, activeProject, projectPanelOpen, projectPanelWidth]);

  useEffect(() => {
    processedWriteToolCallsRef.current.clear();
  }, [activeConversationId]);

  useEffect(() => {
    const currentThreadId = streamingMessage?.threadId ?? null;
    if (!currentThreadId && previousStreamingThreadRef.current && activeProject) {
      setProjectRefreshToken((token) => token + 1);
    }
    previousStreamingThreadRef.current = currentThreadId;
  }, [streamingMessage?.threadId, activeProject]);

  useEffect(() => {
    if (!activeProject) {
      return;
    }

    let shouldRefresh = false;
    messages.forEach((message) => {
      message.toolCalls?.forEach((toolCall: ToolCallState) => {
        const key = `${message.id}:${toolCall.id}`;
        if (
          toolCall.name === 'write_file' &&
          toolCall.status === 'done' &&
          !processedWriteToolCallsRef.current.has(key)
        ) {
          processedWriteToolCallsRef.current.add(key);
          shouldRefresh = true;
        }
      });
    });

    if (shouldRefresh) {
      setProjectRefreshToken((token) => token + 1);
    }
  }, [activeProject, messages]);

  const autoResize = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const dataUrl = loadEvent.target?.result as string;
        setSelectedImages((prev) => [...prev, dataUrl]);
      };
      reader.readAsDataURL(file);
    });

    event.target.value = '';
  };

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleSend = async () => {
    if (conversationLocked) {
      return;
    }

    const trimmed = inputValue.trim();
    if (!trimmed && selectedImages.length === 0) return;

    isNearBottomRef.current = true;
    const images = selectedImages.length > 0 ? [...selectedImages] : undefined;
    setInputValue('');
    setSelectedImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await sendMessage(trimmed, images);
  };

  const handleStop = async () => {
    if (!streamingMessage) return;

    setIsStopping(true);
    try {
      await stopCurrentAgent();
    } finally {
      setIsStopping(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handlePromptClick = (text: string) => {
    setInputValue(text);
    textareaRef.current?.focus();
  };

  const openProjectPicker = async () => {
    setAttachMenuOpen(false);
    setProjectPickerClosing(false);
    setProjectPickerOpen(true);
    setProjectError(null);
    setProjectsLoading(true);

    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load projects');
      }
      setProjectCandidates(data as ProjectCandidate[]);
      setProjectPathInput(activeProject?.projectPath ?? '');
    } catch (err) {
      setProjectCandidates([]);
      setProjectError((err as Error).message);
    } finally {
      setProjectsLoading(false);
    }
  };

  const closeProjectPicker = (afterClose?: () => void) => {
    if (!projectPickerOpen || projectPickerClosing) {
      return;
    }

    setProjectPickerClosing(true);
    projectPickerCloseTimerRef.current = window.setTimeout(() => {
      setProjectPickerOpen(false);
      setProjectPickerClosing(false);
      afterClose?.();
    }, CLOSE_ANIMATION_MS);
  };

  const closeRollbackConfirm = () => {
    if (!rollbackConfirmMessageId || rollbackConfirmClosing) {
      return;
    }

    setRollbackConfirmClosing(true);
    rollbackCloseTimerRef.current = window.setTimeout(() => {
      setRollbackConfirmMessageId(null);
      setRollbackConfirmClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const handleSelectProject = async (candidatePath?: string) => {
    setProjectSaving(true);
    setProjectError(null);

    try {
      let conversationId = activeConversationId;
      if (!conversationId) {
        conversationId = await createConversation();
        navigate(`/c/${conversationId}`);
      }

      const projectPath = (candidatePath ?? projectPathInput).trim();
      if (!projectPath) {
        throw new Error(t.projectPathRequired);
      }

      const response = await fetch(`/api/conversations/${conversationId}/project/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to select project');
      }

      await loadConversations();
      closeProjectPicker(() => {
        setProjectPanelOpenState(true);
      });
    } catch (err) {
      setProjectError((err as Error).message);
    } finally {
      setProjectSaving(false);
    }
  };

  if (!conversationsLoaded) return null;

  const isWelcome = !activeConversationId || (messages.length === 0 && !activeProject);
  const canSend = !conversationLocked && (inputValue.trim().length > 0 || selectedImages.length > 0);
  const showProjectApplyButton = Boolean(activeProject) && projectChangedFilesCount > 0;

  const inputBox = (
    <div className={`input-box ${showProjectApplyButton ? 'has-project-apply' : ''}`}>
      {showProjectApplyButton && (
        <button
          type="button"
          className="project-apply-floating-btn"
          onClick={() => void handleApplyProject()}
          disabled={applyingProject || Boolean(rollingBackMessageId) || Boolean(streamingMessage)}
        >
          <CheckIcon size={14} />
          <span>{applyingProject ? t.projectApplying : t.projectApply}</span>
        </button>
      )}
      <div className="input-wrapper">
        <div className="attach-menu-wrap" ref={attachMenuRef}>
          <button
            className="attach-btn"
            onClick={() => setAttachMenuOpen((open) => !open)}
            title={t.attachMenu}
            type="button"
            disabled={conversationLocked}
          >
            <PlusIcon size={16} />
          </button>

          {attachMenuOpen && (
            <div className="attach-menu">
              <button
                type="button"
                className="attach-menu-item"
                onClick={() => {
                  setAttachMenuOpen(false);
                  fileInputRef.current?.click();
                }}
              >
                <PlusIcon size={14} />
                <span>{t.attachImage}</span>
              </button>
              <button
                type="button"
                className="attach-menu-item"
                onClick={() => void openProjectPicker()}
              >
                <FolderIcon size={14} />
                <span>{t.selectProject}</span>
              </button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleImageSelect}
        />

        <div className="input-main">
          {selectedImages.length > 0 && (
            <div className="image-previews">
              {selectedImages.map((src, index) => (
                <div key={index} className="image-preview-item">
                  <img src={src} alt="" />
                  <button type="button" className="image-remove" onClick={() => removeImage(index)}>
                    <CloseIcon size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(event) => {
              setInputValue(event.target.value);
              autoResize(event.target);
            }}
            onKeyDown={handleKeyDown}
            placeholder={conversationLocked ? t.conversationBusyHint : t.inputPlaceholder}
            rows={isWelcome ? 3 : 1}
          />
        </div>

        <button
          className="send-btn"
          onClick={() => void handleSend()}
          disabled={!canSend}
          type="button"
        >
          <SendIcon size={16} />
        </button>
      </div>
      <div className="input-hint">{conversationLocked ? t.conversationBusyHint : t.inputHint}</div>
    </div>
  );

  const handleRollbackToMessage = async (messageId: string) => {
    if (!activeConversationId) {
      return;
    }

    setRollingBackMessageId(messageId);
    setProjectActionError(null);
    try {
      const selectedMessage = messages.find((message) => message.id === messageId);
      if (!selectedMessage) {
        return;
      }

      const response = await fetch(
        `/api/conversations/${activeConversationId}/project/rollback-to-message`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to roll back project');
      }

      await loadConversations();
      setInputValue(typeof data.inputMessage === 'string' ? data.inputMessage : selectedMessage.content);
      setSelectedImages([]);
      setProjectRefreshToken((token) => token + 1);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        if (textareaRef.current) {
          autoResize(textareaRef.current);
        }
      });
    } catch (err) {
      setProjectActionError((err as Error).message);
    } finally {
      setRollingBackMessageId(null);
      closeRollbackConfirm();
    }
  };

  const pendingRollbackMessage = rollbackConfirmMessageId
    ? messages.find((message) => message.id === rollbackConfirmMessageId) ?? null
    : null;

  const handleApplyProject = async () => {
    if (!activeConversationId) {
      return;
    }

    setApplyingProject(true);
    setProjectActionError(null);
    try {
      const response = await fetch(`/api/conversations/${activeConversationId}/project/apply`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to apply project baseline');
      }
      setProjectRefreshToken((token) => token + 1);
    } catch (err) {
      setProjectActionError((err as Error).message);
    } finally {
      setApplyingProject(false);
    }
  };

  const handleProjectResizerMouseDown = (event: React.MouseEvent) => {
    if (!projectPanelOpen || window.innerWidth <= 960) {
      return;
    }

    event.preventDefault();
    projectDragRef.current = {
      startX: event.clientX,
      startWidth: projectPanelWidth,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const setProjectPanelOpenState = (nextOpen: boolean | ((open: boolean) => boolean)) => {
    const resolved = typeof nextOpen === 'function' ? nextOpen(projectPanelOpen) : nextOpen;
    setProjectPanelOpen(resolved);
    if (activeConversationId && activeProject) {
      writeStoredProjectPanelState(activeConversationId, { open: resolved });
    }
  };

  return (
    <div className="chat-view">
      {isWelcome ? (
        <div className="welcome">
          <div className="welcome-logo">
            <BoltIcon size={30} />
          </div>
          <div>
            <h1>Asyn Agents</h1>
            <p style={{ marginTop: 10 }}>{t.welcomeSubtitle}</p>
          </div>
          <div className="welcome-input-area">{inputBox}</div>
          <div className="welcome-chips">
            {t.welcomePrompts.map((prompt, index) => (
              <div key={index} className="chip" onClick={() => handlePromptClick(prompt.text)}>
                {prompt.emoji} {prompt.text}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div ref={chatShellRef} className={`chat-shell ${projectPanelOpen ? 'has-project-panel' : ''}`}>
          <div className="chat-main">
          {activeProject && (
            <div className="project-mode-bar">
              <div className="project-mode-copy">
                <div className="project-mode-eyebrow">{t.projectModeBadge}</div>
                <div className="project-mode-title">{activeProject.projectName}</div>
                <div className="project-mode-path">{activeProject.projectPath}</div>
                {projectActionError && <div className="project-action-error">{projectActionError}</div>}
              </div>
              <div className="project-mode-actions">
                <button
                  type="button"
                  className={`project-mode-files-btn ${projectPanelOpen ? 'active' : ''}`}
                  title={t.projectFiles}
                  onClick={() => setProjectPanelOpenState((open) => !open)}
                >
                  <FolderIcon size={16} />
                </button>
              </div>
            </div>
          )}

          <div className="messages" ref={messagesContainerRef}>
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                onStop={message.isStreaming ? handleStop : undefined}
                isStopping={isStopping}
                onRollbackToMessage={
                  message.role === 'user' && message.checkpointId
                    ? (selectedMessage) => setRollbackConfirmMessageId(selectedMessage.id)
                    : undefined
                }
                isRollingBack={rollingBackMessageId === message.id}
                rollbackDisabled={Boolean(streamingMessage)}
              />
            ))}
          </div>
          <div className="input-area">{inputBox}</div>
          </div>

          {activeProject && activeConversationId && (
            <>
              <div
                className={`project-panel-resizer ${projectPanelOpen ? '' : 'hidden'}`}
                onMouseDown={handleProjectResizerMouseDown}
              />
              <ProjectPanel
                conversationId={activeConversationId}
                open={projectPanelOpen}
                refreshToken={projectRefreshToken}
                width={projectPanelWidth}
                onClose={() => setProjectPanelOpenState(false)}
                onChangedFilesCountChange={setProjectChangedFilesCount}
              />
            </>
          )}
        </div>
      )}

      {(projectPickerOpen || projectPickerClosing) && (
        <div
          className={`project-picker-overlay ${projectPickerClosing ? 'is-closing' : ''}`}
          onMouseDown={() => closeProjectPicker()}
        >
          <div
            className={`project-picker-modal ${projectPickerClosing ? 'is-closing' : ''}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="project-picker-header">
              <div>
                <div className="project-picker-title">{t.selectProject}</div>
                <div className="project-picker-subtitle">{t.projectPickerHint}</div>
              </div>
              <button
                type="button"
                className="project-picker-close"
                onClick={() => closeProjectPicker()}
                aria-label={t.cancel}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <div className="project-picker-body">
              <div className="project-picker-input-label">{t.projectPathLabel}</div>
              <input
                className="project-picker-input"
                type="text"
                value={projectPathInput}
                onChange={(event) => setProjectPathInput(event.target.value)}
                placeholder={t.projectPathPlaceholder}
              />

              <div className="project-picker-list-header">{t.projectCandidates}</div>
              <div className="project-picker-list">
                {projectsLoading ? (
                  <div className="project-picker-empty">{t.projectLoading}</div>
                ) : projectCandidates.length === 0 ? (
                  <div className="project-picker-empty">{t.projectCandidatesEmpty}</div>
                ) : (
                  projectCandidates.map((candidate) => (
                    <button
                      type="button"
                      key={candidate.path}
                      className={`project-picker-item ${projectPathInput === candidate.path ? 'active' : ''}`}
                      onClick={() => setProjectPathInput(candidate.path)}
                      onDoubleClick={() => void handleSelectProject(candidate.path)}
                    >
                      <div className="project-picker-item-title">{candidate.name}</div>
                      <div className="project-picker-item-path">{candidate.path}</div>
                    </button>
                  ))
                )}
              </div>

              {projectError && <div className="project-picker-error">{projectError}</div>}
            </div>

            <div className="project-picker-footer">
              <button
                type="button"
                className="project-picker-cancel"
                onClick={() => closeProjectPicker()}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                className="project-picker-save"
                disabled={projectSaving}
                onClick={() => void handleSelectProject()}
              >
                {projectSaving ? t.projectSelecting : t.projectSelectConfirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {(pendingRollbackMessage || rollbackConfirmClosing) && pendingRollbackMessage && (
        <div
          className={`project-picker-overlay project-confirm-overlay ${rollbackConfirmClosing ? 'is-closing' : ''}`}
          onMouseDown={() => {
            if (!rollingBackMessageId) {
              closeRollbackConfirm();
            }
          }}
        >
          <div
            className={`project-confirm-modal ${rollbackConfirmClosing ? 'is-closing' : ''}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="project-confirm-header">
              <div>
                <div className="project-confirm-title">{t.projectRollbackTitle}</div>
                <div className="project-confirm-subtitle">{t.projectRollbackConfirm}</div>
              </div>
              <button
                type="button"
                className="project-picker-close"
                onClick={() => {
                  if (!rollingBackMessageId) {
                    closeRollbackConfirm();
                  }
                }}
                aria-label={t.cancel}
                disabled={Boolean(rollingBackMessageId)}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <div className="project-confirm-body">
              <div className="project-confirm-preview-label">{t.projectRollbackPreview}</div>
              <div className="project-confirm-preview">{pendingRollbackMessage.content}</div>
            </div>

            <div className="project-picker-footer">
              <button
                type="button"
                className="project-picker-cancel"
                onClick={() => closeRollbackConfirm()}
                disabled={Boolean(rollingBackMessageId)}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                className="project-confirm-confirm"
                disabled={Boolean(rollingBackMessageId)}
                onClick={() => void handleRollbackToMessage(pendingRollbackMessage.id)}
              >
                {rollingBackMessageId ? t.projectRollbacking : t.projectRollback}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

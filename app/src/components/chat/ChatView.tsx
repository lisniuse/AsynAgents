import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useSSE } from '@/hooks/useSSE';
import { MessageItem } from './MessageItem';
import { SendIcon, PlusIcon } from '@/components/icons';
import { useT } from '@/i18n';
import './ChatView.less';

export const ChatView: React.FC = () => {
  const t = useT();
  const { activeConversationId, conversations, createConversation } = useAppStore();
  const { sendMessage, stopCurrentAgent } = useSSE();
  const [inputValue, setInputValue] = useState('');
  const [isStopping, setIsStopping] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const conversationsLoaded = useAppStore((s) => s.conversationsLoaded);
  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConversation?.messages ?? [];

  // 获取正在流式传输的消息
  const streamingMessage = messages.find((m) => m.isStreaming && m.role === 'assistant');

  // wheel 事件：用户主动滚轮 → 停止自动滚动
  // scroll 事件：用户滚回底部 → 恢复自动滚动
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const onWheel = () => { isNearBottomRef.current = false; };

    container.addEventListener('wheel', onWheel, { passive: true });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container && isNearBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const autoResize = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setSelectedImages((prev) => [...prev, dataUrl]);
      };
      reader.readAsDataURL(file);
    });
    // reset so same file can be re-selected
    e.target.value = '';
  };

  const removeImage = (idx: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSend = async () => {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = inputValue.trim().length > 0 || selectedImages.length > 0;

  const handlePromptClick = (text: string) => {
    if (!activeConversationId) {
      createConversation();
    }
    setInputValue(text);
    textareaRef.current?.focus();
  };

  // Don't render until conversations are loaded to avoid flashing the welcome screen
  if (!conversationsLoaded) return null;

  const isWelcome = !activeConversationId || messages.length === 0;

  const inputBox = (
    <div className="input-box">
      <div className="input-wrapper">
        <button
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          title="上传图片"
          type="button"
        >
          <PlusIcon size={16} />
        </button>
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
              {selectedImages.map((src, i) => (
                <div key={i} className="image-preview-item">
                  <img src={src} alt="" />
                  <button className="image-remove" onClick={() => removeImage(i)}>✕</button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              autoResize(e.target);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t.inputPlaceholder}
            rows={isWelcome ? 3 : 1}
          />
        </div>
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={!canSend}
          title="发送"
        >
          <SendIcon size={16} />
        </button>
      </div>
      <div className="input-hint">{t.inputHint}</div>
    </div>
  );

  return (
    <div className="chat-view">
      {isWelcome ? (
        <div className="welcome">
          <div className="welcome-logo">
            <span>⚡</span>
          </div>
          <div>
            <h1>Asyn Agents</h1>
            <p style={{ marginTop: 10 }}>{t.welcomeSubtitle}</p>
          </div>
          <div className="welcome-input-area">{inputBox}</div>
          <div className="welcome-chips">
            {t.welcomePrompts.map((prompt, i) => (
              <div key={i} className="chip" onClick={() => handlePromptClick(prompt.text)}>
                {prompt.emoji} {prompt.text}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="messages" ref={messagesContainerRef}>
            {messages.map((msg) => (
              <MessageItem
                key={msg.id}
                message={msg}
                onStop={msg.isStreaming ? handleStop : undefined}
                isStopping={isStopping}
              />
            ))}
          </div>
          <div className="input-area">{inputBox}</div>
        </>
      )}
    </div>
  );
};

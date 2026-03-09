import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useSSE } from '@/hooks/useSSE';
import { MessageItem } from './MessageItem';
import { SendIcon } from '@/components/icons';
import { useT } from '@/i18n';
import './ChatView.less';

export const ChatView: React.FC = () => {
  const t = useT();
  const { activeConversationId, conversations, createConversation } = useAppStore();
  const { sendMessage, stopCurrentAgent } = useSSE();
  const [inputValue, setInputValue] = useState('');
  const [isStopping, setIsStopping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConversation?.messages ?? [];
  
  // 获取正在流式传输的消息
  const streamingMessage = messages.find((m) => m.isStreaming && m.role === 'assistant');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const autoResize = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  };

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await sendMessage(trimmed);
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

  const handlePromptClick = (text: string) => {
    if (!activeConversationId) {
      createConversation();
    }
    setInputValue(text);
    textareaRef.current?.focus();
  };

  const isWelcome = !activeConversationId || messages.length === 0;

  const inputBox = (
    <div className="input-box">
      <div className="input-wrapper">
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
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={!inputValue.trim()}
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
          <div className="messages">
            {messages.map((msg) => (
              <MessageItem
                key={msg.id}
                message={msg}
                onStop={msg.isStreaming ? handleStop : undefined}
                isStopping={isStopping}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="input-area">{inputBox}</div>
        </>
      )}
    </div>
  );
};

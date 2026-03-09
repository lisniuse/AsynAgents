import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useSSE } from '@/hooks/useSSE';
import { MessageItem } from './MessageItem';
import { SendIcon } from '@/components/icons';
import './ChatView.less';

const WELCOME_PROMPTS = [
  { emoji: '🐍', text: '写一个 Python 的 Hello World 并运行它' },
  { emoji: '🌐', text: '用 Node.js 创建一个简单的 HTTP 服务器' },
  { emoji: '📂', text: '查看当前目录的文件结构并说明用途' },
  { emoji: '🔢', text: '帮我写一个 Fibonacci 数列计算器并测试' },
  { emoji: '💻', text: '查看系统信息（操作系统、内存、CPU 等）' },
  { emoji: '📝', text: '用 bash 写一个文件批量重命名脚本' },
];

export const ChatView: React.FC = () => {
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
          placeholder="描述你想完成的任务... (Shift+Enter 换行，Enter 发送)"
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
      <div className="input-hint">AI 智能体可以执行命令和修改文件，请确认操作安全</div>
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
            <p style={{ marginTop: 10 }}>
              AI 智能体系统 · 每次对话创建独立线程 · 可执行代码、读写文件、安装包
            </p>
          </div>
          <div className="welcome-input-area">{inputBox}</div>
          <div className="welcome-chips">
            {WELCOME_PROMPTS.map((prompt, i) => (
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

import React, { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';
import { ToolCard } from './ToolCard';
import type { Message } from '@/types';
import { BoltIcon, BrainIcon, ChevronDownIcon, ChevronUpIcon, StopIcon } from '@/components/icons';
import { useAppStore } from '@/stores/appStore';
import { useT } from '@/i18n';
import './MessageItem.less';

interface MessageItemProps {
  message: Message;
  onStop?: () => void;
  isStopping?: boolean;
}

marked.setOptions({
  breaks: true,
  gfm: true,
});

const renderMarkdown = (content: string): string => {
  const tokens = marked.lexer(content);

  return tokens.map((token) => {
    if (token.type === 'code') {
      const codeToken = token as marked.Tokens.Code;
      const highlighted = codeToken.lang && hljs.getLanguage(codeToken.lang)
        ? hljs.highlight(codeToken.text, { language: codeToken.lang }).value
        : hljs.highlightAuto(codeToken.text).value;
      return `<pre><div class="code-header"><span class="code-lang">${codeToken.lang || 'text'}</span></div><code>${highlighted}</code></pre>`;
    }
    if (token.type === 'table') {
      return `<div class="table-wrapper">${marked.parser([token] as marked.Token[])}</div>`;
    }
    return marked.parser([token] as marked.Token[]);
  }).join('');
};

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onStop,
  isStopping = false
}) => {
  const t = useT();
  const contentRef = useRef<HTMLDivElement>(null);
  const settings = useAppStore((s) => s.settings);
  const defaultExpanded = settings?.ui?.showToolCalls ?? true;

  // null = 用户未手动切换，跟随设置；非 null = 用户手动覆盖
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const isToolCallsExpanded = manualExpanded !== null ? manualExpanded : defaultExpanded;

  const handleToggle = () => {
    setManualExpanded(!isToolCallsExpanded);
  };

  useEffect(() => {
    if (contentRef.current) {
      const codeBlocks = contentRef.current.querySelectorAll('pre code');
      codeBlocks.forEach((block) => {
        hljs.highlightElement(block as HTMLElement);
      });
    }
  }, [message.content]);

  if (message.role === 'user') {
    return (
      <div className="message-wrapper msg-user">
        <div className="msg-user-bubble">{message.content}</div>
      </div>
    );
  }

  return (
    <div className="message-wrapper msg-assistant">
      <div className="msg-assistant-content">
        <div className="agent-avatar">
          <BoltIcon size={16} />
        </div>
        <div className="msg-label">{t.assistant}</div>
        <div className="msg-content">

          {/* 工具调用折叠区域 */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="thinking-section">
              <button
                className="thinking-toggle"
                onClick={handleToggle}
                title={isToolCallsExpanded ? t.collapseToolCalls : t.expandToolCalls}
              >
                <BrainIcon size={14} />
                <span>{t.toolCallProcess}</span>
                {isToolCallsExpanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
              </button>
              {isToolCallsExpanded && (
                <div className="tool-calls-content">
                  {message.toolCalls.map((tc) => (
                    <div key={tc.id}>
                      {tc.preText && (
                        <div
                          className="pre-tool-content"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(tc.preText) }}
                        />
                      )}
                      <ToolCard toolCall={tc} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 最终消息内容 */}
          <div
            ref={contentRef}
            className={`md-content ${message.isStreaming && !message.toolCalls?.some(tc => tc.status === 'running') ? 'streaming-cursor' : ''}`}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
          
          {/* 停止按钮 */}
          {message.isStreaming && onStop && (
            <button 
              className="stop-btn"
              onClick={onStop}
              disabled={isStopping}
              title={t.stop}
            >
              <StopIcon size={14} />
              <span>{isStopping ? t.stopping : t.stop}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { ChevronIcon, CopyIcon, CheckIcon, ToolIcon } from '@/components/icons';
import type { ToolCallState } from '@/types';
import './ToolCard.less';

interface ToolCardProps {
  toolCall: ToolCallState;
}

export const ToolCard: React.FC<ToolCardProps> = ({ toolCall }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusClass = toolCall.status;
  const statusText = {
    running: '运行中',
    done: '完成',
    error: '错误',
  }[toolCall.status];

  return (
    <div className={`tool-card ${isOpen ? 'open' : ''}`}>
      <div className="tool-header" onClick={() => setIsOpen(!isOpen)}>
        <ToolIcon size={16} className="tool-icon" />
        <span className="tool-name">{toolCall.name}</span>
        <div className={`tool-status ${statusClass}`}>
          {toolCall.status === 'running' && <div className="spinner" />}
          <span>{statusText}</span>
        </div>
        <ChevronIcon size={12} className="tool-chevron" />
      </div>

      {isOpen && (
        <div className="tool-body">
          <div className="tool-section-label">参数</div>
          <div className="tool-code">
            {JSON.stringify(toolCall.input, null, 2)}
          </div>

          {toolCall.result !== undefined && (
            <>
              <div className="tool-section-label">结果</div>
              <div className={`tool-result-code ${toolCall.isError ? 'error' : 'success'}`}>
                {toolCall.result}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

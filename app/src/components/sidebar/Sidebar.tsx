import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/stores/appStore';
import { PlusIcon, MessageIcon, TrashIcon, BoltIcon } from '@/components/icons';
import { ThemeToggle } from './ThemeToggle';
import './Sidebar.less';

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return '昨天';
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }
};

export const Sidebar: React.FC = () => {
  const {
    conversations,
    activeConversationId,
    createConversation,
    deleteConversation,
    setActiveConversation,
  } = useAppStore();

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!confirmId) return;
    const handler = () => setConfirmId(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [confirmId]);

  const handleNewChat = () => {
    createConversation();
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverPos({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
    setConfirmId(id);
  };

  const handleConfirmDelete = () => {
    if (confirmId) {
      deleteConversation(confirmId);
      setConfirmId(null);
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <div className="logo-icon">
            <BoltIcon size={18} />
          </div>
          <div>
            <div className="logo-text">Asyn Agents</div>
            <div className="logo-sub">AI Sub-agent Platform</div>
          </div>
        </div>
        <button className="new-chat-btn" onClick={handleNewChat}>
          <PlusIcon size={14} />
          新建对话
        </button>
      </div>

      <div className="sidebar-section-label">历史对话</div>

      <div className="conv-list">
        {conversations.length === 0 ? (
          <div className="empty-conv">暂无对话记录</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`conv-item ${activeConversationId === conv.id ? 'active' : ''}`}
              onClick={() => setActiveConversation(conv.id)}
            >
              <MessageIcon size={18} className="conv-item-icon" />
              <div className="conv-item-content">
                <div className="conv-name">{conv.name}</div>
                <div className="conv-time">{formatTime(conv.updatedAt)}</div>
              </div>
              <div className="conv-delete-wrap">
                <button
                  className="conv-delete"
                  onClick={(e) => handleDeleteClick(e, conv.id)}
                  title="删除对话"
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <ThemeToggle />
      </div>

      {confirmId && popoverPos && createPortal(
        <div
          className="delete-popover"
          style={{ top: popoverPos.top, right: popoverPos.right }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="delete-popover-arrow" />
          <div className="delete-popover-text">确定删除？</div>
          <div className="delete-popover-actions">
            <button className="popover-cancel" onClick={() => setConfirmId(null)}>取消</button>
            <button className="popover-confirm" onClick={handleConfirmDelete}>删除</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

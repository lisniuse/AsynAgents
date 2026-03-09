import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/stores/appStore';
import { PlusIcon, MessageIcon, TrashIcon, BoltIcon, SettingsIcon, PanelLeftIcon } from '@/components/icons';
import { ThemeToggle } from './ThemeToggle';
import { SettingsModal } from '@/components/settings';
import { useT } from '@/i18n';
import './Sidebar.less';

const formatTime = (timestamp: number, t: ReturnType<typeof useT>): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return t.yesterday;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
};

export const Sidebar: React.FC = () => {
  const t = useT();
  const {
    conversations,
    activeConversationId,
    createConversation,
    deleteConversation,
    setActiveConversation,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useAppStore();

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; right: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!confirmId) return;
    const handler = () => setConfirmId(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [confirmId]);

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setConfirmId(id);
  };

  const handleConfirmDelete = () => {
    if (confirmId) {
      deleteConversation(confirmId);
      setConfirmId(null);
    }
  };

  return (
    <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!sidebarCollapsed && (
          <div className="logo">
            <div className="logo-icon"><BoltIcon size={18} /></div>
            <div>
              <div className="logo-text">Asyn Agents</div>
              <div className="logo-sub">AI Sub-agent Platform</div>
            </div>
          </div>
        )}
        <button
          className="panel-toggle"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <PanelLeftIcon size={16} />
        </button>
      </div>

      {!sidebarCollapsed && (
        <>
          <button className="new-chat-btn" onClick={() => createConversation()}>
            <PlusIcon size={14} />
            {t.newChat}
          </button>

          <div className="sidebar-section-label">{t.history}</div>

          <div className="conv-list">
            {conversations.length === 0 ? (
              <div className="empty-conv">{t.noConversations}</div>
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
                    <div className="conv-time">{formatTime(conv.updatedAt, t)}</div>
                  </div>
                  <div className="conv-delete-wrap">
                    <button
                      className="conv-delete"
                      onClick={(e) => handleDeleteClick(e, conv.id)}
                      title={t.delete}
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
            <button className="settings-btn" onClick={() => setShowSettings(true)} title={t.settings}>
              <SettingsIcon size={16} />
            </button>
          </div>
        </>
      )}

      {confirmId && popoverPos && createPortal(
        <div
          className="delete-popover"
          style={{ top: popoverPos.top, right: popoverPos.right }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="delete-popover-arrow" />
          <div className="delete-popover-text">{t.confirmDelete}</div>
          <div className="delete-popover-actions">
            <button className="popover-cancel" onClick={() => setConfirmId(null)}>{t.cancel}</button>
            <button className="popover-confirm" onClick={handleConfirmDelete}>{t.delete}</button>
          </div>
        </div>,
        document.body
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
};

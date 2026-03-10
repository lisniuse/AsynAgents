import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/stores/appStore';
import { PlusIcon, BoltIcon, SettingsIcon, PanelLeftIcon, ListManageIcon, MoreHorizontalIcon, PinIcon } from '@/components/icons';
import { ThemeToggle } from './ThemeToggle';
import { SettingsModal } from '@/components/settings';
import { ConversationsManager } from './ConversationsManager';
import { useT } from '@/i18n';
import './Sidebar.less';

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  width?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onMobileClose, width }) => {
  const t = useT();
  const navigate = useNavigate();
  const {
    conversations,
    activeConversationId,
    deleteConversation,
    setActiveConversation,
    updateConversationName,
    updateConversation,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useAppStore();

  const handleNewChat = () => {
    setActiveConversation(null);
    navigate(`/`);
    onMobileClose?.();
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversation(id);
    navigate(`/c/${id}`);
    onMobileClose?.();
  };

  const [showSettings, setShowSettings] = useState(false);
  const [showManager, setShowManager] = useState(false);

  // 更多菜单
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  // 重命名弹窗
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = React.useRef<HTMLInputElement>(null);

  // 删除确认
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!menuId) return;
    const handler = () => setMenuId(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuId]);

  const handleMoreClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setMenuId(menuId === id ? null : id);
  };

  const handleStartRename = (id: string, name: string) => {
    setMenuId(null);
    setRenameValue(name);
    setRenamingId(id);
  };

  const handleRenameSubmit = () => {
    if (renamingId && renameValue.trim()) updateConversationName(renamingId, renameValue.trim());
    setRenamingId(null);
  };

  const handlePin = (id: string, pinned: boolean) => {
    setMenuId(null);
    updateConversation(id, { pinned: !pinned });
  };

  const handleBold = (id: string, bold: boolean) => {
    setMenuId(null);
    updateConversation(id, { bold: !bold });
  };

  const handleDeleteClick = (id: string) => {
    setMenuId(null);
    setConfirmDeleteId(id);
  };

  const handleConfirmDelete = () => {
    if (confirmDeleteId) {
      deleteConversation(confirmDeleteId);
      setConfirmDeleteId(null);
    }
  };

  // 置顶的排在前面
  const sortedConversations = [...conversations].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  return (
    <div
      className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
      style={width !== undefined ? { width } : undefined}
    >
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
          <button className="new-chat-btn" onClick={handleNewChat}>
            <PlusIcon size={14} />
            {t.newChat}
          </button>

          <div className="sidebar-section-row">
            <span className="sidebar-section-label">{t.history}</span>
            {conversations.length > 0 && (
              <button
                className="section-manage-btn"
                onClick={() => setShowManager(true)}
                title={t.manageHistory}
              >
                <ListManageIcon size={13} />
              </button>
            )}
          </div>

          <div className="conv-list">
            {conversations.length === 0 ? (
              <div className="empty-conv">{t.noConversations}</div>
            ) : (
              sortedConversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`conv-item ${activeConversationId === conv.id ? 'active' : ''}`}
                  onClick={() => handleSelectConversation(conv.id)}
                >
                  <div className="conv-item-content">
                    <div className={`conv-name ${conv.bold ? 'conv-name-bold' : ''}`}>
                      {conv.pinned && <PinIcon size={10} className="conv-pin-icon" />}
                      {conv.name}
                    </div>
                  </div>
                  <button
                    className="conv-more"
                    onClick={(e) => handleMoreClick(e, conv.id)}
                    title="更多"
                  >
                    <MoreHorizontalIcon size={14} />
                  </button>
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

      {/* 更多菜单 */}
      {menuId && menuPos && createPortal(
        <div
          className="conv-menu"
          style={{ top: menuPos.top, right: menuPos.right }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {(() => {
            const conv = conversations.find((c) => c.id === menuId);
            if (!conv) return null;
            return (
              <>
                <button className="conv-menu-item" onClick={() => handleStartRename(conv.id, conv.name)}>
                  {t.rename}
                </button>
                <button className="conv-menu-item" onClick={() => handlePin(conv.id, !!conv.pinned)}>
                  {conv.pinned ? t.unpin : t.pin}
                </button>
                <button className="conv-menu-item" onClick={() => handleBold(conv.id, !!conv.bold)}>
                  {conv.bold ? t.unbold : t.bold}
                </button>
                <div className="conv-menu-divider" />
                <button className="conv-menu-item conv-menu-item-danger" onClick={() => handleDeleteClick(conv.id)}>
                  {t.delete}
                </button>
              </>
            );
          })()}
        </div>,
        document.body
      )}

      {/* 删除确认 */}
      {confirmDeleteId && createPortal(
        <div
          className="delete-confirm-mask"
          onMouseDown={() => setConfirmDeleteId(null)}
        >
          <div className="delete-confirm-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <div className="delete-confirm-text">{t.confirmDelete}</div>
            <div className="delete-popover-actions">
              <button className="popover-cancel" onClick={() => setConfirmDeleteId(null)}>{t.cancel}</button>
              <button className="popover-confirm" onClick={handleConfirmDelete}>{t.delete}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 重命名弹窗 */}
      {renamingId && createPortal(
        <div className="delete-confirm-mask" onMouseDown={() => setRenamingId(null)}>
          <div className="rename-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <div className="rename-dialog-title">{t.rename}</div>
            <input
              ref={renameInputRef}
              className="rename-dialog-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') setRenamingId(null);
              }}
              autoFocus
            />
            <div className="delete-popover-actions">
              <button className="popover-cancel" onClick={() => setRenamingId(null)}>{t.cancel}</button>
              <button className="popover-confirm" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={handleRenameSubmit}>{t.save}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showManager && <ConversationsManager onClose={() => setShowManager(false)} />}
    </div>
  );
};

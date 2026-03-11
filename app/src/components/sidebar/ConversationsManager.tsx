import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/stores/appStore';
import { MessageIcon, SearchIcon, TrashIcon } from '@/components/icons';
import { useT } from '@/i18n';
import './ConversationsManager.less';

interface Props {
  onClose: () => void;
}

const CLOSE_ANIMATION_MS = 180;

export const ConversationsManager: React.FC<Props> = ({ onClose }) => {
  const t = useT();
  const navigate = useNavigate();
  const { conversations, deleteConversations, setActiveConversation } = useAppStore();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [closing, setClosing] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conversation) => conversation.name.toLowerCase().includes(q));
  }, [conversations, query]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((conversation) => selected.has(conversation.id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((conversation) => next.delete(conversation.id));
        return next;
      });
      return;
    }

    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((conversation) => next.add(conversation.id));
      return next;
    });
  };

  const handleDelete = () => {
    if (selected.size === 0) return;
    setConfirming(true);
  };

  const handleConfirm = () => {
    deleteConversations([...selected]);
    setSelected(new Set());
    setConfirming(false);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const requestClose = () => {
    if (closing) {
      return;
    }

    setClosing(true);
    window.setTimeout(() => {
      onClose();
    }, CLOSE_ANIMATION_MS);
  };

  return createPortal(
    <div className={`mgr-overlay ${closing ? 'is-closing' : ''}`} onMouseDown={requestClose}>
      <div className={`mgr-modal ${closing ? 'is-closing' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="mgr-header">
          <span className="mgr-title">{t.manageHistory}</span>
          <button className="mgr-close" onClick={requestClose} type="button">×</button>
        </div>

        <div className="mgr-search-wrap">
          <SearchIcon size={15} className="mgr-search-icon" />
          <input
            className="mgr-search"
            placeholder={t.searchConversations}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
        </div>

        <div className="mgr-toolbar">
          <label className="mgr-select-all" onClick={toggleAll}>
            <span className={`mgr-checkbox ${allFilteredSelected ? 'checked' : ''}`} />
            <span>{allFilteredSelected ? t.deselectAll : t.selectAll}</span>
          </label>
          {selected.size > 0 && <span className="mgr-selected-count">{t.selectedCount(selected.size)}</span>}
        </div>

        <div className="mgr-list">
          {filtered.length === 0 ? (
            <div className="mgr-empty">{t.noSearchResults}</div>
          ) : (
            filtered.map((conversation) => (
              <div
                key={conversation.id}
                className={`mgr-item ${selected.has(conversation.id) ? 'selected' : ''}`}
              >
                <span
                  className={`mgr-checkbox ${selected.has(conversation.id) ? 'checked' : ''}`}
                  onClick={() => toggleOne(conversation.id)}
                />
                <div
                  className="mgr-item-info"
                  onClick={() => {
                    setActiveConversation(conversation.id);
                    navigate(`/c/${conversation.id}`);
                    requestClose();
                  }}
                  title={t.manageHistory}
                >
                  <div className="mgr-item-name">
                    <MessageIcon size={13} className="mgr-item-icon" />
                    {conversation.name}
                  </div>
                  <div className="mgr-item-date">{formatDate(conversation.updatedAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mgr-footer">
          {confirming ? (
            <div className="mgr-confirm-row">
              <span className="mgr-confirm-text">{t.confirmBatchDelete(selected.size)}</span>
              <div className="mgr-confirm-actions">
                <button className="mgr-btn-cancel" onClick={() => setConfirming(false)} type="button">{t.cancel}</button>
                <button className="mgr-btn-delete" onClick={handleConfirm} type="button">{t.delete}</button>
              </div>
            </div>
          ) : (
            <div className="mgr-footer-row">
              <button className="mgr-btn-cancel" onClick={requestClose} type="button">{t.cancel}</button>
              <button
                className="mgr-btn-delete"
                onClick={handleDelete}
                disabled={selected.size === 0}
                type="button"
              >
                <TrashIcon size={14} />
                {t.deleteSelected}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

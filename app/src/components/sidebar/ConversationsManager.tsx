import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/stores/appStore';
import { SearchIcon, TrashIcon } from '@/components/icons';
import { useT } from '@/i18n';
import './ConversationsManager.less';

interface Props {
  onClose: () => void;
}

export const ConversationsManager: React.FC<Props> = ({ onClose }) => {
  const t = useT();
  const { conversations, deleteConversations } = useAppStore();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.name.toLowerCase().includes(q));
  }, [conversations, query]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.id));

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
        filtered.forEach((c) => next.delete(c.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((c) => next.add(c.id));
        return next;
      });
    }
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

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return createPortal(
    <div className="mgr-overlay" onMouseDown={onClose}>
      <div className="mgr-modal" onMouseDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="mgr-header">
          <span className="mgr-title">{t.manageHistory}</span>
          <button className="mgr-close" onClick={onClose}>✕</button>
        </div>

        {/* Search */}
        <div className="mgr-search-wrap">
          <SearchIcon size={15} className="mgr-search-icon" />
          <input
            className="mgr-search"
            placeholder={t.searchConversations}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {/* Toolbar */}
        <div className="mgr-toolbar">
          <label className="mgr-select-all" onClick={toggleAll}>
            <span className={`mgr-checkbox ${allFilteredSelected ? 'checked' : ''}`} />
            <span>{allFilteredSelected ? t.deselectAll : t.selectAll}</span>
          </label>
          {selected.size > 0 && (
            <span className="mgr-selected-count">{t.selectedCount(selected.size)}</span>
          )}
        </div>

        {/* List */}
        <div className="mgr-list">
          {filtered.length === 0 ? (
            <div className="mgr-empty">{t.noSearchResults}</div>
          ) : (
            filtered.map((conv) => (
              <div
                key={conv.id}
                className={`mgr-item ${selected.has(conv.id) ? 'selected' : ''}`}
                onClick={() => toggleOne(conv.id)}
              >
                <span className={`mgr-checkbox ${selected.has(conv.id) ? 'checked' : ''}`} />
                <div className="mgr-item-info">
                  <div className="mgr-item-name">{conv.name}</div>
                  <div className="mgr-item-date">{formatDate(conv.updatedAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="mgr-footer">
          {confirming ? (
            <div className="mgr-confirm-row">
              <span className="mgr-confirm-text">{t.confirmBatchDelete(selected.size)}</span>
              <div className="mgr-confirm-actions">
                <button className="mgr-btn-cancel" onClick={() => setConfirming(false)}>{t.cancel}</button>
                <button className="mgr-btn-delete" onClick={handleConfirm}>{t.delete}</button>
              </div>
            </div>
          ) : (
            <div className="mgr-footer-row">
              <button className="mgr-btn-cancel" onClick={onClose}>{t.cancel}</button>
              <button
                className="mgr-btn-delete"
                onClick={handleDelete}
                disabled={selected.size === 0}
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

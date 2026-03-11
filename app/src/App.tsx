import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Routes, Route, useParams, Navigate } from 'react-router-dom';
import { Sidebar } from '@/components/sidebar';
import { ChatView } from '@/components/chat';
import { useAppStore } from '@/stores/appStore';
import { MenuIcon } from '@/components/icons';
import './App.less';

/** 同步 URL 中的 :id 到 store */
const ConversationRoute: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { setActiveConversation, conversations } = useAppStore();

  useEffect(() => {
    if (id) setActiveConversation(id);
  }, [id]);

  // 会话列表已加载但 id 不存在时，重定向到首页
  const loaded = conversations.length > 0;
  if (loaded && id && !conversations.find((c) => c.id === id)) {
    return <Navigate to="/" replace />;
  }

  return <ChatView />;
};

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 260;
const SIDEBAR_WIDTH_STORAGE_KEY = 'asynagents.sidebarWidth';

function readStoredSidebarWidth(): number {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(parsed)) {
      return SIDEBAR_DEFAULT;
    }
    return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, parsed));
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

function persistSidebarWidth(width: number): void {
  try {
    window.localStorage.setItem(
      SIDEBAR_WIDTH_STORAGE_KEY,
      String(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(width))))
    );
  } catch {
    // Ignore local storage failures and keep the width in memory only.
  }
}

const Layout: React.FC = () => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => readStoredSidebarWidth());
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onResizerMouseDown = useCallback((e: React.MouseEvent) => {
    if (window.innerWidth <= 640 || sidebarCollapsed) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: sidebarWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth, sidebarCollapsed]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragRef.current.startWidth + delta));
      setSidebarWidth(next);
    };
    const onMouseUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      persistSidebarWidth(sidebarWidth);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [sidebarWidth]);

  useEffect(() => {
    persistSidebarWidth(sidebarWidth);
  }, [sidebarWidth]);

  return (
    <div className="app">
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
        width={sidebarCollapsed ? undefined : sidebarWidth}
      />
      <div
        className={`sidebar-resizer ${sidebarCollapsed ? 'hidden' : ''}`}
        onMouseDown={onResizerMouseDown}
      />
      {mobileSidebarOpen && (
        <div className="mobile-overlay" onClick={() => setMobileSidebarOpen(false)} />
      )}
      <main className="main">
        <div className="mobile-header">
          <button className="mobile-menu-btn" onClick={() => setMobileSidebarOpen(true)}>
            <MenuIcon size={20} />
          </button>
        </div>
        <Routes>
          <Route path="/" element={<ChatView />} />
          <Route path="/c/:id" element={<ConversationRoute />} />
        </Routes>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  const { loadConversations, loadSettings } = useAppStore();

  useEffect(() => {
    loadConversations();
    loadSettings();
  }, []);

  return (
    <Routes>
      <Route path="/*" element={<Layout />} />
    </Routes>
  );
};

export default App;

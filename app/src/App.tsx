import React, { useEffect, useState } from 'react';
import { Routes, Route, useParams, useNavigate, Navigate } from 'react-router-dom';
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

const Layout: React.FC = () => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="app">
      <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
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

import React, { useEffect } from 'react';
import { Sidebar } from '@/components/sidebar';
import { ChatView } from '@/components/chat';
import { useAppStore } from '@/stores/appStore';
import './App.less';

const App: React.FC = () => {
  const loadConversations = useAppStore((s) => s.loadConversations);
  const loadSettings = useAppStore((s) => s.loadSettings);

  useEffect(() => {
    loadConversations();
    loadSettings();
  }, []);

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <ChatView />
      </main>
    </div>
  );
};

export default App;

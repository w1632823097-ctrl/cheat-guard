import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './hooks/useAppState';
import Toolbar from './components/Toolbar';
import ChatPanel from './components/ChatPanel';
import './overlay.css';

function App() {
  return (
    <AppProvider>
      <div className="window-wrapper">
        <Toolbar />
        <ChatPanel />
      </div>
    </AppProvider>
  );
}

const container = document.getElementById('root');
if (container) {
  try {
    const root = createRoot(container);
    root.render(<App />);
    console.log('[React] App mounted successfully');
  } catch (err) {
    console.error('[React] Failed to mount app:', err);
    container.innerHTML = '<div style="color:red;padding:20px;">React mount failed: ' + (err as Error).message + '</div>';
  }
} else {
  console.error('[React] Root element not found');
}

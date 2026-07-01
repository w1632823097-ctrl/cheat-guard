import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../hooks/useAppState';
import MessageList from './MessageList';
import ChatInput from './ChatInput';

export interface Toast {
  id: string;
  message: string;
  type: 'error' | 'warning' | 'info';
}

function estimateTokens(text: string): number {
  let tokenCount = 0;
  for (const char of text) {
    if (/[\u4e00-\u9fff]/.test(char)) {
      tokenCount += 1.5;
    } else if (/\s/.test(char)) {
      // skip whitespace
    } else {
      // non-Chinese, non-whitespace: count as part of a word
      // We'll handle this by counting words in a separate pass for Latin text
    }
  }
  // Count English words
  const englishWords = text.match(/[a-zA-Z]+/g);
  if (englishWords) {
    tokenCount += englishWords.length;
  }
  return Math.ceil(tokenCount);
}

export default function ChatPanel() {
  const { isExpanded, setIsExpanded, opacity, setOpacity, sessions, setSessions, currentSessionId, setCurrentSessionId, addMessage, clearMessages, messages, isRecording, currentTranscription } = useApp();
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSessionDropdownOpen, setIsSessionDropdownOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const sessionDropdownRef = useRef<HTMLDivElement>(null);

  // 网络状态检测
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Toast 管理
  const showToast = useCallback((message: string, type: Toast['type'] = 'error') => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  // 导出 showToast 供子组件使用
  useEffect(() => {
    (window as any).__chatPanelShowToast = showToast;
  }, [showToast]);

  // 加载会话列表
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = useCallback(async () => {
    if (!window.electronAPI?.llm?.listSessions) return;
    try {
      const result = await window.electronAPI.llm.listSessions();
      if (result.success && Array.isArray(result.data)) {
        setSessions(result.data as any[]);
      }
    } catch (err) {
      console.error('[Sessions] Failed to load:', err);
    }
  }, [setSessions]);

  const loadSessionHistory = useCallback(async (sessionId: string) => {
    if (!window.electronAPI?.llm?.getHistory) return;
    try {
      setIsLoadingHistory(true);
      const result = await window.electronAPI.llm.getHistory(sessionId);
      if (result.success && Array.isArray(result.data)) {
        clearMessages();
        result.data.forEach((msg: any) => {
          if (msg.role !== 'system') {
            addMessage({
              id: msg.id || Date.now().toString() + Math.random().toString(36).slice(2),
              role: msg.role,
              text: msg.content || msg.text,
              timestamp: new Date(msg.timestamp || Date.now()),
            });
          }
        });
      }
    } catch (err) {
      console.error('[Sessions] Failed to load history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [addMessage, clearMessages]);

  // 加载历史消息
  useEffect(() => {
    if (isExpanded && currentSessionId) {
      loadSessionHistory(currentSessionId);
    }
  }, [isExpanded, currentSessionId, loadSessionHistory]);

  // 面板展开时允许窗口获得焦点，收起时恢复不抢焦点
  useEffect(() => {
    if (isExpanded) {
      window.electronAPI?.enableFocus();
    } else {
      window.electronAPI?.disableFocus();
    }
  }, [isExpanded]);

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+C: 切换聊天面板显示/隐藏
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        setIsExpanded(!isExpanded);
        return;
      }

      // Esc: 关闭聊天面板（仅在面板展开且焦点不在输入框时生效）
      if (e.key === 'Escape' && isExpanded) {
        const activeElement = document.activeElement;
        const isInputFocused = activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          (activeElement as HTMLElement).isContentEditable
        );
        if (!isInputFocused) {
          e.preventDefault();
          setIsExpanded(false);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, setIsExpanded]);

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isSessionDropdownOpen && sessionDropdownRef.current && !sessionDropdownRef.current.contains(e.target as Node)) {
        setIsSessionDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isSessionDropdownOpen]);

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setOpacity(value);
    if (window.electronAPI) {
      window.electronAPI.send('set-overlay-opacity', value / 100);
    }
  };

  const handleNewSession = async () => {
    if (!window.electronAPI?.llm?.newSession) return;
    try {
      const result = await window.electronAPI.llm.newSession();
      if (result.success) {
        // 刷新会话列表
        const listResult = await window.electronAPI.llm.listSessions();
        if (listResult.success) {
          setSessions(listResult.data as any[]);
        }
        // 切换到新会话
        if ((result.data as any)?.id) {
          setCurrentSessionId((result.data as any).id);
        }
      }
    } catch (err) {
      console.error('[Sessions] Failed to create:', err);
    }
  };

  const handleSwitchSession = async (sessionId: string) => {
    if (sessionId === currentSessionId) {
      setIsSessionDropdownOpen(false);
      return;
    }
    setCurrentSessionId(sessionId);
    setIsSessionDropdownOpen(false);
    // 历史消息会在 useEffect 中自动加载
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (sessions.length <= 1) return;
    if (!window.electronAPI?.llm?.deleteSession) return;
    try {
      const result = await window.electronAPI.llm.deleteSession(sessionId);
      if (result.success) {
        // 刷新会话列表
        const listResult = await window.electronAPI.llm.listSessions();
        if (listResult.success) {
          setSessions(listResult.data as any[]);
        }
        // 如果删除的是当前会话，切换到第一个
        if (sessionId === currentSessionId && sessions.length > 1) {
          const remainingSessions = sessions.filter((s: any) => s.id !== sessionId);
          if (remainingSessions.length > 0) {
            setCurrentSessionId(remainingSessions[0].id);
          }
        }
      }
    } catch (err) {
      console.error('[Sessions] Failed to delete:', err);
    }
  };

  const currentSession = sessions.find((s: any) => s.id === currentSessionId);

  // 计算上下文统计信息
  const contextInfo = useMemo(() => {
    const messageCount = messages.length;
    const totalTokens = messages.reduce((sum, msg) => sum + estimateTokens(msg.text), 0);
    return { messageCount, totalTokens };
  }, [messages]);

  const isWarning = contextInfo.messageCount > 50 || contextInfo.totalTokens > 4000;

  // 清空上下文
  const handleClearContext = async () => {
    if (!currentSessionId) return;
    try {
      await window.electronAPI?.llm?.clearSession(currentSessionId);
      clearMessages();
    } catch (err) {
      console.error('[Sessions] Failed to clear context:', err);
    }
  };

  // 使用 CSS class 控制显示/隐藏，而不是条件渲染
  // 这样可以保留过渡动画效果
  return (
    <div 
      ref={chatPanelRef} 
      id="chatPanel" 
      className={`chat-panel ${isExpanded ? 'expanded' : ''}`}
    >
      {/* 面板头部 */}
      <div className="panel-header">
        {/* 左侧：透明度控制 */}
        <div className="opacity-control">
          <span className="opacity-label">{opacity}%</span>
          <input
            type="range"
            min="20"
            max="100"
            value={opacity}
            onChange={handleOpacityChange}
            title="透明度"
          />
        </div>
        
        {/* 中间：会话选择器（下拉列表） */}
        <div className="session-selector" ref={sessionDropdownRef}>
          <button
            className="session-btn"
            onClick={(e) => {
              e.stopPropagation();
              setIsSessionDropdownOpen(!isSessionDropdownOpen);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span>{currentSession ? (currentSession as any).title : 'History'}</span>
            <svg className="session-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          
          {isSessionDropdownOpen && (
            <div className="session-dropdown">
              {sessions.map((session: any) => (
                <div
                  key={session.id}
                  className={`session-dropdown-item ${session.id === currentSessionId ? 'active' : ''}`}
                  onClick={() => handleSwitchSession(session.id)}
                >
                  <span>{session.title}</span>
                  <span className="session-msg-count">{session.messageCount || 0} 条</span>
                  <button
                    className="session-delete-btn"
                    onClick={(e) => handleDeleteSession(e, session.id)}
                    title="删除会话"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* 右侧：新建会话 + 清空上下文 */}
        <div className="panel-controls">
          <button
            className="new-session-icon-btn"
            onClick={handleNewSession}
            title="新建会话"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <button
            className="new-session-icon-btn"
            onClick={handleClearContext}
            title="清空上下文"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      
      <MessageList />

      {/* 录音状态指示器 */}
      {isRecording && (
        <div className="recording-status-panel">
          <div className="recording-dot"></div>
          <span>正在录音...</span>
          {currentTranscription && (
            <span className="recording-transcription">{currentTranscription}</span>
          )}
        </div>
      )}

      {/* 离线提示 */}
      {!isOnline && (
        <div className="offline-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.67a4 4 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <span>网络已断开，请检查网络连接</span>
        </div>
      )}

      <ChatInput />

      {/* Toast 通知 */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

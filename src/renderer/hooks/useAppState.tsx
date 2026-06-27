import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  isError?: boolean;
  timestamp: Date;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  baseURL: string;
}

interface AppState {
  // UI 状态
  isExpanded: boolean;
  setIsExpanded: (v: boolean) => void;
  opacity: number;
  setOpacity: (v: number) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  
  // 消息
  messages: Message[];
  addMessage: (msg: Message) => void;
  updateLastMessage: (text: string) => void;
  clearMessages: () => void;
  editMessage: (id: string, text: string) => void;
  regenerateMessage: (id: string) => void;
  
  // 会话
  sessions: Session[];
  setSessions: (sessions: Session[]) => void;
  currentSessionId: string;
  setCurrentSessionId: (id: string) => void;
  isSessionDropdownOpen: boolean;
  setIsSessionDropdownOpen: (v: boolean) => void;
  
  // 模型
  availableModels: ModelInfo[];
  setAvailableModels: (models: ModelInfo[]) => void;
  currentModelId: string;
  setCurrentModelId: (id: string) => void;
  isModelDropdownOpen: boolean;
  setIsModelDropdownOpen: (v: boolean) => void;
  
  // 录音（自己说话 → 自动发送 LLM）
  isRecording: boolean;
  setIsRecording: (v: boolean) => void;
  currentTranscription: string;
  setCurrentTranscription: (text: string) => void;
  
  // 倾听模式（监听对方说话 → 显示转录，手动触发回复）
  isListening: boolean;
  setIsListening: (v: boolean) => void;
  otherPartyTranscript: string;
  setOtherPartyTranscript: (text: string) => void;
  
  // 流式消息
  streamingMessageId: string | null;
  setStreamingMessageId: (id: string | null) => void;
  
  // 拖拽
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;

  // 主题
  theme: 'dark' | 'light';
  setTheme: (v: 'dark' | 'light') => void;

  // 字体大小
  fontSize: 'small' | 'medium' | 'large';
  setFontSize: (v: 'small' | 'medium' | 'large') => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [opacity, setOpacity] = useState(100);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState('default');
  const [isSessionDropdownOpen, setIsSessionDropdownOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [currentModelId, setCurrentModelId] = useState('');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentTranscription, setCurrentTranscription] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [otherPartyTranscript, setOtherPartyTranscript] = useState('');
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 从 localStorage 读取主题和字体大小偏好
  const [theme, setThemeState] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('cheat-guard-theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const [fontSize, setFontSizeState] = useState<'small' | 'medium' | 'large'>(() => {
    try {
      const saved = localStorage.getItem('cheat-guard-font-size');
      if (saved === 'small' || saved === 'large') return saved;
      return 'medium';
    } catch {
      return 'medium';
    }
  });

  // 主题切换时更新 body class 和 localStorage
  const setTheme = useCallback((v: 'dark' | 'light') => {
    setThemeState(v);
    try {
      localStorage.setItem('cheat-guard-theme', v);
      if (v === 'light') {
        document.body.classList.add('light-theme');
      } else {
        document.body.classList.remove('light-theme');
      }
    } catch {
      // ignore
    }
  }, []);

  // 字体大小切换时更新 body class 和 localStorage
  const setFontSize = useCallback((v: 'small' | 'medium' | 'large') => {
    setFontSizeState(v);
    try {
      localStorage.setItem('cheat-guard-font-size', v);
      document.body.classList.remove('font-small', 'font-medium', 'font-large');
      document.body.classList.add(`font-${v}`);
    } catch {
      // ignore
    }
  }, []);

  // 初始化时应用保存的主题和字体大小
  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    }
    document.body.classList.add(`font-${fontSize}`);
  }, []);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastMessage = useCallback((text: string) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const newMessages = [...prev];
      const lastMsg = newMessages[newMessages.length - 1];
      if (lastMsg.role === 'assistant') {
        lastMsg.text += text;
      }
      return newMessages;
    });
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const editMessage = useCallback((id: string, text: string) => {
    setMessages((prev) =>
      prev.map((msg) => (msg.id === id ? { ...msg, text } : msg))
    );
  }, []);

  const regenerateMessage = useCallback((id: string) => {
    setMessages((prev) => {
      const index = prev.findIndex((msg) => msg.id === id);
      if (index === -1) return prev;
      return prev.slice(0, index + 1);
    });
  }, []);

  // 监听 LLM 流式响应
  useEffect(() => {
    const handleChunk = (chunk: string) => {
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        // 如果最后一条是 assistant 消息，追加到该消息
        // 否则添加一条新的 assistant 消息
        if (lastMsg.role === 'assistant') {
          lastMsg.text += chunk;
        } else {
          // 添加新的 assistant 消息
          newMessages.push({
            id: Date.now().toString() + '_stream',
            role: 'assistant',
            text: chunk,
            timestamp: new Date(),
          });
        }
        return newMessages;
      });
    };

    const handleDone = () => {
      setIsLoading(false);
    };

    const unsubChunk = window.electronAPI?.onLLMChunk(handleChunk);
    const unsubDone = window.electronAPI?.onLLMDone(handleDone);

    // 监听音频转录
    const handleTranscriptionInterim = (text: string) => {
      setCurrentTranscription(text);
    };
    const handleTranscriptionUpdate = (text: string) => {
      setCurrentTranscription(text);
    };
    const handleTranscriptionFull = (text: string) => {
      setCurrentTranscription(text);
    };
    const handleASRStateChange = (state: string, error: string) => {
      if (state === 'recording') {
        setIsRecording(true);
      } else if (state === 'idle') {
        setIsRecording(false);
      }
      if (error) {
        console.error('[ASR] Error:', error);
      }
    };

    const unsubInterim = window.electronAPI?.onTranscriptionInterim(handleTranscriptionInterim);
    const unsubUpdate = window.electronAPI?.onTranscriptionUpdate(handleTranscriptionUpdate);
    const unsubFull = window.electronAPI?.onTranscriptionFull(handleTranscriptionFull);
    const unsubASR = window.electronAPI?.onASRStateChange(handleASRStateChange);

    return () => {
      unsubChunk?.();
      unsubDone?.();
      unsubInterim?.();
      unsubUpdate?.();
      unsubFull?.();
      unsubASR?.();
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        isExpanded,
        setIsExpanded,
        opacity,
        setOpacity,
        isLoading,
        setIsLoading,
        messages,
        addMessage,
        updateLastMessage,
        clearMessages,
        editMessage,
        regenerateMessage,
        sessions,
        setSessions,
        currentSessionId,
        setCurrentSessionId,
        isSessionDropdownOpen,
        setIsSessionDropdownOpen,
        availableModels,
        setAvailableModels,
        currentModelId,
        setCurrentModelId,
        isModelDropdownOpen,
        setIsModelDropdownOpen,
        isRecording,
        setIsRecording,
        currentTranscription,
        setCurrentTranscription,
        isListening,
        setIsListening,
        otherPartyTranscript,
        setOtherPartyTranscript,
        streamingMessageId,
        setStreamingMessageId,
        isDragging,
        setIsDragging,
        theme,
        setTheme,
        fontSize,
        setFontSize,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

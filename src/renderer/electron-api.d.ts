// 渲染进程全局类型声明

interface LLMAPI {
  chat: (sessionId: string, message: string, systemPrompt?: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  chatStream: (sessionId: string, message: string, systemPrompt?: string) => Promise<{ success: boolean; error?: string }>;
  clearSession: (sessionId: string) => void;
  setConfig: (config: { apiKey: string; baseURL?: string; model?: string }) => Promise<{ success: boolean; error?: string }>;
  getHistory: (sessionId: string) => Promise<{ success: boolean; data?: unknown[]; error?: string }>;
  getModels: () => Promise<{ success: boolean; data?: unknown[]; error?: string }>;
  setModel: (modelId: string) => Promise<{ success: boolean; error?: string }>;
  listSessions: () => Promise<{ success: boolean; data?: unknown[]; error?: string }>;
  newSession: (title?: string) => Promise<{ success: boolean; data?: unknown; error?: string }>;
  deleteSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
  renameSession: (sessionId: string, title: string) => Promise<{ success: boolean; error?: string }>;
  getCurrentSession: () => Promise<{ success: boolean; data?: string; error?: string }>;
}

interface AudioAPI {
  startRecording: () => Promise<{ success: boolean; error?: string }>;
  stopRecording: () => Promise<{ success: boolean; transcript?: string; error?: string }>;
  checkStatus: () => Promise<{ recording: boolean; state: string; model: string; transcript: string }>;
  sendChunk: (chunk: ArrayBuffer) => void;
  setConfig: (config: Record<string, unknown>) => Promise<{ success: boolean }>;
  log: (message: string) => void;
}

interface OCRAPI {
  screenshot: () => Promise<{ success: boolean; text?: string; error?: string }>;
}

interface ElectronAPI {
  send: (channel: string, ...args: unknown[]) => void;
  on: (channel: string, callback: (...args: unknown[]) => void) => (() => void);
  once: (channel: string, callback: (...args: unknown[]) => void) => void;
  off: (channel: string, callback: (...args: unknown[]) => void) => void;
  audio: AudioAPI;
  llm: LLMAPI;
  ocr: OCRAPI;
  onTranscriptionInterim: (callback: (text: string) => void) => (() => void);
  onTranscriptionUpdate: (callback: (text: string) => void) => (() => void);
  onTranscriptionFull: (callback: (fullText: string) => void) => (() => void);
  onASRStateChange: (callback: (state: string, error: string) => void) => (() => void);
  onLLMChunk: (callback: (chunk: string) => void) => (() => void);
  onLLMDone: (callback: () => void) => (() => void);
  onOCRResult: (callback: (text: string) => void) => (() => void);
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};

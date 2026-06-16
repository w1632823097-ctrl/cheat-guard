import { contextBridge, ipcRenderer } from 'electron';

// 暴露给渲染进程的安全 API
contextBridge.exposeInMainWorld('electronAPI', {
  // IPC 发送
  send: (channel: string, ...args: unknown[]) => {
    ipcRenderer.send(channel, ...args);
  },

  // IPC 监听
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const wrapper = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, wrapper);
    // 返回取消监听的函数
    return () => ipcRenderer.removeListener(channel, wrapper);
  },

  // 一次性监听
  once: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.once(channel, (_event, ...args) => callback(...args));
  },

  // Audio capture APIs
  audio: {
    startRecording: () => ipcRenderer.invoke('audio:start-recording'),
    stopRecording: () => ipcRenderer.invoke('audio:stop-recording'),
    checkWhisper: () => ipcRenderer.invoke('audio:check-whisper'),
    sendChunk: (chunk: ArrayBuffer) => ipcRenderer.send('audio:chunk', chunk),
  },

  // Real-time transcription events
  onTranscriptionUpdate: (callback: (text: string) => void) => {
    const wrapper = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
    ipcRenderer.on('transcription-update', wrapper);
    return () => ipcRenderer.removeListener('transcription-update', wrapper);
  },

  // LLM chat APIs
  llm: {
    chat: (sessionId: string, message: string, systemPrompt?: string) =>
      ipcRenderer.invoke('llm:chat', sessionId, message, systemPrompt),
    chatStream: (sessionId: string, message: string, systemPrompt?: string) =>
      ipcRenderer.invoke('llm:chat-stream', sessionId, message, systemPrompt),
    clearSession: (sessionId: string) =>
      ipcRenderer.send('llm:clear-session', sessionId),
    setConfig: (config: { apiKey: string; baseURL?: string; model?: string }) =>
      ipcRenderer.invoke('llm:set-config', config),
    getHistory: (sessionId: string) =>
      ipcRenderer.invoke('llm:get-history', sessionId),
  },

  // LLM streaming chunk listener
  onLLMChunk: (callback: (chunk: string) => void) => {
    const wrapper = (_event: Electron.IpcRendererEvent, chunk: string) => callback(chunk);
    ipcRenderer.on('llm:chunk', wrapper);
    return () => ipcRenderer.removeListener('llm:chunk', wrapper);
  },

  onLLMDone: (callback: () => void) => {
    const wrapper = () => callback();
    ipcRenderer.on('llm:done', wrapper);
    return () => ipcRenderer.removeListener('llm:done', wrapper);
  },
});

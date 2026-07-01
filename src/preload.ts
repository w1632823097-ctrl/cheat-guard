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
    checkStatus: () => ipcRenderer.invoke('audio:check-status'),
    sendChunk: (chunk: ArrayBuffer) => ipcRenderer.send('audio:chunk', chunk),
    setConfig: (config: Record<string, unknown>) => ipcRenderer.invoke('audio:set-config', config),
    log: (message: string) => ipcRenderer.send('audio:log', message),
  },

  // Transcription events
  onTranscriptionInterim: (callback: (text: string) => void) => {
    const wrapper = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
    ipcRenderer.on('transcription-interim', wrapper);
    return () => ipcRenderer.removeListener('transcription-interim', wrapper);
  },
  onTranscriptionUpdate: (callback: (text: string) => void) => {
    const wrapper = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
    ipcRenderer.on('transcription-update', wrapper);
    return () => ipcRenderer.removeListener('transcription-update', wrapper);
  },
  onTranscriptionFull: (callback: (fullText: string) => void) => {
    const wrapper = (_event: Electron.IpcRendererEvent, fullText: string) => callback(fullText);
    ipcRenderer.on('transcription-full', wrapper);
    return () => ipcRenderer.removeListener('transcription-full', wrapper);
  },
  onASRStateChange: (callback: (state: string, error: string) => void) => {
    const wrapper = (_event: Electron.IpcRendererEvent, state: string, error: string) => callback(state, error);
    ipcRenderer.on('asr-state-change', wrapper);
    return () => ipcRenderer.removeListener('asr-state-change', wrapper);
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
    getModels: () =>
      ipcRenderer.invoke('llm:get-models'),
    setModel: (modelId: string) =>
      ipcRenderer.invoke('llm:set-model', modelId),
    addModel: (modelInfo: { id: string; name: string; baseURL: string; apiKey?: string }) =>
      ipcRenderer.invoke('llm:add-model', modelInfo),
    testModel: (modelInfo: { id: string; baseURL: string; apiKey: string }) =>
      ipcRenderer.invoke('llm:test-model', modelInfo),
    // 会话管理
    listSessions: () =>
      ipcRenderer.invoke('llm:list-sessions'),
    newSession: (title?: string) =>
      ipcRenderer.invoke('llm:new-session', title),
    deleteSession: (sessionId: string) =>
      ipcRenderer.invoke('llm:delete-session', sessionId),
    renameSession: (sessionId: string, title: string) =>
      ipcRenderer.invoke('llm:rename-session', sessionId, title),
    getCurrentSession: () =>
      ipcRenderer.invoke('llm:get-current-session'),
    cancelStream: () =>
      ipcRenderer.send('llm:cancel-stream'),
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

  // OCR screenshot API
  ocr: {
    screenshot: () => ipcRenderer.invoke('ocr:screenshot'),
  },

  // OCR result listener
  onOCRResult: (callback: (text: string) => void) => {
    const wrapper = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
    ipcRenderer.on('ocr:result', wrapper);
    return () => ipcRenderer.removeListener('ocr:result', wrapper);
  },

  // 窗口焦点控制
  enableFocus: () => ipcRenderer.invoke('window:enable-focus'),
  disableFocus: () => ipcRenderer.invoke('window:disable-focus'),
});

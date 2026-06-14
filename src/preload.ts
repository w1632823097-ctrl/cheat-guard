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
});

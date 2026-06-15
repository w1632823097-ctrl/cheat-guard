import { ipcMain, BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;
let initialized = false;

export function initAudioCapture(window: BrowserWindow) {
  if (initialized) return;
  mainWindow = window;
  initialized = true;

  // TODO: 语音识别功能待后续开发
  ipcMain.handle('audio:start-recording', async () => {
    console.log('[Audio] Recording not implemented yet');
    return { success: false, error: '语音识别功能尚未实现' };
  });

  ipcMain.handle('audio:stop-recording', async () => {
    console.log('[Audio] Recording stopped (not implemented)');
    return { success: true };
  });

  ipcMain.handle('audio:check-whisper', async () => {
    return { available: false, recording: false };
  });

  ipcMain.on('audio:chunk', () => {
    // TODO: 实现音频流接收
  });
}

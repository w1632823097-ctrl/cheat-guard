import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import * as path from 'path';
import { chat, chatStream, clearSession, setApiConfig, getHistory } from './llm/llm-service';
import { setWindowInvisible, setNoActivateStyle, isWDAvailable } from './native/wda-wrapper';

let overlayWindow: BrowserWindow | null = null;

function toggleOverlay() {
  if (!overlayWindow) return;
  if (overlayWindow.isVisible()) {
    overlayWindow.hide();
  } else {
    overlayWindow.showInactive();
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  }
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 420,
    height: 600,
    x: 100,
    y: 100,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    focusable: true,
    hasShadow: false,
    show: false,
    thickFrame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  overlayWindow.loadFile('src/renderer/overlay.html');
  overlayWindow.setVisibleOnAllWorkspaces(true);
  overlayWindow.setMenuBarVisibility(false);

  overlayWindow.once('ready-to-show', () => {
    if (process.platform === 'win32' && isWDAvailable()) {
      try {
        const hwnd = overlayWindow?.getNativeWindowHandle();
        if (hwnd) {
          setNoActivateStyle(hwnd);
          setWindowInvisible(hwnd);
        }
      } catch (err) {
        console.error('[WDA] Error applying WDA:', err);
      }
    }

    overlayWindow?.showInactive();
    overlayWindow?.setTitle('');
    overlayWindow?.setSkipTaskbar(true);
  });

  overlayWindow.on('closed', () => { overlayWindow = null; });
}

app.whenReady().then(async () => {
  createOverlayWindow();

  try {
    const { initAudioCapture } = await import('./audio/audio-capture');
    if (overlayWindow) {
      initAudioCapture(overlayWindow);
    }
  } catch (err) {
    console.warn('[Audio] Failed to initialize audio capture:', err);
  }

  globalShortcut.register('CommandOrControl+Enter', () => {
    if (overlayWindow) {
      toggleOverlay();
    }
  });

  globalShortcut.register('CommandOrControl+Shift+O', () => {
    if (overlayWindow) {
      toggleOverlay();
    }
  });

  app.on('activate', () => {
    if (!overlayWindow) createOverlayWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => globalShortcut.unregisterAll());

ipcMain.on('update-overlay-text', (event, text: string) => {
  if (overlayWindow) overlayWindow.webContents.send('update-text', text);
});

ipcMain.on('quit-app', () => {
  app.quit();
});

ipcMain.on('focus-input', () => {
  if (overlayWindow) {
    overlayWindow.focus();
  }
});

ipcMain.on('blur-input', () => {
  if (overlayWindow) {
    overlayWindow.blur();
  }
});

let dragInterval: NodeJS.Timeout | null = null;
let startMousePos = { x: 0, y: 0 };
let startWindowPos = { x: 0, y: 0 };
let lastMousePos = { x: 0, y: 0 };
let isDragging = false;

function clearDragInterval() {
  if (dragInterval) {
    clearInterval(dragInterval);
    dragInterval = null;
  }
  isDragging = false;
}

ipcMain.on('start-drag', () => {
  if (!overlayWindow || isDragging) return;
  
  isDragging = true;
  
  try {
    const point = require('electron').screen.getCursorScreenPoint();
    const windowBounds = overlayWindow.getBounds();
    
    startMousePos = { x: point.x, y: point.y };
    startWindowPos = { x: windowBounds.x, y: windowBounds.y };
    lastMousePos = { x: point.x, y: point.y };
    
    if (dragInterval) {
      clearInterval(dragInterval);
      dragInterval = null;
    }
    
    dragInterval = setInterval(() => {
      if (!overlayWindow || !isDragging) {
        if (dragInterval) {
          clearInterval(dragInterval);
          dragInterval = null;
        }
        return;
      }
      
      try {
        const currentPoint = require('electron').screen.getCursorScreenPoint();
        
        if (currentPoint.x === lastMousePos.x && currentPoint.y === lastMousePos.y) {
          return;
        }
        
        lastMousePos = { x: currentPoint.x, y: currentPoint.y };
        
        const newX = startWindowPos.x + (currentPoint.x - startMousePos.x);
        const newY = startWindowPos.y + (currentPoint.y - startMousePos.y);
        
        overlayWindow.setPosition(newX, newY, false);
      } catch (e) {
      }
    }, 16);
  } catch (e) {
    console.error('Drag start error:', e);
  }
});

ipcMain.on('stop-drag', () => {
  clearDragInterval();
});

ipcMain.on('set-overlay-opacity', (event, opacity: number) => {
  if (overlayWindow) {
    overlayWindow.setOpacity(opacity);
  }
});

ipcMain.handle('llm:chat', async (_event, sessionId: string, message: string, systemPrompt?: string) => {
  try {
    const response = await chat(sessionId, message, systemPrompt);
    return { success: true, data: response };
  } catch (err: any) {
    console.error('[LLM] Chat error:', err.message);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('llm:chat-stream', async (event, sessionId: string, message: string, systemPrompt?: string) => {
  const sender = event.sender;
  try {
    await chatStream(sessionId, message, (chunk: string) => {
      sender.send('llm:chunk', chunk);
    }, systemPrompt);
    sender.send('llm:done');
    return { success: true };
  } catch (err: any) {
    console.error('[LLM] Chat stream error:', err.message);
    sender.send('llm:done');
    return { success: false, error: err.message };
  }
});

ipcMain.on('llm:clear-session', (_event, sessionId: string) => {
  clearSession(sessionId);
});

ipcMain.handle('llm:set-config', async (_event, config: { apiKey: string; baseURL?: string; model?: string }) => {
  try {
    setApiConfig(config);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('llm:get-history', async (_event, sessionId: string) => {
  const history = getHistory(sessionId);
  return { success: true, data: history };
});
import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import * as path from 'path';
import { setWindowInvisible, isWDAvailable } from './native/wda-wrapper';

let overlayWindow: BrowserWindow | null = null;

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
  overlayWindow.setBackgroundColor('#00000000');

  // Windows: 阻止失去焦点时出现白色标题栏
  if (process.platform === 'win32') {
    const { nativeImage } = require('electron');
    overlayWindow.setIcon(nativeImage.createEmpty());

    // 拦截 WM_NCACTIVATE，阻止系统绘制非激活状态标题栏
    overlayWindow.hookWindowMessage(0x0086, () => {
      // Always return true to prevent Windows from drawing non-client area
      overlayWindow?.setBackgroundColor('#00000000');
      return true;
    });

    // 焦点恢复时强制透明背景
    overlayWindow.on('focus', () => {
      overlayWindow?.setBackgroundColor('#00000000');
    });
  }

  overlayWindow.once('ready-to-show', () => {
    overlayWindow?.show();
    overlayWindow?.setTitle('');
    overlayWindow?.setSkipTaskbar(true);

    // 核心：应用 WDA 使窗口在屏幕捕获中不可见
    if (process.platform === 'win32' && isWDAvailable()) {
      try {
        const hwnd = overlayWindow?.getNativeWindowHandle();
        if (hwnd) {
          const success = setWindowInvisible(hwnd);
          if (success) {
            // WDA wrapper already logged success
          } else {
            console.warn('[WDA] Failed to set window invisible');
          }
        }
      } catch (err) {
        console.error('[WDA] Error applying WDA:', err);
      }
    }
  });

  overlayWindow.on('closed', () => { overlayWindow = null; });
}

app.whenReady().then(async () => {
  createOverlayWindow();

  // Initialize audio capture IPC handlers (dynamic import)
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
      overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show();
    }
  });

  globalShortcut.register('CommandOrControl+Shift+O', () => {
    if (overlayWindow) {
      overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show();
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

// 退出应用
ipcMain.on('quit-app', () => {
  app.quit();
});

// 聚焦输入框
ipcMain.on('focus-input', () => {
  if (overlayWindow) {
    overlayWindow.focus();
  }
});

// 失去焦点（点击外部后）
ipcMain.on('blur-input', () => {
  if (overlayWindow) {
    overlayWindow.blurWebView();
  }
});

// 拖动窗口
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
    
    // 记录拖拽开始时的鼠标位置和窗口位置
    startMousePos = { x: point.x, y: point.y };
    startWindowPos = { x: windowBounds.x, y: windowBounds.y };
    lastMousePos = { x: point.x, y: point.y };
    
    // 清除之前的 interval（如果有）
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
        
        // 如果鼠标位置没有变化，不更新窗口位置
        if (currentPoint.x === lastMousePos.x && currentPoint.y === lastMousePos.y) {
          return;
        }
        
        lastMousePos = { x: currentPoint.x, y: currentPoint.y };
        
        // 计算新的窗口位置
        const newX = startWindowPos.x + (currentPoint.x - startMousePos.x);
        const newY = startWindowPos.y + (currentPoint.y - startMousePos.y);
        
        // 更新窗口位置
        overlayWindow.setPosition(newX, newY, false); // false = 不使用动画
      } catch (e) {
        // 忽略可能的错误
      }
    }, 16); // 约 60fps
  } catch (e) {
    console.error('Drag start error:', e);
  }
});

ipcMain.on('stop-drag', () => {
  clearDragInterval();
});

// 设置透明度
ipcMain.on('set-overlay-opacity', (event, opacity: number) => {
  if (overlayWindow) {
    overlayWindow.setOpacity(opacity);
  }
});

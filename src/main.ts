import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import * as path from 'path';
import { setWindowInvisible, isWDAvailable, removeWindowCaption } from './native/wda-wrapper';
import { chat, chatStream, clearSession, setApiConfig, getHistory } from './llm/llm-service';

let overlayWindow: BrowserWindow | null = null;

function toggleOverlay() {
  if (!overlayWindow) return;
  if (overlayWindow.isVisible()) {
    overlayWindow.hide();
  } else {
    // 先强制透明背景，再 show，避免 Windows 标题栏白条闪烁
    overlayWindow.setBackgroundColor('#00000000');
    overlayWindow.showInactive();
    overlayWindow.setBackgroundColor('#00000000');
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
    overlayWindow?.setBackgroundColor('#00000000');
    overlayWindow?.showInactive();
    overlayWindow?.setBackgroundColor('#00000000');
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
          // 移除标题栏边框，消除 focus/blur 时白条闪烁
          removeWindowCaption(hwnd);
        }
      } catch (err) {
        console.error('[WDA] Error applying WDA:', err);
      }
    }
  });

  overlayWindow.on('closed', () => { overlayWindow = null; });
}

app.whenReady().then(async () => {
  // ---- LLM 启动自检：纯 https 直连，排除一切封装 ----
  try {
    const fs = await import('fs');
    const path = await import('path');
    const https = await import('https');

    const configPath = path.join(process.cwd(), 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')).llm;
    
    const payload = JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 10,
    });

    console.log('[LLM] Self-check: POST', config.baseURL + '/chat/completions');
    console.log('[LLM] Self-check: key =', config.apiKey.slice(0, 4) + '***' + config.apiKey.slice(-4));

    const result = await new Promise<string>((resolve, reject) => {
      const u = new URL(config.baseURL + '/chat/completions');
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }, (res) => {
        let body = '';
        res.on('data', (c: Buffer) => body += c.toString());
        res.on('end', () => {
          if (res.statusCode === 200) resolve('OK ' + body.slice(0, 100));
          else reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    console.log('[LLM] Startup self-check:', result);
  } catch (err: any) {
    console.error('[LLM] Startup self-check FAILED:', err.message);
  }

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

// 退出应用
ipcMain.on('quit-app', () => {
  app.quit();
});

// 聚焦输入框
ipcMain.on('focus-input', () => {
  if (overlayWindow) {
    overlayWindow.setBackgroundColor('#00000000');
    overlayWindow.focus();
    overlayWindow.setBackgroundColor('#00000000');
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

// ============ LLM Chat IPC Handlers ============

// 非流式聊天
ipcMain.handle('llm:chat', async (_event, sessionId: string, message: string, systemPrompt?: string) => {
  try {
    const response = await chat(sessionId, message, systemPrompt);
    return { success: true, data: response };
  } catch (err: any) {
    console.error('[LLM] Chat error:', err.message);
    return { success: false, error: err.message };
  }
});

// 流式聊天
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

// 清除会话
ipcMain.on('llm:clear-session', (_event, sessionId: string) => {
  clearSession(sessionId);
});

// 设置 API 配置
ipcMain.handle('llm:set-config', async (_event, config: { apiKey: string; baseURL?: string; model?: string }) => {
  try {
    setApiConfig(config);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// 获取会话历史
ipcMain.handle('llm:get-history', async (_event, sessionId: string) => {
  const history = getHistory(sessionId);
  return { success: true, data: history };
});

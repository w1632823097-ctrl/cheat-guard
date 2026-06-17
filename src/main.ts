import { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer } from 'electron';
import * as path from 'path';
import { chat, chatStream, clearSession, setApiConfig, getHistory } from './llm/llm-service';
import { setWindowInvisible, setNoActivateStyle, isWDAvailable } from './native/wda-wrapper';

let overlayWindow: BrowserWindow | null = null;
let regionSelectorWindow: BrowserWindow | null = null;

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

// ============================================================
// OCR：选区 + 截屏 + OCR 核心函数
// ============================================================
async function showRegionSelectorAndOCR(): Promise<{ success: boolean; text?: string; error?: string }> {
  // 第1步：用户选区域
  const region = await showRegionSelector();
  if (!region) {
    return { success: true, text: '' };
  }

  console.log('[OCR] Region selected:', region);

  // 第2步：截屏
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 2560, height: 1440 },
  });
  if (sources.length === 0) {
    return { success: false, error: 'No screen sources found' };
  }

  const fullImage = sources[0].thumbnail;
  if (!fullImage) {
    return { success: false, error: 'Failed to capture screen thumbnail' };
  }

  // 第3步：裁剪到选区
  const { nativeImage } = require('electron');
  const img = nativeImage.createFromBuffer(fullImage.toPNG());
  const cropped = img.crop({
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
  });

  const screenshotPath = path.join(process.cwd(), 'screenshot.png');
  require('fs').writeFileSync(screenshotPath, cropped.toPNG());
  console.log('[OCR] Cropped screenshot saved');

  // 第4步：OCR
  const pythonPath = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
  const scriptPath = path.join(process.cwd(), 'test', 'test-ocr.py');

  return new Promise((resolve) => {
    const proc = require('child_process').spawn(pythonPath, [
      scriptPath,
      '--file', screenshotPath,
      '--no-llm'
    ], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString('utf-8'); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString('utf-8'); });

    proc.on('close', (code: number) => {
      if (code !== 0) {
        resolve({ success: false, error: `OCR exited ${code}: ${stderr}` });
        return;
      }

      const lines = stdout.split('\n');
      let ocrText = '';
      let found = false;
      for (const line of lines) {
        const t = line.trim();
        if (t === '识别结果:') { found = true; continue; }
        if (found && !t.startsWith('─') && t !== '') { ocrText += t + '\n'; }
      }

      if (ocrText.trim()) {
        // 异步发送给 LLM
        sendOCRToLLM(ocrText.trim());
        resolve({ success: true, text: ocrText.trim() });
      } else {
        resolve({ success: true, text: '(未识别到文字)' });
      }
    });

    proc.on('error', (err: Error) => {
      resolve({ success: false, error: err.message });
    });
  });
}

async function sendOCRToLLM(ocrText: string) {
  if (!overlayWindow) return;
  const prompt = `屏幕上显示的内容：\n---\n${ocrText}\n---\n\n请分析并给出帮助。`;
  try {
    await chatStream('default', prompt, (chunk: string) => {
      overlayWindow?.webContents.send('llm:chunk', chunk);
    });
    overlayWindow?.webContents.send('llm:done');
  } catch (err: any) {
    console.error('[LLM] OCR analysis failed:', err.message);
    overlayWindow?.webContents.send('llm:done');
  }
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

  // Register OCR screenshot shortcut (uses region selector)
  globalShortcut.register('CommandOrControl+Shift+S', async () => {
    if (!overlayWindow) return;
    try {
      console.log('[OCR] Shortcut triggered');
      const result = await showRegionSelectorAndOCR();
      if (result && result.text) {
        overlayWindow.webContents.send('ocr:result', result.text);
        sendOCRToLLM(result.text);
      }
    } catch (err: any) {
      console.error('[OCR] Shortcut failed:', err.message);
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

// ============================================================
// OCR Screenshot Handler（先选区域，再OCR）
// ============================================================
function showRegionSelector(): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    // 隐藏覆盖层
    if (overlayWindow) {
      overlayWindow.hide();
    }

    const displays = require('electron').screen.getAllDisplays();
    // 用主显示器或所有显示器边界
    let bounds = { x: 0, y: 0, width: 1920, height: 1080 };
    if (displays.length > 0) {
      const primary = displays[0];
      bounds = primary.workArea;
    }

    regionSelectorWindow = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      focusable: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false,
      },
    });

    // 不应用 WDA，让选择器在截图中可见也没关系（很快就会关掉）
    regionSelectorWindow.loadFile('src/renderer/region-selector.html');
    regionSelectorWindow.setAlwaysOnTop(true, 'screen-saver');
    regionSelectorWindow.setVisibleOnAllWorkspaces(true);
    regionSelectorWindow.setMenuBarVisibility(false);

    // 监听选区结果
    const onSelected = (_e: any, region: { x: number; y: number; width: number; height: number }) => {
      cleanup();
      resolve(region);
    };
    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const cleanup = () => {
      ipcMain.removeListener('region:selected', onSelected);
      ipcMain.removeListener('region:cancel', onCancel);
      if (regionSelectorWindow && !regionSelectorWindow.isDestroyed()) {
        regionSelectorWindow.close();
      }
      regionSelectorWindow = null;
      // 恢复覆盖层
      if (overlayWindow) {
        overlayWindow.showInactive();
        overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      }
    };

    ipcMain.once('region:selected', onSelected);
    ipcMain.once('region:cancel', onCancel);
  });
}

ipcMain.handle('ocr:screenshot', async () => {
  try {
    console.log('[OCR] Button triggered');
    return await showRegionSelectorAndOCR();
  } catch (err: any) {
    console.error('[OCR] Handler error:', err.message);
    return { success: false, error: err.message };
  }
});
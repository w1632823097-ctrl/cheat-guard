import { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer, session } from 'electron';
import * as path from 'path';
import { chat, chatStream, clearSession, setApiConfig, getHistory, getAvailableModels, setModel, addModel, testModel, listSessions, newSession, deleteSession, renameSession, cancelActiveStream } from './llm/llm-service';
import { setWindowInvisible, setNoActivateStyle, removeNoActivateStyle, isWDAvailable } from './native/wda-wrapper';
import { recognizeText, cleanupTempFiles, saveTempImage } from './ocr/ocr-service';
import { startLogCleanupTimer } from './utils/security';
import { initAutoUpdater } from './updater/auto-updater';
import * as fs from 'fs';
import * as os from 'os';

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
    height: 480,
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

  // 加载渲染进程页面
  // 优先尝试 Vite 开发服务器（热更新），否则使用构建产物
  const isDev = !app.isPackaged;
  if (isDev) {
    // 尝试连接 Vite 开发服务器
    const http = require('http');
    http.get('http://localhost:5173', (res: any) => {
      if (res.statusCode === 200) {
        overlayWindow?.loadURL('http://localhost:5173');
      } else {
        overlayWindow?.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
      }
    }).on('error', () => {
      console.warn('[Main] Vite dev server not running, falling back to built files');
      overlayWindow?.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
    });
  } else {
    overlayWindow.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
  }
  overlayWindow.setVisibleOnAllWorkspaces(true);
  overlayWindow.setMenuBarVisibility(false);

  overlayWindow.once('ready-to-show', () => {

    if (process.platform === 'win32' && isWDAvailable()) {
      let wdaInitialized = false;
      let lastWDAFailed = false;
      const applyWDA = () => {
        try {
          const hwnd = overlayWindow?.getNativeWindowHandle();
          if (hwnd) {
            const styleOk = setNoActivateStyle(hwnd);
            const invisibleOk = setWindowInvisible(hwnd);
            const success = styleOk && invisibleOk;

            if (!wdaInitialized) {
              if (success) {
                console.log('[WDA] Window set to screen-capture invisible');
                console.log('[WDA] WS_EX_NOACTIVATE style applied');
                wdaInitialized = true;
                lastWDAFailed = false;
              }
            } else if (!success && !lastWDAFailed) {
              console.warn('[WDA] Re-apply failed, will keep retrying');
              lastWDAFailed = true;
            } else if (success && lastWDAFailed) {
              console.log('[WDA] Re-apply succeeded');
              lastWDAFailed = false;
            }
          }
        } catch (err) {
          console.error('[WDA] Error applying WDA:', err);
        }
      };
      applyWDA();
      // 定期重新应用 WDA + alwaysOnTop，防止第三方录屏软件（如腾讯会议）
      // 接管屏幕捕获管线时改变 DWM 合成状态导致 flag 掉落和 z-order 被抢占
      setInterval(() => {
        applyWDA();
        overlayWindow?.setAlwaysOnTop(true, 'screen-saver');
      }, 3000);
    }

    overlayWindow?.showInactive();
    overlayWindow?.setTitle('');
    overlayWindow?.setSkipTaskbar(true);

    // 启动时自动展开窗口
    setTimeout(() => {
      overlayWindow?.webContents.send('auto-expand');
    }, 500);
  });

  overlayWindow.on('closed', () => { overlayWindow = null; });
}

// ============================================================
// OCR：选区 + 截屏 + OCR 核心函数（Tesseract.js 纯 Node.js 方案）
// ============================================================

/** 截图临时文件路径 */
const SCREENSHOT_DIR = path.join(os.tmpdir(), 'cheat-guard-screenshots');

/** 确保截图目录存在 */
function ensureScreenshotDir(): void {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

/** 生成带时间戳的截图路径 */
function getScreenshotPath(prefix: string): string {
  ensureScreenshotDir();
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return path.join(SCREENSHOT_DIR, `${prefix}_${timestamp}_${random}.png`);
}

/** 清理所有截图临时文件 */
function cleanupScreenshots(): void {
  try {
    if (fs.existsSync(SCREENSHOT_DIR)) {
      const files = fs.readdirSync(SCREENSHOT_DIR);
      for (const file of files) {
        if (file.endsWith('.png')) {
          try {
            fs.unlinkSync(path.join(SCREENSHOT_DIR, file));
          } catch {
            // 忽略删除失败
          }
        }
      }
      console.log('[OCR] Cleaned up', files.length, 'screenshot files');
    }
  } catch (err) {
    console.warn('[OCR] Screenshot cleanup failed:', err);
  }
}

/** 应用退出时清理所有临时文件 */
app.on('will-quit', () => {
  cleanupScreenshots();
  cleanupTempFiles();
});

async function showRegionSelectorAndOCR(): Promise<{ success: boolean; text?: string; error?: string }> {
  // 第1步：用户选区域
  const region = await showRegionSelector();
  if (!region) {
    return { success: true, text: '' };
  }

  console.log('[OCR] Region selected:', region);

  // 第2步：截屏（获取实际屏幕尺寸）
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.size;
  console.log('[OCR] Screen size:', screenWidth, 'x', screenHeight);

  // 使用更高分辨率获取截图
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: screenWidth * 2, height: screenHeight * 2 },
  });
  if (sources.length === 0) {
    return { success: false, error: 'No screen sources found' };
  }

  const fullImage = sources[0].thumbnail;
  if (!fullImage) {
    return { success: false, error: 'Failed to capture screen thumbnail' };
  }

  console.log('[OCR] Thumbnail size:', fullImage.getSize());

  // 保存完整截图到临时目录
  const fullPath = getScreenshotPath('full');
  fs.writeFileSync(fullPath, fullImage.toPNG());
  console.log('[OCR] Full screenshot saved:', fullPath);

  // 第3步：裁剪到选区
  const { nativeImage } = require('electron');
  const img = nativeImage.createFromBuffer(fullImage.toPNG());
  const imgSize = img.getSize();
  console.log('[OCR] Image actual size:', imgSize);

  // 计算缩放比例
  const scaleX = imgSize.width / screenWidth;
  const scaleY = imgSize.height / screenHeight;
  console.log('[OCR] Scale factors:', scaleX, 'x', scaleY);

  const scaledRegion = {
    x: Math.round(region.x * scaleX),
    y: Math.round(region.y * scaleY),
    width: Math.round(region.width * scaleX),
    height: Math.round(region.height * scaleY),
  };
  console.log('[OCR] Scaled region:', scaledRegion);

  const cropped = img.crop(scaledRegion);

  // 保存裁剪后的截图到临时目录
  const screenshotPath = getScreenshotPath('crop');
  fs.writeFileSync(screenshotPath, cropped.toPNG());
  const cropSize = fs.statSync(screenshotPath).size;
  console.log('[OCR] Cropped screenshot saved:', screenshotPath, 'size:', cropSize, 'bytes');

  // 检查截图是否为空
  if (cropSize < 100) {
    // 清理临时文件
    try { fs.unlinkSync(fullPath); } catch {}
    try { fs.unlinkSync(screenshotPath); } catch {}
    return { success: false, error: '截图内容为空，请检查选区是否正确' };
  }

  // 第4步：使用 Tesseract.js 进行 OCR
  try {
    const ocrText = await recognizeText(screenshotPath);
    console.log('[OCR] Recognized text length:', ocrText.length);

    // 清理截图临时文件
    try { fs.unlinkSync(fullPath); } catch {}
    try { fs.unlinkSync(screenshotPath); } catch {}

    if (ocrText.trim()) {
      // 异步发送给 LLM
      sendOCRToLLM(ocrText.trim());
      return { success: true, text: ocrText.trim() };
    } else {
      return { success: true, text: '(未识别到文字)' };
    }
  } catch (err) {
    const msg = getErrorMessage(err);
    console.error('[OCR] Tesseract recognition failed:', msg);
    // 清理临时文件
    try { fs.unlinkSync(fullPath); } catch {}
    try { fs.unlinkSync(screenshotPath); } catch {}
    return { success: false, error: `OCR 识别失败: ${msg}` };
  }
}

async function sendOCRToLLM(ocrText: string) {
  if (!overlayWindow) return;
  const prompt = `屏幕上显示的内容：\n---\n${ocrText}\n---\n\n请分析并给出帮助。`;
  try {
    await chatStream('default', prompt, (chunk: string) => {
      overlayWindow?.webContents.send('llm:chunk', chunk);
    });
    overlayWindow?.webContents.send('llm:done');
  } catch (err) {
    console.error('[LLM] OCR analysis failed:', getErrorMessage(err));
    overlayWindow?.webContents.send('llm:done');
  }
}

app.whenReady().then(async () => {
  // ---- Electron麦克风权限：允许来自 overlayWindow 的 media 请求 ----
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      if (permission === 'media') {
        callback(true);
      } else {
        callback(false);
      }
    },
  );
  // 同时处理已废弃的 media 权限检查回调 (兼容旧版 Electron)
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission) => {
      return permission === 'media';
    },
  );

  // 启动日志清理定时器（每天清理一次超过7天的日志）
  startLogCleanupTimer();

  createOverlayWindow();

  // 初始化自动更新
  if (overlayWindow) {
    initAutoUpdater(overlayWindow);
  }

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
    } catch (err) {
      console.error('[OCR] Shortcut failed:', getErrorMessage(err));
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
  if (!overlayWindow) return;
  if (process.platform === 'win32' && isWDAvailable()) {
    const hwnd = overlayWindow.getNativeWindowHandle();
    removeNoActivateStyle(hwnd);
  }
  overlayWindow.focus();
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

// 设置窗口高度：collapsed 时只显示 toolbar，expanded 时显示完整面板
ipcMain.on('set-overlay-height', (event, expanded: boolean) => {
  if (!overlayWindow) return;
  const currentBounds = overlayWindow.getBounds();
  if (expanded) {
    // 展开状态：完整高度（toolbar ~60px + chat-panel 400px + padding 20px + margin 4px）
    overlayWindow.setBounds({
      ...currentBounds,
      height: 500,
    });
  } else {
    // 收起状态：只保留 toolbar 区域（约 60px padding + toolbar）
    overlayWindow.setBounds({
      ...currentBounds,
      height: 80,
    });
  }
});

/** IPC 响应类型 */
interface IPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** 获取错误消息 */
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ============================================================
// 窗口焦点控制（解决 WS_EX_NOACTIVATE 导致输入框无法输入）
// ============================================================

ipcMain.handle('window:enable-focus', async () => {
  if (!overlayWindow) return;
  if (process.platform === 'win32' && isWDAvailable()) {
    const hwnd = overlayWindow.getNativeWindowHandle();
    removeNoActivateStyle(hwnd);
  }
  // 无论 koffi 是否可用，都需要 focus 窗口
  overlayWindow.focus();
});

ipcMain.handle('window:disable-focus', async () => {
  if (!overlayWindow) return;
  if (process.platform === 'win32' && isWDAvailable()) {
    const hwnd = overlayWindow.getNativeWindowHandle();
    setNoActivateStyle(hwnd);
  }
});

ipcMain.handle('llm:chat', async (_event, sessionId: string, message: string, systemPrompt?: string): Promise<IPCResponse<string>> => {
  try {
    const response = await chat(sessionId, message, systemPrompt);
    return { success: true, data: response };
  } catch (err) {
    const msg = getErrorMessage(err);
    console.error('[LLM] Chat error:', msg);
    return { success: false, error: msg };
  }
});

ipcMain.handle('llm:chat-stream', async (event, sessionId: string, message: string, systemPrompt?: string): Promise<IPCResponse<void>> => {
  const sender = event.sender;
  try {
    await chatStream(sessionId, message, (chunk: string) => {
      sender.send('llm:chunk', chunk);
    }, systemPrompt);
    sender.send('llm:done');
    return { success: true };
  } catch (err) {
    const msg = getErrorMessage(err);
    console.error('[LLM] Chat stream error:', msg);
    sender.send('llm:done');
    return { success: false, error: msg };
  }
});

ipcMain.on('llm:clear-session', (_event, sessionId: string) => {
  clearSession(sessionId).catch(err => console.error('[LLM] clearSession error:', err));
});

ipcMain.handle('llm:set-config', async (_event, config: { apiKey: string; baseURL?: string; model?: string }): Promise<IPCResponse<void>> => {
  try {
    setApiConfig(config);
    return { success: true };
  } catch (err) {
    return { success: false, error: getErrorMessage(err) };
  }
});

ipcMain.handle('llm:get-history', async (_event, sessionId: string): Promise<IPCResponse<unknown[]>> => {
  try {
    const history = await getHistory(sessionId);
    return { success: true, data: history };
  } catch (err) {
    return { success: false, error: getErrorMessage(err) };
  }
});

ipcMain.handle('llm:list-sessions', async (): Promise<IPCResponse<unknown[]>> => {
  try {
    const sessions = await listSessions();
    return { success: true, data: sessions };
  } catch (err) {
    return { success: false, error: getErrorMessage(err) };
  }
});

ipcMain.handle('llm:new-session', async (_event, title?: string): Promise<IPCResponse<unknown>> => {
  try {
    const session = await newSession(title);
    return { success: true, data: session };
  } catch (err) {
    return { success: false, error: getErrorMessage(err) };
  }
});

ipcMain.handle('llm:delete-session', async (_event, sessionId: string): Promise<IPCResponse<void>> => {
  try {
    await deleteSession(sessionId);
    return { success: true };
  } catch (err) {
    return { success: false, error: getErrorMessage(err) };
  }
});

ipcMain.handle('llm:rename-session', async (_event, sessionId: string, title: string): Promise<IPCResponse<void>> => {
  try {
    await renameSession(sessionId, title);
    return { success: true };
  } catch (err) {
    return { success: false, error: getErrorMessage(err) };
  }
});

ipcMain.handle('llm:get-current-session', async (): Promise<IPCResponse<string>> => {
  try {
    const { getCurrentSessionId } = await import('./llm/chat-store');
    const id = await getCurrentSessionId();
    return { success: true, data: id };
  } catch (err) {
    return { success: false, error: getErrorMessage(err) };
  }
});

ipcMain.handle('llm:get-models', async (): Promise<IPCResponse<unknown[]>> => {
  try {
    const models = getAvailableModels();
    return { success: true, data: models };
  } catch (err) {
    return { success: false, error: getErrorMessage(err) };
  }
});

ipcMain.handle('llm:set-model', async (_event, modelId: string): Promise<IPCResponse<void>> => {
  try {
    setModel(modelId);
    return { success: true };
  } catch (err) {
    return { success: false, error: getErrorMessage(err) };
  }
});

ipcMain.handle('llm:add-model', async (_event, modelInfo: { id: string; name: string; baseURL: string; apiKey?: string }): Promise<IPCResponse<void>> => {
  try {
    const result = addModel(modelInfo);
    return result;
  } catch (err) {
    return { success: false, error: getErrorMessage(err) };
  }
});

ipcMain.handle('llm:test-model', async (_event, modelInfo: { id: string; baseURL: string; apiKey: string }): Promise<IPCResponse<void>> => {
  try {
    const result = await testModel(modelInfo);
    return result;
  } catch (err) {
    return { success: false, error: getErrorMessage(err) };
  }
});

// 取消当前流式请求
ipcMain.on('llm:cancel-stream', () => {
  cancelActiveStream();
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
    const onSelected = (_e: Electron.IpcMainEvent, region: { x: number; y: number; width: number; height: number }) => {
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

    // 窗口关闭时自动清理
    regionSelectorWindow.on('closed', () => {
      regionSelectorWindow = null;
    });

    ipcMain.once('region:selected', onSelected);
    ipcMain.once('region:cancel', onCancel);
  });
}

ipcMain.handle('ocr:screenshot', async () => {
  try {
    console.log('[OCR] Button triggered');
    return await showRegionSelectorAndOCR();
  } catch (err) {
    const msg = getErrorMessage(err);
    console.error('[OCR] Handler error:', msg);
    return { success: false, error: msg };
  }
});
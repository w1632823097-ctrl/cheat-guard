import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';

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
    focusable: false,
    hasShadow: false,
    show: false,
    thickFrame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  overlayWindow.loadFile('src/renderer/overlay.html');
  overlayWindow.setVisibleOnAllWorkspaces(true);
  overlayWindow.setMenuBarVisibility(false);
  overlayWindow.setBackgroundColor('#00000000');

  // Windows: 阻止失去焦点时出现白色标题栏
  if (process.platform === 'win32') {
    // 空图标
    const { nativeImage } = require('electron');
    overlayWindow.setIcon(nativeImage.createEmpty());

    // 核心：拦截 WM_NCACTIVATE，阻止系统绘制非激活状态标题栏
    overlayWindow.hookWindowMessage(0x0086, (wParam) => {
      if (wParam.readInt32LE(0) === 0) return true;
      return undefined;
    });
  }

  overlayWindow.once('ready-to-show', () => {
    overlayWindow?.show();
    overlayWindow?.setTitle('');
    overlayWindow?.setSkipTaskbar(true);
  });

  overlayWindow.on('closed', () => { overlayWindow = null; });
}

app.whenReady().then(() => {
  createOverlayWindow();

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

ipcMain.on('start-drag', () => {
  if (!overlayWindow) return;
  
  const point = require('electron').screen.getCursorScreenPoint();
  const windowBounds = overlayWindow.getBounds();
  
  // 记录拖拽开始时的鼠标位置和窗口位置
  startMousePos = { x: point.x, y: point.y };
  startWindowPos = { x: windowBounds.x, y: windowBounds.y };
  lastMousePos = { x: point.x, y: point.y };
  
  if (dragInterval) clearInterval(dragInterval);
  dragInterval = setInterval(() => {
    if (overlayWindow) {
      const currentPoint = require('electron').screen.getCursorScreenPoint();
      // 检查鼠标是否真正移动了（阈值为1像素，过滤抖动）
      const moveX = Math.abs(currentPoint.x - lastMousePos.x);
      const moveY = Math.abs(currentPoint.y - lastMousePos.y);
      
      if (moveX >= 1 || moveY >= 1) {
        // 计算鼠标移动的距离，并应用到窗口位置
        const deltaX = currentPoint.x - startMousePos.x;
        const deltaY = currentPoint.y - startMousePos.y;
        overlayWindow.setPosition(
          Math.round(startWindowPos.x + deltaX),
          Math.round(startWindowPos.y + deltaY)
        );
        lastMousePos = { x: currentPoint.x, y: currentPoint.y };
      }
    }
  }, 16);
});

ipcMain.on('stop-drag', () => {
  if (dragInterval) {
    clearInterval(dragInterval);
    dragInterval = null;
  }
});

// 调节覆盖层窗口透明度
ipcMain.on('set-overlay-opacity', (event, value: number) => {
  if (overlayWindow) {
    overlayWindow.setOpacity(value);
  }
});

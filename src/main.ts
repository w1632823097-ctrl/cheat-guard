import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';

let overlayWindow: BrowserWindow | null = null;

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 400,
    height: 420,
    x: 100,
    y: 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    hasShadow: false,
    titleBarStyle: 'hidden',
    useContentSize: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  overlayWindow.loadFile('src/renderer/overlay.html');
  overlayWindow.setVisibleOnAllWorkspaces(true);

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

// 调节覆盖层窗口透明度
ipcMain.on('set-overlay-opacity', (event, value: number) => {
  if (overlayWindow) {
    overlayWindow.setOpacity(value);
  }
});

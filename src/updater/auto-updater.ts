import { autoUpdater } from 'electron-updater';
import { BrowserWindow, ipcMain } from 'electron';
import { app } from 'electron';

// 开发环境不触发自动更新
const isDev = !app.isPackaged;

export function initAutoUpdater(mainWindow: BrowserWindow) {
  if (isDev) {
    console.log('[Updater] 开发环境，跳过自动更新');
    return;
  }

  // 关闭自动下载，让用户手动确认
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // 检测到新版本
  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] 发现新版本:', info.version);
    mainWindow.webContents.send('updater:update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  // 已是最新版本
  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] 已是最新版本');
    mainWindow.webContents.send('updater:up-to-date');
  });

  // 下载进度
  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent);
    console.log(`[Updater] 下载进度: ${percent}%`);
    mainWindow.webContents.send('updater:download-progress', percent);
  });

  // 下载完成
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] 下载完成:', info.version);
    mainWindow.webContents.send('updater:update-downloaded', {
      version: info.version,
    });
  });

  // 更新出错
  autoUpdater.on('error', (err) => {
    console.error('[Updater] 更新失败:', err.message);
    mainWindow.webContents.send('updater:error', err.message);
  });

  // 渲染进程触发：手动检查更新
  ipcMain.on('updater:check', () => {
    console.log('[Updater] 手动检查更新');
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[Updater] 检查更新失败:', err.message);
    });
  });

  // 渲染进程触发：开始下载
  ipcMain.on('updater:download', () => {
    console.log('[Updater] 开始下载更新');
    autoUpdater.downloadUpdate().catch((err) => {
      console.error('[Updater] 下载失败:', err.message);
    });
  });

  // 渲染进程触发：立即安装重启
  ipcMain.on('updater:install', () => {
    console.log('[Updater] 安装并重启');
    autoUpdater.quitAndInstall();
  });

  // 启动后延迟 10 秒自动检查（不打扰用户启动）
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[Updater] 自动检查更新失败:', err.message);
    });
  }, 10000);
}

import { ipcMain, BrowserWindow } from 'electron';
import { transcribePcm, isWhisperAvailable } from './whisper-local';

let mainWindow: BrowserWindow | null = null;
let initialized = false;
let isRecording = false;
let audioBuffer: Buffer[] = [];
let pendingCount = 0;

export function initAudioCapture(window: BrowserWindow) {
  if (initialized) return;
  mainWindow = window;
  initialized = true;

  ipcMain.handle('audio:start-recording', async () => {
    if (!isWhisperAvailable()) {
      return { success: false, error: 'whisper-cli.exe or model not found' };
    }
    if (isRecording) {
      return { success: false, error: 'Already recording' };
    }
    
    isRecording = true;
    audioBuffer = [];
    pendingCount = 0;
    console.log('[Audio] Recording started');
    return { success: true };
  });

  // Receive raw PCM audio chunk from renderer
  ipcMain.on('audio:chunk', (_event, chunk: ArrayBuffer) => {
    if (!isRecording) return;
    
    audioBuffer.push(Buffer.from(chunk));
    
    // Process every ~2 seconds (16000 * 2 * 2 = 64000 bytes)
    // Don't start a new one while previous is still processing (max 1 concurrent)
    const totalSize = audioBuffer.reduce((sum, b) => sum + b.length, 0);
    const segmentSize = 64000;
    
    if (totalSize >= segmentSize && pendingCount === 0) {
      const pcmBuffer = Buffer.concat(audioBuffer);
      audioBuffer = [];
      pendingCount++;
      
      transcribePcm(pcmBuffer).then((text) => {
        pendingCount--;
        if (text && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('transcription-update', text);
          console.log(`[Audio] ${text}`);
        }
      }).catch((err) => {
        pendingCount--;
        // Swallow timeout errors for short audio
        if (err && err.killed) return;
        console.error('[Audio] Transcription error:', err.message || err);
      });
    }
  });

  ipcMain.handle('audio:stop-recording', async () => {
    isRecording = false;
    
    // Process remaining audio
    if (audioBuffer.length > 0) {
      const pcmBuffer = Buffer.concat(audioBuffer);
      audioBuffer = [];
      
      try {
        const text = await transcribePcm(pcmBuffer);
        if (text && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('transcription-update', text);
        }
      } catch (err: any) {
        if (err && err.killed) return;
        console.error('[Audio] Final error:', err.message || err);
      }
    }
    
    console.log('[Audio] Recording stopped');
    return { success: true };
  });

  ipcMain.handle('audio:check-whisper', async () => {
    return { available: isWhisperAvailable(), recording: isRecording };
  });
}

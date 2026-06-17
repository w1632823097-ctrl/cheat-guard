/**
 * 音频捕获 + 实时语音识别模块
 *
 * 架构：
 *   渲染进程 (Web Audio API) → PCM chunks → IPC → 主进程 → Qwen3ASRClient → DashScope
 *
 * 支持的模型：
 *   - qwen3-asr-flash-realtime (Qwen3-ASR-Flash, 推荐)
 *   - fun-asr-realtime (FunASR, 备选)
 */

import { ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { Qwen3ASRClient, ASRState, ASRConfig } from './asr-client';

// ============================================================
// 配置
// ============================================================
interface AudioModuleConfig {
  /** DashScope API Key (百炼) */
  apiKey: string;
  /** ASR 模型名称 */
  model: 'qwen3-asr-flash-realtime' | 'fun-asr-realtime';
  /** 识别语言 */
  language: string;
  /** 采样率 */
  sampleRate: number;
  /** VAD 静音检测阈值 [-1, 1] */
  vadThreshold: number;
  /** VAD 静音时长 (ms) */
  vadSilenceMs: number;
}

const DEFAULT_CONFIG: AudioModuleConfig = {
  apiKey: '',
  model: 'qwen3-asr-flash-realtime',
  language: 'zh',
  sampleRate: 16000,
  vadThreshold: 0.0,
  vadSilenceMs: 400,
};

let cachedConfig: AudioModuleConfig | null = null;

function loadAudioConfig(): AudioModuleConfig {
  if (cachedConfig) return cachedConfig;

  // ASR 只用自己的 key，不回退到 LLM 的 OPENAI_API_KEY
  const envApiKey = process.env.DASHSCOPE_API_KEY || '';

  // 与 llm-service 使用同一份 config.json
  const searchPaths = [
    path.join(process.cwd(), 'config.json'),
    path.join(__dirname, '..', '..', 'config.json'),
    path.join(__dirname, '..', 'config.json'),
  ];

  let configPath = '';
  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      configPath = p;
      break;
    }
  }

  if (configPath) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw);
      if (config.asr) {
        cachedConfig = {
          apiKey: envApiKey || config.asr.apiKey,
          model: config.asr.model || 'qwen3-asr-flash-realtime',
          language: config.asr.language || 'zh',
          sampleRate: config.asr.sampleRate || 16000,
          vadThreshold: config.asr.vadThreshold ?? 0.0,
          vadSilenceMs: config.asr.vadSilenceMs || 400,
        };
        return cachedConfig;
      }
      // fallback: ASR 配置不存在时用环境变量 + 默认值
      if (envApiKey) {
        cachedConfig = { ...DEFAULT_CONFIG, apiKey: envApiKey };
        return cachedConfig;
      }
    } catch (err) {
      console.warn('[Audio] Failed to parse config.json:', err);
    }
  }

  cachedConfig = { ...DEFAULT_CONFIG, apiKey: envApiKey };
  return cachedConfig;
}

// ============================================================
// 全局状态
// ============================================================
let mainWindow: BrowserWindow | null = null;
let asrClient: Qwen3ASRClient | null = null;
let isRecording = false;
let initialized = false;
let fullTranscript = '';

// ============================================================
// 初始化
// ============================================================
export function initAudioCapture(window: BrowserWindow) {
  if (initialized) return;
  mainWindow = window;
  initialized = true;

  // ---- audio:start-recording ----
  ipcMain.handle('audio:start-recording', async () => {
    try {
      const config = loadAudioConfig();

      if (!config.apiKey) {
        return {
          success: false,
          error: '未配置 API Key。请在 config.json 中设置 asr.apiKey 或设置环境变量 DASHSCOPE_API_KEY',
        };
      }

      if (asrClient) {
        asrClient.disconnect();
        asrClient = null;
      }
      fullTranscript = '';

      asrClient = new Qwen3ASRClient(
        config.apiKey,
        {
          onInterimResult: (text) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('transcription-interim', text);
            }
          },
          onFinalResult: (text) => {
            fullTranscript += text + '\n';
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('transcription-update', text);
              mainWindow.webContents.send('transcription-full', fullTranscript.trim());
            }
          },
          onSpeechStart: () => {
            console.log('[Audio] Speech detected');
          },
          onSpeechEnd: () => {
            console.log('[Audio] Speech ended');
          },
          onStateChange: (state, error) => {
            console.log(`[Audio] ASR state: ${state}${error ? ' - ' + error : ''}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('asr-state-change', state, error || '');
            }
          },
          onConnected: () => {
            console.log('[Audio] ASR connected');
            isRecording = true;
          },
          onDisconnected: (code, reason) => {
            console.log(`[Audio] ASR disconnected (${code}): ${reason}`);
            isRecording = false;
          },
        },
        undefined,
        {
          model: config.model,
          language: config.language,
          sample_rate: config.sampleRate,
          input_audio_format: 'pcm',
          vad_threshold: config.vadThreshold,
          vad_silence_duration_ms: config.vadSilenceMs,
        },
      );

      asrClient.connect();

      return { success: true, model: config.model, language: config.language };
    } catch (err: any) {
      console.error('[Audio] Start recording error:', err);
      return { success: false, error: err.message };
    }
  });

  // ---- audio:stop-recording ----
  ipcMain.handle('audio:stop-recording', async () => {
    try {
      if (asrClient) {
        asrClient.disconnect();
        asrClient = null;
      }
      isRecording = false;
      const transcript = fullTranscript;
      fullTranscript = '';
      return { success: true, transcript };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ---- audio:check-status ----
  ipcMain.handle('audio:check-status', async () => {
    return {
      recording: isRecording,
      state: asrClient?.getState() || 'idle',
      model: loadAudioConfig().model,
      transcript: fullTranscript,
    };
  });

  // ---- audio:chunk (来自渲染进程的 PCM 音频数据) ----
  ipcMain.on('audio:chunk', (_event, chunk: ArrayBuffer) => {
    if (asrClient && isRecording) {
      asrClient.sendAudio(Buffer.from(chunk));
    }
  });

  // ---- audio:set-config (运行时更新配置) ----
  ipcMain.handle('audio:set-config', async (_event, config: Partial<AudioModuleConfig>) => {
    cachedConfig = { ...loadAudioConfig(), ...config };
    return { success: true };
  });

  console.log('[Audio] Module initialized, model:', loadAudioConfig().model);
}

/**
 * 手动停止录音 (外部调用)
 */
export function stopRecording(): void {
  if (asrClient) {
    asrClient.disconnect();
    asrClient = null;
  }
  isRecording = false;
  fullTranscript = '';
}

/**
 * 获取当前 ASR 客户端 (用于高级控制)
 */
export function getASRClient(): Qwen3ASRClient | null {
  return asrClient;
}

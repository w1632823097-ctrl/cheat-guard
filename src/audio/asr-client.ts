/**
 * Qwen3-ASR-Flash 实时语音识别客户端
 * 通过 WebSocket 连接阿里云百炼 DashScope 服务
 */

import WebSocket from 'ws';

export type ASRState = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';

export interface ASRCallbacks {
  /** 实时中间结果 (非稳态) */
  onInterimResult?: (text: string) => void;
  /** 最终确认结果 (稳态) */
  onFinalResult?: (text: string) => void;
  /** 检测到语音开始 */
  onSpeechStart?: () => void;
  /** 检测到语音结束 */
  onSpeechEnd?: () => void;
  /** 连接状态变化 */
  onStateChange?: (state: ASRState, error?: string) => void;
  /** 连接已建立 */
  onConnected?: () => void;
  /** 连接关闭 */
  onDisconnected?: (code: number, reason: string) => void;
}

const DEFAULT_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime';

export class Qwen3ASRClient {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private wsUrl: string;
  private callbacks: ASRCallbacks;
  private state: ASRState = 'idle';
  private config: ASRConfig;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  constructor(
    apiKey: string,
    callbacks: ASRCallbacks = {},
    wsUrl?: string,
    config?: Partial<ASRConfig>,
  ) {
    this.apiKey = apiKey;
    this.wsUrl = wsUrl || DEFAULT_WS_URL;
    this.callbacks = callbacks;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 连接 WebSocket */
  connect(): void {
    if (this.state === 'connecting' || this.state === 'connected') return;

    this.setState('connecting');

    const fullUrl = `${this.wsUrl}?model=${this.config.model}`;

    this.ws = new WebSocket(fullUrl, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': 'cheat-guard/1.0',
      },
    });

    this.ws.on('open', () => this.onOpen());
    this.ws.on('message', (data) => this.onMessage(data));
    this.ws.on('error', (err) => this.onError(err));
    this.ws.on('close', (code, reason) => this.onClose(code, reason));
  }

  /** 发送音频数据 (PCM 16kHz 16bit 单声道) */
  sendAudio(data: ArrayBuffer | Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[ASR] Cannot send audio: WebSocket not open');
      return;
    }

    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    const base64 = buf.toString('base64');
    const message = JSON.stringify({
      event_id: this.genEventId(),
      type: 'input_audio_buffer.append',
      audio: base64,
    });
    this.ws.send(message);
  }

  /** 手动提交音频 (Manual 模式下使用) */
  commit(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      event_id: this.genEventId(),
      type: 'input_audio_buffer.commit',
    }));
  }

  /** 清空缓冲区 */
  clearBuffer(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      event_id: this.genEventId(),
      type: 'input_audio_buffer.clear',
    }));
  }

  /** 断开连接 */
  disconnect(): void {
    this.cancelReconnect();
    if (this.ws) {
      this.ws.close(1000, 'client disconnect');
      this.ws = null;
    }
    this.setState('closed');
  }

  /** 获取当前状态 */
  getState(): ASRState {
    return this.state;
  }

  /** 更新 API Key (用于运行时切换) */
  setApiKey(key: string): void {
    this.apiKey = key;
  }

  /** 更新配置 */
  updateConfig(config: Partial<ASRConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ----------- private -----------

  private setState(state: ASRState, error?: string): void {
    this.state = state;
    this.callbacks.onStateChange?.(state, error);
  }

  private onOpen(): void {
    this.setState('connected');
    this.reconnectAttempts = 0;
    this.callbacks.onConnected?.();

    // 发送 session.update 配置会话
    this.sendSessionUpdate();
  }

  private sendSessionUpdate(): void {
    if (!this.ws) return;

    const sessionConfig: Record<string, unknown> = {
      modalities: ['text'],
      input_audio_transcription: {},
    };

    if (this.config.language) {
      sessionConfig.input_audio_transcription = {
        ...(sessionConfig.input_audio_transcription as object),
        language: this.config.language,
      };
    }
    sessionConfig.input_audio_format = this.config.input_audio_format;
    sessionConfig.sample_rate = this.config.sample_rate;

    sessionConfig.turn_detection = {
      type: 'server_vad',
      threshold: this.config.vad_threshold ?? 0.0,
      prefix_padding_ms: 300,
      silence_duration_ms: this.config.vad_silence_duration_ms ?? 400,
    };

    this.ws.send(JSON.stringify({
      event_id: this.genEventId(),
      type: 'session.update',
      session: sessionConfig,
    }));
  }

  private onMessage(data: WebSocket.Data): void {
    try {
      const msg = JSON.parse(data.toString());
      const evtType: string = msg.type || '';

      switch (evtType) {
        case 'session.created':
          console.log('[ASR] Session created:', msg.session?.id);
          break;

        case 'input_audio_buffer.speech_started':
          console.log('[ASR] Speech detected');
          this.callbacks.onSpeechStart?.();
          break;

        case 'input_audio_buffer.speech_stopped':
          console.log('[ASR] Speech ended');
          this.callbacks.onSpeechEnd?.();
          break;

        case 'conversation.item.input_audio_transcription.text':
          // 实时中间结果
          this.callbacks.onInterimResult?.(msg.stash || '');
          break;

        case 'conversation.item.input_audio_transcription.completed':
          // 最终确认结果
          this.callbacks.onFinalResult?.(msg.transcript || '');
          break;

        case 'error':
          console.error('[ASR] Server error:', msg.error);
          this.callbacks.onStateChange?.('error', JSON.stringify(msg.error));
          break;

        default:
          // session.updated, response.* 等可忽略
          break;
      }
    } catch {
      // 非 JSON 消息忽略
    }
  }

  private onError(err: Error): void {
    console.error('[ASR] WebSocket error:', err.message);
    this.setState('error', err.message);
  }

  private onClose(code: number, reason: Buffer): void {
    console.log(`[ASR] Connection closed (code=${code}): ${reason.toString()}`);
    this.callbacks.onDisconnected?.(code, reason.toString());
    this.ws = null;

    if (this.state !== 'closed' && this.state !== 'error') {
      this.setState('error', `Closed with code ${code}`);
    }

    // 自动重连
    if (this.state !== 'closed' && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 8000);
    this.reconnectAttempts++;
    console.log(`[ASR] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private genEventId(): string {
    return 'evt_' + Math.random().toString(36).slice(2, 10);
  }
}

// ---- 类型定义 ----

export interface ASRConfig {
  model: string;
  language: string;
  sample_rate: number;
  input_audio_format: string;
  vad_threshold: number;
  vad_silence_duration_ms: number;
}

const DEFAULT_CONFIG: ASRConfig = {
  model: 'qwen3-asr-flash-realtime',
  language: 'zh',
  sample_rate: 16000,
  input_audio_format: 'pcm',  // Qwen3-ASR Realtime API 的有效值: pcm/wav/opus
  vad_threshold: 0.0,
  vad_silence_duration_ms: 400,
};

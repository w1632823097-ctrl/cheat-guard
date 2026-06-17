/**
 * 渲染进程端 音频捕获工具
 *
 * 使用 Web Audio API 从麦克风捕获音频，转换为 PCM Int16 后通过 IPC 发送到主进程。
 *
 * 用法：
 *   import { audioCapture } from './audio-capture-renderer';
 *
 *   await audioCapture.start();
 *   // 音频数据自动通过 electronAPI.audio.sendChunk() 发送
 *   await audioCapture.stop();
 */

// ---- 类型声明 (来自 preload 暴露的 API) ----
declare global {
  interface Window {
    electronAPI: {
      audio: {
        startRecording: () => Promise<{ success: boolean; error?: string; model?: string }>;
        stopRecording: () => Promise<{ success: boolean; transcript?: string }>;
        checkStatus: () => Promise<{ recording: boolean; state: string; model: string; transcript: string }>;
        sendChunk: (chunk: ArrayBuffer) => void;
        setConfig: (config: Record<string, unknown>) => Promise<{ success: boolean }>;
      };
    };
  }
}

class AudioCaptureRenderer {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private isCapturing = false;
  private sampleRate = 16000;

  /** 开始捕获麦克风音频 */
  async start(): Promise<void> {
    if (this.isCapturing) {
      console.warn('[AudioRenderer] Already capturing');
      return;
    }

    try {
      // 1. 获取麦克风权限
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: this.sampleRate,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // 2. 创建 AudioContext (降采样到 16kHz)
      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // 3. 创建 ScriptProcessor 处理 PCM 数据
      // bufferSize: 4096 → 每 ~128ms 触发一次 (16000 / 4096 * 1000 ≈ 256ms)
      // 减小到 2048 → ~64ms 触发一次，延迟更低
      const bufferSize = 2048;
      this.scriptNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      this.scriptNode.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!this.isCapturing) return;
        const inputBuffer = event.inputBuffer;
        const rawData = inputBuffer.getChannelData(0);

        // Float32 [-1, 1] → Int16
        const pcmData = new Int16Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) {
          const s = Math.max(-1, Math.min(1, rawData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        window.electronAPI.audio.sendChunk(pcmData.buffer);
      };

      this.sourceNode.connect(this.scriptNode);
      this.scriptNode.connect(this.audioContext.destination);

      this.isCapturing = true;
      console.log('[AudioRenderer] Capture started');
    } catch (err) {
      this.cleanup();
      throw err;
    }
  }

  /** 停止捕获 */
  stop(): void {
    if (!this.isCapturing) return;

    this.isCapturing = false;
    this.cleanup();
    console.log('[AudioRenderer] Capture stopped');
  }

  /** 是否正在捕获 */
  get active(): boolean {
    return this.isCapturing;
  }

  private cleanup(): void {
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
  }
}

export const audioCapture = new AudioCaptureRenderer();

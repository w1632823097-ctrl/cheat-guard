import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '../hooks/useAppState';

export default function ChatInput() {
  const {
    isLoading,
    setIsLoading,
    addMessage,
    updateLastMessage,
    currentSessionId,
    isRecording,
    setIsRecording,
    currentTranscription,
    setCurrentTranscription,
    availableModels,
    setAvailableModels,
    currentModelId,
    setCurrentModelId,
    isModelDropdownOpen,
    setIsModelDropdownOpen,
    editInputText,
    setEditInputText,
    regenerateText,
    setRegenerateText,
  } = useApp();

  const [inputText, setInputText] = useState('');
  const [isScreenshotLoading, setIsScreenshotLoading] = useState(false);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // 音频相关 refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isRecordingRef = useRef(false);

  // 保持 ref 与 state 同步
  isRecordingRef.current = isRecording;

  // 延迟辅助函数
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // 显示 toast 通知
  const showToast = useCallback((message: string, type: 'error' | 'warning' | 'info' = 'error') => {
    if (typeof (window as any).__chatPanelShowToast === 'function') {
      (window as any).__chatPanelShowToast(message, type);
    }
  }, []);

  // 带重试的 LLM 请求
  const sendLLMRequest = useCallback(async (text: string, maxRetries: number = 3): Promise<{ success: boolean; data?: string; error?: string }> => {
    let lastError: string | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (!window.electronAPI?.llm?.chatStream) {
          return { success: false, error: 'LLM 服务未就绪' };
        }
        const result = await window.electronAPI.llm.chatStream(currentSessionId, text);
        if (result.success) {
          return { success: true };
        }
        // 流式失败，尝试非流式 fallback
        if (window.electronAPI?.llm?.chat) {
          const fallback = await window.electronAPI.llm.chat(currentSessionId, text);
          if (fallback.success) {
            return { success: true, data: fallback.data as string };
          }
          lastError = fallback.error as string || '未知错误';
        } else {
          lastError = result.error as string || '未知错误';
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : '网络错误';
      }

      // 如果不是最后一次尝试，等待后重试
      if (attempt < maxRetries) {
        showToast(`请求失败，${2}秒后重试 (${attempt + 1}/${maxRetries})`, 'warning');
        await delay(2000);
      }
    }
    return { success: false, error: lastError || '请求失败' };
  }, [currentSessionId, showToast]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    addMessage({
      id: Date.now().toString(),
      role: 'user',
      text,
      timestamp: new Date(),
    });
    setInputText('');
    setIsLoading(true);

    try {
      const result = await sendLLMRequest(text);
      if (!result.success) {
        // 使用 toast 替代聊天中的错误消息
        showToast('请求失败: ' + (result.error || '未知错误'), 'error');
        setIsLoading(false);
      }
    } catch (err) {
      console.error('[Chat] Send error:', err);
      showToast('请求失败: ' + (err instanceof Error ? err.message : '网络错误'), 'error');
      setIsLoading(false);
    }
  }, [inputText, isLoading, addMessage, setIsLoading, sendLLMRequest, showToast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }

    // Esc: 清空输入框内容
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setInputText('');
    }
  };

  const log = useCallback((msg: string) => {
    console.log('[Audio/Renderer]', msg);
    window.electronAPI?.audio?.log(msg);
  }, []);

  // ============ 音频捕获公共逻辑 ============

  /** 清理所有音频资源 */
  const cleanupAudio = useCallback(() => {
    if (scriptNodeRef.current) { scriptNodeRef.current.disconnect(); scriptNodeRef.current = null; }
    if (sourceNodeRef.current) { sourceNodeRef.current.disconnect(); sourceNodeRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null; }
  }, []);

  /** 开启麦克风捕获，返回 true 表示成功 */
  const startAudioCapture = useCallback(async (): Promise<boolean> => {
    if (!window.electronAPI?.audio?.startRecording) {
      log('startRecording API not available');
      return false;
    }
    try {
      const result = await window.electronAPI.audio.startRecording();
      log('startRecording result: ' + JSON.stringify(result));
      if (!result.success) {
        log('startRecording FAILED: ' + (result.error || 'unknown'));
        return false;
      }
      // 获取麦克风
      log('Requesting mic permission...');
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: { ideal: 1 }, sampleRate: { ideal: 16000 }, echoCancellation: true, noiseSuppression: true }
      });
      log('Mic access granted');
      mediaStreamRef.current = mediaStream;
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      const sourceNode = audioContext.createMediaStreamSource(mediaStream);
      sourceNodeRef.current = sourceNode;
      const scriptNode = audioContext.createScriptProcessor(2048, 1, 1);
      scriptNodeRef.current = scriptNode;

      scriptNode.onaudioprocess = (event) => {
        if (!isRecordingRef.current) return;
        const rawData = event.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) {
          const s = Math.max(-1, Math.min(1, rawData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        window.electronAPI?.audio?.sendChunk(pcmData.buffer);
      };

      sourceNode.connect(scriptNode);
      scriptNode.connect(audioContext.destination);
      log('Microphone capture started OK');
      return true;
    } catch (err) {
      log('Mic access FAILED: ' + (err instanceof Error ? err.message : String(err)));
      return false;
    }
  }, [log]);

  /** 停止 ASR 并返回转录文字 */
  const stopAudioAndGetTranscript = useCallback(async (): Promise<string> => {
    if (window.electronAPI?.audio?.stopRecording) {
      try {
        const result = await window.electronAPI.audio.stopRecording();
        console.log('[Audio] Recording stopped:', result);
        if (result.success && result.transcript) {
          return result.transcript.trim();
        }
      } catch (err) {
        console.error('[Audio] Failed to stop recording:', err);
      }
    }
    return '';
  }, []);

  // ============ 录音（自己说话 → 自动发送 LLM）============

  const toggleRecording = useCallback(async () => {
    if (!isRecording) {
      isRecordingRef.current = true;
      setIsRecording(true);
      setCurrentTranscription('');
      log('Toggle: start dictation recording');
      const ok = await startAudioCapture();
      if (!ok) { setIsRecording(false); isRecordingRef.current = false; }
    } else {
      // 停止录音 → 获取转录 → 填入输入框
      isRecordingRef.current = false;
      setIsRecording(false);
      const transcript = await stopAudioAndGetTranscript();
      cleanupAudio();
      console.log('[Audio] Dictation stopped, transcript:', transcript);

      if (transcript) {
        setInputText(prev => prev ? prev + '\n' + transcript : transcript);
      }
    }
  }, [isRecording, setCurrentTranscription, log, startAudioCapture, stopAudioAndGetTranscript, cleanupAudio, setInputText]);

  // 加载模型列表
  useEffect(() => {
    const loadModels = async () => {
      if (!window.electronAPI?.llm?.getModels) return;
      try {
        const result = await window.electronAPI.llm.getModels();
        if (result.success && result.data && result.data.length > 0) {
          setAvailableModels(result.data as any[]);
          if (!currentModelId) {
            setCurrentModelId((result.data as any[])[0].id);
          }
        }
      } catch (err) {
        console.error('[Models] Failed to load:', err);
      }
    };
    loadModels();
  }, []);

  // 切换模型
  const switchModel = useCallback(async (modelId: string) => {
    if (!window.electronAPI?.llm?.setModel) return;
    try {
      const result = await window.electronAPI.llm.setModel(modelId);
      if (result.success) {
        setCurrentModelId(modelId);
      }
    } catch (err) {
      console.error('[Models] Switch failed:', err);
    }
    setIsModelDropdownOpen(false);
  }, [setCurrentModelId, setIsModelDropdownOpen]);

  // 点击外部关闭模型下拉
  useEffect(() => {
    if (!isModelDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isModelDropdownOpen, setIsModelDropdownOpen]);

  // 监听编辑：将消息文字填入输入框
  useEffect(() => {
    if (editInputText) {
      setInputText(editInputText);
      setEditInputText('');
      // 聚焦输入框
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 50);
    }
  }, [editInputText, setEditInputText]);

  // 监听重新生成：直接重新发送，不放输入框
  useEffect(() => {
    if (regenerateText) {
      const textToSend = regenerateText;
      setRegenerateText('');
      const timer = setTimeout(() => {
        if (!textToSend || isLoading) return;
        addMessage({
          id: Date.now().toString(),
          role: 'user',
          text: textToSend,
          timestamp: new Date(),
        });
        setIsLoading(true);
        sendLLMRequest(textToSend).then((result) => {
          if (!result.success) {
            showToast('请求失败: ' + (result.error || '未知错误'), 'error');
            setIsLoading(false);
          }
        }).catch((err) => {
          console.error('[Chat] Regenerate error:', err);
          showToast('请求失败: ' + (err instanceof Error ? err.message : '网络错误'), 'error');
          setIsLoading(false);
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [regenerateText, setRegenerateText]);

  const currentModel = availableModels.find((m: any) => m.id === currentModelId);

  // OCR 截图
  const handleScreenshot = useCallback(async () => {
    if (window.electronAPI?.ocr?.screenshot) {
      try {
        setIsScreenshotLoading(true);
        console.log('[OCR] Triggering screenshot...');
        const result = await window.electronAPI.ocr.screenshot();
        console.log('[OCR] Screenshot result:', result);

        if (result && result.success) {
          if (result.text) {
            addMessage({
              id: Date.now().toString(),
              role: 'user',
              text: '[截图识别] ' + result.text.substring(0, 200) + (result.text.length > 200 ? '...' : ''),
              timestamp: new Date(),
            });
          }
          // 如果 text 为空，说明用户取消了选区，不显示任何消息
        } else {
          addMessage({
            id: Date.now().toString(),
            role: 'system',
            text: '截图识别失败: ' + (result.error || '未知错误'),
            timestamp: new Date(),
          });
        }
        setIsScreenshotLoading(false);
      } catch (err) {
        console.error('[OCR] Screenshot failed:', err);
        addMessage({
          id: Date.now().toString(),
          role: 'system',
          text: '截图识别失败: ' + (err instanceof Error ? err.message : String(err)),
          timestamp: new Date(),
        });
        setIsScreenshotLoading(false);
      }
    }
  }, [addMessage]);

  return (
    <div id="chatInput" className="chat-input-area">
      <textarea
        ref={chatInputRef}
        id="chatTextarea"
        className="chat-input"
        placeholder={isRecording ? '正在录音...' : '输入问题...'}
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading || isRecording}
      />
      <div className="chat-input-buttons">
        <div className="chat-input-actions">
          {/* 模型选择器 */}
          <div className="model-selector" ref={modelDropdownRef}>
            <button
              className={`model-btn${currentModel ? ' active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setIsModelDropdownOpen(!isModelDropdownOpen);
              }}
              title={currentModel ? '当前模型: ' + currentModel.name : '切换模型'}
            >
              <span className="model-btn-text">
                {currentModel ? currentModel.name : '选择模型'}
              </span>
              <svg className="model-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
            {isModelDropdownOpen && (
              <div className={`model-dropdown open`}>
                {availableModels.map((model: any) => (
                  <button
                    key={model.id}
                    className={`model-dropdown-item ${model.id === currentModelId ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      switchModel(model.id);
                    }}
                  >
                    <span>{model.name}</span>
                    {model.id === currentModelId && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            id="screenshotBtn"
            className={`screenshot-btn ${isScreenshotLoading ? 'loading' : ''}`}
            onClick={handleScreenshot}
            title="截图识别"
            disabled={isRecording}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
          {/* 录音按钮 */}
          <button
            id="recordBtn"
            className={`record-btn ${isRecording ? 'recording' : ''}`}
            onClick={toggleRecording}
            title={isRecording ? '停止录音' : '开始录音'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
          <button
            id="sendBtn"
            className="send-btn"
            onClick={handleSend}
            disabled={isLoading || !inputText.trim() || isRecording}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

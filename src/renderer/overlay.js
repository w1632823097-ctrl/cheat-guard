let isExpanded = false;
let messages = [];
let isRecording = false;
let currentTranscription = '';

const toolbar = document.getElementById('toolbar');
const askBtn = document.getElementById('askBtn');
const askText = document.getElementById('askText');
const recordBtn = document.getElementById('recordBtn');
const closeBtn = document.getElementById('closeBtn');
const chatPanel = document.getElementById('chatPanel');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const messageList = document.getElementById('messageList');
const emptyChat = document.getElementById('emptyChat');
const msgCount = document.getElementById('msgCount');
const opacitySlider = document.getElementById('opacitySlider');
const opacityLabel = document.getElementById('opacityLabel');
const transcriptionArea = document.getElementById('transcriptionArea');
const transcriptionText = document.getElementById('transcriptionText');

// 透明度控制
opacitySlider.addEventListener('input', (e) => {
  const value = e.target.value;
  opacityLabel.textContent = value + '%';
  if (window.electronAPI) {
    window.electronAPI.send('set-overlay-opacity', parseInt(value) / 100);
  }
});

// Ask / Hide 切换
askBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  isExpanded = !isExpanded;
  if (isExpanded) {
    chatPanel.classList.add('expanded');
    askText.textContent = 'Hide';
    setTimeout(() => {
      chatInput.focus();
      if (window.electronAPI) {
        window.electronAPI.send('focus-input');
      }
    }, 350);
  } else {
    chatPanel.classList.remove('expanded');
    askText.textContent = 'Ask';
  }
});

let audioContext = null;
let scriptProcessor = null;
let mediaStream = null;
let chunkBuffer = new Int16Array(0);

// 录音按钮 - 实时转录
recordBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  
  if (!isRecording) {
    // 开始实时录音
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1,
        sampleRate: 16000,
      } });
      
      audioContext = new AudioContext({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(mediaStream);
      
      // ScriptProcessorNode: capture raw PCM samples
      scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
      
      scriptProcessor.onaudioprocess = (event) => {
        if (!isRecording) return;
        
        const inputData = event.inputBuffer.getChannelData(0);
        // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
        const int16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, Math.round(inputData[i] * 32767)));
        }
        
        // Append to buffer
        const newBuffer = new Int16Array(chunkBuffer.length + int16.length);
        newBuffer.set(chunkBuffer, 0);
        newBuffer.set(int16, chunkBuffer.length);
        chunkBuffer = newBuffer;
        
        // Send every ~2s (16000 * 2 = 32000 samples)
        if (chunkBuffer.length >= 32000) {
          const chunk = chunkBuffer.slice(0, 32000);
          chunkBuffer = chunkBuffer.slice(32000);
          
          if (window.electronAPI && window.electronAPI.audio) {
            window.electronAPI.audio.sendChunk(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
          }
        }
      };
      
      source.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);
      
      isRecording = true;
      recordBtn.classList.add('recording');
      currentTranscription = '';
      
      if (transcriptionArea) {
        transcriptionArea.style.display = 'flex';
      }
      if (transcriptionText) {
        transcriptionText.textContent = '正在实时转录...';
      }
      
      // Notify main process
      if (window.electronAPI && window.electronAPI.audio) {
        const result = await window.electronAPI.audio.startRecording();
        console.log('[Audio] Recording started:', result);
      }
    } catch (error) {
      console.error('[Audio] Failed to start recording:', error);
      if (transcriptionText) {
        transcriptionText.textContent = '无法访问麦克风：' + error.message;
      }
    }
  } else {
    // 停止实时录音
    isRecording = false;
    recordBtn.classList.remove('recording');
    
    // Send remaining buffer
    if (chunkBuffer.length > 0 && window.electronAPI && window.electronAPI.audio) {
      window.electronAPI.audio.sendChunk(chunkBuffer.buffer.slice(chunkBuffer.byteOffset, chunkBuffer.byteOffset + chunkBuffer.byteLength));
    }
    chunkBuffer = new Int16Array(0);
    
    if (scriptProcessor) {
      scriptProcessor.disconnect();
      scriptProcessor = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    
    if (transcriptionText) {
      transcriptionText.textContent = '转录已停止';
    }
    
    if (window.electronAPI && window.electronAPI.audio) {
      try {
        const result = await window.electronAPI.audio.stopRecording();
        console.log('[Audio] Recording stopped:', result);
      } catch (error) {
        console.error('[Audio] Failed to stop recording:', error);
      }
    }
  }
});

// 关闭应用
closeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (window.electronAPI) {
    window.electronAPI.send('quit-app');
  }
});

// 拖动功能
let isDragging = false;

toolbar.addEventListener('mousedown', (e) => {
  if (e.target.closest('.ask-btn') || e.target.closest('.close-btn') || e.target.closest('.record-btn')) return;
  isDragging = true;
  if (window.electronAPI) {
    window.electronAPI.send('start-drag');
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    if (window.electronAPI) {
      window.electronAPI.send('stop-drag');
    }
  }
});

// 发送消息
function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  messages.push({
    id: Date.now(),
    text: text,
    timestamp: new Date()
  });

  chatInput.value = '';
  updateMessages();
}

function updateMessages() {
  msgCount.textContent = `${messages.length} 条消息`;

  if (messages.length === 0) {
    emptyChat.style.display = 'block';
    messageList.style.display = 'none';
  } else {
    emptyChat.style.display = 'none';
    messageList.style.display = 'flex';
    messageList.innerHTML = messages.map(m => `
      <div class="message-item">
        <p class="msg-text">${m.text}</p>
        <div class="msg-meta">
          <span>${m.timestamp.toLocaleTimeString()}</span>
        </div>
      </div>
    `).join('');
  }
}

sendBtn.addEventListener('click', sendMessage);

chatInput.addEventListener('focus', () => {
  if (window.electronAPI) {
    window.electronAPI.send('focus-input');
  }
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// 接收实时转录更新
if (window.electronAPI && window.electronAPI.onTranscriptionUpdate) {
  window.electronAPI.onTranscriptionUpdate((text) => {
    console.log('[UI] Transcription update:', text);
    
    // 追加到当前转录文本
    currentTranscription += text + ' ';
    
    // 实时显示在转录区域
    if (transcriptionText) {
      transcriptionText.textContent = currentTranscription.trim();
    }
    
    // 滚动到最新内容
    if (transcriptionText) {
      transcriptionText.scrollTop = transcriptionText.scrollHeight;
    }
  });
}

// 接收主进程消息（兼容旧版）
if (window.electronAPI) {
  window.electronAPI.on('update-text', (text) => {
    messages.push({
      id: Date.now(),
      text: text,
      timestamp: new Date()
    });
    updateMessages();
  });
}

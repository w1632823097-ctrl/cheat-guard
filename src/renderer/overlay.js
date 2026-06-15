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

// 录音按钮 - 语音识别功能待后续开发
recordBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  
  if (!isRecording) {
    isRecording = true;
    recordBtn.classList.add('recording');
    currentTranscription = '';
    
    if (transcriptionArea) {
      transcriptionArea.style.display = 'flex';
    }
    if (transcriptionText) {
      transcriptionText.textContent = '语音识别功能开发中...';
    }
    
    // Notify main process
    if (window.electronAPI && window.electronAPI.audio) {
      const result = await window.electronAPI.audio.startRecording();
      console.log('[Audio] Recording started:', result);
    }
  } else {
    isRecording = false;
    recordBtn.classList.remove('recording');
    
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

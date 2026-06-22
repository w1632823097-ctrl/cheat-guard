let isExpanded = false;
let messages = [];
let isRecording = false;
let currentTranscription = '';
let isLoading = false;
let streamingMessageId = null;
let sessionId = 'default';

// 会话管理相关
let sessions = [];
let isSessionDropdownOpen = false;
let isLoadingHistory = false;

// 模型选择相关
let currentModelId = '';
let availableModels = [];
let isModelDropdownOpen = false;

// 音频捕获相关
let audioContext = null;
let mediaStream = null;
let scriptNode = null;
let sourceNode = null;

const toolbar = document.getElementById('toolbar');
const askBtn = document.getElementById('askBtn');
const askText = document.getElementById('askText');
const recordBtn = document.getElementById('recordBtn');
const screenshotBtn = document.getElementById('screenshotBtn');
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
const modelBtn = document.getElementById('modelBtn');
const modelDropdown = document.getElementById('modelDropdown');

// 会话管理 UI
const sessionSelector = document.getElementById('sessionSelector');
const sessionBtn = document.getElementById('sessionBtn');
const sessionBtnLabel = document.getElementById('sessionBtnLabel');
const sessionDropdown = document.getElementById('sessionDropdown');
const newSessionBtn = document.getElementById('newSessionBtn');

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
    if (window.electronAPI) {
      window.electronAPI.send('set-overlay-height', true);
    }
    setTimeout(() => {
      if (window.electronAPI) {
        window.electronAPI.send('focus-input');
      }
      setTimeout(() => {
        chatInput.focus();
      }, 50);
    }, 350);
  } else {
    chatPanel.classList.remove('expanded');
    askText.textContent = 'Ask';
    if (window.electronAPI) {
      window.electronAPI.send('blur-input');
      window.electronAPI.send('set-overlay-height', false);
    }
  }
});

// 录音按钮
recordBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  
  if (!isRecording) {
    isRecording = true;
    recordBtn.classList.add('recording');
    
    if (transcriptionArea) {
      transcriptionArea.style.display = 'flex';
    }
    
    if (window.electronAPI && window.electronAPI.audio) {
      const result = await window.electronAPI.audio.startRecording();
      console.log('[Audio] Recording started:', result);

      if (result.success) {
        currentTranscription = '';
        if (transcriptionText) transcriptionText.textContent = '';
        const indicator = transcriptionArea?.querySelector('.recording-indicator');
        const dot = transcriptionArea?.querySelector('.recording-dot');
        if (indicator) indicator.style.display = 'flex';
        if (dot) dot.style.display = 'block';

        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true }
          });
          audioContext = new AudioContext({ sampleRate: 16000 });
          sourceNode = audioContext.createMediaStreamSource(mediaStream);
          scriptNode = audioContext.createScriptProcessor(2048, 1, 1);

          scriptNode.onaudioprocess = (event) => {
            if (!isRecording) return;
            const rawData = event.inputBuffer.getChannelData(0);
            const pcmData = new Int16Array(rawData.length);
            for (let i = 0; i < rawData.length; i++) {
              const s = Math.max(-1, Math.min(1, rawData[i]));
              pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            window.electronAPI.audio.sendChunk(pcmData.buffer);
          };

          sourceNode.connect(scriptNode);
          scriptNode.connect(audioContext.destination);
          console.log('[Audio] Microphone capture started');
        } catch (err) {
          console.error('[Audio] Mic access denied:', err);
        }
      }
    }
  } else {
    isRecording = false;
    recordBtn.classList.remove('recording');

    const indicator = transcriptionArea?.querySelector('.recording-indicator');
    const dot = transcriptionArea?.querySelector('.recording-dot');
    if (indicator) indicator.style.display = 'none';
    if (dot) dot.style.display = 'none';
    if (transcriptionText) transcriptionText.textContent = '';
    // 隐藏整个转录区域
    if (transcriptionArea) transcriptionArea.style.display = 'none';

    if (window.electronAPI && window.electronAPI.audio) {
      try {
        const result = await window.electronAPI.audio.stopRecording();
        console.log('[Audio] Recording stopped:', result);

        if (result.success && result.transcript && result.transcript.trim()) {
          const transcript = result.transcript.trim();
          if (transcriptionText) transcriptionText.textContent = '';

          // 和文字输入一样：用户消息 + AI 回复
          addMessage('user', transcript);
          setLoading(true);

          try {
            const chatResult = await window.electronAPI.llm.chatStream(sessionId, transcript);
            if (!chatResult.success) {
              const fallbackResult = await window.electronAPI.llm.chat(sessionId, transcript);
              if (fallbackResult.success) {
                addMessage('assistant', fallbackResult.data);
              } else {
                addMessage('assistant', '请求失败: ' + (fallbackResult.error || '未知错误'), true);
              }
              setLoading(false);
            }
          } catch (err) {
            console.error('[Chat] Transcription send error:', err);
            setLoading(false);
          }
        }
      } catch (error) {
        console.error('[Audio] Failed to stop recording:', error);
      }
    }

    if (scriptNode) { scriptNode.disconnect(); scriptNode = null; }
    if (sourceNode) { sourceNode.disconnect(); sourceNode = null; }
    if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    console.log('[Audio] Microphone capture stopped');
  }
});

// 截图 OCR 按钮
screenshotBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  
  if (window.electronAPI && window.electronAPI.ocr) {
    try {
      screenshotBtn.classList.add('loading');
      console.log('[OCR] Triggering screenshot...');
      
      const result = await window.electronAPI.ocr.screenshot();
      console.log('[OCR] Screenshot result:', result);
      
      if (result && result.success && result.text) {
        // Show OCR text in chat
        addMessage('user', '[截图识别] ' + result.text.substring(0, 200) + (result.text.length > 200 ? '...' : ''));
      } else {
        addMessage('system', '截图识别失败: ' + (result.error || '未知错误'));
      }
      
      screenshotBtn.classList.remove('loading');
    } catch (err) {
      console.error('[OCR] Screenshot failed:', err);
      screenshotBtn.classList.remove('loading');
      addMessage('system', '截图识别失败: ' + err.message);
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

// ============ 模型选择 ============

async function loadModels() {
  if (!window.electronAPI || !window.electronAPI.llm || !window.electronAPI.llm.getModels) return;
  try {
    const result = await window.electronAPI.llm.getModels();
    if (result.success && result.data && result.data.length > 0) {
      availableModels = result.data;
      currentModelId = availableModels[0].id;
      renderModelSelector();
    }
  } catch (err) {
    console.error('[Models] Failed to load:', err);
  }
}

function renderModelSelector() {
  const current = availableModels.find(m => m.id === currentModelId);
  modelBtn.title = `切换模型 (当前: ${current ? current.name : currentModelId})`;
}

function buildDropdown() {
  if (!modelDropdown) return;
  modelDropdown.innerHTML = '';
  availableModels.forEach(model => {
    const item = document.createElement('button');
    item.className = 'model-dropdown-item';
    item.dataset.modelId = model.id;
    if (model.id === currentModelId) {
      item.classList.add('active');
      item.innerHTML = `
        <span>${model.name}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
        </svg>
      `;
    } else {
      item.innerHTML = `<span>${model.name}</span>`;
    }
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      switchModel(model.id);
    });
    modelDropdown.appendChild(item);
  });
}

async function switchModel(modelId) {
  if (!window.electronAPI || !window.electronAPI.llm || !window.electronAPI.llm.setModel) return;
  try {
    const result = await window.electronAPI.llm.setModel(modelId);
    if (result.success) {
      currentModelId = modelId;
      renderModelSelector();
      buildDropdown();
    }
  } catch (err) {
    console.error('[Models] Switch failed:', err);
  }
  closeModelDropdown();
}

function openModelDropdown() {
  if (isModelDropdownOpen) {
    closeModelDropdown();
    return;
  }
  buildDropdown();
  modelDropdown.classList.add('open');
  modelBtn.classList.add('active');
  isModelDropdownOpen = true;
}

function closeModelDropdown() {
  modelDropdown.classList.remove('open');
  modelBtn.classList.remove('active');
  isModelDropdownOpen = false;
}

// 模型按钮点击
if (modelBtn) {
  modelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openModelDropdown();
  });
}

// 点击外部关闭下拉
document.addEventListener('click', (e) => {
  if (isModelDropdownOpen && !modelBtn.contains(e.target) && !modelDropdown.contains(e.target)) {
    closeModelDropdown();
  }
});

// 初始化加载模型列表
loadModels();

// ============ 会话管理（持久化记忆） ============

async function loadSessions() {
  if (!window.electronAPI || !window.electronAPI.llm) return;
  try {
    const result = await window.electronAPI.llm.listSessions();
    if (result.success) {
      sessions = result.data;
      try {
        const curId = await window.electronAPI.llm.getCurrentSession();
        if (curId.success && curId.data) {
          sessionId = curId.data;
        }
      } catch (e) { /* 使用默认 */ }
      updateSessionUI();
      await loadSessionHistory(sessionId);
    }
  } catch (err) {
    console.error('[Sessions] Failed to load:', err);
  }
}

function updateSessionUI() {
  const current = sessions.find(s => s.id === sessionId) || { title: '新对话' };
  if (sessionBtnLabel) sessionBtnLabel.textContent = current.title;
}

function buildSessionDropdown() {
  if (!sessionDropdown) return;
  sessionDropdown.innerHTML = '';
  sessions.forEach(s => {
    const item = document.createElement('button');
    item.className = 'session-dropdown-item';
    item.dataset.sessionId = s.id;
    if (s.id === sessionId) {
      item.classList.add('active');
    }
    const msgCount = s.messageCount || 0;
    item.innerHTML = `
      <span>${escapeHtml(s.title)}</span>
      <span class="session-msg-count">${msgCount} 条</span>
    `;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      switchSession(s.id);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'session-delete-btn';
    delBtn.title = '删除会话';
    delBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteSessionById(s.id);
    });
    item.appendChild(delBtn);

    sessionDropdown.appendChild(item);
  });
}

async function switchSession(id) {
  if (id === sessionId || isLoadingHistory) return;
  isLoadingHistory = true;
  closeSessionDropdown();

  sessionId = id;
  messages = [];
  messageList.innerHTML = '';
  streamingMessageId = null;
  setLoading(false);

  await loadSessionHistory(id);
  updateSessionUI();
  refreshChatMeta();
  isLoadingHistory = false;
}

async function loadSessionHistory(id) {
  if (!window.electronAPI || !window.electronAPI.llm) return;
  try {
    const result = await window.electronAPI.llm.getHistory(id);
    if (result.success && Array.isArray(result.data)) {
      messages = result.data
        .filter(m => m.role !== 'system')
        .map(m => ({
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          role: m.role,
          text: m.content,
          isError: false,
          timestamp: new Date(),
        }));
      messageList.innerHTML = '';
      messages.forEach(m => {
        const el = buildMessageEl(m);
        messageList.appendChild(el);
        bindCopyBtn(el);
      });
      scrollToBottom();
      refreshChatMeta();
    }
  } catch (err) {
    console.error('[Sessions] Failed to load history:', err);
  }
}

async function addNewSession() {
  if (!window.electronAPI || !window.electronAPI.llm) return;
  try {
    const result = await window.electronAPI.llm.newSession();
    if (result.success) {
      await loadSessions();
      await switchSession(result.data.id);
    }
  } catch (err) {
    console.error('[Sessions] Failed to create:', err);
  }
}

async function deleteSessionById(id) {
  if (sessions.length <= 1) return;
  if (!window.electronAPI || !window.electronAPI.llm) return;
  try {
    const result = await window.electronAPI.llm.deleteSession(id);
    if (result.success) {
      await loadSessions();
      if (sessionId === id && sessions.length > 0) {
        await switchSession(sessions[0].id);
      }
    }
  } catch (err) {
    console.error('[Sessions] Failed to delete:', err);
  }
}

function openSessionDropdown() {
  if (isSessionDropdownOpen) {
    closeSessionDropdown();
    return;
  }
  buildSessionDropdown();
  sessionDropdown.classList.add('open');
  sessionBtn.classList.add('active');
  isSessionDropdownOpen = true;
}

function closeSessionDropdown() {
  sessionDropdown.classList.remove('open');
  sessionBtn.classList.remove('active');
  isSessionDropdownOpen = false;
}

if (sessionBtn) {
  sessionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openSessionDropdown();
  });
}

if (newSessionBtn) {
  newSessionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    addNewSession();
  });
}

document.addEventListener('click', (e) => {
  if (isSessionDropdownOpen && !sessionSelector?.contains(e.target)) {
    closeSessionDropdown();
  }
});

loadSessions();

// ============ LLM Chat ============

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

// ============ LLM Chat ============

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMessageContent(text) {
  let html = escapeHtml(text);

  // 代码块（```...```）— 使用 highlight.js 语法高亮
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const trimmed = code.trim();
    let highlighted;
    try {
      if (typeof hljs !== 'undefined') {
        if (lang && hljs.getLanguage(lang)) {
          highlighted = hljs.highlight(trimmed, { language: lang }).value;
        } else {
          highlighted = hljs.highlightAuto(trimmed).value;
        }
      } else {
        highlighted = escapeHtml(trimmed);
      }
    } catch (e) {
      highlighted = escapeHtml(trimmed);
    }
    const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : '';
    return `<div class="code-block-wrapper">${label}<button class="code-copy-btn" onclick="copyCodeBlock(this)" title="复制代码"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button><pre class="code-block"><code class="hljs">${highlighted}</code></pre></div>`;
  });

  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  html = html.replace(/^### (.+)$/gm, '<h4 class="md-heading md-h4">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="md-heading md-h3">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="md-heading md-h2">$1</h2>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="md-link" href="$2" target="_blank">$1</a>');
  html = html.replace(/^(---|\*\*\*)$/gm, '<hr class="md-hr">');
  html = html.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-li">$1</li>');
  html = html.replace(/((?:<li class="md-li">.*?<\/li>\n?)+)/g, '<ul class="md-list">$1</ul>');
  html = html.replace(/^> (.+)$/gm, '<blockquote class="md-blockquote"><p>$1</p></blockquote>');
  html = html.replace(/<\/blockquote>\n<blockquote class="md-blockquote">/g, '\n');
  html = html.replace(/\n/g, '<br>');

  return html;
}

// 复制代码块
function copyCodeBlock(btn) {
  const wrapper = btn.closest('.code-block-wrapper');
  const code = wrapper?.querySelector('code');
  if (!code) return;
  const text = code.textContent || '';
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    btn.title = '已复制';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.title = '复制代码';
    }, 2000);
  }).catch(() => {});
}

// 发送消息到 LLM（用户输入，显示用户消息）
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isLoading) return;

  if (!window.electronAPI || !window.electronAPI.llm) {
    addMessage('user', text);
    addMessage('assistant', 'LLM 服务未就绪。');
    chatInput.value = '';
    return;
  }

  addMessage('user', text);
  chatInput.value = '';
  setLoading(true);

  try {
    const result = await window.electronAPI.llm.chatStream(sessionId, text);
    if (!result.success) {
      console.warn('[Chat] Stream failed, falling back to non-stream. Error:', result.error);
      const fallbackResult = await window.electronAPI.llm.chat(sessionId, text);
      if (fallbackResult.success) {
        addMessage('assistant', fallbackResult.data);
      } else {
        addMessage('assistant', '请求失败: ' + (fallbackResult.error || '未知错误'), true);
      }
      setLoading(false);
    }
  } catch (err) {
    console.error('[Chat] Send error:', err);
    finishStreaming('请求失败: ' + (err.message || '网络错误'));
  }
}

// 发送转录文本到 LLM（不显示用户消息，只显示 AI 回复）
async function sendTranscription(text) {
  if (!text || isLoading) return;
  if (!window.electronAPI || !window.electronAPI.llm) {
    addMessage('assistant', 'LLM 服务未就绪。', true);
    return;
  }

  setLoading(true);

  try {
    const result = await window.electronAPI.llm.chatStream(sessionId, text);
    if (!result.success) {
      const fallbackResult = await window.electronAPI.llm.chat(sessionId, text);
      if (fallbackResult.success) {
        addMessage('assistant', fallbackResult.data);
      } else {
        addMessage('assistant', '请求失败: ' + (fallbackResult.error || '未知错误'), true);
      }
      setLoading(false);
    }
  } catch (err) {
    console.error('[Chat] Transcription send error:', err);
    setLoading(false);
  }
}

function addMessage(role, text, isError = false) {
  const msg = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    role: role,
    text: text,
    isError: isError,
    timestamp: new Date()
  };
  messages.push(msg);

  const el = buildMessageEl(msg);
  messageList.appendChild(el);
  bindCopyBtn(el);
  refreshChatMeta();
  scrollToBottom();
  return msg;
}

function setLoading(loading) {
  isLoading = loading;
  sendBtn.disabled = loading;
  chatInput.disabled = loading;
  if (loading) {
    sendBtn.classList.add('loading');
  } else {
    sendBtn.classList.remove('loading');
  }
}

function finishStreaming(errorText) {
  if (streamingMessageId) {
    const msg = messages.find(m => m.id === streamingMessageId);
    if (msg) {
      if (errorText) {
        msg.text = errorText;
        msg.isError = true;
      }
      msg.isStreaming = false;

      const el = messageList.querySelector(`.message-row[data-id="${msg.id}"]`);
      if (el) {
        const newEl = buildMessageEl(msg);
        el.replaceWith(newEl);
        bindCopyBtn(newEl);
      }
    }
    streamingMessageId = null;
  }
  setLoading(false);
}

// SVG 头像
const USER_AVATAR = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="rgba(99,102,241,0.25)"/><circle cx="16" cy="12" r="5" fill="rgba(99,102,241,0.6)"/><ellipse cx="16" cy="27" rx="9" ry="7" fill="rgba(99,102,241,0.35)"/></svg>`;
const AI_AVATAR = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="rgba(34,197,94,0.2)"/><rect x="10" y="10" width="12" height="12" rx="3" fill="rgba(34,197,94,0.5)"/><line x1="16" y1="13" x2="16" y2="19" stroke="rgba(0,0,0,0.3)" stroke-width="1.5" stroke-linecap="round"/><line x1="13" y1="16" x2="19" y2="16" stroke="rgba(0,0,0,0.3)" stroke-width="1.5" stroke-linecap="round"/></svg>`;

function buildMessageEl(m) {
  const isUser = m.role === 'user';
  const isStreaming = m.isStreaming;
  const isError = m.isError;
  const streamClass = isStreaming ? 'streaming' : '';
  const errorClass = isError ? 'error' : '';
  const content = renderMessageContent(m.text);
  const cursor = isStreaming ? '<span class="streaming-cursor"></span>' : '';

  const el = document.createElement('div');
  el.className = `message-row ${isUser ? 'user' : 'assistant'} ${streamClass} ${errorClass}`;
  el.dataset.id = m.id;

  const avatar = isUser ? USER_AVATAR : AI_AVATAR;

  if (isUser) {
    el.innerHTML = `
      <div class="msg-body">
        <div class="msg-bubble">${content}${cursor}</div>
        <div class="msg-time">${m.timestamp.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <div class="msg-avatar">${avatar}</div>
    `;
  } else {
    el.innerHTML = `
      <div class="msg-avatar">${avatar}</div>
      <div class="msg-body">
        <div class="msg-bubble">${content}${cursor}</div>
        <div class="msg-time">${m.timestamp.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
      </div>
    `;
  }

  if (!isUser && !isStreaming) {
    const body = el.querySelector('.msg-body');
    const btn = document.createElement('button');
    btn.className = 'msg-copy-btn';
    btn.dataset.id = m.id;
    btn.title = '复制';
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    body.appendChild(btn);
  }

  return el;
}

function bindCopyBtn(el) {
  const btn = el.querySelector('.msg-copy-btn');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = btn.dataset.id;
    const msg = messages.find(m => m.id === id);
    if (msg) {
      navigator.clipboard.writeText(msg.text).then(() => {
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1500);
      });
    }
  });
}

function refreshChatMeta() {
  const totalMessages = messages.filter(m => m.role !== 'system').length;
  msgCount.textContent = `${totalMessages} 条消息`;
  if (messages.length === 0) {
    emptyChat.style.display = 'flex';
    messageList.style.display = 'none';
  } else {
    emptyChat.style.display = 'none';
    messageList.style.display = 'flex';
  }
}

function scrollToBottom(smooth = false) {
  requestAnimationFrame(() => {
    const items = messageList.querySelectorAll('.message-row');
    if (items.length > 0) {
      items[items.length - 1].scrollIntoView({ behavior: smooth ? 'smooth' : 'instant', block: 'end' });
    }
  });
}

// ============ Event Listeners ============

sendBtn.addEventListener('click', sendMessage);

chatInput.addEventListener('focus', () => {
  if (window.electronAPI) {
    window.electronAPI.send('focus-input');
  }
});

chatInput.addEventListener('blur', () => {
  if (window.electronAPI && !isExpanded) {
    window.electronAPI.send('blur-input');
  }
});

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ============ LLM Streaming Events ============

if (window.electronAPI && window.electronAPI.onLLMChunk) {
  window.electronAPI.onLLMChunk((chunk) => {
    if (!streamingMessageId) {
      const msg = addMessage('assistant', chunk);
      msg.isStreaming = true;
      streamingMessageId = msg.id;
    } else {
      const msg = messages.find(m => m.id === streamingMessageId);
      if (msg) {
        msg.text += chunk;
        const el = messageList.querySelector(`.message-row[data-id="${msg.id}"] .msg-bubble`);
        if (el) {
          el.innerHTML = renderMessageContent(msg.text) + '<span class="streaming-cursor"></span>';
        }
        scrollToBottom();
      }
    }
  });
}

if (window.electronAPI && window.electronAPI.onLLMDone) {
  window.electronAPI.onLLMDone(() => {
    finishStreaming(null);
  });
}

// 接收实时转录更新
if (window.electronAPI && window.electronAPI.onTranscriptionUpdate) {
  window.electronAPI.onTranscriptionUpdate((text) => {
    console.log('[UI] Transcription update:', text);
    currentTranscription += text + ' ';
    if (transcriptionText) {
      transcriptionText.textContent = currentTranscription.trim();
    }
    if (transcriptionText) {
      transcriptionText.scrollTop = transcriptionText.scrollHeight;
    }
  });
}

// 接收主进程消息
if (window.electronAPI) {
  window.electronAPI.on('update-text', (text) => {
    addMessage('assistant', text);
  });
}

// 接收 OCR 结果
if (window.electronAPI && window.electronAPI.onOCRResult) {
  window.electronAPI.onOCRResult((text) => {
    console.log('[UI] OCR result received:', text.substring(0, 100) + '...');
    
    // Show OCR text as user message (screenshot content)
    if (text && text.trim()) {
      addMessage('user', '[截图内容] ' + text.substring(0, 200) + (text.length > 200 ? '...' : ''));
    }
  });
}

let isExpanded = false;
let messages = [];
let isRecording = false;
let currentTranscription = '';
let isLoading = false;
let streamingMessageId = null;
const sessionId = 'default';

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

// 录音按钮
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

// ============ LLM Chat ============

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMessageContent(text) {
  let html = escapeHtml(text);

  // 先处理代码块 ```，避免内部语法被后续规则干扰
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const label = lang ? `<span class="code-lang">${lang}</span>` : '';
    return `<pre class="code-block">${label}<code>${code.trim()}</code></pre>`;
  });

  // 行内代码 `
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // 标题 ### / ## / #
  html = html.replace(/^### (.+)$/gm, '<h4 class="md-heading md-h4">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="md-heading md-h3">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="md-heading md-h2">$1</h2>');

  // 粗体 **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 斜体 *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 链接 [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="md-link" href="$2" target="_blank">$1</a>');

  // 分隔线 --- / ***
  html = html.replace(/^(---|\*\*\*)$/gm, '<hr class="md-hr">');

  // 无序列表 - item
  html = html.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>');
  // 有序列表 1. item
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-li">$1</li>');
  // 将连续的 <li> 包在 <ul> 中
  html = html.replace(/((?:<li class="md-li">.*?<\/li>\n?)+)/g, '<ul class="md-list">$1</ul>');

  // 引用块 >
  html = html.replace(/^> (.+)$/gm, '<blockquote class="md-blockquote"><p>$1</p></blockquote>');
  // 合并连续的 blockquote
  html = html.replace(/<\/blockquote>\n<blockquote class="md-blockquote">/g, '\n');

  // 剩余换行
  html = html.replace(/\n/g, '<br>');

  return html;
}

// 发送消息到 LLM
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
    // 优先尝试流式
    const result = await window.electronAPI.llm.chatStream(sessionId, text);
    if (!result.success) {
      // 流式失败，回退到非流式
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

      // 只更新这一条消息的 DOM
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
    // 用户消息：气泡在右，头像在右
    el.innerHTML = `
      <div class="msg-body">
        <div class="msg-bubble">${content}${cursor}</div>
        <div class="msg-time">${m.timestamp.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <div class="msg-avatar">${avatar}</div>
    `;
  } else {
    // AI 消息：头像在左，气泡在左
    el.innerHTML = `
      <div class="msg-avatar">${avatar}</div>
      <div class="msg-body">
        <div class="msg-bubble">${content}${cursor}</div>
        <div class="msg-time">${m.timestamp.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
      </div>
    `;
  }

  // 复制按钮（仅 AI 非流式消息）
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

// 绑定单条消息的复制按钮
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

// 只更新消息列表元数据（条数、空状态），不重建 DOM
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
      // 第一条 chunk 到达，创建流式消息
      const msg = addMessage('assistant', chunk);
      msg.isStreaming = true;
      streamingMessageId = msg.id;
    } else {
      // 追加到现有流式消息 — 只更新这一条 DOM 的文本，不重建整个列表
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

// 接收主进程消息（兼容旧版：直接推送文本到聊天）
if (window.electronAPI) {
  window.electronAPI.on('update-text', (text) => {
    addMessage('assistant', text);
  });
}

import React, { useRef, useEffect, useState } from 'react';
import { useApp } from '../hooks/useAppState';

declare const hljs: any;

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMessageContent(text: string): string {
  let html = escapeHtml(text);

  // 使用占位符保护代码块，避免后续正则误处理
  const codeBlocks: string[] = [];
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
    const blockHtml = `<div class="code-block-wrapper">${label}<button class="code-copy-btn" onclick="copyCodeBlock(this)" title="复制代码"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button><pre class="code-block"><code class="hljs">${highlighted}</code></pre></div>`;
    codeBlocks.push(blockHtml);
    return `\x00CODEBLOCK_${codeBlocks.length - 1}\x00`;
  });

  // 表格：匹配 Markdown 表格语法
  // 格式：| col1 | col2 |
  //       |------|------|
  //       | data | data |
  html = html.replace(/((?:^\|[^\n]*\|\n?)+)/gm, (match) => {
    const lines = match.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) return match;

    // 检查第二行是否为分隔行（包含 --- 或 ===）
    const separatorLine = lines[1];
    const isSeparator = /^\|?[\s]*:?[\-]+[\s]*:?[\|]?/.test(separatorLine);
    if (!isSeparator) return match;

    let tableHtml = '<table class="md-table">';

    // 表头
    const headerCells = lines[0].split('|').filter(cell => cell !== '');
    tableHtml += '<thead><tr>';
    headerCells.forEach(cell => {
      tableHtml += `<th>${escapeHtml(cell.trim())}</th>`;
    });
    tableHtml += '</tr></thead>';

    // 表体
    if (lines.length > 2) {
      tableHtml += '<tbody>';
      for (let i = 2; i < lines.length; i++) {
        const rowCells = lines[i].split('|').filter(cell => cell !== '');
        if (rowCells.length === 0) continue;
        tableHtml += '<tr>';
        rowCells.forEach(cell => {
          tableHtml += `<td>${escapeHtml(cell.trim())}</td>`;
        });
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody>';
    }

    tableHtml += '</table>';
    return tableHtml;
  });

  // 行内代码（排除已保护的代码块）
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h4 class="md-heading md-h4">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="md-heading md-h3">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="md-heading md-h2">$1</h2>');

  // 粗体和斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 链接（确保 href 安全，只允许 http/https/mailto）
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, linkText, href) => {
    const safeHref = escapeHtml(href);
    const isSafe = /^(https?:\/\/|mailto:)/i.test(href);
    const finalHref = isSafe ? safeHref : '#';
    return `<a class="md-link" href="${finalHref}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
  });

  // 分隔线
  html = html.replace(/^(---|\*\*\*)$/gm, '<hr class="md-hr">');

  // 列表项
  html = html.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-li">$1</li>');
  html = html.replace(/((?:<li class="md-li">.*?<\/li>\n?)+)/g, '<ul class="md-list">$1</ul>');

  // 引用块
  html = html.replace(/^> (.+)$/gm, '<blockquote class="md-blockquote"><p>$1</p></blockquote>');
  html = html.replace(/<\/blockquote>\n<blockquote class="md-blockquote">/g, '\n');

  // 换行
  html = html.replace(/\n/g, '<br>');

  // 恢复代码块占位符
  codeBlocks.forEach((block, index) => {
    html = html.replace(`\x00CODEBLOCK_${index}\x00`, block);
  });

  return html;
}

// 复制代码块
function copyCodeBlock(btn: HTMLElement) {
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

// 暴露到全局，供 HTML onclick 使用
(window as any).copyCodeBlock = copyCodeBlock;

// 判断是否需要显示时间（每3分钟显示一次）
function shouldShowTime(currentMsg: any, prevMsg: any): boolean {
  if (!prevMsg) return true; // 第一条消息显示时间
  const diff = currentMsg.timestamp.getTime() - prevMsg.timestamp.getTime();
  return diff >= 3 * 60 * 1000; // 3分钟 = 180000毫秒
}

// 格式化时间
function formatTime(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  
  if (isToday) {
    return timeStr;
  }
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return '昨天 ' + timeStr;
  }
  
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' ' + timeStr;
}

export default function MessageList() {
  const { messages, isLoading, editMessage, regenerateMessage } = useApp();
  const messageListRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  // 复制消息
  const copyMessage = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // 可以添加复制成功的提示
    }).catch(() => {});
  };

  // 开始编辑
  const startEdit = (msg: { id: string; text: string }) => {
    setEditingId(msg.id);
    setEditText(msg.text);
  };

  // 取消编辑
  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  // 保存编辑
  const saveEdit = (id: string) => {
    editMessage(id, editText);
    setEditingId(null);
    setEditText('');
  };

  return (
    <div ref={messageListRef} id="messageList" className="chat-messages">
      {messages.length === 0 && (
        <div id="emptyChat" className="empty-chat">
          <div className="empty-icon">💬</div>
          <p>开始你的第一次对话</p>
        </div>
      )}
      
      {messages.map((msg, index) => {
        const prevMsg = index > 0 ? messages[index - 1] : null;
        const showTime = shouldShowTime(msg, prevMsg);
        
        return (
          <React.Fragment key={msg.id}>
            {/* 时间分隔线 */}
            {showTime && (
              <div className="message-time-divider">
                <span>{formatTime(msg.timestamp)}</span>
              </div>
            )}
            
            {/* 消息行 */}
            <div className={`message-row ${msg.role} ${msg.isError ? 'error' : ''}`}>
              {/* 头像 */}
              <div className="msg-avatar">
                {msg.role === 'user' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                ) : msg.role === 'system' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                )}
              </div>
              
              {/* 消息体 */}
              <div className="msg-body">
                {editingId === msg.id ? (
                  <div className="msg-edit-wrapper">
                    <textarea
                      className="msg-edit-textarea"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                    />
                    <div className="msg-edit-actions">
                      <button className="msg-edit-btn cancel" onClick={cancelEdit}>
                        取消
                      </button>
                      <button className="msg-edit-btn save" onClick={() => saveEdit(msg.id)}>
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className="msg-bubble"
                      dangerouslySetInnerHTML={{ __html: renderMessageContent(msg.text) }}
                    />
                    <div className="msg-actions">
                      {/* 复制按钮（仅 assistant 消息显示） */}
                      {msg.role === 'assistant' && !msg.isError && (
                        <button
                          className="msg-action-btn"
                          onClick={() => copyMessage(msg.text)}
                          title="复制"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                          </svg>
                        </button>
                      )}
                      {/* 编辑按钮（仅 user 消息显示） */}
                      {msg.role === 'user' && (
                        <button
                          className="msg-action-btn"
                          onClick={() => startEdit(msg)}
                          title="编辑"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                      )}
                      {/* 重新生成按钮（user 和 assistant 消息都显示） */}
                      {(msg.role === 'user' || msg.role === 'assistant') && (
                        <button
                          className="msg-action-btn"
                          onClick={() => regenerateMessage(msg.id)}
                          title="重新生成"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="1 4 1 10 7 10"/>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </React.Fragment>
        );
      })}
      
      {/* 加载中动画 */}
      {isLoading && (
        <div className="message-row assistant">
          <div className="msg-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </div>
          <div className="msg-body">
            <div className="msg-bubble">
              <span className="streaming-cursor" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

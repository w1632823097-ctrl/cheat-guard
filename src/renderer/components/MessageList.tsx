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

    // Mermaid 图表：渲染为 SVG
    if (lang === 'mermaid') {
      const mermaidId = 'mermaid-' + Math.random().toString(36).slice(2, 10);
      const blockHtml = `<div class="mermaid-block-wrapper"><div class="mermaid" id="${mermaidId}">${trimmed}</div></div>`;
      // 延迟渲染 mermaid
      setTimeout(() => {
        try {
          const mermaid = (window as any).mermaid;
          if (typeof mermaid !== 'undefined') {
            // 初始化 mermaid（如果还没初始化）
            mermaid.initialize({ startOnLoad: false, theme: 'dark' });
            const el = document.getElementById(mermaidId);
            if (el) {
              mermaid.render(mermaidId + '-svg', el.textContent || '').then((result: any) => {
                el.innerHTML = result.svg;
                el.removeAttribute('id');
              }).catch((err: any) => {
                console.error('Mermaid render error:', err);
                el.innerHTML = '<span style="color:#ef4444;font-size:12px;">Mermaid 渲染失败</span>';
              });
            }
          }
        } catch (e) {
          console.error('Mermaid render error:', e);
        }
      }, 100);
      codeBlocks.push(blockHtml);
      return `\x00CODEBLOCK_${codeBlocks.length - 1}\x00`;
    }

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
    // 为代码添加行号：每行包裹在 div.code-line-wrapper 中，行号用 data-line-num 属性
    const codeLines = highlighted.split('\n');
    const codeWithLineNumbers = codeLines.map((line: string, i: number) =>
      `<div class="code-line-wrapper" data-line-num="${i + 1}"><span class="code-line-text">${line || ' '}</span></div>`
    ).join('');
    const blockHtml = `<div class="code-block-wrapper">${label}<button class="code-copy-btn" onclick="copyCodeBlock(this)" title="复制代码"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button><button class="code-toggle-btn" onclick="toggleCodeBlock(this)" title="折叠/展开"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg></button><div class="code-block-content"><pre class="code-block"><code class="hljs code-with-lines">${codeWithLineNumbers}</code></pre></div></div>`;
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

  // 图片（Markdown 语法：![alt](url)）
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
    const safeSrc = escapeHtml(src);
    const safeAlt = escapeHtml(alt);
    return `<img class="md-image" src="${safeSrc}" alt="${safeAlt}" loading="lazy" onerror="this.style.display='none'" />`;
  });

  // 链接（确保 href 安全，只允许 http/https/mailto）
  // 注意：必须在图片之后处理，避免图片语法被误匹配
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
  html = html.replace(/((?:<li class="md-li">.*?<\/li>\n?)+)/g, (_m) => {
    return '<ul class="md-list">' + _m.replace(/\n/g, '') + '</ul>';
  });

  // 引用块
  html = html.replace(/^> (.+)$/gm, '<blockquote class="md-blockquote"><p>$1</p></blockquote>');
  html = html.replace(/<\/blockquote>\n<blockquote class="md-blockquote">/g, '');

  // 换行处理：Markdown 规范 —— 单换行忽略，双换行=段落，3+连续换行折叠
  html = html.replace(/\n{3,}/g, '\n\n').replace(/\n\n/g, '<br><br>');

  // 恢复代码块占位符
  codeBlocks.forEach((block, index) => {
    html = html.replace(`\x00CODEBLOCK_${index}\x00`, block);
  });

  // 清理块级元素前后的多余 <br>（标题/列表/引用/代码块/表格/分隔线等自带 margin，不需要额外换行）
  html = html.replace(/(<br>)+(\s*<(?:h[2-4]|ul|ol|blockquote|pre|table|hr|div)[ >])/gi, '$2');
  html = html.replace(/(<\/(?:h[2-4]|ul|ol|blockquote|pre|table|hr|div)>)\s*(<br>)+/gi, '$1');

  return html;
}

// 复制代码块
function copyCodeBlock(btn: HTMLElement) {
  const wrapper = btn.closest('.code-block-wrapper');
  if (!wrapper) return;
  // 从 .code-line-text 中提取纯文本代码
  const lines = wrapper.querySelectorAll('.code-line-text');
  const text = Array.from(lines).map((el) => el.textContent || '').join('\n');
  navigator.clipboard.writeText(text).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    document.body.removeChild(ta);
  });
  btn.classList.add('copied');
  btn.title = '已复制';
  setTimeout(() => {
    btn.classList.remove('copied');
    btn.title = '复制代码';
  }, 2000);
}

// 暴露到全局，供 HTML onclick 使用
(window as any).copyCodeBlock = copyCodeBlock;

// 折叠/展开代码块
function toggleCodeBlock(btn: HTMLElement) {
  const wrapper = btn.closest('.code-block-wrapper');
  if (!wrapper) return;
  wrapper.classList.toggle('collapsed');
}

// 暴露到全局
(window as any).toggleCodeBlock = toggleCodeBlock;

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

// 相对时间格式化（如"2分钟前"）
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 10) return '刚刚';
  if (seconds < 60) return `${seconds}秒前`;
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;
  return formatTime(date);
}

export default function MessageList() {
  const { messages, isLoading, editMessage, regenerateMessage } = useApp();
  const messageListRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const prevMessagesLengthRef = useRef(messages.length);

  // 智能滚动：只在用户位于底部时自动滚动
  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;

    const isNewMessage = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (isNewMessage && isNearBottomRef.current) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }, [messages]);

  // 监听滚动位置，判断用户是否在底部
  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return;

    const handleScroll = () => {
      const threshold = 50; // 距离底部 50px 内视为在底部
      isNearBottomRef.current =
        container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // 复制消息
  const copyMessage = (text: string, btn: HTMLButtonElement) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    document.body.removeChild(ta);
    // 视觉反馈
    btn.classList.add('copied');
    btn.title = '已复制';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.title = '复制';
    }, 1500);
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
                <span title={formatTime(msg.timestamp)}>{formatRelativeTime(msg.timestamp)}</span>
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
                <div
                  className="msg-bubble"
                  dangerouslySetInnerHTML={{ __html: renderMessageContent(msg.text) }}
                />
                <div className="msg-actions">
                      {/* 复制按钮（仅 assistant 消息显示） */}
                      {msg.role === 'assistant' && !msg.isError && (
                        <button
                          className="msg-action-btn"
                          onClick={(e) => copyMessage(msg.text, e.currentTarget)}
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
                          onClick={(e) => {
                            editMessage(msg.id, msg.text);
                            // 视觉反馈
                            const btn = e.currentTarget;
                            btn.classList.add('copied');
                            btn.title = '已填入输入框';
                            setTimeout(() => {
                              btn.classList.remove('copied');
                              btn.title = '编辑';
                            }, 1500);
                          }}
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
                          onClick={(e) => {
                            regenerateMessage(msg.id);
                            // 视觉反馈
                            const btn = e.currentTarget;
                            btn.classList.add('copied');
                            btn.title = '正在重新生成';
                            setTimeout(() => {
                              btn.classList.remove('copied');
                              btn.title = '重新生成';
                            }, 2000);
                          }}
                          title="重新生成"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="1 4 1 10 7 10"/>
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                          </svg>
                        </button>
                      )}
                    </div>
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

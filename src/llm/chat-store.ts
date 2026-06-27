import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { encrypt, decrypt } from '../utils/security';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  lastMessageAt: number;
}

interface SessionData {
  meta: SessionMeta;
  messages_encrypted?: string;
  messages?: ChatMessage[]; // 兼容旧格式
}

interface StoreData {
  currentSessionId: string;
  sessions: Record<string, SessionData>;
}

const DEFAULT_SESSION_TITLE = 'History';

/** 获取存储文件路径 */
function getStorePath(): string {
  const dir = path.join(os.homedir(), '.cheat-guard');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'chat-history.json');
}

/** 加密存储的值 */
function encryptStoreValue(value: ChatMessage[]): string {
  return encrypt(JSON.stringify(value));
}

/** 解密存储的值 */
function decryptStoreValue(encrypted: string): ChatMessage[] {
  return JSON.parse(decrypt(encrypted));
}

/** 读取整个存储数据 */
function readStore(): StoreData {
  const storePath = getStorePath();
  const defaults: StoreData = {
    currentSessionId: 'default',
    sessions: {
      default: {
        meta: {
          id: 'default',
          title: DEFAULT_SESSION_TITLE,
          createdAt: Date.now(),
          lastMessageAt: Date.now(),
        },
      },
    },
  };

  if (!fs.existsSync(storePath)) {
    console.log('[ChatStore] No store file found, using defaults');
    return defaults;
  }

  try {
    const raw = fs.readFileSync(storePath, 'utf-8');
    const data = JSON.parse(raw) as StoreData;
    // 确保 default session 存在
    if (!data.sessions.default) {
      data.sessions.default = defaults.sessions.default;
    }
    console.log('[ChatStore] Store loaded, sessions:', Object.keys(data.sessions).length);
    return data;
  } catch (err) {
    console.error('[ChatStore] Failed to read store file:', err);
    return defaults;
  }
}

/** 写入整个存储数据 */
function writeStore(data: StoreData): void {
  const storePath = getStorePath();
  try {
    const dir = path.dirname(storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log('[ChatStore] Store written successfully');
  } catch (err) {
    console.error('[ChatStore] Failed to write store file:', err);
  }
}

// ═══════════════════════════════════════════
// Sessions
// ═══════════════════════════════════════════

export async function listSessions(): Promise<SessionInfo[]> {
  const data = readStore();
  const result: SessionInfo[] = [];
  for (const [id, s] of Object.entries(data.sessions)) {
    result.push({
      id,
      title: s.meta.title,
      createdAt: s.meta.createdAt,
      lastMessageAt: s.meta.lastMessageAt,
      messageCount: getMessageCount(s),
    });
  }
  result.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  return result;
}

export async function newSession(title?: string): Promise<SessionInfo> {
  const data = readStore();
  const id = 'session_' + Date.now();
  const now = Date.now();
  const meta: SessionMeta = {
    id,
    title: title || DEFAULT_SESSION_TITLE,
    createdAt: now,
    lastMessageAt: now,
  };
  data.sessions[id] = { meta };
  writeStore(data);
  return {
    id,
    title: meta.title,
    createdAt: meta.createdAt,
    lastMessageAt: meta.lastMessageAt,
    messageCount: 0,
  };
}

export async function deleteSession(sessionId: string): Promise<void> {
  const data = readStore();
  if (!data.sessions[sessionId]) return;
  delete data.sessions[sessionId];
  if (data.currentSessionId === sessionId) {
    const remaining = Object.keys(data.sessions);
    data.currentSessionId = remaining.length > 0 ? remaining[0] : 'default';
    // 确保至少有一个会话
    if (remaining.length === 0) {
      const now = Date.now();
      data.sessions.default = {
        meta: {
          id: 'default',
          title: DEFAULT_SESSION_TITLE,
          createdAt: now,
          lastMessageAt: now,
        },
      };
      data.currentSessionId = 'default';
    }
  }
  writeStore(data);
}

export async function renameSession(sessionId: string, title: string): Promise<void> {
  const data = readStore();
  const session = data.sessions[sessionId];
  if (!session) return;
  session.meta.title = title;
  writeStore(data);
}

export async function getCurrentSessionId(): Promise<string> {
  const data = readStore();
  return data.currentSessionId;
}

export async function setCurrentSessionId(id: string): Promise<void> {
  const data = readStore();
  if (data.sessions[id]) {
    data.currentSessionId = id;
    writeStore(data);
  }
}

// ═══════════════════════════════════════════
// Messages
// ═══════════════════════════════════════════

function getMessageCount(session: SessionData): number {
  if (session.messages_encrypted) {
    try {
      return decryptStoreValue(session.messages_encrypted).length;
    } catch {
      // ignore
    }
  }
  return (session.messages || []).length;
}

function loadMessages(session: SessionData): ChatMessage[] {
  if (session.messages_encrypted) {
    try {
      const decrypted = decryptStoreValue(session.messages_encrypted);
      if (decrypted.length > 0) {
        return decrypted;
      }
    } catch (err) {
      console.error('[ChatStore] Failed to decrypt messages:', err);
    }
  }
  return session.messages || [];
}

function saveMessages(session: SessionData, messages: ChatMessage[]): void {
  const maxMsgs = 100;
  if (messages.length > maxMsgs) {
    messages = messages.slice(-maxMsgs);
  }
  session.messages_encrypted = encryptStoreValue(messages);
  // 清理旧格式的明文 messages 字段（节省空间）
  delete session.messages;
}

export async function getMessages(sessionId: string): Promise<ChatMessage[]> {
  const data = readStore();
  const session = data.sessions[sessionId];
  if (!session) return [];
  return loadMessages(session);
}

export async function addMessage(sessionId: string, message: ChatMessage): Promise<void> {
  const data = readStore();
  const session = data.sessions[sessionId];
  if (!session) {
    console.warn('[ChatStore] Session not found:', sessionId);
    return;
  }

  const messages = loadMessages(session);
  messages.push(message);
  session.meta.lastMessageAt = Date.now();
  saveMessages(session, messages);
  writeStore(data);
}

export async function setMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
  const data = readStore();
  const session = data.sessions[sessionId];
  if (!session) {
    console.warn('[ChatStore] Session not found for setMessages:', sessionId);
    return;
  }
  session.meta.lastMessageAt = Date.now();
  saveMessages(session, messages);
  writeStore(data);
}

export async function clearCurrentSession(): Promise<void> {
  const data = readStore();
  const session = data.sessions[data.currentSessionId];
  if (session) {
    saveMessages(session, []);
    writeStore(data);
  }
}

export async function hasMessages(sessionId: string): Promise<boolean> {
  const data = readStore();
  const session = data.sessions[sessionId];
  return session ? getMessageCount(session) > 0 : false;
}

// ═══════════════════════════════════════════
// Types
// ═══════════════════════════════════════════

export interface SessionInfo {
  id: string;
  title: string;
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
}

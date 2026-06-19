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

// electron-store 实例接口（动态 import ESM 模块，避免类型推断问题）
interface StoreInstance {
  get<T = any>(key: string): T;
  set(key: string, value: any): void;
  delete(key: string): void;
  store: any;
}

const DEFAULT_SESSION_TITLE = '新对话';

let storePromise: Promise<StoreInstance> | null = null;

async function getStore(): Promise<StoreInstance> {
  if (!storePromise) {
    storePromise = (async () => {
      // 用 new Function 构造真正的动态 import，避免 tsc 将其编译为 require()
      // （electron-store v10+ 是纯 ESM，不支持 require）
      const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
      const { default: StoreClass } = await dynamicImport('electron-store');
      const store = new StoreClass({
        name: 'chat-history',
        defaults: {
          currentSessionId: 'default',
          sessions: {
            default: {
              meta: {
                id: 'default',
                title: DEFAULT_SESSION_TITLE,
                createdAt: Date.now(),
                lastMessageAt: Date.now(),
              },
              messages: [],
            },
          },
        },
      }) as unknown as StoreInstance;
      return store;
    })();
  }
  return storePromise;
}

export interface SessionInfo {
  id: string;
  title: string;
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
}

// --- Sessions ---

export async function listSessions(): Promise<SessionInfo[]> {
  const store = await getStore();
  const sessions = store.get('sessions') as Record<string, { meta: SessionMeta; messages: ChatMessage[] }>;
  const result: SessionInfo[] = [];
  for (const [id, s] of Object.entries(sessions)) {
    result.push({
      id,
      title: s.meta.title,
      createdAt: s.meta.createdAt,
      lastMessageAt: s.meta.lastMessageAt,
      messageCount: s.messages.length,
    });
  }
  result.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  return result;
}

export async function newSession(title?: string): Promise<SessionInfo> {
  const store = await getStore();
  const id = 'session_' + Date.now();
  const now = Date.now();
  const meta: SessionMeta = {
    id,
    title: title || DEFAULT_SESSION_TITLE,
    createdAt: now,
    lastMessageAt: now,
  };
  store.set(`sessions.${id}`, { meta, messages: [] });
  return {
    id,
    title: meta.title,
    createdAt: meta.createdAt,
    lastMessageAt: meta.lastMessageAt,
    messageCount: 0,
  };
}

export async function deleteSession(sessionId: string): Promise<void> {
  const store = await getStore();
  const sessions = store.get('sessions') as Record<string, any>;
  if (!sessions[sessionId]) return;
  delete sessions[sessionId];
  store.set('sessions', sessions);
  if (store.get('currentSessionId') === sessionId) {
    const remaining = Object.keys(sessions);
    store.set('currentSessionId', remaining.length > 0 ? remaining[0] : '');
  }
}

export async function renameSession(sessionId: string, title: string): Promise<void> {
  const store = await getStore();
  const session = store.get(`sessions.${sessionId}`) as { meta: SessionMeta; messages: ChatMessage[] } | undefined;
  if (!session) return;
  session.meta.title = title;
  store.set(`sessions.${sessionId}`, session);
}

export async function getCurrentSessionId(): Promise<string> {
  const store = await getStore();
  return store.get('currentSessionId') as string;
}

export async function setCurrentSessionId(id: string): Promise<void> {
  const store = await getStore();
  const sessions = store.get('sessions') as Record<string, any>;
  if (sessions[id]) {
    store.set('currentSessionId', id);
  }
}

// --- Messages ---

export async function getMessages(sessionId: string): Promise<ChatMessage[]> {
  const store = await getStore();
  const session = store.get(`sessions.${sessionId}`) as { messages: ChatMessage[] } | undefined;
  return session ? [...session.messages] : [];
}

export async function addMessage(sessionId: string, message: ChatMessage): Promise<void> {
  const store = await getStore();
  const session = store.get(`sessions.${sessionId}`) as { meta: SessionMeta; messages: ChatMessage[] } | undefined;
  if (!session) return;
  session.messages.push(message);
  session.meta.lastMessageAt = Date.now();
  const maxMsgs = 100;
  if (session.messages.length > maxMsgs) {
    session.messages = session.messages.slice(-maxMsgs);
  }
  store.set(`sessions.${sessionId}`, session);
}

export async function setMessages(sessionId: string, messages: ChatMessage[]): Promise<void> {
  const store = await getStore();
  const session = store.get(`sessions.${sessionId}`) as { meta: SessionMeta; messages: ChatMessage[] } | undefined;
  if (!session) return;
  session.messages = messages;
  session.meta.lastMessageAt = Date.now();
  store.set(`sessions.${sessionId}`, session);
}

export async function clearCurrentSession(): Promise<void> {
  const store = await getStore();
  const sessionId = store.get('currentSessionId') as string;
  setMessages(sessionId, []);
}

export async function hasMessages(sessionId: string): Promise<boolean> {
  const store = await getStore();
  const session = store.get(`sessions.${sessionId}`) as { messages: ChatMessage[] } | undefined;
  return session ? session.messages.length > 0 : false;
}

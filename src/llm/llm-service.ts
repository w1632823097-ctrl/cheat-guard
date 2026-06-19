import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import {
  getMessages,
  addMessage,
  setMessages,
  listSessions,
  newSession,
  deleteSession,
  renameSession,
  setCurrentSessionId,
  clearCurrentSession,
  hasMessages,
  type SessionInfo,
} from './chat-store';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  baseURL: string;
}

let cachedConfig: LLMConfig | null = null;
let cachedModels: ModelInfo[] = [];

const DEFAULT_SYSTEM_PROMPT = `你是一个实时 AI 桌面助手 CheatGuard，帮助用户在会议、面试、销售通话等场景中提供实时 AI 提示。
你的回答要求：
- 简洁、直接、有用
- 如果是代码问题，给出可运行的代码
- 如果是知识性问题，给出准确答案
- 始终保持专业和 helpful 的态度`;

function loadConfig(): LLMConfig {
  if (cachedConfig) return cachedConfig;

  const envApiKey = process.env.OPENAI_API_KEY || '';
  const envBaseURL = process.env.OPENAI_BASE_URL || '';
  const envModel = process.env.LLM_MODEL || '';

  const searchPaths = [
    path.join(process.cwd(), 'config.json'),
    path.join(__dirname, '..', '..', 'config.json'),
    path.join(__dirname, '..', 'config.json'),
  ];

  let configPath = '';
  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      configPath = p;
      break;
    }
  }

  if (configPath) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw);
      if (config.llm) {
        cachedConfig = {
          apiKey: config.llm.apiKey || envApiKey || '',
          baseURL: config.llm.baseURL || envBaseURL || 'https://api.openai.com/v1',
          model: config.llm.model || envModel || 'gpt-4o-mini',
        };
        if (config.llm.models && Array.isArray(config.llm.models)) {
          cachedModels = config.llm.models;
        } else {
          cachedModels = [{
            id: cachedConfig.model,
            name: cachedConfig.model,
            baseURL: cachedConfig.baseURL,
          }];
        }
        return cachedConfig;
      }
    } catch (err) {
      console.warn('[LLM] Failed to parse config.json:', err);
    }
  } else {
    console.warn('[LLM] config.json not found. Searched:', searchPaths.join(', '));
  }

  console.warn('[LLM] Using env vars as fallback (no config.json found)');
  cachedConfig = {
    apiKey: envApiKey,
    baseURL: envBaseURL || 'https://api.openai.com/v1',
    model: envModel || 'gpt-4o-mini',
  };
  return cachedConfig;
}

function getConfig(): LLMConfig {
  return loadConfig();
}

export function setApiConfig(config: { apiKey?: string; baseURL?: string; model?: string }) {
  const current = getConfig();
  cachedConfig = {
    apiKey: config.apiKey || current.apiKey,
    baseURL: config.baseURL || current.baseURL,
    model: config.model || current.model,
  };
}

export function setModel(modelId: string) {
  getConfig();
  const found = cachedModels.find((m) => m.id === modelId);
  if (found) {
    cachedConfig = {
      ...cachedConfig!,
      model: found.id,
      baseURL: found.baseURL,
    };
  }
}

export function getAvailableModels(): ModelInfo[] {
  getConfig();
  return [...cachedModels];
}

export function getModel(): string {
  return getConfig().model;
}

// ============================================================
// Session / Memory APIs (持久化)
// ============================================================
export { listSessions, newSession, deleteSession, renameSession } from './chat-store';
export type { SessionInfo } from './chat-store';

function buildEndpoint(baseURL: string): string {
  const base = baseURL.replace(/\/+$/, '');
  return `${base}/chat/completions`;
}

function httpRequest(endpoint: string, config: LLMConfig, body: object, stream: boolean): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const mod = url.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || undefined,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = mod.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errBody = '';
        res.on('data', (chunk) => { errBody += chunk.toString(); });
        res.on('end', () => {
          reject(new Error(`HTTP ${res.statusCode}: ${errBody.slice(0, 500)}`));
        });
        return;
      }

      if (stream) {
        resolve({ status: res.statusCode, data: res });
      } else {
        let body = '';
        res.on('data', (chunk) => { body += chunk.toString(); });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, data: JSON.parse(body) });
          } catch {
            reject(new Error('Failed to parse response: ' + body.slice(0, 200)));
          }
        });
      }
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(payload);
    req.end();
  });
}

// 根据 sessionId 获取消息历史（自动处理首次创建）
async function getOrInitHistory(sessionId: string, systemPrompt?: string): Promise<ChatMessage[]> {
  let history = await getMessages(sessionId);
  if (history.length === 0) {
    history = [{ role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT }];
    await setMessages(sessionId, history);
  }
  return history;
}

export async function chat(
  sessionId: string,
  userMessage: string,
  systemPrompt?: string
): Promise<string> {
  const config = getConfig();
  const endpoint = buildEndpoint(config.baseURL);

  let history = await getOrInitHistory(sessionId, systemPrompt);
  history.push({ role: 'user', content: userMessage });
  await addMessage(sessionId, { role: 'user', content: userMessage });

  const recentMessages = history.slice(-21);

  const { data } = await httpRequest(endpoint, config, {
    model: config.model,
    messages: recentMessages,
    temperature: 0.7,
    max_tokens: 2000,
    stream: false,
  }, false);

  const assistantMessage = data.choices?.[0]?.message?.content || '(无响应)';
  await addMessage(sessionId, { role: 'assistant', content: assistantMessage });

  return assistantMessage;
}

export async function chatStream(
  sessionId: string,
  userMessage: string,
  onChunk: (chunk: string) => void,
  systemPrompt?: string
): Promise<void> {
  const config = getConfig();
  const endpoint = buildEndpoint(config.baseURL);

  let history = await getOrInitHistory(sessionId, systemPrompt);
  history.push({ role: 'user', content: userMessage });
  await addMessage(sessionId, { role: 'user', content: userMessage });

  const recentMessages = history.slice(-21);

  const { data: stream } = await httpRequest(endpoint, config, {
    model: config.model,
    messages: recentMessages,
    temperature: 0.7,
    max_tokens: 2000,
    stream: true,
  }, true);

  let fullResponse = '';
  let buffer = '';

  for await (const chunk of stream) {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          onChunk(content);
        }
      } catch { /* ignore malformed lines */ }
    }
  }

  if (buffer.trim().startsWith('data: ') && buffer.trim().slice(6) !== '[DONE]') {
    try {
      const parsed = JSON.parse(buffer.trim().slice(6));
      const content = parsed.choices?.[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        onChunk(content);
      }
    } catch { /* ignore */ }
  }

  await addMessage(sessionId, { role: 'assistant', content: fullResponse });
}

export async function clearSession(sessionId: string) {
  await setMessages(sessionId, []);
}

export async function getHistory(sessionId: string): Promise<ChatMessage[]> {
  return getMessages(sessionId);
}

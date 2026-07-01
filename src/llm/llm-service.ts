import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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
import { encrypt, decrypt, isEncrypted } from '../utils/security';

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
  apiKey?: string;
}

let cachedConfig: LLMConfig | null = null;
let cachedModels: ModelInfo[] = [];

const DEFAULT_SYSTEM_PROMPT = `你是一个实时 AI 桌面助手 CheatGuard，帮助用户在会议、面试、销售通话等场景中提供实时 AI 提示。
你的回答要求：
- 简洁、直接、有用
- 如果是代码问题，给出可运行的代码
- 如果是知识性问题，给出准确答案
- 始终保持专业和 helpful 的态度`;

/** 获取配置文件路径（与 chat-store 一致，使用用户目录） */
function getConfigPath(): string {
  const dir = path.join(os.homedir(), '.cheat-guard');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'config.json');
}

/** 确保配置文件存在，不存在则创建默认配置 */
function ensureConfigFile(): string {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    const defaultConfig = {
      llm: {
        apiKey: '',
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        models: [],
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    console.log('[LLM] Created default config.json at:', configPath);
  }
  return configPath;
}

function loadConfig(): LLMConfig {
  if (cachedConfig) return cachedConfig;

  const envApiKey = process.env.OPENAI_API_KEY || '';
  const envBaseURL = process.env.OPENAI_BASE_URL || '';
  const envModel = process.env.LLM_MODEL || '';

  // 优先使用用户目录的 config.json，其次尝试项目目录（开发模式）
  const searchPaths = [
    getConfigPath(),
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
        // 解密 API Key（如果已加密）
        let apiKey = config.llm.apiKey || envApiKey || '';
        if (apiKey && isEncrypted(apiKey)) {
          try {
            apiKey = decrypt(apiKey);
          } catch (err) {
            console.warn('[LLM] Failed to decrypt API key, using raw value');
          }
        }

        cachedConfig = {
          apiKey: apiKey,
          baseURL: config.llm.baseURL || envBaseURL || 'https://api.openai.com/v1',
          model: config.llm.model || envModel || 'gpt-4o-mini',
        };
        if (config.llm.models && Array.isArray(config.llm.models)) {
          cachedModels = config.llm.models.map((m: any) => {
            let key = m.apiKey || '';
            if (key && isEncrypted(key)) {
              try { key = decrypt(key); } catch {}
            }
            return { ...m, apiKey: key };
          });
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
      apiKey: found.apiKey || cachedConfig!.apiKey,
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

// 查找 config.json 路径（优先用户目录，不存在则自动创建）
function findConfigPath(): string | null {
  const configPath = ensureConfigFile();
  return configPath;
}

export function addModel(modelInfo: ModelInfo): { success: boolean; error?: string } {
  const configPath = findConfigPath();
  if (!configPath) {
    return { success: false, error: 'config.json 未找到' };
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);

    if (!config.llm) config.llm = {};
    if (!Array.isArray(config.llm.models)) config.llm.models = [];

    // 检查是否已存在
    const exists = config.llm.models.some((m: any) => m.id === modelInfo.id);
    if (exists) {
      return { success: false, error: `模型 "${modelInfo.id}" 已存在` };
    }

    config.llm.models.push({
      id: modelInfo.id,
      name: modelInfo.name || modelInfo.id,
      baseURL: modelInfo.baseURL || config.llm.baseURL || 'https://api.openai.com/v1',
      apiKey: modelInfo.apiKey || undefined,
    });

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // 更新缓存
    cachedModels.push(config.llm.models[config.llm.models.length - 1]);

    return { success: true };
  } catch (err) {
    return { success: false, error: '保存失败: ' + (err instanceof Error ? err.message : String(err)) };
  }
}

export async function testModel(modelInfo: { id: string; baseURL: string; apiKey: string }): Promise<{ success: boolean; error?: string }> {
  const endpoint = modelInfo.baseURL.replace(/\/+$/, '') + '/chat/completions';

  // 解密 API Key（如果已加密），和 loadConfig 保持一致的逻辑
  let apiKey = modelInfo.apiKey;
  if (apiKey && isEncrypted(apiKey)) {
    try {
      apiKey = decrypt(apiKey);
    } catch {
      // 解密失败则使用原始值
    }
  }

  return new Promise((resolve) => {
    const url = new URL(endpoint);
    const mod = url.protocol === 'https:' ? https : http;
    const payload = JSON.stringify({
      model: modelInfo.id,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 10,
      temperature: 0.7,
    });

    const req = mod.request({
      hostname: url.hostname,
      port: url.port || undefined,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 15000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ success: true });
        } else {
          let msg = `HTTP ${res.statusCode}`;
          try {
            const errJson = JSON.parse(body);
            msg = errJson.error?.message || errJson.message || errJson.error || msg;
          } catch {}
          resolve({ success: false, error: msg + (body ? ` — ${body.slice(0, 200)}` : '') });
        }
      });
    });

    req.on('error', (err: Error) => {
      resolve({ success: false, error: '连接失败: ' + err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: '连接超时 (15s)' });
    });

    req.write(payload);
    req.end();
  });
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

interface LLMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface StreamChunk {
  choices: Array<{
    delta: {
      content?: string;
    };
  }>;
}

type HttpResponseData = LLMResponse | http.IncomingMessage;

// 活跃的流式请求引用，用于取消
let activeStreamRequest: http.ClientRequest | null = null;

/** 取消当前活跃的流式请求 */
export function cancelActiveStream(): void {
  if (activeStreamRequest) {
    activeStreamRequest.destroy();
    activeStreamRequest = null;
  }
}

function httpRequest(endpoint: string, config: LLMConfig, body: object, stream: boolean): Promise<{ status: number; data: HttpResponseData }> {
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
          activeStreamRequest = null;
          reject(new Error(`HTTP ${res.statusCode}: ${errBody.slice(0, 500)}`));
        });
        return;
      }

      if (stream) {
        resolve({ status: res.statusCode!, data: res as http.IncomingMessage });
      } else {
        let body = '';
        res.on('data', (chunk) => { body += chunk.toString(); });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, data: JSON.parse(body) as LLMResponse });
          } catch {
            reject(new Error('Failed to parse response: ' + body.slice(0, 200)));
          }
        });
      }
    });

    if (stream) {
      activeStreamRequest = req;
    }

    req.on('error', (err) => {
      activeStreamRequest = null;
      reject(err);
    });
    req.setTimeout(30000, () => {
      activeStreamRequest = null;
      req.destroy();
      reject(new Error('Request timeout'));
    });
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

  const responseData = data as LLMResponse;
  const assistantMessage = responseData.choices?.[0]?.message?.content || '(无响应)';
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

  const streamData = stream as http.IncomingMessage;

  for await (const chunk of streamData) {
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

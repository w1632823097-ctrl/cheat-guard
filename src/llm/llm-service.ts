import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

const conversationHistory: Map<string, ChatMessage[]> = new Map();

let cachedConfig: LLMConfig | null = null;

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
          // config.json 优先，环境变量作为 fallback
          apiKey: config.llm.apiKey || envApiKey || '',
          baseURL: config.llm.baseURL || envBaseURL || 'https://api.openai.com/v1',
          model: config.llm.model || envModel || 'gpt-4o-mini',
        };
        return cachedConfig;
      }
    } catch (err) {
      console.warn('[LLM] Failed to parse config.json:', err);
    }
  } else {
    console.warn('[LLM] config.json not found. Searched:', searchPaths.join(', '));
  }

  // 纯环境变量 fallback
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

export function setApiConfig(config: { apiKey: string; baseURL?: string; model?: string }) {
  cachedConfig = {
    apiKey: config.apiKey,
    baseURL: config.baseURL || 'https://api.openai.com/v1',
    model: config.model || 'gpt-4o-mini',
  };
}

export function getModel(): string {
  return getConfig().model;
}

function buildEndpoint(baseURL: string): string {
  const base = baseURL.replace(/\/+$/, '');
  return `${base}/chat/completions`;
}

// 原生 HTTP 请求，避免 axios 在 Electron 中的兼容问题
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

    const maskedKey = config.apiKey.length > 8 ? config.apiKey.slice(0, 4) + '***' + config.apiKey.slice(-4) : '***';

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

export async function chat(
  sessionId: string,
  userMessage: string,
  systemPrompt?: string
): Promise<string> {
  const config = getConfig();
  const endpoint = buildEndpoint(config.baseURL);

  if (!conversationHistory.has(sessionId)) {
    conversationHistory.set(sessionId, [
      { role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
    ]);
  }

  const history = conversationHistory.get(sessionId)!;
  history.push({ role: 'user', content: userMessage });
  const recentMessages = history.slice(-21);

  const { data } = await httpRequest(endpoint, config, {
    model: config.model,
    messages: recentMessages,
    temperature: 0.7,
    max_tokens: 2000,
    stream: false,
  }, false);

  const assistantMessage = data.choices?.[0]?.message?.content || '(无响应)';
  history.push({ role: 'assistant', content: assistantMessage });

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

  if (!conversationHistory.has(sessionId)) {
    conversationHistory.set(sessionId, [
      { role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
    ]);
  }

  const history = conversationHistory.get(sessionId)!;
  history.push({ role: 'user', content: userMessage });
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

  // 处理剩余
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

  history.push({ role: 'assistant', content: fullResponse });
}

export function clearSession(sessionId: string) {
  conversationHistory.delete(sessionId);
}

export function getHistory(sessionId: string): ChatMessage[] {
  return conversationHistory.get(sessionId) || [];
}

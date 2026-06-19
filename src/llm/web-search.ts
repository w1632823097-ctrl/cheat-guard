import * as https from 'https';

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

interface WebSearchConfig {
  provider: 'duckduckgo' | 'brave' | 'none';
  maxResults: number;
  braveApiKey?: string;
}

let cachedSearchConfig: WebSearchConfig | null = null;

export function loadSearchConfig(rawConfig?: any): WebSearchConfig {
  if (cachedSearchConfig) return cachedSearchConfig;

  const ws = rawConfig || {};

  cachedSearchConfig = {
    provider: ws.provider || 'duckduckgo',
    maxResults: ws.maxResults || 5,
    braveApiKey: ws.braveApiKey,
  };

  return cachedSearchConfig;
}

/**
 * DuckDuckGo Lite 搜索（免费，无需 API Key）
 */
async function searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
  const q = encodeURIComponent(query);
  const url = `https://lite.duckduckgo.com/lite/?q=${q}`;

  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'text/html' } }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk.toString(); });
      res.on('end', () => {
        try {
          const results = parseDDGLite(body, maxResults);
          resolve(results);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject).setTimeout(8000, function (this: any) { this.destroy(); reject(new Error('Search timeout')); });
  });
}

function parseDDGLite(html: string, max: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DDG Lite 结果行格式: <a href="...">title</a><span>snippet</span>
  // 更通用的正则匹配
  const linkRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="[^"]*result-link[^"]*"[^>]*>([^<]+)<\/a>[\s\S]*?<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;

  let m;
  while ((m = linkRegex.exec(html)) !== null && results.length < max) {
    const url = m[1];
    const title = decodeHtmlEntities(m[2].trim());
    const snippet = decodeHtmlEntities(m[3].replace(/<[^>]+>/g, '').trim());
    if (title && snippet && !url.includes('duckduckgo.com')) {
      results.push({ title, snippet, url });
    }
  }

  // fallback: 简化解析
  if (results.length === 0) {
    const fallbackRegex = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
    const spanRegex = /<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;

    const links: Array<{ title: string; url: string }> = [];
    const snippets: string[] = [];

    let lm;
    while ((lm = fallbackRegex.exec(html)) !== null && links.length < max * 2) {
      const url = lm[1];
      const title = decodeHtmlEntities(lm[2].trim());
      if (!url.includes('duckduckgo.com') && title) {
        links.push({ title, url });
      }
    }

    let sm;
    while ((sm = spanRegex.exec(html)) !== null && snippets.length < max * 2) {
      snippets.push(decodeHtmlEntities(sm[1].replace(/<[^>]+>/g, '').trim()));
    }
    // 重新设置 lastIndex
    spanRegex.lastIndex = 0;

    for (let i = 0; i < Math.min(links.length, snippets.length, max); i++) {
      results.push({
        title: links[i].title,
        url: links[i].url,
        snippet: snippets[i],
      });
    }
  }

  return results;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

/**
 * Brave Search API（可选，需 API Key）
 */
async function searchBrave(query: string, maxResults: number, apiKey: string): Promise<SearchResult[]> {
  const q = encodeURIComponent(query);
  const url = `https://api.search.brave.com/res/v1/web/search?q=${q}&count=${maxResults}`;

  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk.toString(); });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const web = json.web?.results || [];
          resolve(web.slice(0, maxResults).map((r: any) => ({
            title: r.title || '',
            snippet: r.description || '',
            url: r.url || '',
          })));
        } catch {
          resolve([]);
        }
      });
    }).on('error', reject).setTimeout(8000, function (this: any) { this.destroy(); reject(new Error('Search timeout')); });
  });
}

// ============================================================
// Public API
// ============================================================

let webSearchEnabled = false;

export function isWebSearchEnabled(): boolean {
  return webSearchEnabled;
}

export function setWebSearchEnabled(enabled: boolean): void {
  webSearchEnabled = enabled;
}

export async function searchWeb(query: string): Promise<SearchResult[]> {
  const config = loadSearchConfig();

  if (config.provider === 'none') return [];

  try {
    if (config.provider === 'brave' && config.braveApiKey) {
      return await searchBrave(query, config.maxResults, config.braveApiKey);
    }
    return await searchDuckDuckGo(query, config.maxResults);
  } catch (err) {
    console.error('[WebSearch] Search failed:', err);
    return [];
  }
}

/**
 * 生成注入给 LLM 的搜索上下文文本
 */
export function formatSearchContext(results: SearchResult[]): string {
  if (results.length === 0) return '';

  let ctx = '\n\n【以下是最新的网页搜索结果，请参考这些信息回答用户问题：】\n';
  results.forEach((r, i) => {
    ctx += `\n[${i + 1}] ${r.title}\n${r.snippet}\n来源: ${r.url}\n`;
  });
  return ctx;
}

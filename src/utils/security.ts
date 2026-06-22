import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================
// 安全工具模块
// 提供 AES-256-GCM 加密/解密、密钥管理、日志清理等功能
// ============================================================

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

// 密钥文件路径（存储在用户数据目录）
function getKeyFilePath(): string {
  const userDataPath = path.join(os.homedir(), '.cheat-guard');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  return path.join(userDataPath, '.key');
}

/**
 * 生成或读取加密密钥
 * 密钥基于机器特征生成，不同机器密钥不同
 */
function getOrCreateKey(): Buffer {
  const keyFile = getKeyFilePath();

  if (fs.existsSync(keyFile)) {
    try {
      const keyData = fs.readFileSync(keyFile);
      return keyData;
    } catch {
      // 读取失败则重新生成
    }
  }

  // 生成随机密钥
  const key = crypto.randomBytes(KEY_LENGTH);
  try {
    fs.writeFileSync(keyFile, key);
    // 设置仅当前用户可读写
    fs.chmodSync(keyFile, 0o600);
  } catch (err) {
    console.warn('[Security] Failed to write key file:', err);
  }
  return key;
}

/**
 * 获取当前密钥（内存缓存）
 */
let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (!cachedKey) {
    cachedKey = getOrCreateKey();
  }
  return cachedKey;
}

/**
 * 加密文本
 * @param text 明文
 * @returns 加密后的 base64 字符串（包含 salt + iv + authTag + ciphertext）
 */
export function encrypt(text: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // 组合: salt + iv + authTag + ciphertext
  const combined = Buffer.concat([salt, iv, authTag, Buffer.from(encrypted, 'hex')]);  return combined.toString('base64');
}

/**
 * 解密文本
 * @param encryptedBase64 加密后的 base64 字符串
 * @returns 明文
 */
export function decrypt(encryptedBase64: string): string {
  const key = getKey();
  const combined = Buffer.from(encryptedBase64, 'base64');

  let offset = 0;
  const salt = combined.slice(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;

  const iv = combined.slice(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;

  const authTag = combined.slice(offset, offset + AUTH_TAG_LENGTH);
  offset += AUTH_TAG_LENGTH;

  const ciphertext = combined.slice(offset);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * 判断字符串是否已加密（简单启发式检测）
 */
export function isEncrypted(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  try {
    const decoded = Buffer.from(text, 'base64');
    // 加密后的数据至少包含 salt + iv + authTag
    return decoded.length > SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;
  } catch {
    return false;
  }
}

/**
 * 安全地存储敏感配置到文件
 * @param config 配置对象
 * @param filePath 文件路径
 */
export function saveEncryptedConfig<T extends Record<string, any>>(
  config: T,
  filePath: string
): void {
  const encrypted = encrypt(JSON.stringify(config));
  fs.writeFileSync(filePath, JSON.stringify({ _encrypted: true, data: encrypted }, null, 2));
}

/**
 * 从文件读取并解密配置
 * @param filePath 文件路径
 * @returns 解密后的配置对象
 */
export function loadEncryptedConfig<T extends Record<string, any>>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed._encrypted && parsed.data) {
      const decrypted = decrypt(parsed.data);
      return JSON.parse(decrypted);
    }
    // 兼容旧版未加密配置
    return parsed;
  } catch (err) {
    console.warn('[Security] Failed to load encrypted config:', err);
    return null;
  }
}

// ============================================================
// 日志清理
// ============================================================

const LOG_RETENTION_DAYS = 7;

interface LogFile {
  path: string;
  mtime: Date;
}

/**
 * 获取日志文件列表
 */
function getLogFiles(): LogFile[] {
  const logPaths: string[] = [];

  // Electron 日志目录
  const electronLogDir = path.join(os.homedir(), 'AppData', 'Roaming', 'CheatGuard', 'logs');
  if (fs.existsSync(electronLogDir)) {
    logPaths.push(electronLogDir);
  }

  // 项目日志目录
  const projectLogDir = path.join(process.cwd(), 'logs');
  if (fs.existsSync(projectLogDir)) {
    logPaths.push(projectLogDir);
  }

  const files: LogFile[] = [];
  for (const dir of logPaths) {
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          files.push({ path: fullPath, mtime: stat.mtime });
        }
      }
    } catch {
      // 忽略读取失败
    }
  }

  return files;
}

/**
 * 清理超过保留天数的日志文件
 * @param retentionDays 保留天数（默认 7 天）
 * @returns 清理的文件数量
 */
export function cleanupOldLogs(retentionDays: number = LOG_RETENTION_DAYS): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const logFiles = getLogFiles();
  let cleanedCount = 0;

  for (const logFile of logFiles) {
    if (logFile.mtime < cutoffDate) {
      try {
        fs.unlinkSync(logFile.path);
        cleanedCount++;
        console.log('[Security] Cleaned old log:', logFile.path);
      } catch {
        // 忽略删除失败
      }
    }
  }

  if (cleanedCount > 0) {
    console.log(`[Security] Cleaned ${cleanedCount} old log files`);
  }

  return cleanedCount;
}

/**
 * 启动定时日志清理
 * @param intervalHours 清理间隔（小时，默认 24）
 */
export function startLogCleanupTimer(intervalHours: number = 24): NodeJS.Timeout {
  // 立即执行一次
  cleanupOldLogs();

  // 定时执行
  const intervalMs = intervalHours * 60 * 60 * 1000;
  return setInterval(() => {
    cleanupOldLogs();
  }, intervalMs);
}

/**
 * 安全擦除文件（覆盖后删除）
 * @param filePath 文件路径
 */
export function secureDelete(filePath: string): void {
  try {
    const stat = fs.statSync(filePath);
    const size = stat.size;

    // 用随机数据覆盖
    const buffer = crypto.randomBytes(Math.min(size, 1024 * 1024)); // 最多 1MB
    const fd = fs.openSync(filePath, 'w');
    let written = 0;
    while (written < size) {
      const chunk = buffer.slice(0, Math.min(buffer.length, size - written));
      fs.writeSync(fd, chunk);
      written += chunk.length;
    }
    fs.closeSync(fd);

    // 删除文件
    fs.unlinkSync(filePath);
  } catch {
    // 如果安全删除失败，尝试普通删除
    try {
      fs.unlinkSync(filePath);
    } catch {
      // 忽略
    }
  }
}

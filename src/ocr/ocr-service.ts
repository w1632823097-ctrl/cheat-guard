import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createWorker, Worker } from 'tesseract.js';

// ============================================================
// OCR Service - 使用 Tesseract.js 纯 Node.js OCR
// 替代外部 Python 依赖
// ============================================================

let worker: Worker | null = null;
let workerInitializing = false;

const TEMP_DIR = path.join(os.tmpdir(), 'cheat-guard-ocr');

// 确保临时目录存在
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * 初始化 Tesseract Worker（懒加载）
 */
async function initWorker(): Promise<Worker> {
  if (worker) return worker;
  if (workerInitializing) {
    // 等待其他初始化完成
    await new Promise(resolve => setTimeout(resolve, 100));
    return initWorker();
  }

  workerInitializing = true;
  try {
    // 使用中文+英文语言包
    worker = await createWorker('chi_sim+eng');
    console.log('[OCR] Tesseract worker initialized');
    return worker;
  } catch (err) {
    console.error('[OCR] Failed to initialize worker:', err);
    throw err;
  } finally {
    workerInitializing = false;
  }
}

/**
 * 生成临时文件路径
 */
function getTempPath(prefix: string, ext: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return path.join(TEMP_DIR, `${prefix}_${timestamp}_${random}.${ext}`);
}

/**
 * 清理临时文件
 */
export function cleanupTempFiles(): void {
  try {
    if (fs.existsSync(TEMP_DIR)) {
      const files = fs.readdirSync(TEMP_DIR);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(TEMP_DIR, file));
        } catch {
          // 忽略删除失败
        }
      }
      console.log('[OCR] Cleaned up', files.length, 'temp files');
    }
  } catch (err) {
    console.warn('[OCR] Cleanup failed:', err);
  }
}

/**
 * 保存 Buffer 为临时 PNG 文件
 */
export function saveTempImage(buffer: Buffer, prefix = 'screenshot'): string {
  const tempPath = getTempPath(prefix, 'png');
  fs.writeFileSync(tempPath, buffer);
  return tempPath;
}

/**
 * 识别图片中的文字
 * @param imagePath 图片文件路径或 Buffer
 * @returns 识别的文字
 */
export async function recognizeText(imagePath: string | Buffer): Promise<string> {
  const w = await initWorker();

  let tempPath: string | null = null;
  let targetPath: string;

  if (Buffer.isBuffer(imagePath)) {
    tempPath = saveTempImage(imagePath, 'ocr_input');
    targetPath = tempPath;
  } else {
    targetPath = imagePath;
  }

  try {
    const { data: { text } } = await w.recognize(targetPath);
    return text.trim();
  } finally {
    if (tempPath) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // 忽略
      }
    }
  }
}

/**
 * 对 Electron NativeImage 进行 OCR
 * @param nativeImage Electron NativeImage 对象
 * @returns 识别的文字
 */
export async function recognizeNativeImage(nativeImage: any): Promise<string> {
  const pngBuffer = nativeImage.toPNG();
  return recognizeText(pngBuffer);
}

/**
 * 关闭 OCR Worker（应用退出时调用）
 */
export async function terminateWorker(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

// 应用退出时自动清理
process.on('exit', cleanupTempFiles);
process.on('SIGINT', () => {
  cleanupTempFiles();
  process.exit(0);
});

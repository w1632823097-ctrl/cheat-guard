import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { app } from 'electron';
import * as OpenCC from 'opencc-js';

function getWhisperDir(): string {
  return path.join(app.getAppPath(), 'models', 'whisper');
}

function getWhisperCliExe(): string {
  return path.join(getWhisperDir(), 'Release', 'whisper-cli.exe');
}

function getWhisperModel(): string {
  return path.join(getWhisperDir(), 'ggml-base.bin');
}

export function isWhisperAvailable(): boolean {
  return fs.existsSync(getWhisperCliExe()) && fs.existsSync(getWhisperModel());
}

function buildWav(pcmBuffer: Buffer, sampleRate = 16000): Buffer {
  const dataSize = pcmBuffer.length;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(wav, 44);
  return wav;
}

let counter = 0;

/**
 * Transcribe PCM via whisper-cli.exe with temp file.
 * 2-second segments, 12s timeout — avoids process overlap.
 */
export function transcribePcm(pcmBuffer: Buffer, language = 'zh'): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = counter++;
    const wav = buildWav(pcmBuffer);
    const tmpFile = path.join(os.tmpdir(), `wg_${id}_${Date.now()}.wav`);
    fs.writeFileSync(tmpFile, wav);

    execFile(
      getWhisperCliExe(),
      [
        '-m', getWhisperModel(),
        '-f', tmpFile,
        '-l', language,
        '-nt',
        '-t', '4',
        '--no-gpu',
      ],
      {
        timeout: 15000,
        cwd: getWhisperDir(),
      },
      (err, stdout, _stderr) => {
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }

        if (err && !stdout) {
          reject(err);
          return;
        }

        const lines = (stdout || '').split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('whisper_') && !l.startsWith('[') && !l.startsWith('main:') && !l.startsWith('system_') && !l.startsWith('read_'));
        
        // Clean up hallucinations: remove parentheticals, emojis, non-Chinese noise
        let result = lines.join(' ');
        result = result
          .replace(/\(.*?\)/g, '')           // Remove (parentheticals)
          .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')  // Remove emojis
          .replace(/[\u{FF00}-\u{FFEF}]/gu, '')    // Remove fullwidth symbols
          .replace(/[\u3000\s]+/g, ' ')       // Normalize whitespace
          .trim();

        // Convert traditional to simplified Chinese
        try {
          const converter = OpenCC.Converter({ from: 'tw', to: 'cn' });
          result = converter(result);
        } catch { /* ignore conversion errors */ }

        // Skip if result is too short after cleanup (likely noise)
        if (result.length < 2) {
          resolve('');
          return;
        }

        resolve(result);
      }
    );
  });
}

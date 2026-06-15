import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

// Stream process
let streamProcess: ChildProcess | null = null;
let onTranscriptionCallback: ((text: string) => void) | null = null;

/**
 * Get whisper directory path (lazy evaluation)
 */
function getWhisperDir(): string {
  return path.join(app.getAppPath(), 'models', 'whisper');
}

/**
 * Get whisper-stream executable path
 */
function getWhisperStreamExe(): string {
  return path.join(getWhisperDir(), 'Release', 'whisper-stream.exe');
}

/**
 * Get whisper model path
 */
function getWhisperModel(): string {
  return path.join(getWhisperDir(), 'ggml-base.bin');
}

/**
 * Check if whisper.cpp stream is available
 */
export function isWhisperStreamAvailable(): boolean {
  const exe = getWhisperStreamExe();
  const model = getWhisperModel();
  return fs.existsSync(exe) && fs.existsSync(model);
}

/**
 * Start real-time transcription stream
 * @param onTranscription Callback for each transcription segment
 */
export function startStreamTranscription(onTranscription: (text: string) => void): void {
  if (streamProcess) {
    console.warn('[Whisper] Stream already running');
    return;
  }

  onTranscriptionCallback = onTranscription;

  const WHISPER_DIR = getWhisperDir();
  const WHISPER_STREAM_EXE = getWhisperStreamExe();
  const WHISPER_MODEL = getWhisperModel();

  // Start whisper-stream with real-time parameters
  // --step 3000: process every 3 seconds
  // --length 10000: buffer 10 seconds of audio
  // --capture-device -1: default microphone
  streamProcess = spawn(WHISPER_STREAM_EXE, [
    '-m', WHISPER_MODEL,
    '--step', '3000',
    '--length', '10000',
    '-c', '-1',
    '-l', 'zh',
  ], {
    cwd: WHISPER_DIR,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
  });

  console.log('[Whisper] Stream started');

  // Handle stdout (transcription output)
  streamProcess.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines, control sequences, and non-text output
      if (!trimmed || trimmed === '[Start speaking]' || trimmed.startsWith('(')) {
        continue;
      }
      // Filter out lines that are just whitespace or control characters
      if (/^[\s\u0000-\u001F\u007F-\u009F]*$/.test(trimmed)) {
        continue;
      }
      if (onTranscriptionCallback) {
        onTranscriptionCallback(trimmed);
      }
    }
  });

  // Handle stderr (logs)
  streamProcess.stderr?.on('data', (data: Buffer) => {
    console.log('[Whisper]', data.toString().trim());
  });

  // Handle process exit
  streamProcess.on('close', (code) => {
    console.log(`[Whisper] Stream exited with code ${code}`);
    streamProcess = null;
  });

  streamProcess.on('error', (error) => {
    console.error('[Whisper] Stream error:', error);
    streamProcess = null;
  });
}

/**
 * Stop real-time transcription stream
 */
export function stopStreamTranscription(): void {
  if (streamProcess) {
    streamProcess.kill('SIGTERM');
    streamProcess = null;
    console.log('[Whisper] Stream stopped');
  }
  onTranscriptionCallback = null;
}

/**
 * Check if stream is running
 */
export function isStreamRunning(): boolean {
  return streamProcess !== null && !streamProcess.killed;
}

/**
 * Windows Display Affinity (WDA) Wrapper
 * 使用 koffi v3 FFI 直接调用 user32.dll，无需编译 C++ 代码
 */

import koffi from 'koffi';

const WDA_EXCLUDEFROMCAPTURE = 0x11;
const WDA_MONITOR = 0x01;

let user32Lib: any = null;
let _SetWindowDisplayAffinity: any = null;

function loadLib() {
  if (user32Lib) return user32Lib;

  if (process.platform !== 'win32') {
    console.warn('[WDA] Not running on Windows, WDA unavailable');
    return null;
  }

  try {
    // koffi v3: C-like 声明式 API
    // BOOL SetWindowDisplayAffinity(HWND hWnd, DWORD dwAffinity);
    user32Lib = koffi.load('user32.dll');
    _SetWindowDisplayAffinity = user32Lib.func(
      'bool SetWindowDisplayAffinity(int64 hwnd, uint32 affinity)'
    );
    console.log('[WDA] user32.dll + SetWindowDisplayAffinity loaded (via koffi FFI)');
    return user32Lib;
  } catch (err) {
    console.error('[WDA] Failed to load user32.dll:', err);
    return null;
  }
}

/**
 * 设置窗口在屏幕捕获中不可见
 * @param hwndBuffer - 窗口句柄的 Buffer (来自 window.getNativeWindowHandle())
 * @returns 是否成功
 */
export function setWindowInvisible(hwndBuffer: Buffer): boolean {
  const lib = loadLib();
  if (!lib || !_SetWindowDisplayAffinity) return false;

  try {
    // 从 Buffer 读取 HWND 为 BigInt
    const hwnd = hwndBuffer.readBigInt64LE(0);

    let result = _SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
    if (!result) {
      console.warn('[WDA] WDA_EXCLUDEFROMCAPTURE failed (OS < Win10 2004?), trying WDA_MONITOR');
      result = _SetWindowDisplayAffinity(hwnd, WDA_MONITOR);
    }

    if (result) {
      console.log('[WDA] Window set to screen-capture invisible');
    } else {
      console.error('[WDA] Both WDA modes failed');
    }

    return result;
  } catch (err) {
    console.error('[WDA] SetWindowDisplayAffinity call failed:', err);
    return false;
  }
}

/**
 * 恢复窗口在屏幕捕获中可见
 * @param hwndBuffer - 窗口句柄的 Buffer
 * @returns 是否成功
 */
export function setWindowVisible(hwndBuffer: Buffer): boolean {
  if (!_SetWindowDisplayAffinity) return false;

  try {
    const hwnd = hwndBuffer.readBigInt64LE(0);
    return _SetWindowDisplayAffinity(hwnd, 0);
  } catch (err) {
    console.error('[WDA] Restore visible failed:', err);
    return false;
  }
}

/**
 * 检查 WDA 功能是否可用
 */
export function isWDAvailable(): boolean {
  return process.platform === 'win32' && loadLib() !== null;
}

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

// ===== 去掉窗口标题栏边框，彻底消除 focus/blur 时白条闪烁 =====

const GWL_STYLE = -16;
const WS_CAPTION = 0x00C00000;
const WS_THICKFRAME = 0x00040000;
const WS_BORDER = 0x00800000;
const WS_DLGFRAME = 0x00400000;
const WS_POPUP = 0x80000000;
const WS_CHILD = 0x40000000;
const WS_MINIMIZEBOX = 0x00020000;
const WS_MAXIMIZEBOX = 0x00010000;
const WS_SYSMENU = 0x00080000;
const SWP_FRAMECHANGED = 0x0020;
const SWP_NOMOVE = 0x0002;
const SWP_NOSIZE = 0x0001;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_SHOWWINDOW = 0x0040;

let _SetWindowLong: any = null;
let _GetWindowLong: any = null;
let _SetWindowPos: any = null;

function loadStyleFuncs() {
  const lib = loadLib();
  if (!lib) return false;
  if (!_SetWindowLong) {
    _SetWindowLong = lib.func('int64 SetWindowLongW(int64 hWnd, int32 nIndex, int64 dwNewLong)');
  }
  if (!_GetWindowLong) {
    _GetWindowLong = lib.func('int64 GetWindowLongW(int64 hWnd, int32 nIndex)');
  }
  if (!_SetWindowPos) {
    _SetWindowPos = lib.func('bool SetWindowPos(int64 hWnd, int64 hWndInsertAfter, int32 X, int32 Y, int32 cx, int32 cy, uint32 uFlags)');
  }
  return true;
}


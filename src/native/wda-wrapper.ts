import koffi from 'koffi';

// ============================================================
// Windows Desktop API (WDA) 封装
// 用于设置窗口防截图和不可激活样式
// ============================================================

const WDA_EXCLUDEFROMCAPTURE = 0x11;
const WDA_MONITOR = 0x01;

// koffi 库类型定义
type KoffiLib = ReturnType<typeof koffi.load>;
type KoffiFunc = ReturnType<KoffiLib['func']>;

let user32Lib: KoffiLib | null = null;
let _SetWindowDisplayAffinity: KoffiFunc | null = null;

function loadLib(): KoffiLib | null {
  if (user32Lib) return user32Lib;

  if (process.platform !== 'win32') {
    console.warn('[WDA] Not running on Windows, WDA unavailable');
    return null;
  }

  try {
    user32Lib = koffi.load('user32.dll');
    _SetWindowDisplayAffinity = user32Lib.func(
      'bool SetWindowDisplayAffinity(int64 hwnd, uint32 affinity)'
    );
    console.log('[WDA] user32.dll + SetWindowDisplayAffinity loaded');
    return user32Lib;
  } catch (err) {
    console.error('[WDA] Failed to load user32.dll:', err);
    return null;
  }
}

export function setWindowInvisible(hwndBuffer: Buffer): boolean {
  const lib = loadLib();
  if (!lib || !_SetWindowDisplayAffinity) return false;

  try {
    const hwnd = hwndBuffer.readBigInt64LE(0);

    let result = _SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
    if (!result) {
      result = _SetWindowDisplayAffinity(hwnd, WDA_MONITOR);
    }

    if (!result) {
      console.error('[WDA] Both WDA modes failed');
    }

    return result;
  } catch (err) {
    console.error('[WDA] SetWindowDisplayAffinity call failed:', err);
    return false;
  }
}

export function isWDAvailable(): boolean {
  return process.platform === 'win32' && loadLib() !== null;
}

// ===== WS_EX_NOACTIVATE 方案 =====
// 使用此样式让窗口永远不被激活，避免焦点切换时的 DWM 边框渲染

const GWL_EXSTYLE = -20;
const WS_EX_NOACTIVATE = 0x08000000;
const WS_EX_LAYERED = 0x00080000;

const SWP_FRAMECHANGED = 0x0020;
const SWP_NOMOVE = 0x0002;
const SWP_NOSIZE = 0x0001;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;

let _GetWindowLongPtrW: KoffiFunc | null = null;
let _SetWindowLongPtrW: KoffiFunc | null = null;
let _SetWindowPos: KoffiFunc | null = null;

function loadStyleFuncs(): boolean {
  const lib = loadLib();
  if (!lib) return false;

  if (!_GetWindowLongPtrW) {
    _GetWindowLongPtrW = lib.func('int64 GetWindowLongPtrW(int64 hWnd, int32 nIndex)');
  }
  if (!_SetWindowLongPtrW) {
    _SetWindowLongPtrW = lib.func('int64 SetWindowLongPtrW(int64 hWnd, int32 nIndex, int64 dwNewLong)');
  }
  if (!_SetWindowPos) {
    _SetWindowPos = lib.func('bool SetWindowPos(int64 hWnd, int64 hWndInsertAfter, int32 X, int32 Y, int32 cx, int32 cy, uint32 uFlags)');
  }

  return true;
}

export function setNoActivateStyle(hwndBuffer: Buffer): boolean {
  if (!loadStyleFuncs()) return false;

  try {
    const hwnd = hwndBuffer.readBigInt64LE(0);

    let exStyle = _GetWindowLongPtrW!(hwnd, GWL_EXSTYLE);
    exStyle = BigInt(exStyle) | BigInt(WS_EX_NOACTIVATE) | BigInt(WS_EX_LAYERED);
    _SetWindowLongPtrW!(hwnd, GWL_EXSTYLE, exStyle);

    _SetWindowPos!(hwnd, 0n, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);

    return true;
  } catch (err) {
    console.error('[WDA] Failed to set no-activate style:', err);
    return false;
  }
}

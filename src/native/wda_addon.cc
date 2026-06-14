#include <napi.h>
#include <windows.h>

// WDA_EXCLUDEFROMCAPTURE = 17 (0x11)
// WDA_MONITOR = 1 (0x1)
#define WDA_EXCLUDEFROMCAPTURE 0x00000011
#define WDA_MONITOR 0x00000001

Napi::Value SetWindowInvisible(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Expected a Buffer (HWND handle)").ThrowAsJavaScriptException();
        return env.Null();
    }

    // 从 Buffer 获取 HWND
    Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();
    if (buffer.Length() < sizeof(HWND)) {
        Napi::TypeError::New(env, "Buffer too small for HWND").ThrowAsJavaScriptException();
        return env.Null();
    }

    HWND hwnd = *reinterpret_cast<HWND*>(buffer.Data());
    if (!hwnd || !IsWindow(hwnd)) {
        Napi::Error::New(env, "Invalid window handle").ThrowAsJavaScriptException();
        return env.Null();
    }

    // 设置窗口为不可捕获
    BOOL result = SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);

    if (!result) {
        DWORD error = GetLastError();
        // 尝试备用方案
        result = SetWindowDisplayAffinity(hwnd, WDA_MONITOR);
        if (!result) {
            Napi::Error::New(env, "SetWindowDisplayAffinity failed with error: " + std::to_string(error)).ThrowAsJavaScriptException();
            return env.Null();
        }
    }

    return Napi::Boolean::New(env, true);
}

Napi::Value SetWindowVisible(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Expected a Buffer (HWND handle)").ThrowAsJavaScriptException();
        return env.Null();
    }

    Napi::Buffer<char> buffer = info[0].As<Napi::Buffer<char>>();
    if (buffer.Length() < sizeof(HWND)) {
        Napi::TypeError::New(env, "Buffer too small for HWND").ThrowAsJavaScriptException();
        return env.Null();
    }

    HWND hwnd = *reinterpret_cast<HWND*>(buffer.Data());
    if (!hwnd || !IsWindow(hwnd)) {
        Napi::Error::New(env, "Invalid window handle").ThrowAsJavaScriptException();
        return env.Null();
    }

    // 恢复为默认可捕获
    BOOL result = SetWindowDisplayAffinity(hwnd, 0);

    return Napi::Boolean::New(env, result != 0);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "setWindowInvisible"), Napi::Function::New(env, SetWindowInvisible));
    exports.Set(Napi::String::New(env, "setWindowVisible"), Napi::Function::New(env, SetWindowVisible));
    return exports;
}

NODE_API_MODULE(wda_addon, Init)

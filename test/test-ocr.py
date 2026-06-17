"""
Windows OCR API + LLM 联动测试脚本
=====================================
方案: 屏幕截图 -> Python winrt 调用 Windows 内置 OCR -> 提取文字 -> 发给 LLM

用法:
  python test-ocr.py                        # 全屏 OCR + LLM
  python test-ocr.py --no-llm               # 只做 OCR，不调 LLM
  python test-ocr.py --file screenshot.png  # 识别指定图片文件
  python test-ocr.py --region 100 200 800 600  # 指定区域 OCR

环境要求:
  - Windows 10/11
  - Python 3.8+
  - pip install winrt-Windows.Media.Ocr winrt-Windows.Graphics.Imaging winrt-Windows.Storage.Streams
"""

import os
import sys
import json
import time
import argparse
import subprocess
import tempfile
import urllib.request
import asyncio

# ---- 路径 ----
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)


# ============================================================
# 1. 屏幕截图
# ============================================================
def capture_screen(region=None, output_path=None):
    if output_path is None:
        output_path = os.path.join(tempfile.gettempdir(), "cheatguard_ocr_screenshot.png")
    
    print(f"[截图] 正在截取屏幕...")
    
    try:
        from PIL import ImageGrab
        img = ImageGrab.grab(bbox=region, all_screens=True)
        img.save(output_path, "PNG")
        size_kb = os.path.getsize(output_path) / 1024
        w, h = img.size
        print(f"[截图] 截图成功: {w}x{h}, {size_kb:.1f} KB -> {output_path}")
        return output_path
    except ImportError:
        print("[截图] PIL 未安装 (pip install pillow), 使用 PowerShell 截图...")
        return _capture_via_powershell(region, output_path)


def _capture_via_powershell(region, output_path):
    ps_code = f'''
Add-Type -AssemblyName System.Drawing
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen(0, 0, 0, 0, $bitmap.Size)
$bitmap.Save("{output_path}", [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
Write-Output "OK"
'''
    proc = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps_code],
        capture_output=True, text=True, timeout=30
    )
    if proc.returncode != 0:
        raise RuntimeError(f"PowerShell 截图失败: {proc.stderr}")
    print(f"[截图] 截图成功 -> {output_path}")
    return output_path


# ============================================================
# 2. Windows OCR (Python winrt 直接调用)
# ============================================================
async def ocr_image_async(image_path, language="zh-Hans"):
    """异步调用 WinRT OCR"""
    import winrt.windows.media.ocr as ocr
    import winrt.windows.graphics.imaging as imaging
    import winrt.windows.storage.streams as streams
    import winrt.windows.globalization as globalization
    
    # Read image file
    with open(image_path, "rb") as f:
        image_bytes = f.read()
    
    # Create stream and write bytes
    stream = streams.InMemoryRandomAccessStream()
    writer = streams.DataWriter(stream.get_output_stream_at(0))
    writer.write_bytes(image_bytes)
    await writer.store_async()
    await writer.flush_async()
    
    # Decode image
    decoder = await imaging.BitmapDecoder.create_async(stream)
    frame = await decoder.get_frame_async(0)
    software_bitmap = await frame.get_software_bitmap_async()
    
    # Convert to Bgra8 if needed
    if software_bitmap.bitmap_pixel_format != imaging.BitmapPixelFormat.BGRA8:
        software_bitmap = imaging.SoftwareBitmap.convert(software_bitmap, imaging.BitmapPixelFormat.BGRA8)
    
    # Create OCR engine
    lang = globalization.Language(language)
    engine = ocr.OcrEngine.try_create_from_language(lang)
    
    if engine is None:
        engine = ocr.OcrEngine.try_create_from_user_profile_languages()
    
    if engine is None:
        return {"success": False, "error": "Cannot create OCR engine", "fullText": "", "lines": []}
    
    # Run OCR
    result = await engine.recognize_async(software_bitmap)
    
    # Use the built-in full text from OCR result
    full_text = result.text or ""
    
    # Split into lines for display
    lines = [line.strip() for line in full_text.splitlines() if line.strip()]
    
    return {
        "success": True,
        "language": engine.recognizer_language.language_tag,
        "lineCount": len(lines),
        "lines": lines,
        "fullText": full_text
    }


def ocr_image(image_path, language="zh-Hans"):
    """同步包装 async OCR"""
    return asyncio.run(ocr_image_async(image_path, language))


# ============================================================
# 3. LLM 调用
# ============================================================
def load_llm_config():
    config = {"apiKey": "", "baseURL": "", "model": ""}
    
    config_json = os.path.join(PROJECT_ROOT, "config.json")
    if os.path.exists(config_json):
        with open(config_json, "r", encoding="utf-8") as f:
            cfg = json.load(f)
            llm = cfg.get("llm", {})
            config["apiKey"] = llm.get("apiKey", "")
            config["baseURL"] = llm.get("baseURL", "")
            config["model"] = llm.get("model", "")
    
    env_file = os.path.join(SCRIPT_DIR, ".env")
    if os.path.exists(env_file):
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k == "OPENAI_API_KEY" and v:
                    config["apiKey"] = v
                elif k == "OPENAI_BASE_URL" and v:
                    config["baseURL"] = v
    
    env_key = os.environ.get("OPENAI_API_KEY", "")
    if env_key:
        config["apiKey"] = env_key
    env_url = os.environ.get("OPENAI_BASE_URL", "")
    if env_url:
        config["baseURL"] = env_url
    
    return config


def call_llm(ocr_text, user_prompt=None, config=None):
    if config is None:
        config = load_llm_config()
    
    api_key = config.get("apiKey", "")
    base_url = config.get("baseURL", "")
    model = config.get("model", "")
    
    if not api_key:
        print("[LLM] 未配置 API Key，跳过 LLM 调用")
        return None
    
    if user_prompt:
        system_msg = "你是一个实时桌面 AI 助手。根据屏幕上显示的内容，回答用户的问题。"
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": f"屏幕上显示的内容:\n---\n{ocr_text}\n---\n\n用户问题: {user_prompt}"}
        ]
    else:
        system_msg = "你是一个实时桌面 AI 助手。分析屏幕上显示的内容，给出最有可能需要的帮助。"
        messages = [
            {"role": "system", "content": system_msg},
            {"role": "user", "content": f"屏幕上显示的内容:\n---\n{ocr_text}\n---\n\n请分析并给出帮助。"}
        ]
    
    endpoint = base_url.rstrip("/") if base_url else "https://api.openai.com/v1"
    if not endpoint.endswith("/chat/completions"):
        if endpoint.endswith("/v1"):
            endpoint += "/chat/completions"
        else:
            endpoint += "/v1/chat/completions"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": model or "gpt-3.5-turbo",
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 1024,
    }
    
    masked = api_key[:8] + "***" + api_key[-4:] if len(api_key) > 12 else "***"
    print(f"\n[LLM] 端点: {endpoint}")
    print(f"[LLM] 模型: {model or '(default)'}")
    print(f"[LLM] API Key: {masked}")
    print(f"[LLM] 请稍候...")
    
    t_start = time.time()
    
    try:
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(body).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        resp = urllib.request.urlopen(req, timeout=30)
        result = json.loads(resp.read().decode("utf-8"))
        elapsed = time.time() - t_start
        
        content = result["choices"][0]["message"]["content"]
        usage = result.get("usage", {})
        
        print(f"[LLM] 耗时: {elapsed:.2f}s")
        print(f"[LLM] Token: 输入 {usage.get('prompt_tokens', '?')}, 输出 {usage.get('completion_tokens', '?')}")
        return content
        
    except Exception as e:
        elapsed = time.time() - t_start
        print(f"[LLM] 请求失败 ({elapsed:.2f}s): {e}")
        return None


# ============================================================
# 4. 文件 OCR
# ============================================================
def ocr_file(image_path, call_llm_flag=True, user_prompt=None):
    if not os.path.exists(image_path):
        print(f"[错误] 文件不存在: {image_path}")
        return
    
    print("=" * 60)
    print(f"  Windows OCR API + LLM 测试")
    print(f"  图片: {image_path}")
    print(f"  大小: {os.path.getsize(image_path) / 1024:.1f} KB")
    print("=" * 60)
    
    result = ocr_image(image_path)
    
    if not result.get("success"):
        print(f"\n[测试] OCR 失败")
        print(f"  错误: {result.get('error', '未知错误')}")
        return
    
    full_text = result.get("fullText", "")
    lines = result.get("lines", [])
    
    if not full_text.strip():
        print("\n[测试] 未识别到文字 (图片可能为空白或不包含文字)")
        return
    
    print(f"\n[测试] OCR 通过  共 {len(lines)} 行")
    print(f"  语言: {result.get('language', '?')}")
    print(f"\n  识别结果:")
    print(f"  {'-' * 54}")
    for line in lines:
        print(f"    {line}")
    print(f"  {'-' * 54}")
    
    if call_llm_flag:
        config = load_llm_config()
        if config.get("apiKey"):
            reply = call_llm(full_text, user_prompt, config)
            if reply:
                print(f"\n{'-' * 56}")
                print(f"  LLM 回复:")
                print(f"{'-' * 56}")
                for line in reply.splitlines():
                    print(f"  {line}")
                print(f"{'-' * 56}")
                print(f"\n[测试] 全流程通过")
            else:
                print(f"\n[测试] OCR 通过  LLM 请求失败")
        else:
            print(f"\n[测试] OCR 通过  (LLM 未配置)")
    
    return result


# ============================================================
# main
# ============================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Windows OCR API + LLM 联动测试脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python test-ocr.py                        # 全屏 OCR + LLM
  python test-ocr.py --no-llm               # 只测试 OCR
  python test-ocr.py --file screenshot.png  # 对已有图片 OCR
  python test-ocr.py --question "这题的答案是什么？"  # 附上问题发给 LLM
  python test-ocr.py --region 100 200 800 600  # 指定区域
        """,
    )
    parser.add_argument(
        "--file",
        default=None,
        help="直接 OCR 指定图片文件 (不截图)"
    )
    parser.add_argument(
        "--no-llm",
        action="store_true",
        help="只做 OCR，不调用 LLM"
    )
    parser.add_argument(
        "--question", "-q",
        default=None,
        help="附加问题 (OCR 文本 + 此问题一起发给 LLM)"
    )
    parser.add_argument(
        "--region",
        nargs=4,
        type=int,
        metavar=("X", "Y", "W", "H"),
        default=None,
        help="截屏区域: X Y WIDTH HEIGHT"
    )
    
    args = parser.parse_args()
    
    call_llm_flag = not args.no_llm
    
    if args.file:
        ocr_file(args.file, call_llm_flag, args.question)
    else:
        print("=" * 60)
        print(f"  Windows OCR API + LLM 测试")
        region_desc = f"区域 ({args.region[0]},{args.region[1]},{args.region[2]}x{args.region[3]})" if args.region else "全屏"
        print(f"  截图: {region_desc}")
        print(f"  LLM: {'启用' if call_llm_flag else '禁用'}")
        print("=" * 60)
        
        try:
            screenshot_path = capture_screen(
                region=tuple(args.region) if args.region else None
            )
        except Exception as e:
            print(f"[错误] 截图失败: {e}")
            sys.exit(1)
        
        result = ocr_image(screenshot_path)
        
        if not result.get("success"):
            print(f"\n[测试] OCR 失败")
            print(f"  错误: {result.get('error', '未知错误')}")
            sys.exit(1)
        
        full_text = result.get("fullText", "")
        lines = result.get("lines", [])
        
        if not full_text.strip():
            print("\n[测试] 未识别到文字 (屏幕可能空白或不含文字)")
            sys.exit(0)
        
        print(f"\n[测试] OCR 通过  共 {len(lines)} 行")
        print(f"  语言: {result.get('language', '?')}")
        print(f"\n  识别结果:")
        print(f"  {'-' * 54}")
        for line in lines:
            print(f"    {line}")
        print(f"  {'-' * 54}")
        
        if call_llm_flag:
            config = load_llm_config()
            if config.get("apiKey"):
                reply = call_llm(full_text, args.question, config)
                if reply:
                    print(f"\n{'-' * 56}")
                    print(f"  LLM 回复:")
                    print(f"{'-' * 56}")
                    for line in reply.splitlines():
                        print(f"  {line}")
                    print(f"{'-' * 56}")
                    print(f"\n[测试] 全流程通过")
                else:
                    print(f"\n[测试] OCR 通过  LLM 请求失败")
            else:
                print(f"\n[测试] OCR 通过  (LLM 未配置)")
        
        try:
            os.remove(screenshot_path)
            print(f"\n[清理] 临时截图已删除: {os.path.basename(screenshot_path)}")
        except Exception:
            pass

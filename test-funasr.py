"""
阿里云百炼 实时语音识别 — 测试脚本
==================================================
支持两种模型: FunASR 和 Qwen3-ASR-Flash

用法:
  python test-funasr.py file <音频文件> --model fun-asr        # FunASR 文件转写
  python test-funasr.py file <音频文件> --model qwen3-asr      # Qwen3-ASR 文件转写
  python test-funasr.py mic --model fun-asr                    # FunASR 麦克风实时
  python test-funasr.py mic --model qwen3-asr                  # Qwen3-ASR 麦克风实时
  python test-funasr.py url <网址> --model fun-asr             # URL 下载后转写

默认模型: fun-asr

使用前需设置环境变量：
  $env:DASHSCOPE_API_KEY="sk-xxx"    (PowerShell)
  或在同目录下创建 .env 文件写入: DASHSCOPE_API_KEY=sk-xxx
"""

import os
import sys
import signal
import argparse
import time
import urllib.request

# ============================================================
# 模型配置
# ============================================================
MODEL_CONFIG = {
    "fun-asr": {
        "name": "fun-asr-realtime",
        "label": "FunASR",
        "ws_url": "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
    },
    "qwen3-asr": {
        "name": "qwen3-asr-flash-realtime",
        "label": "Qwen3-ASR-Flash",
        "ws_url": "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
    },
}


# ============================================================
# 1. 加载 API Key
# ============================================================
def load_api_key():
    """优先从环境变量，其次从 .env 文件读取"""
    key = os.environ.get("DASHSCOPE_API_KEY", "")

    if not key:
        env_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        if os.path.exists(env_file):
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    k, v = k.strip(), v.strip().strip('"').strip("'")
                    if k == "DASHSCOPE_API_KEY" and v:
                        key = v
                        os.environ["DASHSCOPE_API_KEY"] = v
                        break

    if not key:
        print("=" * 60)
        print("  [错误] 未找到 API Key！")
        print()
        print("  请任选一种方式设置：")
        print()
        print("  方式1 (环境变量, PowerShell):")
        print('    $env:DASHSCOPE_API_KEY="sk-xxx"')
        print()
        print("  方式2 (.env 文件):")
        print("    在脚本同目录创建 .env 文件，内容:")
        print("    DASHSCOPE_API_KEY=sk-xxx")
        print()
        print("  获取 API Key: https://bailian.console.aliyun.com/#/api-key")
        print("=" * 60)
        sys.exit(1)

    return key


# ============================================================
# 2. 本地文件转写 — FunASR (非流式)
# ============================================================
def file_funasr(model_cfg, file_path: str):
    import dashscope
    from dashscope.audio.asr import Recognition
    from http import HTTPStatus

    dashscope.api_key = api_key
    dashscope.base_websocket_api_url = model_cfg["ws_url"]

    print(f"[文件转写] 模型: {model_cfg['label']}")
    print(f"[文件转写] 音频: {file_path}")
    print("-" * 50)

    if not os.path.exists(file_path):
        print(f"[错误] 文件不存在: {file_path}")
        sys.exit(1)

    print(f"[文件转写] 文件大小: {os.path.getsize(file_path) / 1024:.1f} KB")

    recognition = Recognition(
        model=model_cfg["name"],
        format="wav",
        sample_rate=16000,
        callback=None,
    )

    t_start = time.time()
    result = recognition.call(file_path)
    elapsed = time.time() - t_start

    print(f"\n[文件转写] 请求耗时: {elapsed:.2f}s")

    if result.status_code == HTTPStatus.OK:
        print(f"[文件转写] 识别结果:")
        print(f"  {'─' * 48}")
        print(f"  {result.get_sentence().get('text', '(无文本)')}")
        print(f"  {'─' * 48}")
    else:
        print(f"[文件转写] 错误: {result.message}")
        sys.exit(1)

    _print_metrics(recognition)
    print("\n[文件转写] 测试通过 ✓")


# ============================================================
# 3. 本地文件转写 — Qwen3-ASR (流式模式)
# ============================================================
def file_qwen3asr(model_cfg, file_path: str):
    import dashscope
    import base64
    from dashscope.audio.qwen_omni import (
        OmniRealtimeConversation,
        OmniRealtimeCallback,
        MultiModality,
    )
    from dashscope.audio.qwen_omni.omni_realtime import TranscriptionParams

    dashscope.api_key = api_key

    print(f"[文件转写] 模型: {model_cfg['label']}")
    print(f"[文件转写] 音频: {file_path}")
    print("-" * 50)

    if not os.path.exists(file_path):
        print(f"[错误] 文件不存在: {file_path}")
        sys.exit(1)

    print(f"[文件转写] 文件大小: {os.path.getsize(file_path) / 1024:.1f} KB")

    all_text = []

    class FileCallback(OmniRealtimeCallback):
        def on_open(self):
            print("[文件转写] 连接已建立, 开始上传音频...")

        def on_close(self, code, msg):
            print(f"\n[文件转写] 连接已关闭 (code={code})")

        def on_event(self, response):
            evt_type = response.get("type", "")
            if evt_type == "conversation.item.input_audio_transcription.completed":
                txt = response.get("transcript", "")
                if txt:
                    all_text.append(txt)
                    print(f"[最终] {txt}")
            elif evt_type == "conversation.item.input_audio_transcription.text":
                stash = response.get("stash", "")
                if stash:
                    print(f"[实时] {stash}")
            elif evt_type == "input_audio_buffer.speech_started":
                print("[VAD] 检测到语音")
            elif evt_type == "input_audio_buffer.speech_stopped":
                print("[VAD] 语音结束")
            elif evt_type == "error":
                print(f"[错误] {response.get('error', response)}")

    callback = FileCallback()
    conv = OmniRealtimeConversation(
        model=model_cfg["name"],
        url=model_cfg["ws_url"],
        callback=callback,
    )
    callback.conversation = conv

    try:
        t_start = time.time()
        conv.connect()

        conv.update_session(
            output_modalities=[MultiModality.TEXT],
            enable_turn_detection=False,
            enable_input_audio_transcription=True,
            transcription_params=TranscriptionParams(
                language="zh",
                sample_rate=16000,
                input_audio_format="wav",
            ),
        )

        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(3200)
                if not chunk:
                    break
                conv.append_audio(base64.b64encode(chunk).decode("utf-8"))
                time.sleep(0.1)

        # 手动提交音频并等待结果
        conv.commit()
        # 等待 VAD 结束 + 识别完成（max 30s）
        time.sleep(3)

        elapsed = time.time() - t_start
        print(f"\n[文件转写] 请求耗时: {elapsed:.2f}s")

        if all_text:
            print(f"[文件转写] 识别结果:")
            print(f"  {'─' * 48}")
            for t in all_text:
                print(f"  {t}")
            print(f"  {'─' * 48}")
        else:
            print("[文件转写] 未收到识别结果")

    except Exception as e:
        print(f"[文件转写] 异常: {e}")
        import traceback; traceback.print_exc()
    finally:
        try:
            conv.close()
        except Exception:
            pass

    print("\n[文件转写] 测试完成")


# ============================================================
# 4. 麦克风实时转写 — FunASR
# ============================================================
def mic_funasr(model_cfg):
    import dashscope
    import pyaudio
    from dashscope.audio.asr import Recognition, RecognitionCallback, RecognitionResult

    dashscope.api_key = api_key
    dashscope.base_websocket_api_url = model_cfg["ws_url"]

    sample_rate = 16000
    channels = 1
    block_size = 3200
    format_pcm = "pcm"

    mic = None
    stream = None
    recognition = None

    class MicCallback(RecognitionCallback):
        def on_open(self):
            nonlocal mic, stream
            print("[麦克风] 连接已建立, 开始录音...")
            print("[麦克风] 请说话, 按 Ctrl+C 停止\n")
            mic = pyaudio.PyAudio()
            stream = mic.open(
                format=pyaudio.paInt16,
                channels=channels,
                rate=sample_rate,
                input=True,
            )

        def on_close(self):
            nonlocal mic, stream
            print("\n[麦克风] 连接已关闭")
            if stream:
                stream.stop_stream()
                stream.close()
            if mic:
                mic.terminate()

        def on_complete(self):
            print("[麦克风] 识别完成")

        def on_error(self, message):
            print(f"[麦克风] 错误: {message.message}")
            if stream and stream.is_active():
                stream.stop_stream()
                stream.close()
            sys.exit(1)

        def on_event(self, result: RecognitionResult):
            sentence = result.get_sentence()
            text = sentence.get("text", "")
            if not text:
                return
            if RecognitionResult.is_sentence_end(sentence):
                print(f"[最终] {text}")
            else:
                print(f"[实时] {text}")

    def signal_handler(sig, frame):
        nonlocal recognition
        print("\n\n[麦克风] 正在停止...")
        recognition.stop()
        _print_metrics(recognition)
        print("\n[麦克风] 测试结束")
        sys.exit(0)

    print(f"[麦克风] 模型: {model_cfg['label']}")
    print(f"[麦克风] 采样率: {sample_rate}Hz, 声道: {channels}, 格式: {format_pcm}")
    print("-" * 50)

    try:
        callback = MicCallback()
        recognition = Recognition(
            model=model_cfg["name"],
            format=format_pcm,
            sample_rate=sample_rate,
            semantic_punctuation_enabled=False,
            callback=callback,
        )
        recognition.start()
        signal.signal(signal.SIGINT, signal_handler)

        while True:
            if stream:
                data = stream.read(block_size, exception_on_overflow=False)
                recognition.send_audio_frame(data)
            else:
                time.sleep(0.01)
    except KeyboardInterrupt:
        signal_handler(None, None)
    except Exception as e:
        print(f"[麦克风] 异常: {e}")
        sys.exit(1)


# ============================================================
# 5. 麦克风实时转写 — Qwen3-ASR
# ============================================================
def mic_qwen3asr(model_cfg):
    import dashscope
    import pyaudio
    import base64
    from dashscope.audio.qwen_omni import (
        OmniRealtimeConversation,
        OmniRealtimeCallback,
        MultiModality,
    )
    from dashscope.audio.qwen_omni.omni_realtime import TranscriptionParams

    dashscope.api_key = api_key

    sample_rate = 16000
    channels = 1
    block_size = 3200

    mic = None
    stream = None
    conv = None

    class MicCallback(OmniRealtimeCallback):
        def __init__(self, conversation=None):
            super().__init__()
            self.conversation = conversation

        def on_open(self):
            nonlocal mic, stream
            print("[麦克风] 连接已建立, 开始录音...")
            print("[麦克风] 请说话, 按 Ctrl+C 停止\n")
            mic = pyaudio.PyAudio()
            stream = mic.open(
                format=pyaudio.paInt16,
                channels=channels,
                rate=sample_rate,
                input=True,
            )

        def on_close(self, code, msg):
            nonlocal mic, stream
            print(f"\n[麦克风] 连接已关闭 (code={code})")
            if stream:
                stream.stop_stream()
                stream.close()
            if mic:
                mic.terminate()

        def on_event(self, response):
            evt_type = response.get("type", "")
            if evt_type == "conversation.item.input_audio_transcription.completed":
                txt = response.get("transcript", "")
                if txt:
                    print(f"[最终] {txt}")
            elif evt_type == "conversation.item.input_audio_transcription.text":
                stash = response.get("stash", "")
                if stash:
                    print(f"[实时] {stash}")
            elif evt_type == "input_audio_buffer.speech_started":
                print("[VAD] 检测到语音")
            elif evt_type == "input_audio_buffer.speech_stopped":
                print("[VAD] 语音结束 -- 正在识别...")
            elif evt_type == "error":
                print(f"[错误] {response.get('error', response)}")

    def signal_handler(sig, frame):
        nonlocal conv
        print("\n\n[麦克风] 正在停止...")
        try:
            conv.close()
        except Exception:
            pass
        print("[麦克风] 测试结束")
        sys.exit(0)

    print(f"[麦克风] 模型: {model_cfg['label']}")
    print(f"[麦克风] 采样率: {sample_rate}Hz, 声道: {channels}, 格式: pcm")
    print("-" * 50)

    try:
        callback = MicCallback()
        conv = OmniRealtimeConversation(
            model=model_cfg["name"],
            url=model_cfg["ws_url"],
            callback=callback,
        )
        callback.conversation = conv

        conv.connect()

        conv.update_session(
            output_modalities=[MultiModality.TEXT],
            enable_turn_detection=True,
            turn_detection_type="server_vad",
            turn_detection_threshold=0.0,
            turn_detection_silence_duration_ms=400,
            enable_input_audio_transcription=True,
            transcription_params=TranscriptionParams(
                language="zh",
                sample_rate=sample_rate,
                input_audio_format="pcm",
            ),
        )

        signal.signal(signal.SIGINT, signal_handler)

        while True:
            if stream:
                data = stream.read(block_size, exception_on_overflow=False)
                conv.append_audio(base64.b64encode(data).decode("utf-8"))
            else:
                time.sleep(0.01)
    except KeyboardInterrupt:
        signal_handler(None, None)
    except Exception as e:
        print(f"[麦克风] 异常: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)


# ============================================================
# 6. URL 音频下载后转写
# ============================================================
def test_url_transcription(model_cfg, audio_url: str):
    import dashscope
    from dashscope.audio.asr import Recognition
    from http import HTTPStatus

    dashscope.api_key = api_key
    dashscope.base_websocket_api_url = model_cfg["ws_url"]

    tmp_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_temp_audio.wav")
    print(f"[URL转写] 模型: {model_cfg['label']}")
    print(f"[URL转写] 正在下载音频...")
    print(f"[URL转写] {audio_url}")

    try:
        urllib.request.urlretrieve(audio_url, tmp_file)
        print(f"[URL转写] 下载完成: {os.path.getsize(tmp_file) / 1024:.1f} KB")
    except Exception as e:
        print(f"[URL转写] 下载失败: {e}")
        sys.exit(1)

    recognition = Recognition(
        model=model_cfg["name"],
        format="wav",
        sample_rate=16000,
        callback=None,
    )

    t_start = time.time()
    result = recognition.call(tmp_file)
    elapsed = time.time() - t_start

    print(f"[URL转写] 请求耗时: {elapsed:.2f}s")

    if result.status_code == HTTPStatus.OK:
        print(f"[URL转写] 识别结果:")
        print(f"  {'─' * 48}")
        print(f"  {result.get_sentence().get('text', '(无文本)')}")
        print(f"  {'─' * 48}")
    else:
        print(f"[URL转写] 错误: {result.message}")
        os.remove(tmp_file)
        sys.exit(1)

    _print_metrics(recognition)
    os.remove(tmp_file)
    print("[URL转写] 临时文件已清理")
    print("\n[URL转写] 测试通过 ✓")


# ============================================================
# 工具函数
# ============================================================
def _print_metrics(recognition):
    """打印 FunASR 模式的性能指标"""
    try:
        rid = recognition.get_last_request_id()
        print(f"\n[Metric] requestId: {rid}")
        fd = recognition.get_first_package_delay()
        if fd is not None:
            print(f"[Metric] 首包延迟: {fd}ms")
            print(f"[Metric] 尾包延迟: {recognition.get_last_package_delay()}ms")
    except Exception:
        pass


# ============================================================
# main
# ============================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="阿里云百炼 实时语音识别 — 测试脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python test-funasr.py file ./test.wav --model fun-asr       # FunASR 文件转写
  python test-funasr.py file ./test.wav --model qwen3-asr     # Qwen3-ASR 文件转写
  python test-funasr.py mic --model fun-asr                   # FunASR 麦克风实时
  python test-funasr.py mic --model qwen3-asr                 # Qwen3-ASR 麦克风实时
  python test-funasr.py url https://... --model fun-asr       # URL 下载后转写

模型说明:
  fun-asr    → 阿里达摩院 FunASR, 中英日方言, 准确率高       (WS: /api-ws/v1/inference)
  qwen3-asr  → 千问3-ASR-Flash, 52种语言, VAD/情绪识别        (WS: /api-ws/v1/realtime)

获取 API Key: https://bailian.console.aliyun.com/#/api-key
        """,
    )
    parser.add_argument(
        "mode",
        choices=["file", "mic", "url"],
        help="测试模式: file=文件转写, mic=麦克风录音, url=URL下载转写",
    )
    parser.add_argument(
        "target",
        nargs="?",
        default=None,
        help="file模式: 音频文件路径; url模式: 音频URL",
    )
    parser.add_argument(
        "--model",
        choices=["fun-asr", "qwen3-asr"],
        default="fun-asr",
        help="选择语音识别模型 (默认: fun-asr)",
    )

    args = parser.parse_args()

    if args.mode in ("file", "url") and not args.target:
        parser.error(f"{args.mode} 模式需要指定文件路径或URL")

    # 加载 API Key
    api_key = load_api_key()
    model_cfg = MODEL_CONFIG[args.model]
    masked = api_key[:6] + "***" + api_key[-4:] if len(api_key) > 10 else "***"

    print(f"[配置] 模型: {model_cfg['label']} ({model_cfg['name']})")
    print(f"[配置] API Key: {masked}")
    print(f"[配置] 地域: 华北2 (北京)")
    print()

    # 路由分发
    if args.mode == "file":
        if args.model == "qwen3-asr":
            file_qwen3asr(model_cfg, args.target)
        else:
            file_funasr(model_cfg, args.target)
    elif args.mode == "mic":
        if args.model == "qwen3-asr":
            mic_qwen3asr(model_cfg)
        else:
            mic_funasr(model_cfg)
    elif args.mode == "url":
        if args.model == "qwen3-asr":
            print("[提示] URL 模式使用 FunASR 接口, 自动切换为 FunASR 模式")
            print("       Qwen3-ASR 的文件转写请使用 'file' 模式")
            print()
            file_funasr(MODEL_CONFIG["fun-asr"], args.target)
        else:
            test_url_transcription(model_cfg, args.target)

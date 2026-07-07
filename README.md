# CheatGuard

> 实时 AI 桌面助手 — 隐形覆盖层，屏幕截图 OCR + 多模型 AI 对话 + 语音输入

![Platform](https://img.shields.io/badge/platform-Windows-blue)
![Electron](https://img.shields.io/badge/electron-28+-9feaf9)
![React](https://img.shields.io/badge/react-18-61dafb)
![TypeScript](https://img.shields.io/badge/typescript-5.3-3178c6)
![License](https://img.shields.io/badge/license-AGPL--3.0-blue)

## 功能特性

- **隐形悬浮窗** — 透明无边框窗口，通过系统级 API 实现防截图保护
- **多模型 AI 对话** — 支持接入 OpenAI 兼容 API，可自由添加/切换模型
- **屏幕截图 + OCR** — 框选屏幕任意区域，自动识别文字并发送给 AI 分析
- **语音录制** — 一键录音转文字，自动发送给 LLM
- **快捷键操作** — 全局快捷键控制窗口显隐、截图 OCR、语音
- **会话管理** — 支持多会话、历史记录持久化

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + Enter` | 显示/隐藏助手窗口 |
| `Ctrl + Shift + O` | 显示/隐藏助手窗口 |
| `Ctrl + Shift + S` | 框选截图并 OCR 识别 |

## 技术栈

- **框架**: Electron 28 + React 18 + TypeScript 5
- **构建**: Vite 4
- **OCR**: Tesseract.js
- **原生扩展**: Node.js C++ Addon (`SetWindowDisplayAffinity` + `WS_EX_NOACTIVATE`)
- **FFI**: koffi (Windows API 调用)
- **持久化**: electron-store

## 项目结构

```
src/
├── main.ts                  # Electron 主进程
├── preload.ts               # 预加载脚本（IPC 桥接）
├── audio/                   # 音频捕获与语音识别
│   ├── audio-capture.ts
│   └── asr-client.ts
├── llm/                     # LLM 对话服务
│   ├── llm-service.ts
│   └── chat-store.ts
├── native/                  # 原生 Windows API 封装
│   ├── wda-wrapper.ts       # 防截图 + 不可激活样式
│   ├── wda_addon.cc         # C++ 原生扩展
│   └── binding.gyp
├── ocr/                     # OCR 识别服务
│   └── ocr-service.ts
├── renderer/                # 渲染进程（React）
│   ├── main.tsx
│   ├── components/          # React 组件
│   ├── hooks/               # 状态管理
│   └── overlay.css
└── utils/                   # 工具函数
    └── security.ts
```

## 快速开始

### 环境要求

- Node.js 18+
- npm 9+
- Windows 10/11（仅 Windows 支持防截图等原生功能）
- Python 3.x + C++ 编译工具链（编译原生扩展时需要）

### 安装

```bash
# 克隆项目
git clone https://github.com/your-username/cheat-guard.git
cd cheat-guard

# 安装依赖
npm install

# 编译原生扩展（Windows 防截图功能）
npm run build-native
```

### 开发运行

```bash
# 启动（编译主进程 + 构建渲染进程 + 启动 Electron）
npm run dev
```

### 打包构建

```bash
# 打包为 Windows 安装包
npm run dist
```

## 使用说明

1. 启动应用后，桌面上会出现一个半透明悬浮窗
2. 点击 **Ask** 展开聊天面板，输入问题与 AI 对话
3. 点击 **截图按钮** 或按 `Ctrl+Shift+S` 框选屏幕区域进行 OCR 识别
4. 点击 **录音按钮** 进行语音输入
5. 在设置中配置 API Key 和模型信息

## AI 模型配置

支持所有 OpenAI 兼容 API 的模型提供商：

- OpenAI / Azure OpenAI
- 国内大模型（通义千问、DeepSeek、智谱 GLM 等）
- 本地部署模型（Ollama、vLLM 等）

在应用内设置中填入 API Key 和 Base URL 即可使用。

## 隐私说明

- 所有数据本地处理，API 调用直接发送到用户配置的服务商
- 截图和 OCR 临时文件在使用后自动清理
- 不收集任何用户数据

## 许可证

本项目采用 **AGPL-3.0** 开源协议。

### 这意味着什么？

| 你可以 | 你不可以 |
|--------|----------|
| 自由使用、学习代码 | 闭源分发修改后的版本 |
| 修改代码并自用 | 以 SaaS 形式提供服务而不公开源码 |
| 分发原始代码 | 声称这是你原创的作品 |
| 用于商业目的（需遵守协议） | 移除版权声明和许可信息 |

### 商业授权

如果你希望在**不公开源代码**的情况下使用本项目，或需要闭源分发，请通过以下方式联系获取商业授权：

- Email: 1632823097@qq.com

AGPL-3.0 完整协议文本见 [LICENSE](LICENSE) 文件。

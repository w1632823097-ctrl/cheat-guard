# CheatGuard 架构文档

## 1. 项目概述

**CheatGuard** 是一个基于 Electron 的实时 AI 桌面助手。它以透明覆盖层形式悬浮在屏幕顶层，提供：
- 实时聊天（支持多会话、流式响应）
- 语音识别（通过阿里云百炼 DashScope）
- 屏幕截图 + OCR 文字识别
- 模型切换（多 LLM 提供商支持）

**技术栈**：Electron 28 + React 18 + TypeScript 5 + Vite 4

**关键依赖**：

| 包名 | 版本 | 用途 |
|------|------|------|
| `electron` | ^28 | 桌面框架 |
| `react` / `react-dom` | ^18 | UI 框架 |
| `vite` | ^4 | 构建工具（渲染进程） |
| `typescript` | ^5 | 类型安全 |
| `koffi` | ^3 | FFI 库，直接调用 Windows DLL（WDA 防截图） |
| `tesseract.js` | ^7 | 纯 JS OCR 引擎（中英文） |
| `highlight.js` | ^11 | 聊天中代码块语法高亮 |
| `axios` | ^1 | HTTP 客户端（LLM API 调用） |
| `ws` | ^8 | WebSocket 客户端（ASR 实时通信） |
| `node-gyp` | ^10 | 原生模块编译（备选方案） |
| `node-addon-api` | ^7 | C++ Node 插件 API |

---

## 2. 目录结构

```
cheat-guard/
├── package.json                 # 项目配置与依赖
├── tsconfig.json                # 主进程 TS 配置
├── tsconfig.renderer.json       # 渲染进程 TS 配置
├── vite.config.ts               # Vite 构建配置
├── config.example.json          # 配置文件示例（API Key 等）
├── .npmrc                       # npm 镜像源配置（国内加速）
├── ARCHITECTURE.md              # 本文档
├── eng.traineddata              # Tesseract 英文语言包
├── chi_sim.traineddata          # Tesseract 中文语言包
│
├── src/
│   ├── main.ts                  # 【主进程入口】窗口管理 + IPC 路由 + 快捷键
│   ├── preload.ts               # 【预加载脚本】安全桥接 API（contextBridge）
│   │
│   ├── llm/                     # LLM 大模型服务层
│   │   ├── llm-service.ts       #   LLM 调用（chat / chatStream / 配置管理）
│   │   └── chat-store.ts        #   会话持久化存储（JSON 文件 + AES-256-GCM 加密）
│   │
│   ├── audio/                   # 音频 + ASR 语音识别
│   │   ├── audio-capture.ts     #   音频捕获协调（渲染进程 PCM → 主进程 → ASR）
│   │   └── asr-client.ts        #   阿里云百炼 DashScope WebSocket ASR 客户端
│   │
│   ├── ocr/                     # OCR 光学字符识别
│   │   └── ocr-service.ts       #   Tesseract.js 中文+英文 OCR
│   │
│   ├── native/                  # 原生模块
│   │   ├── wda-wrapper.ts       #   WDA 防截图封装（通过 koffi FFI 调用 Windows API）
│   │   ├── wda_addon.cc         #   C++ 原生插件源码（备选方案）
│   │   └── binding.gyp          #   node-gyp 构建配置（备选方案）
│   │
│   ├── utils/                   # 工具模块
│   │   └── security.ts          #   AES-256-GCM 加密 / 密钥管理 / 日志清理
│   │
│   └── renderer/                # 渲染进程（前端 UI）
│       ├── main.tsx             #   React 入口
│       ├── index.html           #   HTML 入口
│       ├── overlay.html         #   覆盖层 HTML（旧版 Vanilla JS UI，保留备用）
│       ├── overlay.js           #   覆盖层 JS（旧版，功能完整）
│       ├── overlay.css          #   覆盖层样式
│       ├── electron-api.d.ts    #   TypeScript 类型声明
│       ├── region-selector.html #   截图区域选择器 HTML
│       ├── region-selector.css  #   截图区域选择器样式
│       ├── region-selector.js   #   截图区域选择器逻辑
│       ├── hooks/
│       │   └── useAppState.tsx  #   React Context 全局状态管理
│       └── components/
│           ├── Toolbar.tsx      #   工具栏（折叠状态）
│           ├── ChatPanel.tsx    #   聊天面板（展开状态）
│           ├── ChatInput.tsx    #   聊天输入框
│           └── MessageList.tsx  #   消息列表
│
└── test/                        # 测试脚本与资源
    ├── test-ocr.py / .ps1       #   OCR 测试
    └── test-funasr.py           #   语音识别测试
```

---

## 3. 架构分层

```
┌──────────────────────────────────────────────────────────────────┐
│                         外部依赖                                   │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │ OpenAI 兼容   │  │ 阿里云百炼       │  │ 本地文件系统      │   │
│  │ API (SophNet, │  │ DashScope ASR    │  │ - config.json    │   │
│  │ GLM 等)       │  │ (WebSocket)      │  │ - chat-history   │   │
│  │ HTTP SSE      │  │                  │  │   .json + .key   │   │
│  └──────┬────────┘  └────────┬─────────┘  └────────┬─────────┘   │
│         │                    │                      │             │
├─────────┼────────────────────┼──────────────────────┼─────────────┤
│         │                    │                      │             │
│         ▼                    ▼                      ▼             │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                     渲染进程 (Renderer)                    │    │
│  │  React (main.tsx) — index.html / Vite 入口                │    │
│  │  ┌──────────────┬──────────────┬──────────────────────┐  │    │
│  │  │  Toolbar.tsx │  ChatPanel   │  ChatInput.tsx       │  │    │
│  │  │              │    .tsx      │  MessageList.tsx     │  │    │
│  │  └──────────────┴──────────────┴──────────────────────┘  │    │
│  │                          │ IPC (contextBridge)            │    │
│  ├──────────────────────────┼───────────────────────────────┤    │
│  │                     预加载脚本 (preload.ts)                 │    │
│  │  安全暴露 API：electronAPI.llm / .audio / .ocr / .on*    │    │
│  │                          │                                │    │
│  ├──────────────────────────┼───────────────────────────────┤    │
│  │                     主进程 (main.ts)                       │    │
│  │  窗口管理 + WDA + 全局快捷键 + IPC 路由                    │    │
│  │  ┌───────────┬───────────┬─────────┬──────────────┐     │    │
│  │  │ llm/      │ audio/    │ ocr/    │ native/      │     │    │
│  │  │ service   │ capture   │ service │ wda-wrapper  │     │    │
│  │  │  + store  │ + asr     │         │ (koffi FFI)  │     │    │
│  │  └───────────┴───────────┴─────────┴──────────────┘     │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

**外部依赖**：

| 外部系统 | 通信方式 | 用途 |
|----------|----------|------|
| OpenAI 兼容 API (SophNet / GLM 等) | HTTP SSE (axios) | LLM 对话推理 |
| 阿里云百炼 DashScope | WebSocket (ws) | 实时语音识别 (ASR) |
| `config.json` | 本地文件读取 | API Key、模型列表等配置 |
| `~/.cheat-guard/chat-history.json` | 本地文件读写 | 加密会话持久化 |
| `~/.cheat-guard/.key` | 本地文件 | AES-256-GCM 加密密钥 |
| `eng.traineddata` / `chi_sim.traineddata` | 本地文件 | Tesseract OCR 语言模型 |

---

## 4. 核心数据流

### 4.1 聊天流（流式）

```
用户输入文字
  → renderer 调用 electronAPI.llm.chatStream(sessionId, text)
  → preload ipcRenderer.invoke('llm:chat-stream', ...)
  → main.ts ipcMain.handle('llm:chat-stream', ...)
  → llm-service.ts chatStream() → HTTP SSE → OpenAI 兼容 API
  → 每个 chunk 通过 sender.send('llm:chunk', chunk) 推送到渲染进程
  → 最后一个 chunk 后 sender.send('llm:done')
  → renderer 通过 onLLMChunk / onLLMDone 接收 → 实时渲染消息
  → 完整回复通过 chat-store.ts 写入加密 JSON 文件
```

### 4.2 语音识别流

```
用户点击录音按钮
  → 渲染进程 Web Audio API 捕获麦克风 PCM 数据
  → PCM chunks → IPC 'audio:chunk' → 主进程
  → audio-capture.ts 将音频流写入文件
  → asr-client.ts 通过 WebSocket 连接阿里云百炼 DashScope
  → 实时识别结果 → IPC 'transcription-interim' / 'transcription-full'
  → 渲染进程显示转录文本 → 录音结束后自动发送给 LLM
```

### 4.3 OCR 截图流

```
用户按 Ctrl+Shift+S（或点击截图按钮）
  → main.ts 打开 region-selector 窗口（全屏选区）
  → 用户选区 → desktopCapturer.getSources() 截屏
  → 裁剪到选区 → 保存临时 PNG
  → Tesseract.js OCR 识别 → 提取文字
  → 文字结果 → llm:chunk 流式发送给 LLM 分析
  → 临时文件自动清理
```

---

## 5. 模块详解

### 5.1 主进程 - main.ts

| 职责 | 说明 |
|------|------|
| 窗口管理 | 创建透明覆盖层窗口（无边框、置顶、不可见于截图） |
| WDA | 通过 `koffi` FFI 调用 Windows `SetWindowDisplayAffinity` API 隐藏窗口于屏幕捕获；**每 3 秒重试**防止腾讯会议等录屏软件抢占 DWM 导致 flag 丢失 |
| 全局快捷键 | `Ctrl+Enter` 显示/隐藏 | `Ctrl+Shift+S` OCR 截图 |
| IPC 路由 | 注册所有 `ipcMain.handle/on` 分发到对应服务模块 |
| 拖拽 | `start-drag/stop-drag` 实现窗口拖拽移动 |
| 窗口高度切换 | collapsed (80px) / expanded (600px) |
| 权限 | Session 级别 `media` 权限白名单，允许麦克风访问 |
| OCR 入口 | `showRegionSelectorAndOCR()` 管理截图全流程（选区 → 截图 → 裁剪 → OCR → LLM） |

### 5.2 LLM 服务 - llm-service.ts

| 功能 | 说明 |
|------|------|
| `chat()` | 非流式聊天，返回完整响应 |
| `chatStream()` | 流式聊天，通过 `onChunk` 回调逐步返回 |
| `setApiConfig()` | 运行时更新 API Key / BaseURL / Model |
| `getAvailableModels()` | 返回支持的模型列表 |

**配置加载优先级**：
1. `config.json` 文件（API Key 支持 AES-256-GCM 加密存储，`isEncrypted()` 自动检测并解密）
2. 环境变量 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `LLM_MODEL`

**系统提示词**：硬编码在 `llm-service.ts`，角色为"实时 AI 桌面助手"

### 5.3 会话存储 - chat-store.ts

| 功能 | 说明 |
|------|------|
| 存储格式 | JSON 文件，路径 `~/.cheat-guard/chat-history.json` |
| 加密 | 消息内容使用 AES-256-GCM 加密（密钥存储在 `~/.cheat-guard/.key`） |
| 会话管理 | `newSession` / `deleteSession` / `renameSession` / `listSessions` |
| 消息上限 | 每个会话最多 100 条消息，超出自动截断 |

**数据结构**：
```
{
  currentSessionId: string,
  sessions: {
    [sessionId]: {
      meta: { id, title, createdAt, lastMessageAt },
      messages_encrypted: "base64..."   // 或 messages: [...] (旧格式)
    }
  }
}
```

### 5.4 音频 + ASR - audio/

**audio-capture.ts**：主进程侧音频协调器
- 接收渲染进程的 PCM 音频块
- 管理录音状态（开始/停止/暂停）
- 将音频数据转发给 ASR 客户端

**asr-client.ts**：阿里云百炼 DashScope WebSocket 客户端
- 支持模型：`qwen3-asr-flash-realtime` / `fun-asr-realtime`
- 自动重连（最多 3 次）
- 实时返回中间结果（interim）和最终结果（final）
- VAD 语音活动检测

### 5.5 OCR - ocr-service.ts

- 基于 Tesseract.js（纯 Node.js，无需 Python）
- 支持中英文混合识别（`chi_sim+eng`）
- 临时文件存储在系统临时目录
- 应用退出时自动清理

### 5.6 原生模块 - native/

**wda-wrapper.ts**：通过 **koffi**（Node.js FFI 库）直接调用 Windows `user32.dll` 的 `SetWindowDisplayAffinity` API，无需编译 C++ 插件即可实现窗口防截图。

- 方案 1（优先）：`WDA_EXCLUDEFROMCAPTURE` (0x11) — 完全从屏幕捕获中排除
- 方案 2（回退）：`WDA_MONITOR` (0x01) — 仅显示在显示器上
- **重试机制**：`main.ts` 中每 **3 秒**自动重新应用 WDA + `setAlwaysOnTop(true, 'screen-saver')`，防止第三方录屏软件（如腾讯会议）接管 DWM 合成状态后 flag 掉落
- `wda_addon.cc` + `binding.gyp` 为 node-gyp 编译的 C++ 备选方案，当前主方案是 koffi

### 5.7 安全 - utils/security.ts

- AES-256-GCM 加密/解密
- 密钥基于随机生成，存储在 `~/.cheat-guard/.key`
- 日志自动清理（每 7 天清理一次）

---

## 6. IPC 通信清单

### 6.1 LLM 相关 (Channel: `llm:*`)

| Channel | 方向 | 调用方式 | 说明 |
|---------|------|----------|------|
| `llm:chat` | Ren→Main | invoke | 非流式聊天 |
| `llm:chat-stream` | Ren→Main | invoke | 流式聊天 |
| `llm:clear-session` | Ren→Main | send | 清空会话 |
| `llm:set-config` | Ren→Main | invoke | 设置 API 配置 |
| `llm:get-history` | Ren→Main | invoke | 获取会话历史 |
| `llm:get-models` | Ren→Main | invoke | 获取模型列表 |
| `llm:set-model` | Ren→Main | invoke | 切换模型 |
| `llm:list-sessions` | Ren→Main | invoke | 列出所有会话 |
| `llm:new-session` | Ren→Main | invoke | 新建会话 |
| `llm:delete-session` | Ren→Main | invoke | 删除会话 |
| `llm:rename-session` | Ren→Main | invoke | 重命名会话 |
| `llm:get-current-session` | Ren→Main | invoke | 获取当前会话 ID |
| `llm:chunk` | Main→Ren | send | 流式响应块 |
| `llm:done` | Main→Ren | send | 流式响应结束 |

### 6.2 音频相关 (Channel: `audio:*` / `transcription:*`)

| Channel | 方向 | 调用方式 | 说明 |
|---------|------|----------|------|
| `audio:start-recording` | Ren→Main | invoke | 开始录音 |
| `audio:stop-recording` | Ren→Main | invoke | 停止录音 |
| `audio:check-status` | Ren→Main | invoke | 检查录音状态 |
| `audio:chunk` | Ren→Main | send | 发送 PCM 音频块 |
| `audio:set-config` | Ren→Main | invoke | 设置 ASR 配置 |
| `transcription-interim` | Main→Ren | send | 实时中间识别结果 |
| `transcription-update` | Main→Ren | send | 转录文本增量更新 |
| `transcription-full` | Main→Ren | send | 最终完整识别结果 |
| `asr-state-change` | Main→Ren | send | ASR 状态变化通知 |

### 6.3 OCR 相关 (Channel: `ocr:*` / `region:*` / `ocr:`)

| Channel | 方向 | 调用方式 | 说明 |
|---------|------|----------|------|
| `ocr:screenshot` | Ren→Main | invoke | 触发截图 OCR 流程 |
| `ocr:result` | Main→Ren | send | OCR 识别结果推送 |
| `region:selected` | Ren→Main | once | 用户完成区域选择 |
| `region:cancel` | Ren→Main | once | 用户取消区域选择 |

### 6.4 窗口控制 (Channel: 各种)

| Channel | 方向 | 说明 |
|---------|------|------|
| `start-drag` / `stop-drag` | Ren→Main | 窗口拖拽 |
| `set-overlay-opacity` | Ren→Main | 设置透明度 |
| `set-overlay-height` | Ren→Main | 切换展开/折叠高度 |
| `focus-input` / `blur-input` | Ren→Main | 焦点控制 |
| `update-text` | Main→Ren | 主进程推送文本 |
| `quit-app` | Ren→Main | 退出应用 |

---

## 7. 渲染进程 UI 组件

### 7.1 两种渲染模式

| 入口 | 技术 | 说明 |
|------|------|------|
| `index.html` + `main.tsx` | React | **当前实际使用**的 UI，Vite 构建入口（Toolbar / ChatPanel / ChatInput / MessageList） |
| `overlay.html` + `overlay.js` | Vanilla JS | 旧版 UI 保留备用（功能完整，包含独立聊天逻辑） |

**Vite 构建流程**：`vite.config.ts` 中 `root: src/renderer`，入口为 `index.html`，构建产物输出到 `dist/renderer/`。`main.ts` 通过 `loadFile('dist/renderer/index.html')` 加载 React UI。

React 组件使用 `useAppState` Context 共享状态，核心状态包括：
- `isExpanded` / `isRecording` / `isLoading`
- `messages` / `sessions` / `currentSessionId`
- `availableModels` / `currentModelId`
- `opacity` / `currentTranscription`

### 7.2 Toolbar（折叠状态）

- 显示/隐藏切换
- 模型选择下拉
- 透明度滑块
- 录音按钮 + 实时转录预览
- 新建会话 (`+`)

### 7.3 ChatPanel（展开状态）

- 会话选择器（下拉列表 + 删除/重命名）
- 消息列表（用户气泡 + AI 回复 + 代码高亮 + 流式光标）
- 输入区（textarea + 模型选择 + 截图 + 录音 + 发送）
- 转录区（录音中显示实时转录）

---

## 8. 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Enter` | 显示/隐藏覆盖层 |
| `Ctrl+Shift+O` | 显示/隐藏覆盖层（备选） |
| `Ctrl+Shift+S` | 选区截图 + OCR 识别 |

---

## 9. 开发与构建

```bash
# 开发模式（编译 + 构建 + 启动）
npm run dev

# 仅启动 Vite 开发服务器（热更新，需单独启动 Electron）
npm run dev:renderer

# 生产构建
npm run build

# 打包为 Windows 安装包
npm run dist:cn

# 编译原生模块
npm run build-native
```

- **Vite 开发服务器**：端口 `5173`，提供 HMR 热更新
- **开发模式回退**：如果 Vite 不可用，自动加载 `dist/renderer/index.html`
- **原生模块**：主要通过 koffi FFI 直接调用 Windows API，`node-gyp` + `binding.gyp` 为备选编译方案
- **国内镜像**：`.npmrc` 配置了 npmmirror 镜像源，加速依赖安装

# Cluely 类实时 AI 桌面助手项目设计书

> **版本**: v1.1  
> **日期**: 2026-06-14  
> **定位**: 桌面级实时 AI 辅助工具（类 Cluely）
> **核心定位**: "Cheat on Everything" - 实时隐形 AI 辅助
> **当前进度**: Phase 1 完成 — WDA 隐形覆盖层通过截图验证

---

## 目录

1. [项目概述](#一项目概述)
2. [核心功能需求](#二核心功能需求)
3. [技术选型方案](#三技术选型方案)
4. [系统架构设计](#四系统架构设计)
5. [GPU 隐形覆盖层技术实现](#五gpu-隐形覆盖层技术实现)
6. [开发实施计划](#六开发实施计划)
7. [测试策略](#七测试策略)
8. [风险与应对](#八风险与应对)

---

## 一、项目概述

### 1.1 项目背景

Cluely 是一款引发广泛关注的实时 AI 桌面助手，其核心卖点是通过**GPU 级隐形覆盖层**在会议、面试、销售通话等场景中为用户提供实时 AI 提示，而对方无法察觉。本项目旨在开发功能对等的产品，核心能力完全对标 Cluely。

### 1.2 核心定位

| 维度 | 说明 |
|------|------|
| **Slogan** | "Cheat on Everything" |
| **核心能力** | 隐形覆盖层、实时 AI 提示、屏幕共享不可见 |
| **目标场景** | 技术面试、销售通话、在线考试、商务会议 |
| **技术特色** | Win32 API 窗口隐形、OCR 屏幕读取、语音转文字、AI 实时生成 |

### 1.3 核心目标

| 目标 | 指标 |
|------|------|
| **隐形能力** | 屏幕共享完全不可见（Zoom/Meet/Teams） |
| **延迟** | 端到端延迟 < 500ms |
| **准确率** | 语音识别 > 95%，问题检测 > 90% |
| **兼容性** | Windows 10+ / macOS 12+ |

---

## 二、核心功能需求

### 2.1 功能架构

```
┌─────────────────────────────────────────────────┐
│              桌面应用 (Electron + Native)        │
├─────────────┬─────────────┬─────────────────────┤
│  隐形覆盖层  │   实时 AI   │    知识库管理       │
│  (WDA)     │   提示引擎   │    模块            │
├─────────────┼─────────────┼─────────────────────┤
│  屏幕捕获   │   语音转    │    文档上传         │
│  OCR 识别   │   文字引擎   │    智能检索        │
├─────────────┼─────────────┼─────────────────────┤
│  音频捕获   │   上下文    │    会议管理         │
│  降噪处理   │   分析引擎   │    历史记录        │
└─────────────┴─────────────┴─────────────────────┘
```

### 2.2 核心功能详解

#### 2.2.1 隐形覆盖层（核心功能）

| 编号 | 功能 | 优先级 | 验收标准 |
|------|------|--------|---------|
| OVL-001 | SetWindowDisplayAffinity 集成 | P0 | 窗口在屏幕共享中不可见 |
| OVL-002 | WDA_EXCLUDEFROMCAPTURE 支持 | P0 | Zoom/Meet/Teams/OBS 中完全隐藏 |
| OVL-003 | 点击穿透支持 | P0 | 不影响底层应用操作 |
| OVL-004 | 自定义覆盖层样式 | P1 | 支持透明度、位置、大小调整 |
| OVL-005 | 多显示器支持 | P1 | 支持多屏显示覆盖层 |

#### 2.2.2 实时 AI 提示引擎

| 编号 | 功能 | 优先级 | 验收标准 |
|------|------|--------|---------|
| AI-001 | 实时语音转文字 | P0 | 延迟 < 500ms，准确率 > 95% |
| AI-002 | 问题自动检测 | P0 | 检测准确率 > 90% |
| AI-003 | AI 答案实时生成 | P0 | 生成时间 < 1s |
| AI-004 | 代码辅助生成 | P0 | 支持 10+ 编程语言 |
| AI-005 | 上下文感知提示 | P0 | 支持多轮对话上下文 |
| AI-006 | 自定义 Prompt | P1 | 支持用户自定义提示词 |

#### 2.2.3 屏幕捕获与 OCR

| 编号 | 功能 | 优先级 | 验收标准 |
|------|------|--------|---------|
| OCR-001 | 屏幕实时捕获 | P0 | 帧率 > 10fps |
| OCR-002 | 文字识别 (OCR) | P0 | 准确率 > 90% |
| OCR-003 | 代码识别 | P0 | 支持语法高亮识别 |
| OCR-004 | 图像内容理解 | P2 | 支持简单图表识别 |

#### 2.2.4 音频捕获与处理

| 编号 | 功能 | 优先级 | 验收标准 |
|------|------|--------|---------|
| AUD-001 | 系统音频捕获 | P0 | 捕获会议对方语音 |
| AUD-002 | 麦克风音频捕获 | P0 | 捕获用户语音 |
| AUD-003 | 噪音抑制 | P1 | 信噪比提升 > 10dB |
| AUD-004 | 回声消除 | P1 | 消除会议回声 |

#### 2.2.5 知识库管理

| 编号 | 功能 | 优先级 | 验收标准 |
|------|------|--------|---------|
| KB-001 | 文档上传 (PDF/DOC/TXT) | P0 | 支持常见格式 |
| KB-002 | 智能检索 | P0 | 检索准确率 > 85% |
| KB-003 | 向量数据库 | P0 | 支持语义检索 |
| KB-004 | 团队知识库共享 | P2 | 支持团队共享 |

#### 2.2.6 会议管理

| 编号 | 功能 | 优先级 | 验收标准 |
|------|------|--------|---------|
| MT-001 | 日历集成 | P1 | 支持 Google/Outlook |
| MT-002 | 会议摘要生成 | P1 | 自动生成会议摘要 |
| MT-003 | 跟进邮件生成 | P2 | 自动生成跟进邮件 |
| MT-004 | 会议历史搜索 | P1 | 支持语义搜索 |

### 2.3 非功能需求

| 需求 | 具体要求 |
|------|---------|
| **性能** | 启动 < 3s，内存 < 400MB，CPU < 10% |
| **兼容性** | Windows 10+ / macOS 12+ |
| **安全** | 本地优先，传输加密 |
| **稳定性** | 崩溃率 < 0.1% |

---

## 三、技术选型方案

### 3.1 技术栈总览

```
┌─────────────────────────────────────────┐
│           桌面应用层 (Electron)          │
│    React + TypeScript + Tailwind CSS    │
├─────────────────────────────────────────┤
│           原生模块层 (koffi FFI)        │
│    koffi → user32.dll / Cocoa API      │
├─────────────────────────────────────────┤
│           后端服务层 (推迟到 Phase 3)     │
│    Express/Fastify + WebSocket          │
├─────────────────────────────────────────┤
│           数据存储层 (推迟到 Phase 3)     │
│    SQLite (本地) + PostgreSQL (云端)    │
├─────────────────────────────────────────┤
│           AI 服务层                      │
│    OpenAI API / Claude API / Whisper    │
├─────────────────────────────────────────┤
│           基础设施                       │
│    Docker + GitHub Actions              │
└─────────────────────────────────────────┘
```

### 3.2 详细技术选型

#### 3.2.1 桌面应用框架

| 技术 | 版本 | 用途 | 优势 |
|------|------|------|------|
| **Electron** | 28.x | 桌面框架 | 成熟生态、跨平台、丰富原生 API |
| **React** | 18.x | UI 框架 | 组件化、虚拟 DOM |
| **TypeScript** | 5.x | 类型安全 | 编译时检查 |
| **Tailwind CSS** | 3.x | 样式方案 | 原子化 CSS |
| **Framer Motion** | 11.x | 动画效果 | 声明式动画 |

#### 3.2.2 隐形覆盖层技术（核心技术）

| 技术 | 版本 | 用途 | 优势 | 实现路径 |
|------|------|------|------|---------|
| **SetWindowDisplayAffinity** | Win 10 2004+ | Windows 窗口隐形 | 官方 API，可靠，兼容性好 | Win32 API |
| **WDA_EXCLUDEFROMCAPTURE** | Win 10 2004+ | 排除屏幕捕获 | 支持 Zoom/Teams/Meet/OBS | Win32 API |
| **koffi** | 3.x | Node.js 调用 Win32 FFI | 预编译、零编译依赖、即装即用 | `lib.func('bool SetWindowDisplayAffinity(...)')` |
| **CGWindowLevel** | macOS | macOS 窗口层级 | 最高层级显示 | Cocoa API |
| **ScreenCaptureKit** | macOS 12+ | 屏幕捕获控制 | 系统原生支持 | Swift/Objective-C |

> **实际落地**: 采用 **koffi** 替代原计划的 `node-ffi`/Native C++ Addon。koffi 是预编译的 FFI 库，无需安装 Visual Studio C++ 编译工具链，通过 C 风格声明字符串直接调用 `user32.dll` 的 `SetWindowDisplayAffinity`，Phase 1 已验证通过（Win+Shift+S 截图中窗口不可见）。

**隐形原理**:
```
标准窗口渲染流程:
应用窗口 → DWM (桌面窗口管理器) → 屏幕显示 → 屏幕捕获 API 可以捕获

Cluely 隐形流程:
应用窗口 → SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)
         → DWM 标记窗口为"不可捕获"
         → 屏幕显示可见
         → 屏幕捕获 API 无法捕获该窗口
```

#### 3.2.3 音频处理

| 技术 | 版本 | 用途 | 优势 |
|------|------|------|------|
| **Web Audio API** | - | 浏览器音频捕获 | 原生支持 |
| **OpenAI Whisper API** | - | 语音转文字（API 优先） | 无需本地部署，精度高，多语言 |
| **RNNoise** | - | 噪音抑制 | 开源、实时 |
| **SpeexDSP** | - | 回声消除 | 开源、高效 |

> **策略**: 语音转文字优先使用 **OpenAI Whisper API**，零部署成本、快速出活。本地部署 Whisper 模型推迟到 Phase 3 性能优化阶段。

#### 3.2.4 OCR 与图像处理

| 技术 | 版本 | 用途 | 优势 |
|------|------|------|------|
| **Tesseract** | 5.x | OCR 文字识别 | 开源、多语言 |
| **PaddleOCR** | 2.x | OCR 文字识别 | 中文识别效果好 |
| **OpenCV** | 4.x | 图像处理 | 功能全面 |
| **Sharp** | - | 图像处理 (Node.js) | 高性能 |

#### 3.2.5 AI 与大模型

| 技术 | 版本 | 用途 | 优势 |
|------|------|------|------|
| **OpenAI API** | v1 | GPT-4/Claude 调用 | 强大模型 |
| **LangChain** | 0.1.x | AI 框架 | 模块化、RAG |
| **Pinecone** | - | 向量数据库 | 高性能语义检索 |
| **Sentence Transformers** | - | 文本嵌入 | 高质量语义表示 |

#### 3.2.6 后端服务（推迟到 Phase 3）

> POC 阶段 Electron 主进程直接调用 AI API，无需独立后端。数据库用本地 SQLite 满足 Phase 2 需求。独立 API 服务、PostgreSQL、Redis 推迟到 Phase 3。

| 技术 | 版本 | 用途 | 优势 |
|------|------|------|------|
| **Node.js** | 20.x | API 服务 | 异步 I/O |
| **Express/Fastify** | 4.x | Web 框架 | 轻量、高性能 |
| **Socket.io** | 4.x | 实时通信 | WebSocket 封装 |
| **Redis** | 7.x | 缓存 | 高性能 |

#### 3.2.7 数据存储

| 技术 | 版本 | 用途 | 优势 |
|------|------|------|------|
| **SQLite** | 3.x | 本地数据库 | 零配置、嵌入式 |
| **PostgreSQL** | 16.x | 云端数据库 | ACID、JSON 支持 |
| **MinIO** | - | 文件存储 | 兼容 S3 |

### 3.3 关键技术对比

#### 隐形覆盖层方案对比

| 方案 | 复杂度 | 可靠性 | 兼容性 | 推荐度 |
|------|--------|--------|--------|--------|
| **SetWindowDisplayAffinity (WDA)** | 低 | 极高 | Win 10 2004+ | ✅ **强烈推荐** |
| **WDA_MONITOR** | 低 | 高 | Win 8+ | ✅ 备选 |
| **GPU 直接渲染** | 极高 | 中 | 低 | ❌ 不推荐 |
| **透明窗口 + 点击穿透** | 低 | 低 | 高 | ❌ 不推荐 |

---

## 四、系统架构设计

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    桌面应用 (Electron)                    │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │  UI 层   │  │ 业务层  │  │ 数据层  │  │ 原生层  │  │
│  │ React   │  │ Redux   │  │ SQLite  │  │ C++     │  │
│  │ Tailwind│  │ Saga    │  │ Local   │  │ Win32   │  │
│  └─────────┘  └─────────┘  └─────────┘  │ API     │  │
│                                         └─────────┘  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐              │
│  │ 覆盖层   │  │ 主窗口  │  │ 设置窗口│              │
│  │ Overlay │  │ Main    │  │ Settings│              │
│  │ (WDA)   │  │         │  │         │              │
│  └─────────┘  └─────────┘  └─────────┘              │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    API 服务 (Node.js)                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │
│  │ 用户服务 │  │ 会议服务 │  │ AI 服务  │  │ 支付服务 │   │
│  │ Auth    │  │ Meeting │  │ LLM     │  │ Stripe  │   │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘   │
└─────────────────────────┬───────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  PostgreSQL │    │    Redis    │    │   OpenAI    │
│  (主数据库)  │    │   (缓存)    │    │   (AI API)  │
└─────────────┘    └─────────────┘    └─────────────┘
```

### 4.2 隐形覆盖层架构

```
┌─────────────────────────────────────────────────────────┐
│              隐形覆盖层架构                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Windows 标准窗口渲染                  │   │
│  │  应用窗口 → DWM (桌面窗口管理器) → 屏幕显示        │   │
│  │       ↓                                          │   │
│  │  屏幕捕获 API (可以捕获)                         │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │           隐形覆盖层渲染流程                       │   │
│  │                                                  │   │
│  │  ┌─────────┐    ┌─────────────────────────┐      │   │
│  │  │ Electron│    │    Win32 API             │      │   │
│  │  │ 主进程   │───►│  ┌─────────────────┐   │      │   │
│  │  │         │    │  │ 创建窗口         │   │      │   │
│  │  │         │    │  │ (WS_EX_LAYERED)  │   │      │   │
│  │  │         │    │  └─────────────────┘   │      │   │
│  │  │         │    │         ↓              │      │   │
│  │  │         │    │  ┌─────────────────┐   │      │   │
│  │  │         │    │  │ SetWindowDisplay│   │      │   │
│  │  │         │    │  │ Affinity(WDA_   │   │      │   │
│  │  │         │    │  │ EXCLUDEFROM     │   │      │   │
│  │  │         │    │  │ CAPTURE)        │   │      │   │
│  │  │         │    │  └─────────────────┘   │      │   │
│  │  │         │    │         ↓              │      │   │
│  │  │         │    │  ┌─────────────────┐   │      │   │
│  │  │         │    │  │ DWM 标记为      │   │      │   │
│  │  │         │    │  │ "不可捕获"      │   │      │   │
│  │  │         │    │  └─────────────────┘   │      │   │
│  │  │         │    │         ↓              │      │   │
│  │  │         │    │  ┌─────────────────┐   │      │   │
│  │  │         │    │  │ 屏幕显示 (可见)  │   │      │   │
│  │  │         │    │  │ 捕获 API (不可见)│   │      │   │
│  │  │         │    │  └─────────────────┘   │      │   │
│  │  └─────────┘    └─────────────────────────┘      │   │
│  │                                                  │   │
│  │  屏幕捕获 API → 无法捕获 (窗口被标记为排除)       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.3 数据流架构

```
┌─────────────────────────────────────────────────────────┐
│                      实时数据流                           │
│                                                         │
│  麦克风 ──► 音频捕获 ──► 降噪处理 ──► Whisper 转文字 ──► 文本 │
│    │                                                    │
│    │                                              ┌────┐│
│    │                                              │ LLM││
│    │                                              │处理││
│    │                                              └──┬─┘│
│    │              ┌─────────────────────────────────┘  │
│    │              ▼                                      │
│    │         AI 答案 ──► 覆盖层显示 ──► 用户可见      │
│    │                                                     │
│  屏幕 ───► 屏幕捕获 ──► OCR 识别 ──► 上下文分析 ──► LLM │
│                                                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 快捷键触发: Cmd/Ctrl + Enter                     │   │
│  │ 自动触发: 检测到问题/代码时自动显示               │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

### 4.4 Electron 进程架构

```
┌────────────────────────────────────────────────────────────┐
│                    Electron 进程架构                         │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              主进程 (Main Process)                    │ │
│  │                                                      │ │
│  │  • 窗口管理 (BrowserWindow)                           │ │
│  │  • WDA 集成 (koffi → user32.dll)                     │ │
│  │  • 全局快捷键 (globalShortcut)                        │ │
│  │  • 系统托盘                                           │ │
│  │  • IPC 通信枢纽                                       │ │
│  │  • 直接调用 OpenAI API (Phase 2)                      │ │
│  │                                                      │ │
│  │  [文件: src/main.ts, src/native/wda-wrapper.ts]       │ │
│  └──────────┬───────────────────────────────────────────┘ │
│             │ ipcMain / ipcRenderer                        │
│             │ (contextBridge)                              │
│  ┌──────────▼───────────────────────────────────────────┐ │
│  │              渲染进程 (Renderer Process)              │ │
│  │                                                      │ │
│  │  • 覆盖层 UI (overlay.html + overlay.js)              │ │
│  │  • 用户交互 (输入框、按钮)                            │ │
│  │  • 消息列表渲染                                       │ │
│  │  • 禁止访问 Node.js API (contextIsolation: true)      │ │
│  │                                                      │ │
│  │  [文件: src/renderer/overlay.html, overlay.tsx]       │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              Preload 脚本 (安全桥接)                  │ │
│  │                                                      │ │
│  │  • contextBridge.exposeInMainWorld()                  │ │
│  │  • 暴露有限的 API 给渲染进程                          │ │
│  │                                                      │ │
│  │  [文件: src/preload.ts]                              │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

| 进程 | 职责 | 关键文件 |
|------|------|---------|
| **Main** | WDA 窗口管理、快捷键、系统级操作、AI API 调用 | `src/main.ts`, `src/native/wda-wrapper.ts` |
| **Renderer** | UI 渲染、用户交互、消息展示 | `src/renderer/overlay.html`, `overlay.js` |
| **Preload** | 安全桥接，暴露 IPC 接口 | `src/preload.ts` |

---

## 五、隐形覆盖层技术实现

### 5.1 Windows 实现方案（主流）

#### 5.1.1 SetWindowDisplayAffinity + WDA_EXCLUDEFROMCAPTURE（推荐）

**原理**：Windows 10 版本 2004 起提供的官方 API，允许窗口声明自己不应被屏幕捕获 API（包括屏幕共享、截图等）捕获。这是目前最可靠、最主流的实现方式。

```cpp
#include <windows.h>

class InvisibleOverlay {
private:
    HWND hwnd;
    
public:
    // 创建隐形窗口
    bool CreateInvisibleWindow() {
        // 注册窗口类
        WNDCLASSEXW wc = { sizeof(wc) };
        wc.lpfnWndProc = DefWindowProcW;
        wc.hInstance = GetModuleHandle(nullptr);
        wc.lpszClassName = L"CluelyInvisibleOverlay";
        RegisterClassExW(&wc);
        
        // 创建窗口
        hwnd = CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_NOACTIVATE,
            wc.lpszClassName,
            L"Cluely Overlay",
            WS_POPUP,
            100, 100, 400, 300,
            nullptr, nullptr, wc.hInstance, nullptr
        );
        
        if (!hwnd) return false;
        
        // 关键：设置窗口显示亲和性，排除屏幕捕获
        // WDA_EXCLUDEFROMCAPTURE: 窗口不会出现在屏幕捕获中
        // 支持：Zoom, Teams, Google Meet, OBS 等
        BOOL result = SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
        
        if (!result) {
            // 回退到 WDA_MONITOR (仅排除当前显示器捕获)
            SetWindowDisplayAffinity(hwnd, WDA_MONITOR);
        }
        
        // 设置透明背景
        SetLayeredWindowAttributes(hwnd, 0, 0, LWA_COLORKEY);
        
        // 显示窗口
        ShowWindow(hwnd, SW_SHOW);
        
        return true;
    }
    
    // 更新覆盖层内容
    void UpdateOverlay(const std::wstring& text) {
        // 使用 GDI+ 或 Direct2D 在窗口上绘制内容
        HDC hdc = GetDC(hwnd);
        
        // 清除背景
        RECT rect;
        GetClientRect(hwnd, &rect);
        FillRect(hdc, &rect, (HBRUSH)GetStockObject(BLACK_BRUSH));
        
        // 绘制文字
        SetTextColor(hdc, RGB(255, 255, 255));
        SetBkMode(hdc, TRANSPARENT);
        DrawTextW(hdc, text.c_str(), -1, &rect, DT_LEFT | DT_WORDBREAK);
        
        ReleaseDC(hwnd, hdc);
    }
    
    // 设置窗口位置
    void SetPosition(int x, int y, int width, int height) {
        SetWindowPos(hwnd, HWND_TOPMOST, x, y, width, height, SWP_SHOWWINDOW);
    }
    
    // 销毁窗口
    void Destroy() {
        if (hwnd) {
            DestroyWindow(hwnd);
            hwnd = nullptr;
        }
    }
};
```

**WDA 模式对比**：

| 模式 | 值 | 说明 | 兼容性 |
|------|-----|------|--------|
| **WDA_NONE** | 0 | 默认，可被捕获 | 所有版本 |
| **WDA_MONITOR** | 1 | 仅排除当前显示器捕获 | Windows 8+ |
| **WDA_EXCLUDEFROMCAPTURE** | 3 | 完全排除所有屏幕捕获 | Windows 10 2004+ |

#### 5.1.2 Electron 中调用 Win32 API

```typescript
// main.ts - Electron 主进程
import { BrowserWindow, screen } from 'electron';

// 加载 node-ffi 或 node-api 调用 Win32 API
const ffi = require('ffi-napi');

// 定义 Win32 API
const user32 = ffi.Library('user32', {
    SetWindowDisplayAffinity: ['bool', ['pointer', 'uint32']],
    FindWindowW: ['pointer', ['pointer', 'pointer']],
    GetForegroundWindow: ['pointer', []],
    SetWindowPos: ['bool', ['pointer', 'pointer', 'int', 'int', 'int', 'int', 'uint32']],
});

const WDA_EXCLUDEFROMCAPTURE = 0x00000011;
const WDA_MONITOR = 0x00000001;
const HWND_TOPMOST = -1;
const SWP_SHOWWINDOW = 0x0040;

class OverlayManager {
    private overlayWindow: BrowserWindow | null = null;
    
    async createOverlayWindow() {
        this.overlayWindow = new BrowserWindow({
            width: 400,
            height: 300,
            x: 100,
            y: 100,
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            movable: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
        });
        
        // 加载覆盖层 UI
        await this.overlayWindow.loadFile('overlay.html');
        
        // 获取窗口句柄
        const hwnd = this.overlayWindow.getNativeWindowHandle();
        
        // 关键：设置 WDA_EXCLUDEFROMCAPTURE
        // 需要在窗口创建后立即设置
        const result = user32.SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
        
        if (!result) {
            console.warn('WDA_EXCLUDEFROMCAPTURE 设置失败，尝试 WDA_MONITOR');
            user32.SetWindowDisplayAffinity(hwnd, WDA_MONITOR);
        }
        
        // 设置窗口为置顶
        user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_SHOWWINDOW);
        
        // 设置点击穿透
        this.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    }
    
    showOverlay(text: string) {
        if (this.overlayWindow) {
            this.overlayWindow.webContents.send('update-text', text);
            this.overlayWindow.show();
        }
    }
    
    hideOverlay() {
        if (this.overlayWindow) {
            this.overlayWindow.hide();
        }
    }
}

// 快捷键监听
import { globalShortcut } from 'electron';

app.on('ready', () => {
    const overlayManager = new OverlayManager();
    overlayManager.createOverlayWindow();
    
    globalShortcut.register('CommandOrControl+Enter', () => {
        overlayManager.showOverlay('AI 提示内容...');
    });
});
```

### 5.2 macOS 实现方案

macOS 没有直接等价于 `SetWindowDisplayAffinity` 的 API，但可以通过以下方式实现：

#### 5.2.1 CGWindowLevel + kCGScreenSaverWindowLevel

```objc
#import <Cocoa/Cocoa.h>

@interface OverlayWindow : NSWindow
@end

@implementation OverlayWindow

- (id)initWithContentRect:(NSRect)contentRect {
    self = [super initWithContentRect:contentRect
                            styleMask:NSWindowStyleMaskBorderless
                              backing:NSBackingStoreBuffered
                                defer:NO];
    if (self) {
        // 设置窗口层级为屏幕保护程序级别（最高层级）
        [self setLevel:kCGScreenSaverWindowLevel];
        
        // 设置透明背景
        [self setBackgroundColor:[NSColor clearColor]];
        [self setOpaque:NO];
        
        // 设置点击穿透
        [self setIgnoresMouseEvents:YES];
        
        // 设置窗口在所有工作区可见
        [self setCollectionBehavior:NSWindowCollectionBehaviorCanJoinAllSpaces |
                                     NSWindowCollectionBehaviorStationary |
                                     NSWindowCollectionBehaviorIgnoresCycle];
    }
    return self;
}

@end
```

#### 5.2.2 使用 ScreenCaptureKit（macOS 12+）

```swift
import ScreenCaptureKit

class OverlayManager {
    func createOverlay() {
        // 创建不可捕获的窗口
        let window = NSWindow(
            contentRect: NSRect(x: 100, y: 100, width: 400, height: 300),
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )
        
        // 设置窗口层级
        window.level = .screenSaver
        
        // 设置透明
        window.backgroundColor = .clear
        window.isOpaque = false
        
        // 显示窗口
        window.makeKeyAndOrderFront(nil)
    }
}
```

### 5.3 技术方案对比

| 方案 | 复杂度 | 可靠性 | 兼容性 | 推荐度 |
|------|--------|--------|--------|--------|
| **SetWindowDisplayAffinity (WDA)** | 低 | 极高 | Win 10 2004+ | ✅ **强烈推荐** |
| **WDA_MONITOR** | 低 | 高 | Win 8+ | ✅ 备选 |
| **GPU 直接渲染** | 极高 | 中 | 低 | ❌ 不推荐 |
| **透明窗口 + 点击穿透** | 低 | 低 | 高 | ❌ 不推荐 |

### 5.4 覆盖层 UI 设计

```typescript
// Overlay.tsx - 覆盖层 React 组件
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface OverlayProps {
    isVisible: boolean;
    text: string;
    confidence: number;
    onClose: () => void;
}

export const AIOverlay: React.FC<OverlayProps> = ({ isVisible, text, confidence, onClose }) => {
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="fixed top-4 right-4 w-96 bg-gray-900/95 
                               backdrop-blur-sm rounded-lg shadow-2xl 
                               border border-gray-700 p-4 z-[99999]"
                    style={{ 
                        pointerEvents: 'none', // 点击穿透
                        userSelect: 'none'
                    }}
                >
                    {/* 头部 */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-sm font-medium text-gray-300">
                                AI 助手
                            </span>
                        </div>
                        <span className="text-xs text-gray-500">
                            置信度: {(confidence * 100).toFixed(0)}%
                        </span>
                    </div>
                    
                    {/* 内容 */}
                    <div className="text-sm text-gray-100 leading-relaxed">
                        {text}
                    </div>
                    
                    {/* 操作按钮 */}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700">
                        <button 
                            className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 
                                       rounded text-white transition-colors"
                            style={{ pointerEvents: 'auto' }}
                        >
                            复制
                        </button>
                        <button 
                            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 
                                       rounded text-gray-300 transition-colors"
                            style={{ pointerEvents: 'auto' }}
                        >
                            隐藏
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

@end
```

### 5.3 Native Addon 方案（已弃用）

> **已弃用**: 原设计通过 C++ Native Addon (`node-gyp` 编译) 调用 Win32 API，需要 Visual Studio C++ 编译工具链。实际采用 **koffi FFI**（见 3.2.2），无需编译依赖，一行 `lib.func('bool SetWindowDisplayAffinity(int64 hwnd, uint32 affinity)')` 即可完成调用。实现代码见 `src/native/wda-wrapper.ts`。

---

## 六、开发实施计划

### 6.1 项目阶段

| 阶段 | 名称 | 周期 | 交付物 | 里程碑 |
|------|------|------|--------|--------|
| **Phase 1** | GPU 覆盖层 POC | 4 周 | 可运行的隐形覆盖层 | 屏幕共享不可见验证 |
| **Phase 2** | 核心功能开发 | 8 周 | MVP 版本 | 内部 Alpha 测试 |
| **Phase 3** | 功能完善 | 4 周 | Beta 版本 | 外部 Beta 测试 |
| **Phase 4** | 正式发布 | 2 周 | 正式版本 | 公开发布 |

### 6.2 详细计划

#### Phase 1: 隐形覆盖层 POC（第 1-4 周）

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W1 | SetWindowDisplayAffinity API 集成 | 可显示窗口 |
| W2 | WDA_EXCLUDEFROMCAPTURE 测试 | 屏幕捕获测试 |
| W3 | 透明背景 + 点击穿透 | 完整覆盖层 |
| W4 | Electron 集成 | Electron 可调用的覆盖层 |

#### Phase 2: 核心功能（第 5-12 周）

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W5-W6 | 音频捕获 + Whisper 集成 | 实时转录 |
| W7-W8 | AI 提示引擎 | 实时 AI 答案 |
| W9-W10 | 屏幕 OCR + 代码识别 | 屏幕内容理解 |
| W11-W12 | 知识库 + 会议管理 | 完整 MVP |

#### Phase 3: 功能完善（第 13-16 周）

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W13-W14 | 性能优化 | 延迟 < 500ms |
| W15 | 多语言 + 稳定性 | 稳定版本 |
| W16 | Bug 修复 | Beta 版本 |

#### Phase 4: 发布（第 17-18 周）

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W17 | 安全审计 | 安全报告 |
| W18 | 正式发布 | 正式版本 |

### 6.3 团队配置

| 角色 | 人数 | 职责 | 备注 |
|------|------|------|------|
| 全栈工程师 | 1 | Electron + React + API + WDA 集成 | 当前实际 |
| （按需扩展） | - | - | - |

> **说明**: 原计划 9 人团队配置为商业化假设。当前 POC/MVP 阶段建议单人推进，优先完成核心功能验证后再考虑扩团队。采用 koffi 替代 C++ addon 后不再需要 C++ 工程师；Whisper API 替代本地部署后不再需要专职 AI 工程师；后端服务延后后不需要独立后端。

---

## 七、测试策略

### 7.1 核心测试项

| 测试类型 | 工具 | 测试内容 |
|---------|------|---------|
| **隐形测试** | 手动 + 自动化 | Zoom/Meet/Teams 屏幕共享不可见 |
| **延迟测试** | 自动化脚本 | 语音输入到 AI 显示 < 500ms |
| **兼容性测试** | 手动 | Windows 10+/macOS 12+ |
| **稳定性测试** | 自动化 | 连续运行 24h 不崩溃 |

### 7.2 隐形测试方案

```python
# 自动化隐形测试脚本
import subprocess
import time

def test_overlay_invisible():
    """测试覆盖层在屏幕共享中是否可见"""
    
    # 启动应用
    app = subprocess.Popen(['./cluely-app.exe'])
    time.sleep(3)
    
    # 启动 Zoom 屏幕共享
    zoom = subprocess.Popen(['zoom.exe'])
    time.sleep(5)
    
    # 捕获屏幕共享画面
    screenshot = capture_screen()
    
    # 检查覆盖层是否可见
    overlay_visible = detect_overlay_in_image(screenshot)
    
    assert not overlay_visible, "覆盖层在屏幕共享中可见！"
    
    print("✅ 隐形测试通过")
```

---

## 八、风险与应对

| 风险 | 可能性 | 影响 | 应对策略 |
|------|--------|------|---------|
| **GPU 渲染兼容性** | 高 | 高 | 多方案备选 (WDA/CGWindowLevel) |
| **系统更新导致失效** | 中 | 高 | 持续跟进系统更新，快速适配 |
| **反检测工具** | 高 | 中 | 持续更新渲染技术 |
| **法律风险** | 中 | 极高 | 用户协议免责，合规使用提示 |
| **性能不达标** | 中 | 高 | 早期 POC 验证，持续优化 |

---

## 附录

### A. 技术栈版本

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | 28.x | 桌面框架 |
| React | 18.x | UI 框架 |
| TypeScript | 5.x | 类型安全 |
| koffi | 3.x | Win32 FFI 调用 |
| OpenAI Whisper API | - | 语音转文字 |
| OpenAI API | v1 | AI 模型 |
| SQLite | 3.x | 本地数据库 |

### B. 参考资源

- [Win32 API 官方文档](https://docs.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity)
- [ScreenCaptureKit 官方文档](https://developer.apple.com/documentation/screencapturekit)
- [Electron Native Addon 文档](https://www.electronjs.org/docs/latest/tutorial/native-code)
- [Windows Graphics Capture](https://docs.microsoft.com/en-us/windows/uwp/audio-video-camera/screen-capture)

---

**文档版本**: v1.1  
**最后更新**: 2026-06-14  
**核心定位**: "Cheat on Everything" - GPU 级隐形 AI 辅助

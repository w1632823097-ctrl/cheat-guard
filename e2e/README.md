# E2E 测试

使用 Playwright 进行 Electron 应用的端到端测试。

## 运行测试

```bash
# 运行所有测试
npm run test:e2e

# 带 UI 界面运行（可逐条查看）
npm run test:e2e:ui

# 调试模式
npm run test:e2e:debug

# 运行单个测试文件
npx playwright test e2e/basic.spec.ts
```

## 测试文件说明

| 文件 | 覆盖功能 |
|------|----------|
| `basic.spec.ts` | 应用启动、聊天面板、消息发送、模型切换、新建会话、OCR 截图 |
| `add-model.spec.ts` | 添加模型弹窗、表单填写、测试连接 |

## 测试结果

- 截图保存在 `e2e-results/` 目录
- 失败时会自动保存 trace 和截图

## 注意事项

- 测试需要有效的 API Key 才能通过聊天相关测试
- 可在 `test.beforeAll` 中配置测试用的 API Key
- 测试前确保应用已构建（`npm run build`）

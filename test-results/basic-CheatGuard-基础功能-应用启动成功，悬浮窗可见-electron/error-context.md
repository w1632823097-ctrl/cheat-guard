# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: basic.spec.ts >> CheatGuard 基础功能 >> 应用启动成功，悬浮窗可见
- Location: e2e\basic.spec.ts:28:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.overlay-container')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('.overlay-container')

```

```yaml
- 'button "切换模型 (当前: DeepSeek V4 Flash)"':
  - img
- button "Ask"
- button:
  - img
- text: 100%
- slider "透明度": "100"
- button "今天天气怎么样":
  - img
  - text: 今天天气怎么样
  - img
- button "新建会话":
  - img
- button "清空上下文":
  - img
- text: 💬
- paragraph: 开始你的第一次对话
- textbox "输入问题..."
- button "DeepSeek V4 Flash":
  - text: DeepSeek V4 Flash
  - img
- button "截图识别":
  - img
- button "开始录音":
  - img
- button [disabled]:
  - img
```

# Test source

```ts
  1   | import { test, expect, ElectronApplication, Page } from '@playwright/test';
  2   | import { _electron as electron } from '@playwright/test';
  3   | import * as path from 'path';
  4   | 
  5   | let electronApp: ElectronApplication;
  6   | let page: Page;
  7   | 
  8   | test.beforeAll(async () => {
  9   |   // 启动 Electron 应用
  10  |   electronApp = await electron.launch({
  11  |     args: [path.join(__dirname, '..')],
  12  |     env: {
  13  |       ...process.env,
  14  |       NODE_ENV: 'test',
  15  |     },
  16  |   });
  17  | 
  18  |   // 等待主窗口加载
  19  |   page = await electronApp.firstWindow();
  20  |   await page.waitForLoadState('domcontentloaded');
  21  | });
  22  | 
  23  | test.afterAll(async () => {
  24  |   await electronApp?.close();
  25  | });
  26  | 
  27  | test.describe('CheatGuard 基础功能', () => {
  28  |   test('应用启动成功，悬浮窗可见', async () => {
  29  |     // 截图保存
  30  |     await page.screenshot({ path: 'e2e-results/01-launch.png' });
  31  | 
  32  |     // 检查悬浮窗是否存在
  33  |     const overlay = await page.locator('.overlay-container');
> 34  |     await expect(overlay).toBeVisible();
      |                           ^ Error: expect(locator).toBeVisible() failed
  35  |   });
  36  | 
  37  |   test('点击悬浮窗展开聊天面板', async () => {
  38  |     // 点击悬浮窗
  39  |     await page.locator('.overlay-container').click();
  40  | 
  41  |     // 等待聊天面板出现
  42  |     const chatPanel = await page.locator('.chat-panel');
  43  |     await expect(chatPanel).toBeVisible();
  44  | 
  45  |     await page.screenshot({ path: 'e2e-results/02-chat-panel-open.png' });
  46  |   });
  47  | 
  48  |   test('发送消息并收到 AI 回复', async () => {
  49  |     // 确保聊天面板已展开
  50  |     const chatPanel = await page.locator('.chat-panel');
  51  |     if (!(await chatPanel.isVisible())) {
  52  |       await page.locator('.overlay-container').click();
  53  |       await chatPanel.waitFor({ state: 'visible' });
  54  |     }
  55  | 
  56  |     // 在输入框输入测试消息
  57  |     const input = page.locator('.chat-input textarea');
  58  |     await input.fill('你好，这是一个测试');
  59  | 
  60  |     // 点击发送按钮
  61  |     await page.locator('.chat-input .send-btn').click();
  62  | 
  63  |     // 等待用户消息出现在列表中
  64  |     await page.waitForSelector('.message-row.user', { timeout: 5000 });
  65  | 
  66  |     // 等待 AI 回复（流式输出，最多等 30 秒）
  67  |     await page.waitForSelector('.message-row.assistant', { timeout: 30000 });
  68  | 
  69  |     await page.screenshot({ path: 'e2e-results/03-chat-response.png' });
  70  |   });
  71  | 
  72  |   test('模型切换功能正常', async () => {
  73  |     // 点击模型下拉
  74  |     await page.locator('.model-selector-btn').click();
  75  | 
  76  |     // 等待下拉列表出现
  77  |     await page.waitForSelector('.model-dropdown', { state: 'visible' });
  78  | 
  79  |     // 选择第一个模型（假设至少有一个）
  80  |     const options = await page.locator('.model-dropdown-item').all();
  81  |     if (options.length > 0) {
  82  |       await options[0].click();
  83  |     }
  84  | 
  85  |     // 验证下拉已关闭
  86  |     await expect(page.locator('.model-dropdown')).not.toBeVisible();
  87  | 
  88  |     await page.screenshot({ path: 'e2e-results/04-model-switch.png' });
  89  |   });
  90  | 
  91  |   test('新建会话功能', async () => {
  92  |     // 点击新建会话按钮
  93  |     await page.locator('.new-session-btn').click();
  94  | 
  95  |     // 等待消息列表清空或出现新会话提示
  96  |     await page.waitForTimeout(500);
  97  | 
  98  |     await page.screenshot({ path: 'e2e-results/05-new-session.png' });
  99  |   });
  100 | 
  101 |   test('截图 OCR 功能', async () => {
  102 |     // 点击截图按钮
  103 |     await page.locator('.screenshot-btn').click();
  104 | 
  105 |     // OCR 是异步的，等待一段时间
  106 |     await page.waitForTimeout(3000);
  107 | 
  108 |     await page.screenshot({ path: 'e2e-results/06-ocr.png' });
  109 |   });
  110 | });
  111 | 
```
# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: basic.spec.ts >> CheatGuard 基础功能 >> 新建会话功能
- Location: e2e\basic.spec.ts:91:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.new-session-btn')

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - 'button "切换模型 (当前: DeepSeek V4 Flash)" [ref=e6] [cursor=pointer]':
      - img [ref=e7]
    - button "Hide" [ref=e11] [cursor=pointer]:
      - generic [ref=e12]: Hide
    - button [ref=e13] [cursor=pointer]:
      - img [ref=e14]
  - generic [ref=e16]:
    - generic [ref=e17]:
      - generic [ref=e18]:
        - generic [ref=e19]: 100%
        - slider "透明度" [ref=e20] [cursor=pointer]: "100"
      - button "今天天气怎么样" [ref=e22] [cursor=pointer]:
        - img [ref=e23]
        - generic [ref=e25]: 今天天气怎么样
        - img [ref=e26]
      - generic [ref=e28]:
        - button "新建会话" [ref=e29] [cursor=pointer]:
          - img [ref=e30]
        - button "清空上下文" [ref=e31] [cursor=pointer]:
          - img [ref=e32]
    - generic [ref=e34]:
      - generic [ref=e36]: 15:09
      - generic [ref=e37]:
        - img [ref=e39]
        - generic [ref=e42]:
          - generic [ref=e43]: 你好
          - generic [ref=e44]:
            - button "编辑" [ref=e45] [cursor=pointer]:
              - img [ref=e46]
            - button "重新生成" [ref=e49] [cursor=pointer]:
              - img [ref=e50]
      - generic [ref=e53]:
        - img [ref=e55]
        - generic [ref=e57]:
          - generic [ref=e58]: 你好！我是 CheatGuard，你的实时 AI 桌面助手。有什么需要我帮忙的吗？请告诉我你的场景或问题。
          - generic [ref=e59]:
            - button "复制" [ref=e60] [cursor=pointer]:
              - img [ref=e61]
            - button "重新生成" [ref=e64] [cursor=pointer]:
              - img [ref=e65]
      - generic [ref=e68]:
        - img [ref=e70]
        - generic [ref=e73]:
          - generic [ref=e74]: 今天天气怎么样
          - generic [ref=e75]:
            - button "编辑" [ref=e76] [cursor=pointer]:
              - img [ref=e77]
            - button "重新生成" [ref=e80] [cursor=pointer]:
              - img [ref=e81]
      - generic [ref=e84]:
        - img [ref=e86]
        - generic [ref=e89]:
          - generic [ref=e90]: 深圳今天天气怎么样
          - generic [ref=e91]:
            - button "编辑" [ref=e92] [cursor=pointer]:
              - img [ref=e93]
            - button "重新生成" [ref=e96] [cursor=pointer]:
              - img [ref=e97]
      - generic [ref=e100]:
        - img [ref=e102]
        - generic [ref=e104]:
          - generic [ref=e105]: 抱歉，我无法实时获取天气数据。建议你打开手机或电脑的天气应用，或直接搜索“深圳天气”获取最新信息。
          - generic [ref=e106]:
            - button "复制" [ref=e107] [cursor=pointer]:
              - img [ref=e108]
            - button "重新生成" [ref=e111] [cursor=pointer]:
              - img [ref=e112]
      - generic [ref=e115]:
        - img [ref=e117]
        - generic [ref=e120]:
          - generic [ref=e121]: 深圳今天天气怎么样
          - generic [ref=e122]:
            - button "编辑" [ref=e123] [cursor=pointer]:
              - img [ref=e124]
            - button "重新生成" [ref=e127] [cursor=pointer]:
              - img [ref=e128]
      - generic [ref=e131]:
        - img [ref=e133]
        - generic [ref=e135]:
          - generic [ref=e136]: 抱歉，我无法实时获取天气数据。建议你打开手机或电脑的天气应用，或直接搜索“深圳天气”获取最新信息。
          - generic [ref=e137]:
            - button "复制" [ref=e138] [cursor=pointer]:
              - img [ref=e139]
            - button "重新生成" [ref=e142] [cursor=pointer]:
              - img [ref=e143]
      - generic [ref=e146]:
        - img [ref=e148]
        - generic [ref=e151]:
          - generic [ref=e152]: 你好
          - generic [ref=e153]:
            - button "编辑" [ref=e154] [cursor=pointer]:
              - img [ref=e155]
            - button "重新生成" [ref=e158] [cursor=pointer]:
              - img [ref=e159]
      - generic [ref=e162]:
        - img [ref=e164]
        - generic [ref=e166]:
          - generic [ref=e167]: 你好！有什么需要帮忙的？请告诉我具体场景或问题。
          - generic [ref=e168]:
            - button "复制" [ref=e169] [cursor=pointer]:
              - img [ref=e170]
            - button "重新生成" [ref=e173] [cursor=pointer]:
              - img [ref=e174]
      - generic [ref=e177]:
        - img [ref=e179]
        - generic [ref=e182]:
          - generic [ref=e183]: 你好呀
          - generic [ref=e184]:
            - button "编辑" [ref=e185] [cursor=pointer]:
              - img [ref=e186]
            - button "重新生成" [ref=e189] [cursor=pointer]:
              - img [ref=e190]
      - generic [ref=e193]:
        - img [ref=e195]
        - generic [ref=e197]:
          - generic [ref=e198]: 你好呀！😊 有什么我可以帮你的？请告诉我具体场景或问题。
          - generic [ref=e199]:
            - button "复制" [ref=e200] [cursor=pointer]:
              - img [ref=e201]
            - button "重新生成" [ref=e204] [cursor=pointer]:
              - img [ref=e205]
      - generic [ref=e208]:
        - img [ref=e210]
        - generic [ref=e213]:
          - generic [ref=e214]: 你好
          - generic [ref=e215]:
            - button "编辑" [ref=e216] [cursor=pointer]:
              - img [ref=e217]
            - button "重新生成" [ref=e220] [cursor=pointer]:
              - img [ref=e221]
      - generic [ref=e224]:
        - img [ref=e226]
        - generic [ref=e228]:
          - generic [ref=e229]: 你好！随时可以为你提供帮助。请告诉我具体场景或问题。
          - generic [ref=e230]:
            - button "复制" [ref=e231] [cursor=pointer]:
              - img [ref=e232]
            - button "重新生成" [ref=e235] [cursor=pointer]:
              - img [ref=e236]
    - generic [ref=e239]:
      - textbox "输入问题..." [ref=e240]
      - generic [ref=e242]:
        - button "DeepSeek V4 Flash" [ref=e244] [cursor=pointer]:
          - generic [ref=e245]: DeepSeek V4 Flash
          - img [ref=e246]
        - button "截图识别" [ref=e248] [cursor=pointer]:
          - img [ref=e249]
        - button "开始录音" [ref=e253] [cursor=pointer]:
          - img [ref=e254]
        - button [disabled] [ref=e257] [cursor=pointer]:
          - img [ref=e258]
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
  34  |     await expect(overlay).toBeVisible();
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
> 93  |     await page.locator('.new-session-btn').click();
      |                                            ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
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
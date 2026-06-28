# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: add-model.spec.ts >> 添加模型弹窗 >> 打开添加模型弹窗
- Location: e2e\add-model.spec.ts:22:7

# Error details

```
"beforeAll" hook timeout of 30000ms exceeded.
```

```
TimeoutError: page.waitForLoadState: Timeout 30000ms exceeded.
=========================== logs ===========================
  "networkidle" event fired
============================================================
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { _electron as electron } from '@playwright/test';
  3  | import * as path from 'path';
  4  | 
  5  | test.describe('添加模型弹窗', () => {
  6  |   let electronApp: any;
  7  |   let page: any;
  8  | 
  9  |   test.beforeAll(async () => {
  10 |     electronApp = await electron.launch({
  11 |       args: [path.join(__dirname, '..')],
  12 |       env: { ...process.env, NODE_ENV: 'test' },
  13 |     });
  14 |     page = await electronApp.firstWindow();
> 15 |     await page.waitForLoadState('domcontentloaded');
     |                ^ TimeoutError: page.waitForLoadState: Timeout 30000ms exceeded.
  16 |   });
  17 | 
  18 |   test.afterAll(async () => {
  19 |     await electronApp?.close();
  20 |   });
  21 | 
  22 |   test('打开添加模型弹窗', async () => {
  23 |     // 展开聊天面板
  24 |     await page.locator('.overlay-container').click();
  25 |     await page.waitForSelector('.chat-panel', { state: 'visible' });
  26 | 
  27 |     // 点击模型下拉
  28 |     await page.locator('.model-selector-btn').click();
  29 |     await page.waitForSelector('.model-dropdown', { state: 'visible' });
  30 | 
  31 |     // 点击 "+ 添加模型"
  32 |     await page.locator('.model-dropdown .add-model-btn').click();
  33 | 
  34 |     // 等待弹窗出现
  35 |     await page.waitForSelector('.modal-content', { state: 'visible' });
  36 | 
  37 |     await page.screenshot({ path: 'e2e-results/07-add-model-modal.png' });
  38 |   });
  39 | 
  40 |   test('填写表单并测试连接', async () => {
  41 |     // 填写模型 ID
  42 |     await page.locator('.modal-content input[type="text"]').first().fill('Test-Model');
  43 | 
  44 |     // 填写 API Key
  45 |     await page.locator('.modal-content input[type="password"]').fill('test-api-key-123');
  46 | 
  47 |     // 填写 API 地址
  48 |     const inputs = await page.locator('.modal-content input[type="text"]').all();
  49 |     if (inputs.length >= 2) {
  50 |       await inputs[1].fill('https://api.test.com/v1');
  51 |     }
  52 | 
  53 |     // 点击测试连接
  54 |     await page.locator('.modal-btn.test').click();
  55 | 
  56 |     // 等待测试结果（成功或失败）
  57 |     await page.waitForSelector('.modal-test-result', { timeout: 15000 });
  58 | 
  59 |     await page.screenshot({ path: 'e2e-results/08-test-model-result.png' });
  60 | 
  61 |     // 关闭弹窗
  62 |     await page.locator('.modal-close').click();
  63 |     await page.waitForSelector('.modal-content', { state: 'hidden' });
  64 |   });
  65 | });
  66 | 
```
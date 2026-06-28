import { test, expect } from '@playwright/test';
import { _electron as electron } from '@playwright/test';
import * as path from 'path';

test.describe('添加模型弹窗', () => {
  let electronApp: any;
  let page: any;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      args: [path.join(__dirname, '..')],
      env: { ...process.env, NODE_ENV: 'test' },
    });
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await electronApp?.close();
  });

  test('打开添加模型弹窗', async () => {
    // 展开聊天面板
    await page.locator('.overlay-container').click();
    await page.waitForSelector('.chat-panel', { state: 'visible' });

    // 点击模型下拉
    await page.locator('.model-selector-btn').click();
    await page.waitForSelector('.model-dropdown', { state: 'visible' });

    // 点击 "+ 添加模型"
    await page.locator('.model-dropdown .add-model-btn').click();

    // 等待弹窗出现
    await page.waitForSelector('.modal-content', { state: 'visible' });

    await page.screenshot({ path: 'e2e-results/07-add-model-modal.png' });
  });

  test('填写表单并测试连接', async () => {
    // 填写模型 ID
    await page.locator('.modal-content input[type="text"]').first().fill('Test-Model');

    // 填写 API Key
    await page.locator('.modal-content input[type="password"]').fill('test-api-key-123');

    // 填写 API 地址
    const inputs = await page.locator('.modal-content input[type="text"]').all();
    if (inputs.length >= 2) {
      await inputs[1].fill('https://api.test.com/v1');
    }

    // 点击测试连接
    await page.locator('.modal-btn.test').click();

    // 等待测试结果（成功或失败）
    await page.waitForSelector('.modal-test-result', { timeout: 15000 });

    await page.screenshot({ path: 'e2e-results/08-test-model-result.png' });

    // 关闭弹窗
    await page.locator('.modal-close').click();
    await page.waitForSelector('.modal-content', { state: 'hidden' });
  });
});

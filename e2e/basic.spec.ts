import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from '@playwright/test';
import * as path from 'path';

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  // 启动 Electron 应用
  electronApp = await electron.launch({
    args: [path.join(__dirname, '..')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  // 等待主窗口加载
  page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await electronApp?.close();
});

test.describe('CheatGuard 基础功能', () => {
  test('应用启动成功，悬浮窗可见', async () => {
    // 截图保存
    await page.screenshot({ path: 'e2e-results/01-launch.png' });

    // 检查悬浮窗是否存在
    const overlay = await page.locator('.overlay-container');
    await expect(overlay).toBeVisible();
  });

  test('点击悬浮窗展开聊天面板', async () => {
    // 点击悬浮窗
    await page.locator('.overlay-container').click();

    // 等待聊天面板出现
    const chatPanel = await page.locator('.chat-panel');
    await expect(chatPanel).toBeVisible();

    await page.screenshot({ path: 'e2e-results/02-chat-panel-open.png' });
  });

  test('发送消息并收到 AI 回复', async () => {
    // 确保聊天面板已展开
    const chatPanel = await page.locator('.chat-panel');
    if (!(await chatPanel.isVisible())) {
      await page.locator('.overlay-container').click();
      await chatPanel.waitFor({ state: 'visible' });
    }

    // 在输入框输入测试消息
    const input = page.locator('.chat-input textarea');
    await input.fill('你好，这是一个测试');

    // 点击发送按钮
    await page.locator('.chat-input .send-btn').click();

    // 等待用户消息出现在列表中
    await page.waitForSelector('.message-row.user', { timeout: 5000 });

    // 等待 AI 回复（流式输出，最多等 30 秒）
    await page.waitForSelector('.message-row.assistant', { timeout: 30000 });

    await page.screenshot({ path: 'e2e-results/03-chat-response.png' });
  });

  test('模型切换功能正常', async () => {
    // 点击模型下拉
    await page.locator('.model-selector-btn').click();

    // 等待下拉列表出现
    await page.waitForSelector('.model-dropdown', { state: 'visible' });

    // 选择第一个模型（假设至少有一个）
    const options = await page.locator('.model-dropdown-item').all();
    if (options.length > 0) {
      await options[0].click();
    }

    // 验证下拉已关闭
    await expect(page.locator('.model-dropdown')).not.toBeVisible();

    await page.screenshot({ path: 'e2e-results/04-model-switch.png' });
  });

  test('新建会话功能', async () => {
    // 点击新建会话按钮
    await page.locator('.new-session-btn').click();

    // 等待消息列表清空或出现新会话提示
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'e2e-results/05-new-session.png' });
  });

  test('截图 OCR 功能', async () => {
    // 点击截图按钮
    await page.locator('.screenshot-btn').click();

    // OCR 是异步的，等待一段时间
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'e2e-results/06-ocr.png' });
  });
});

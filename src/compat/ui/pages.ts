/**
 * compat/ui/pages — 页面渲染适配器
 *
 * 封装所有桌面端 pages/* 模块的动态导入。
 * 当上游重组页面模块或修改导出 API 时,只需更新此文件,
 * mobile/ 通过统一的 renderPage() 接口调用,不受影响。
 */

import type { Page } from '../../shared/types/index.js';

/** 移动端支持的页面名称 */
export type PageName = Page;

/**
 * 渲染指定页面到容器元素。
 *
 * @param page - 页面标识
 * @param container - 目标 DOM 容器
 */
export async function renderPage(page: Page, container: HTMLElement): Promise<void> {
  try {
    switch (page) {
      case 'messages': {
        const { renderMessagesPage } = await import('../../pages/messagesPage.js');
        await renderMessagesPage(container);
        break;
      }
      case 'contacts': {
        const { renderContactsPage } = await import('../../pages/contactsPage.js');
        await renderContactsPage(container);
        break;
      }
      case 'groups': {
        const { renderGroupsPage } = await import('../../pages/groupsPage.js');
        await renderGroupsPage(container);
        break;
      }
      case 'work': {
        const { renderWorkPage } = await import('../../pages/workPage.js');
        await renderWorkPage(container);
        break;
      }
      case 'me':
      case 'settings': {
        const { renderMePage } = await import('../../pages/settingsPage.js');
        await renderMePage(container);
        break;
      }
      case 'inbox': {
        const { renderInboxMain } = await import('../../pages/inboxPage.js');
        await renderInboxMain(container);
        break;
      }
      case 'terminal': {
        // 终端页需要 panel + main 两个容器,移动端只传一个
        const { renderTerminalPage } = await import('../../pages/terminalPage.js');
        renderTerminalPage(container, container);
        break;
      }
      default: {
        container.innerHTML = `<div class="empty">未知页面: ${page}</div>`;
      }
    }
  } catch (err) {
    console.error(`[compat/ui/pages] render ${page} failed:`, err);
    container.innerHTML = `<div class="empty">页面加载失败</div>`;
  }
}

/**
 * compat/ui/shell — 移动端 Shell 布局适配器
 *
 * 提供移动端 WeChat 风格 Shell 布局(TopBar + PageContainer + BottomNav)。
 * 适配桌面端 shell/shell.ts 的三栏布局为单栏移动布局。
 *
 * 内部使用 api.ts 和 state.ts 直接进行数据访问(无中间层)。
 */

import { state, setState } from '../../state.js';
import { call } from '../../api.js';
import { escapeHtml } from '../../shared/utils/index.js';
import { PAGE_TITLES } from '../../shared/constants/index.js';
import { iconSvg } from '../../components/icon.js';
import type { Page } from '../../shared/types/index.js';

/** 上一页面记录(用于返回导航) */
let previousPage: Page = 'messages';

// ── Shell 渲染 ─────────────────────────────────────────────────────────

/**
 * 渲染移动端 Shell 布局到 #app。
 * 创建: TopBar + PageContainer(5 个页面容器) + BottomNav 占位。
 */
export function renderMobileShell(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <div id="mobile-shell" class="mobile-shell">
      <div id="mobile-top-bar" class="mobile-top-bar">
        <button id="mobile-back-btn" class="mobile-back-btn" aria-label="Back" style="display:none">
          ${iconSvg('arrow-left', { width: 24, height: 24, strokeWidth: 1.5 })}
        </button>
        <span id="mobile-title" class="mobile-title">Chats</span>
        <div id="mobile-top-actions" class="mobile-top-actions"></div>
      </div>
      <div id="mobile-page-container" class="mobile-page-container">
        <div id="mobile-page-messages" class="mobile-page"></div>
        <div id="mobile-page-contacts" class="mobile-page" style="display:none"></div>
        <div id="mobile-page-groups" class="mobile-page" style="display:none"></div>
        <div id="mobile-page-work" class="mobile-page" style="display:none"></div>
        <div id="mobile-page-me" class="mobile-page" style="display:none"></div>
      </div>
      <div id="bottom-nav" class="mobile-bottom-nav"></div>
    </div>
  `;

  bindBackButton();
}

// ── 页面导航 ────────────────────────────────────────────────────────────

/**
 * 导航到指定移动端页面。
 * 隐藏其他页面,更新顶栏,渲染页面内容,刷新底部导航高亮。
 */
export async function navigateToMobilePage(page: Page): Promise<void> {
  previousPage = state.currentPage;
  setState({ currentPage: page, currentChatId: null });

  // 隐藏所有页面
  document.querySelectorAll<HTMLElement>('.mobile-page').forEach((p) => {
    p.style.display = 'none';
  });

  // 显示目标页面
  const pageEl = document.getElementById(`mobile-page-${page}`);
  if (pageEl) {
    pageEl.style.display = '';
  }

  // 更新顶栏标题
  updateMobileTopBar();

  // 渲染页面内容(通过 pages 适配器)
  await renderPageContent(page);

  // 刷新底部导航高亮
  const { renderBottomNav } = await import('./navigation.js');
  renderBottomNav();
}

/**
 * 渲染页面内容。
 * 通过 pages 适配器动态加载桌面端页面模块。
 */
async function renderPageContent(page: Page): Promise<void> {
  const pageEl = document.getElementById(`mobile-page-${page}`);
  if (!pageEl) return;

  const { renderPage } = await import('./pages.js');
  await renderPage(page, pageEl);
}

// ── 聊天全屏模式 ────────────────────────────────────────────────────────

/**
 * 进入聊天全屏模式。
 * 隐藏底部导航和所有页面,渲染聊天视图到 messages 容器。
 */
export async function enterMobileChat(chatId: number): Promise<void> {
  previousPage = state.currentPage;
  setState({ currentChatId: chatId });

  // 隐藏所有页面
  document.querySelectorAll<HTMLElement>('.mobile-page').forEach((p) => {
    p.style.display = 'none';
  });

  // 隐藏底部导航
  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) bottomNav.style.display = 'none';

  // 移除底部内边距
  const container = document.getElementById('mobile-page-container');
  if (container) container.style.paddingBottom = '0';

  // 渲染聊天到 messages 页面容器
  const pageEl = document.getElementById('mobile-page-messages');
  if (pageEl) {
    pageEl.style.display = '';
    const { renderChatView } = await import('./chat.js');
    await renderChatView(chatId);
  }

  updateMobileTopBar();
}

/**
 * 退出聊天全屏模式,返回上一页面。
 */
export async function leaveMobileChat(): Promise<void> {
  setState({
    currentChatId: null,
    messages: [],
    currentMembers: [],
  });

  // 恢复底部导航
  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) bottomNav.style.display = '';

  // 恢复页面容器内边距
  const container = document.getElementById('mobile-page-container');
  if (container) container.style.paddingBottom = '';

  // 返回上一页面
  await navigateToMobilePage(previousPage);
}

// ── 顶栏管理 ────────────────────────────────────────────────────────────

/**
 * 更新移动端顶栏标题、返回按钮和操作按钮。
 */
export function updateMobileTopBar(): void {
  const title = document.getElementById('mobile-title');
  const backBtn = document.getElementById('mobile-back-btn');
  const topActions = document.getElementById('mobile-top-actions');
  if (!title) return;

  const isInChat = state.currentChatId != null;

  if (isInChat) {
    title.textContent = getChatTitle();
    if (backBtn) backBtn.style.display = '';
    if (topActions) {
      topActions.innerHTML = `
        <button class="mobile-menu-btn" id="mobile-chat-menu-btn" aria-label="Chat Info">
          ${iconSvg('more-horizontal', { width: 24, height: 24, strokeWidth: 1.5 })}
        </button>
      `;
      bindChatMenuButton();
    }
  } else {
    title.textContent = PAGE_TITLES[state.currentPage] || 'Peytchat';
    if (backBtn) backBtn.style.display = 'none';
    if (topActions) topActions.innerHTML = '';
  }
}

/** 从 state.channels 中查找当前聊天名称 */
function getChatTitle(): string {
  if (!state.currentChatId) return 'Chat';
  const channel = state.channels.find(
    (c) => c.chat_id === state.currentChatId,
  );
  if (channel) return channel.name;
  return 'Chat';
}

// ── 事件绑定 ────────────────────────────────────────────────────────────

function bindBackButton(): void {
  const backBtn = document.getElementById('mobile-back-btn');
  if (!backBtn) return;
  backBtn.addEventListener('click', async () => {
    if (state.currentChatId != null) {
      await leaveMobileChat();
    }
  });
}

async function bindChatMenuButton(): Promise<void> {
  const btn = document.getElementById('mobile-chat-menu-btn');
  if (!btn) return;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const { showDropdown } = await import('../../components/dropdown.js');
    const { showToast } = await import('../../toast.js');

    const chatId = state.currentChatId;
    if (!chatId) return;

    showDropdown(btn, [
      {
        label: '查看资料',
        icon: 'user',
        action: () => showToast('查看资料(开发中)'),
      },
      {
        label: '屏蔽',
        icon: 'volume-x',
        action: async () => {
          try {
            await call('block_chat', { chatId });
            showToast('已屏蔽');
            await leaveMobileChat();
          } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
          }
        },
      },
      {
        label: '删除会话',
        icon: 'trash',
        danger: true,
        action: async () => {
          try {
            await call('delete_chat', { chatId });
            showToast('已删除');
            await leaveMobileChat();
          } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
          }
        },
      },
    ], { position: 'bottom-right' });
  });
}

import { state } from '../state.js';
import { saveState } from '../persist.js';
import { iconSvg } from '../components/icon.js';
import { renderBottomNav } from './bottomNavigation.js';
import type { Page } from '../types.js';

// ── 移动端 Shell: WeChat 风格 ──────────────────────────────────────────
// 架构: Fixed TopBar + Page Container (full-screen pages) + Fixed BottomNav
// 没有侧边栏、没有抽屉、没有 nav-panel/main 分离。
// 每个底部 Tab 对应一个独立的全屏页面。

const PAGE_TITLES: Record<string, string> = {
  messages: 'Chats',
  contacts: 'Contacts',
  groups: 'Groups',
  work: 'Work',
  me: 'Me',
};

let previousPage: Page = 'messages';

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

// ── 页面导航 ──────────────────────────────────────────────────────────

export async function navigateToMobilePage(page: Page): Promise<void> {
  previousPage = state.currentPage;
  state.currentPage = page;
  state.currentChatId = null;
  saveState();

  // 隐藏所有页面
  document.querySelectorAll<HTMLElement>('.mobile-page').forEach((p) => {
    p.style.display = 'none';
  });

  // 显示目标页面
  const pageEl = document.getElementById(`mobile-page-${page}`);
  if (pageEl) {
    pageEl.style.display = '';
  }

  // 更新顶栏
  updateMobileTopBar();

  // 渲染页面内容
  await renderPageContent(page);

  // 更新底部导航
  renderBottomNav();
}

async function renderPageContent(page: Page): Promise<void> {
  const pageEl = document.getElementById(`mobile-page-${page}`);
  if (!pageEl) return;

  try {
    switch (page) {
      case 'messages': {
        const { renderMessagesPage } = await import('../pages/messagesPage.js');
        await renderMessagesPage(pageEl);
        break;
      }
      case 'contacts': {
        const { renderContactsPage } = await import('../pages/contactsPage.js');
        await renderContactsPage(pageEl);
        break;
      }
      case 'groups': {
        const { renderGroupsPage } = await import('../pages/groupsPage.js');
        await renderGroupsPage(pageEl);
        break;
      }
      case 'work': {
        const { renderWorkPage } = await import('../pages/workPage.js');
        await renderWorkPage(pageEl);
        break;
      }
      case 'me': {
        const { renderMePage } = await import('../pages/settingsPage.js');
        await renderMePage(pageEl);
        break;
      }
    }
  } catch {
    pageEl.innerHTML = `<div class="empty">页面加载失败</div>`;
  }
}

// ── 进入聊天全屏模式 ──────────────────────────────────────────────────

export async function enterMobileChat(chatId: number): Promise<void> {
  previousPage = state.currentPage;
  state.currentChatId = chatId;
  saveState();

  // 隐藏页面容器内的所有页面
  document.querySelectorAll<HTMLElement>('.mobile-page').forEach((p) => {
    p.style.display = 'none';
  });

  // 隐藏底部导航
  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) bottomNav.style.display = 'none';

  // 调整页面容器 padding（没有底部导航）
  const container = document.getElementById('mobile-page-container');
  if (container) container.style.paddingBottom = '0';

  // 渲染聊天到 messages 页面容器
  const pageEl = document.getElementById('mobile-page-messages');
  if (pageEl) {
    pageEl.style.display = '';
    try {
      const { renderChatView } = await import('../chat/chatView.js');
      await renderChatView(chatId);
    } catch {
      pageEl.innerHTML = `<div class="empty">聊天加载失败</div>`;
    }
  }

  updateMobileTopBar();
}

export async function leaveMobileChat(): Promise<void> {
  state.currentChatId = null;
  state.currentMembers = [];
  state.messages = [];
  saveState();

  // 恢复底部导航
  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) bottomNav.style.display = '';

  // 恢复页面容器 padding
  const container = document.getElementById('mobile-page-container');
  if (container) container.style.paddingBottom = '';

  // 返回上一页面
  await navigateToMobilePage(previousPage);
}

// ── 顶栏更新 ──────────────────────────────────────────────────────────

export function updateMobileTopBar(): void {
  const title = document.getElementById('mobile-title');
  const backBtn = document.getElementById('mobile-back-btn');
  const topActions = document.getElementById('mobile-top-actions');
  if (!title) return;

  const isInChat = state.currentChatId != null;

  if (isInChat) {
    // 聊天模式: 显示返回按钮 + 频道名
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
    // 页面模式: 隐藏返回按钮, 显示页面标题
    title.textContent = PAGE_TITLES[state.currentPage] || 'Peytchat';
    if (backBtn) backBtn.style.display = 'none';
    if (topActions) topActions.innerHTML = '';
  }
}

function getChatTitle(): string {
  if (!state.currentChatId) return 'Chat';
  const channel = state.channels.find((c) => c.chat_id === state.currentChatId);
  if (channel) return channel.name;
  return 'Chat';
}

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
    const { showDropdown } = await import('../components/dropdown.js');
    const { showToast } = await import('../toast.js');
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
            const { call } = await import('../api.js');
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
            const { call } = await import('../api.js');
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

export function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

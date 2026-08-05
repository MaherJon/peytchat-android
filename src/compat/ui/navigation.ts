/**
 * compat/ui/navigation — 移动端导航适配器
 *
 * 提供移动端底部 5 标签页导航 + 导航栈管理。
 * 适配桌面端的 state.currentPage 分发逻辑为移动端标签页模式。
 *
 * 内部使用 state.ts 读写当前页面,persist.ts 持久化导航状态。
 */

import { state, setState } from '../../state.js';
import { saveState } from '../../persist.js';
import { MOBILE_TABS } from '../../shared/constants/index.js';
import type { Page } from '../../shared/types/index.js';
import { iconSvg } from '../../components/icon.js';
import type { IconName } from '../../components/icon.js';

// ── 类型 ──────────────────────────────────────────────────────────────────

/** 导航栈条目 */
export interface NavigationEntry {
  page: Page;
  chatId?: number | null;
}

/** 导航栈(用于子页面返回) */
const navStack: NavigationEntry[] = [];

// ── 底部导航栏渲染 ───────────────────────────────────────────────────────

/**
 * 渲染移动端底部 5 标签页导航栏。
 * 高亮当前页面,点击切换到对应页面。
 */
export function renderBottomNav(): void {
  const nav = document.getElementById('bottom-nav');
  if (!nav) return;

  nav.innerHTML = MOBILE_TABS
    .map((t) => {
      const active = state.currentPage === t.page ? 'active' : '';
      return `<div class="bn-tab ${active}" data-page="${t.page}" role="tab" aria-selected="${state.currentPage === t.page}">
        ${iconSvg(t.icon as IconName, { width: 24, height: 24, strokeWidth: 1.5 })}
        <span class="bn-label">${t.label}</span>
      </div>`;
    })
    .join('');

  nav.querySelectorAll<HTMLElement>('.bn-tab').forEach((el) => {
    el.addEventListener('click', async () => {
      const page = el.dataset.page as Page;
      if (state.currentPage === page) return;
      await navigate(page);
    });
  });
}

// ── 导航方法 ────────────────────────────────────────────────────────────

/**
 * 导航到指定页面。
 * 如果当前在聊天模式,先退出聊天。
 */
export async function navigate(page: Page): Promise<void> {
  // 如果当前在聊天模式,先退出
  if (state.currentChatId != null) {
    const { leaveMobileChat } = await import('./shell.js');
    await leaveMobileChat();
  }

  const { navigateToMobilePage } = await import('./shell.js');
  await navigateToMobilePage(page);
  saveState();
}

/**
 * 打开指定聊天(全屏模式)。
 * 将当前页面压入导航栈,便于返回。
 */
export async function openChat(chatId: number): Promise<void> {
  // 保存当前页到导航栈
  navStack.push({ page: state.currentPage, chatId: state.currentChatId });

  const { enterMobileChat } = await import('./shell.js');
  await enterMobileChat(chatId);
  saveState();
}

/**
 * 返回上一页(从导航栈弹出)。
 * @returns 是否成功返回(false 表示栈空,无法返回)
 */
export async function goBack(): Promise<boolean> {
  // 如果在聊天模式,先退出
  if (state.currentChatId != null) {
    const { leaveMobileChat } = await import('./shell.js');
    await leaveMobileChat();
    return true;
  }

  // 从导航栈弹出
  const prev = navStack.pop();
  if (!prev) return false;

  if (prev.chatId) {
    const { enterMobileChat } = await import('./shell.js');
    await enterMobileChat(prev.chatId);
  } else {
    const { navigateToMobilePage } = await import('./shell.js');
    await navigateToMobilePage(prev.page);
  }
  saveState();
  return true;
}

/**
 * 初始化导航(从持久化状态恢复当前页面)。
 * 在应用启动时调用。
 */
export function initNavigation(): void {
  // 当前页面已由 persist.ts 恢复,只需确保初始页面有效
  if (!state.currentPage) {
    setState({ currentPage: 'messages' });
  }
}

/**
 * shared/constants — 共享常量
 *
 * 集中定义 mobile/ 和 compat/ 都使用的常量。
 * 不依赖任何项目模块(纯常量文件)。
 */

import type { Page } from '../types/index.js';
import type { IconName } from '../../components/icon.js';

// ── 兼容层版本 ───────────────────────────────────────────────────────────
/** 当前兼容层 API 版本 */
export const COMPAT_API_VERSION = 1;

// ── 移动端页面标题 ───────────────────────────────────────────────────────
/** 移动端顶栏标题映射 (原先在 mobileShell.ts 中定义) */
export const PAGE_TITLES: Record<string, string> = {
  messages: 'Chats',
  contacts: 'Contacts',
  groups: 'Groups',
  work: 'Work',
  me: 'Me',
};

// ── 移动端底部导航栏 Tab 定义 ───────────────────────────────────────────
/** 移动端底部导航标签页定义 (原先在 bottomNavigation.ts 中定义) */
export interface MobileTabDef {
  page: Page;
  icon: string; // IconName, but kept as string to avoid coupling
  label: string;
}

export const MOBILE_TABS: MobileTabDef[] = [
  { page: 'messages', icon: 'message-circle', label: 'Chats' },
  { page: 'contacts', icon: 'contact', label: 'Contacts' },
  { page: 'groups', icon: 'users', label: 'Groups' },
  { page: 'work', icon: 'layout-grid', label: 'Work' },
  { page: 'me', icon: 'user', label: 'Me' },
];

// ── Emoji 面板 ────────────────────────────────────────────────────────────
/** 移动端快速 Emoji 面板 (原先在 mobileComposer.ts 中定义) */
export const QUICK_EMOJIS: string[] = [
  '😊', '😂', '❤️', '👍', '🎉', '🔥',
  '😢', '😡', '👋', '✅', '🙏', '💪',
];

// ── 移动端断点 ────────────────────────────────────────────────────────────
/** 移动端视口最大宽度 (px) */
export const MOBILE_BREAKPOINT = 900;

/**
 * 检测当前是否为移动端视口。
 * 原先各处使用 window.matchMedia('(max-width:900px)').matches。
 */
export function isMobileViewport(): boolean {
  return window.matchMedia(`(max-width:${MOBILE_BREAKPOINT}px)`).matches;
}

// ── 消息虚拟化参数 ───────────────────────────────────────────────────────
/** 消息列表虚拟化: 每项高度(px) */
export const MSG_ITEM_HEIGHT = 60;
/** 消息列表虚拟化: 视口外缓冲项数 */
export const MSG_BUFFER = 20;
/** 消息列表虚拟化: 视口内可见项数 */
export const MSG_VIEWPORT = 30;

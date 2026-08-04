import { state } from '../state.js';
import { saveState } from '../persist.js';

// ── 移动端 Chat 编排器 ───────────────────────────────────────────────
// 管理移动端聊天模式的生命周期。
// 实际的导航逻辑已迁移到 mobileShell.ts (enterMobileChat / leaveMobileChat)。
// 此文件保留用于兼容旧引用。

/** 进入聊天模式 */
export function enterMobileChat(): void {
  // 由 mobileShell.enterMobileChat 处理,此函数保留用于旧代码兼容
}

/** 退出聊天模式 */
export async function leaveMobileChat(): Promise<void> {
  state.currentChatId = null;
  state.currentMembers = [];
  state.messages = [];
  saveState();
}

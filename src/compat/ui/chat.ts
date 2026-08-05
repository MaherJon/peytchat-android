/**
 * compat/ui/chat — 聊天视图适配器
 *
 * 封装桌面端 chat/chatView.ts 的导入和调用。
 * 当上游修改 chatView 的导出 API 时,只需更新此文件,
 * mobile/ 通过统一的适配器接口调用,不受影响。
 */

import type { MsgDto } from '../../shared/types/index.js';

/**
 * 渲染聊天视图。
 * 封装 desktop chat/chatView.ts 的 renderChatView。
 */
export async function renderChatView(chatId: number): Promise<void> {
  const { renderChatView: desktopRender } = await import('../../chat/chatView.js');
  await desktopRender(chatId);
}

/**
 * 乐观更新: 将临时消息追加到消息列表。
 * 封装 desktop chat/chatView.ts 的 appendOptimisticMessage。
 */
export function appendOptimisticMessage(tmpMsg: MsgDto): void {
  // 动态导入以确保模块已加载
  import('../../chat/chatView.js').then(({ appendOptimisticMessage: fn }) => {
    fn(tmpMsg);
  }).catch(err => {
    console.error('[compat/ui/chat] appendOptimisticMessage failed:', err);
  });
}

/**
 * 追加新消息(增量加载)。
 * 封装 desktop chat/chatView.ts 的 appendNewMessages。
 */
export async function appendNewMessages(chatId: number): Promise<void> {
  const { appendNewMessages: fn } = await import('../../chat/chatView.js');
  await fn(chatId);
}

/**
 * mobile/components/MobileChat — 移动端聊天(兼容性重导出)
 *
 * 此文件保留用于向后兼容。
 * 实际实现在 compat/ui/chat.ts。
 * 所有新代码应直接从 compat/ui/chat.js 导入。
 */

export {
  renderChatView,
  appendOptimisticMessage,
  appendNewMessages,
} from '../../compat/ui/chat.js';

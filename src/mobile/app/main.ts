/**
 * mobile/app/main — 移动端应用入口
 *
 * 移动端启动流程:
 * 1. 初始化事件监听(直接使用 api.ts 的 onEvent)
 * 2. 加载工作区和频道数据(直接使用 api.ts 的 call)
 * 3. 渲染移动端 Shell(通过 compat/ui 适配器)
 * 4. 初始化导航和底部导航栏(通过 compat/ui 适配器)
 *
 * 数据层: 直接使用 src/api.ts 和 src/state.ts,无中间层。
 * UI 层: 通过 compat/ui/ 适配器访问桌面 UI 模块。
 */

import { call, onEvent } from '../../api.js';
import type { DcEvent } from '../../api.js';
import { state, setState } from '../../state.js';
import { isMobileViewport } from '../../shared/constants/index.js';

/**
 * 移动端启动入口。
 * 仅在移动端视口时调用。
 */
export async function bootMobile(): Promise<void> {
  if (!isMobileViewport()) return;

  // 1. 加载初始数据
  await loadInitialData();

  // 2. 注入移动端样式
  const { injectMobileStyles } = await import('../../compat/ui/styles.js');
  injectMobileStyles();

  // 3. 渲染移动端 Shell
  const { renderMobileShell, navigateToMobilePage } = await import(
    '../../compat/ui/shell.js'
  );
  renderMobileShell();

  // 4. 渲染底部导航
  const { renderBottomNav } = await import(
    '../../compat/ui/navigation.js'
  );
  renderBottomNav();

  // 5. 导航到初始页面
  await navigateToMobilePage(state.currentPage);

  // 6. 注册全局事件处理器
  registerMobileEventHandlers();

  // 7. 加载插件
  try {
    const { loadPlugins } = await import('../../plugins/manager.js');
    void loadPlugins();
  } catch { /* ignore */ }
}

/**
 * 加载初始数据:工作区、频道、个人资料、未读数。
 */
async function loadInitialData(): Promise<void> {
  try {
    // 加载工作区列表
    const workspaces = await call<Array<Record<string, unknown>>>('list_workspaces');
    setState({ workspaces: workspaces as never });

    // 加载自己的资料
    try {
      const self = await call<Record<string, unknown>>('get_self_profile');
      if (self) setState({ self: self as never });
    } catch { /* ignore */ }

    // 如果已有当前工作区,加载频道列表
    if (state.currentWsId != null) {
      try {
        const channels = await call<Array<Record<string, unknown>>>('list_channels', {
          workspaceId: state.currentWsId,
        });
        setState({ channels: channels as never });
      } catch { /* ignore */ }
    }

    // 验证频道有效性
    try {
      await call<number>('validate_channels');
    } catch { /* ignore */ }

    // 总未读数
    try {
      const chatList = await call<Array<{ unread: number }>>('get_chatlist');
      const totalUnread = chatList.reduce((sum, c) => sum + (c.unread || 0), 0);
      setState({ inboxUnread: totalUnread });
    } catch { /* ignore */ }

    // PEYT Studio
    try {
      await call('ensure_peyt_studio');
    } catch { /* ignore */ }
  } catch (err) {
    console.error('[mobile] init data failed:', err);
  }
}

/**
 * 注册移动端全局事件处理器。
 * 直接使用 api.ts 的 onEvent(),不经过 EventBridge 转译。
 * 当上游 DC 事件名变更时,只需更新此函数中的事件名映射。
 */
function registerMobileEventHandlers(): void {
  // 聊天列表/会话变更 → 刷新频道列表和未读数
  const refreshConversations = async () => {
    if (state.currentWsId == null) return;
    try {
      const channels = await call<Array<Record<string, unknown>>>('list_channels', {
        workspaceId: state.currentWsId,
      });
      setState({ channels: channels as never });

      const chatList = await call<Array<{ unread: number }>>('get_chatlist');
      const totalUnread = chatList.reduce((sum, c) => sum + (c.unread || 0), 0);
      setState({ inboxUnread: totalUnread });
    } catch { /* ignore */ }
  };

  void onEvent('MsgsChanged', () => { void refreshConversations(); });
  void onEvent('ChatModified', () => { void refreshConversations(); });
  void onEvent('ChatlistItemChanged', () => { void refreshConversations(); });
  void onEvent('ChatDeleted', () => { void refreshConversations(); });

  // 收到新消息 → 增量刷新当前聊天
  void onEvent('IncomingMsg', async () => {
    if (state.currentChatId == null) return;
    try {
      await call('get_chat_msgs', {
        chatId: state.currentChatId,
        beforeMsgId: state.messagesOldestId ?? null,
      });
    } catch { /* ignore */ }
    void refreshConversations();
  });

  // 未读数变化
  void onEvent('MsgsNoticed', () => { void refreshConversations(); });

  // 联系人变更
  void onEvent('ContactsChanged', () => { /* mobile doesn't maintain contact cache */ });

  // 个人信息更新
  void onEvent('SelfavatarChanged', async () => {
    try {
      const self = await call<Record<string, unknown>>('get_self_profile');
      if (self) setState({ self: self as never });
    } catch { /* ignore */ }
  });
}

import { call } from '../api.js';
import { state } from '../state.js';
import { saveState } from '../persist.js';
import type { ChannelDto, SpaceType } from '../types.js';

export async function refreshChannels(): Promise<void> {
  if (state.currentWsId == null) {
    state.channels = [];
    return;
  }
  try {
    state.channels = await call<ChannelDto[]>('list_channels', { workspaceId: state.currentWsId });
  } catch {
    state.channels = [];
  }
  try {
    const ws = state.workspaces.find((w) => w.id === state.currentWsId);
    if (ws?.master_chat_id) {
      const info = await call<{ members: unknown[] }>('get_chat_info', { chatId: ws.master_chat_id });
      state.wsMembers[state.currentWsId] = info.members?.length || 0;
    }
  } catch {}
}

const spaceTypeCache = new Map<number, SpaceType>();

export async function getSpaceType(chatId: number): Promise<SpaceType> {
  if (spaceTypeCache.has(chatId)) return spaceTypeCache.get(chatId)!;
  try {
    const st = await call<SpaceType>('get_channel_space_type', { chatId });
    spaceTypeCache.set(chatId, st);
    return st;
  } catch {
    return 'chat';
  }
}

export function clearSpaceTypeCache(): void {
  spaceTypeCache.clear();
}

export async function renderNavPanel(): Promise<void> {
  const panel = document.getElementById('channel-tree');
  if (!panel) return;
  panel.className = 'nav-panel';

  try {
    switch (state.currentPage) {
      case 'messages': {
        const { renderMessagesPage } = await import('../pages/messagesPage.js');
        await renderMessagesPage(panel);
        break;
      }
      case 'groups': {
        const { renderGroupsPage } = await import('../pages/groupsPage.js');
        await renderGroupsPage(panel);
        break;
      }
      case 'work': {
        const { renderWorkPage } = await import('../pages/workPage.js');
        await renderWorkPage(panel);
        break;
      }
      case 'settings': {
        const { renderSettingsNav } = await import('../pages/settingsPage.js');
        await renderSettingsNav(panel);
        break;
      }
    }
  } catch {
    panel.innerHTML = `<div class="empty">页面加载失败</div>`;
  }
}

export async function renderMain(): Promise<void> {
  const main = document.getElementById('chat-main');
  if (!main) return;

  if (state.currentPage === 'settings') {
    try {
      const { renderSettingsMain } = await import('../pages/settingsPage.js');
      await renderSettingsMain(main);
    } catch {
      main.innerHTML = `<div class="empty">设置页加载失败</div>`;
    }
    return;
  }

  if (state.currentPage === 'work') {
    if (state.currentChatId == null) {
      main.innerHTML = `<div class="empty">选择一个协作频道</div>`;
      return;
    }
    if (state.currentView === 'kanban') {
      try {
        // @ts-expect-error kanban.js 待迁移为 .ts,届时删除本指令
        const { renderKanban } = await import('../work/kanban.js');
        await renderKanban(state.currentChatId);
      } catch {
        main.innerHTML = `<div class="empty">看板视图加载失败</div>`;
      }
    } else {
      try {
        // @ts-expect-error list.js 待迁移为 .ts,届时删除本指令
        const { renderList } = await import('../work/list.js');
        await renderList(state.currentChatId);
      } catch {
        main.innerHTML = `<div class="empty">列表视图加载失败</div>`;
      }
    }
    return;
  }

  // messages / groups 页:聊天视图
  if (state.currentChatId == null) {
    main.innerHTML = `<div class="empty">选择一个频道</div>`;
    return;
  }
  try {
    const { renderChatView } = await import('../chat/chatView.js');
    await renderChatView(state.currentChatId);
  } catch {
    main.innerHTML = `<div class="empty">聊天视图加载失败</div>`;
  }
}

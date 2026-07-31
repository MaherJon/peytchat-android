import { state } from '../state.js';
import { saveState } from '../persist.js';
import { iconSvg } from '../components/icon.js';
import { getSpaceType } from '../shell/navPanel.js';
import { renderAvatarHtml } from '../components/avatar.js';
import type { ChannelDto } from '../types.js';

export async function renderWorkPage(panel: HTMLElement): Promise<void> {
  const ws = state.workspaces.find((w) => w.id === state.currentWsId);
  const multiWs = state.workspaces.length > 1;
  const headerClickable = multiWs ? 'clickable' : '';
  const avatarHtml = state.self ? await renderAvatarHtml(state.self) : '';

  panel.innerHTML = `
    <div class="nav-header ${headerClickable}">
      <div class="nav-title">协作</div>
      <div class="nav-subtitle">${escapeHtml(ws?.name || '未选择团队')}</div>
    </div>
    <div class="nav-list" id="work-list"></div>
    <div class="nav-user">
      ${avatarHtml}
      <div class="nav-user-info">
        <div class="nav-user-name">${escapeHtml(state.self?.name || 'me')}</div>
      </div>
    </div>
  `;

  await renderWorkChannelList();
}

async function renderWorkChannelList(): Promise<void> {
  const list = document.getElementById('work-list');
  if (!list) return;
  const channels = state.channels;
  const typed = await Promise.all(
    channels.map(async (ch) => ({ ch, st: await getSpaceType(ch.chat_id) }))
  );
  const cardChannels: ChannelDto[] = typed
    .filter((x) => x.st === 'card')
    .map((x) => x.ch);

  if (cardChannels.length === 0) {
    list.innerHTML = `<div class="nav-empty">暂无协作频道,在群组页右键分类可创建协作频道</div>`;
    return;
  }

  const itemsHtml = cardChannels
    .map((ch) => {
      const active = state.currentChatId === ch.chat_id ? 'active' : '';
      const unread = ch.unread > 0 ? `<span class="nav-unread">${ch.unread}</span>` : '';
      return `<div class="nav-work-item ${active}" data-id="${ch.chat_id}">
      ${iconSvg('layout-grid', { width: 14, height: 14 })}
      <span class="nav-work-name">${escapeHtml(ch.name)}</span>
      ${unread}
    </div>`;
    })
    .join('');

  list.innerHTML = `<div class="nav-group-title">${iconSvg('chevron-down', { width: 12, height: 12 })} 协作频道</div>${itemsHtml}`;

  list.querySelectorAll<HTMLElement>('.nav-work-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = Number(el.dataset.id);
      state.currentChatId = id;
      state.currentView = 'kanban';
      state.currentCardId = null;
      state.rightDrawerOpen = false;
      saveState();
      const { renderNavPanel, renderMain } = await import('../shell/navPanel.js');
      await renderNavPanel();
      await renderMain();
      const { renderRightDrawer } = await import('../shell/rightDrawer.js');
      renderRightDrawer();
    });
  });
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

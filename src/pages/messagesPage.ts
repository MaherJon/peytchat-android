import { call } from '../api.js';
import { state } from '../state.js';
import { showToast } from '../toast.js';
import { saveState } from '../persist.js';
import { iconSvg } from '../components/icon.js';
import { showDropdown, type DropdownItem } from '../components/dropdown.js';
import { createInlineInput } from '../components/inlineInput.js';
import { renderAvatarHtml } from '../components/avatar.js';
import type { ChatListItem } from '../types.js';

export async function renderMessagesPage(container: HTMLElement): Promise<void> {
  const avatarHtml = state.self ? await renderAvatarHtml(state.self) : '';
  const isMobile = window.matchMedia('(max-width:900px)').matches;

  container.innerHTML = `
    <div class="mobile-page-content">
      <div class="nav-header">
        <div class="nav-title">Chats</div>
        <div class="nav-subtitle">Messages & Groups</div>
        <button class="nav-add-btn" id="messages-add" title="New">${iconSvg('plus', { width: 18, height: 18 })}</button>
      </div>
      <div class="nav-list" id="messages-list"></div>
      ${!isMobile ? `
      <div class="nav-user">
        ${avatarHtml}
        <div class="nav-user-info">
          <div class="nav-user-name">${escapeHtml(state.self?.name || 'me')}</div>
          <div class="nav-user-role">core</div>
        </div>
      </div>` : ''}
    </div>
  `;

  await renderMessageList(container);
  bindAddButton(container);
  if (!isMobile) bindUserBar(container);
}

async function renderMessageList(container: HTMLElement): Promise<void> {
  const list = document.getElementById('messages-list');
  if (!list) return;
  let chats: ChatListItem[] = [];
  try {
    chats = await call<ChatListItem[]>('get_chatlist');
  } catch {
    chats = [];
  }
  const wsChatIds = new Set<number>();
  for (const ws of state.workspaces) {
    wsChatIds.add(ws.master_chat_id);
    for (const ch of state.channels) {
      if (ch.workspace_id === ws.id) wsChatIds.add(ch.chat_id);
    }
  }
  const messages = chats.filter((c) => !wsChatIds.has(c.chat_id));

  if (messages.length === 0) {
    list.innerHTML = `
      <div class="mobile-empty-chat" style="padding:40px 20px">
        <div class="mobile-empty-icon">${iconSvg('message-circle', { width: 48, height: 48, strokeWidth: 1.2 })}</div>
        <div class="mobile-empty-title">暂无会话</div>
        <div class="mobile-empty-desc">点击右下角 + 开始新会话</div>
      </div>`;
    return;
  }

  // WeChat 风格:头像 + 名称 + 最后消息 + 时间 + 未读角标
  const items = messages.map((c) => {
    const time = c.last_ts ? formatTime(c.last_ts) : '';
    const unreadCount = c.unread || 0;
    const unread = unreadCount > 0
      ? `<span class="chatlist-unread">${unreadCount > 99 ? '99+' : unreadCount}</span>`
      : '';
    const hasUnread = unreadCount > 0 ? ' has-unread' : '';
    const active = state.currentChatId === c.chat_id ? ' active' : '';
    const letter = (c.name || '?').charAt(0).toUpperCase();
    const avatarColor = stringToColor(c.name);
    return `<div class="chatlist-item${active}${hasUnread}" data-id="${c.chat_id}">
      <div class="chatlist-avatar" style="background:${avatarColor}">${escapeHtml(letter)}</div>
      <div class="chatlist-content">
        <div class="chatlist-row">
          <span class="chatlist-name">${escapeHtml(c.name)}</span>
          <span class="chatlist-time">${time}</span>
        </div>
        <div class="chatlist-row">
          <span class="chatlist-preview">${escapeHtml(c.last_msg?.slice(0, 50) || '')}</span>
          ${unread}
        </div>
      </div>
    </div>`;
  });
  list.innerHTML = items.join('');

  list.querySelectorAll<HTMLElement>('.chatlist-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = Number(el.dataset.id);
      state.currentChatId = id;
      saveState();
      const isMobile = window.matchMedia('(max-width:900px)').matches;
      if (isMobile) {
        const { enterMobileChat } = await import('../shell/mobileShell.js');
        await enterMobileChat(id);
      } else {
        await renderMessagesPage(container);
        const { renderMain } = await import('../shell/navPanel.js');
        await renderMain();
      }
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showChatContextMenu(el);
    });
  });
}

// 根据字符串生成稳定的颜色 (用于头像背景)
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 55%)`;
}

function bindAddButton(container: HTMLElement): void {
  const btn = document.getElementById('messages-add');
  if (!btn) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const items: DropdownItem[] = [
      { label: '添加好友(邮箱)', icon: 'user', action: () => showInlineEmailInput() },
      { label: '通过 QR 加入', icon: 'hash', action: () => showInlineQrInput() },
      { label: '创建群', icon: 'users', action: () => showInlineGroupInput() },
      { label: '加入 PEYT Studio', icon: 'layout-grid', action: () => { void joinPeytStudio(); } },
    ];
    showDropdown(btn as HTMLElement, items, { position: 'bottom-left' });
  });
}

function showInlineEmailInput(): void {
  const list = document.getElementById('messages-list');
  if (!list) return;
  const container = list.closest<HTMLElement>('.mobile-page') || list.parentElement!;
  const input = createInlineInput({
    placeholder: '输入邮箱地址',
    confirmLabel: '添加',
    onConfirm: async (email) => {
      try {
        const chatId = await call<number>('create_chat_by_email', { email });
        state.currentChatId = chatId;
        saveState();
        await renderMessagesPage(container);
        const { renderMain } = await import('../shell/navPanel.js');
        await renderMain();
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
    onCancel: () => { void renderMessagesPage(container); },
  });
  list.insertBefore(input, list.firstChild);
}

function showInlineQrInput(): void {
  const list = document.getElementById('messages-list');
  if (!list) return;
  const container = list.closest<HTMLElement>('.mobile-page') || list.parentElement!;
  const input = createInlineInput({
    placeholder: '粘贴 QR 邀请链接',
    confirmLabel: '加入',
    onConfirm: async (qr) => {
      try {
        await call('secure_join', { qr });
        await renderMessagesPage(container);
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
    onCancel: () => { void renderMessagesPage(container); },
  });
  list.insertBefore(input, list.firstChild);
}

function showInlineGroupInput(): void {
  const list = document.getElementById('messages-list');
  if (!list) return;
  const container = list.closest<HTMLElement>('.mobile-page') || list.parentElement!;
  const input = createInlineInput({
    placeholder: '输入群名称',
    confirmLabel: '创建',
    onConfirm: async (name) => {
      try {
        const chatId = await call<number>('create_group_chat', { name });
        state.currentChatId = chatId;
        saveState();
        await renderMessagesPage(container);
        const { renderMain } = await import('../shell/navPanel.js');
        await renderMain();
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
    onCancel: () => { void renderMessagesPage(container); },
  });
  list.insertBefore(input, list.firstChild);
}

async function joinPeytStudio(): Promise<void> {
  try {
    const r = await call<{ workspace_id: number }>('join_peyt_studio', {});
    state.currentWsId = r.workspace_id;
    state.currentPage = 'groups';
    saveState();
    const { refreshWorkspaces } = await import('../shell/rail.js');
    await refreshWorkspaces();
    const { renderRail } = await import('../shell/rail.js');
    await renderRail();
    const { renderNavPanel } = await import('../shell/navPanel.js');
    await renderNavPanel();
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e));
  }
}

function showChatContextMenu(anchor: HTMLElement): void {
  const id = Number(anchor.dataset.id);
  const container = anchor.closest<HTMLElement>('.mobile-page') || anchor.parentElement!;
  const items: DropdownItem[] = [
    { label: '查看资料', icon: 'user', action: () => showToast('查看资料(开发中)') },
    {
      label: '屏蔽',
      icon: 'volume-x',
      action: async () => {
        try {
          await call('block_chat', { chatId: id });
          showToast('已屏蔽');
          await renderMessagesPage(container);
        } catch (e) {
          showToast(e instanceof Error ? e.message : String(e));
        }
      },
    },
    {
      label: '删除会话',
      icon: 'trash',
      danger: true,
      action: async () => {
        try {
          await call('delete_chat', { chatId: id });
          if (state.currentChatId === id) {
            state.currentChatId = null;
            saveState();
          }
          showToast('已删除');
          await renderMessagesPage(container);
          const { renderMain } = await import('../shell/navPanel.js');
          await renderMain();
        } catch (e) {
          showToast(e instanceof Error ? e.message : String(e));
        }
      },
    },
  ];
  showDropdown(anchor, items, { position: 'bottom-right' });
}

function bindUserBar(container: HTMLElement): void {
  const userBar = container.querySelector<HTMLElement>('.nav-user');
  if (!userBar) return;
  userBar.style.cursor = 'pointer';
  userBar.addEventListener('click', async () => {
    state.currentPage = 'settings';
    state.currentSettingsSection = 'account';
    saveState();
    const { renderRail } = await import('../shell/rail.js');
    await renderRail();
    const { renderNavPanel } = await import('../shell/navPanel.js');
    await renderNavPanel();
    const { renderMain } = await import('../shell/navPanel.js');
    await renderMain();
  });
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

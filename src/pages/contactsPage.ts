import { call } from '../api.js';
import { state } from '../state.js';
import { saveState } from '../persist.js';
import { showToast } from '../toast.js';
import { iconSvg } from '../components/icon.js';
import { escapeHtml } from '../shell/mobileShell.js';

// ── Contacts 页面 (WeChat 风格) ──────────────────────────────────────
// 显示联系人列表。每项: 头像 + 名称 + 简介。
// 点击联系人 → 进入聊天。

interface ContactItem {
  contact_id: number;
  name: string;
  addr: string;
  avatar: string | null;
  color: number | null;
}

export async function renderContactsPage(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="mobile-page-content">
      <div class="contacts-header">
        <div class="contacts-title">Contacts</div>
      </div>
      <div class="contacts-list" id="contacts-list">
        <div class="mobile-loading">
          <div class="mobile-loading-spinner"></div>
        </div>
      </div>
    </div>
  `;

  await renderContactList();
}

async function renderContactList(): Promise<void> {
  const list = document.getElementById('contacts-list');
  if (!list) return;

  let contacts: ContactItem[] = [];
  try {
    contacts = await call<ContactItem[]>('get_contacts');
  } catch {
    contacts = [];
  }

  if (contacts.length === 0) {
    list.innerHTML = `
      <div class="mobile-empty-chat" style="padding:60px 20px">
        <div class="mobile-empty-icon">${iconSvg('contact', { width: 48, height: 48, strokeWidth: 1.2 })}</div>
        <div class="mobile-empty-title">No Contacts</div>
        <div class="mobile-empty-desc">Add contacts to start chatting</div>
      </div>`;
    return;
  }

  const items = contacts.map((c) => {
    const letter = (c.name || '?').charAt(0).toUpperCase();
    const avatarColor = stringToColor(c.name);
    return `<div class="chatlist-item" data-id="${c.contact_id}">
      <div class="chatlist-avatar" style="background:${avatarColor}">${escapeHtml(letter)}</div>
      <div class="chatlist-content">
        <div class="chatlist-row">
          <span class="chatlist-name">${escapeHtml(c.name)}</span>
        </div>
        <div class="chatlist-row">
          <span class="chatlist-preview">${escapeHtml(c.addr || '')}</span>
        </div>
      </div>
    </div>`;
  });

  list.innerHTML = items.join('');

  list.querySelectorAll<HTMLElement>('.chatlist-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = Number(el.dataset.id);
      try {
        const chatId = await call<number>('create_chat_by_contact_id', { contactId: id });
        state.currentChatId = chatId;
        saveState();
        const { enterMobileChat } = await import('../shell/mobileShell.js');
        await enterMobileChat(chatId);
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e));
      }
    });
  });
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 45%, 55%)`;
}

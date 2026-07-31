import { call } from '../api.js';
import { state } from '../state.js';
import { renderChatView } from '../chat/chatView.js';

interface SearchResult {
  chat_id: number;
  msg_id: number;
  chat_name: string;
  from_name: string;
  text: string;
}

interface ChatInfo {
  members: MemberInfo[];
}

interface MemberInfo {
  contact_id: number;
  name: string;
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;

export function openSearch(): void {
  if (state.searchOpen) return;
  state.searchOpen = true;
  const overlay = document.createElement('div');
  overlay.className = 'overlay search-overlay';
  overlay.style.display = 'flex';
  overlay.id = 'search-overlay';
  overlay.innerHTML = `
    <div class="search-dialog">
      <input id="search-input" placeholder="搜索消息 / 频道 / 成员" autocomplete="off" />
      <div id="search-results" class="search-results"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = overlay.querySelector<HTMLInputElement>('#search-input');
  input?.focus();
  input?.addEventListener('input', () => {
    if (searchTimer) clearTimeout(searchTimer);
    const val = input.value;
    searchTimer = setTimeout(() => { void doSearch(val.trim()); }, 200);
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSearch();
  });
}

export function closeSearch(): void {
  const overlay = document.getElementById('search-overlay');
  if (overlay) overlay.remove();
  state.searchOpen = false;
}

async function doSearch(q: string): Promise<void> {
  const resultsEl = document.getElementById('search-results');
  if (!resultsEl) return;
  if (!q) {
    resultsEl.innerHTML = '';
    return;
  }
  const lower = q.toLowerCase();
  const sections: string[] = [];
  try {
    const results = await call<SearchResult[]>('search_msgs', { query: q });
    if (results && results.length > 0) {
      const items = results
        .map(
          (r) =>
            `<div class="sr-item" data-type="msg" data-chat="${r.chat_id}" data-id="${r.msg_id}"><span class="sr-type">${escapeHtml(r.chat_name)}</span><span class="sr-content">${escapeHtml(r.from_name)}: ${escapeHtml(r.text)}</span></div>`
        )
        .join('');
      sections.push(`<div class="sr-section">消息 (${results.length})</div>${items}`);
    }
  } catch (e) {
    console.error('search_msgs failed:', e);
  }
  const chanMatches = (state.channels || [])
    .filter((c) => (c.name || '').toLowerCase().includes(lower))
    .slice(0, 5);
  if (chanMatches.length > 0) {
    const items = chanMatches
      .map(
        (c) =>
          `<div class="sr-item" data-type="channel" data-id="${c.chat_id}"><span class="sr-type">频道</span><span class="sr-content">#${escapeHtml(c.name)}</span></div>`
      )
      .join('');
    sections.push(`<div class="sr-section">频道</div>${items}`);
  }
  try {
    if (state.currentChatId) {
      const info = await call<ChatInfo>('get_chat_info', { chatId: state.currentChatId });
      const memMatches = (info.members || [])
        .filter((m) => (m.name || '').toLowerCase().includes(lower))
        .slice(0, 5);
      if (memMatches.length > 0) {
        const items = memMatches
          .map(
            (m) =>
              `<div class="sr-item" data-type="member" data-id="${m.contact_id}"><span class="sr-type">成员</span><span class="sr-content">${escapeHtml(m.name)}</span></div>`
          )
          .join('');
        sections.push(`<div class="sr-section">成员</div>${items}`);
      }
    }
  } catch {}
  resultsEl.innerHTML = sections.join('') || `<div class="sr-empty">无结果</div>`;
  bindSearchResults();
}

function bindSearchResults(): void {
  const resultsEl = document.getElementById('search-results');
  if (!resultsEl) return;
  resultsEl.querySelectorAll<HTMLElement>('.sr-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const type = el.dataset.type || '';
      const id = el.dataset.id || '';
      if (type === 'channel') {
        state.currentChatId = Number(id);
        closeSearch();
        await renderChatView(Number(id));
      } else if (type === 'msg') {
        const chatId = el.dataset.chat ? Number(el.dataset.chat) : state.currentChatId;
        if (chatId != null) {
          state.currentChatId = chatId;
          closeSearch();
          await renderChatView(chatId);
          const msgEl = document.querySelector(`[data-msg="${id}"]`);
          if (msgEl) {
            msgEl.scrollIntoView({ behavior: 'smooth' });
            (msgEl as HTMLElement).style.background = 'var(--active)';
            setTimeout(() => {
              (msgEl as HTMLElement).style.background = '';
            }, 2000);
          }
        }
      } else if (type === 'member') {
        closeSearch();
        state.rightDrawerOpen = true;
        state.detailTab = 'members';
        const { renderRightDrawer } = await import('../shell/rightDrawer.js');
        renderRightDrawer();
        setTimeout(async () => {
          const body = document.getElementById('rd-body');
          if (body) {
            const { renderMemberDetail } = await import('./memberDetail.js');
            await renderMemberDetail(body, Number(id));
          }
        }, 100);
      }
    });
  });
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

import { call } from '../api.js';
import { state } from '../state.js';
import { saveState } from '../persist.js';
import { showToast } from '../toast.js';
import { renderAvatarHtml } from '../components/avatar.js';
import { iconSvg } from '../components/icon.js';
import type { MemberDto, MsgDto } from '../types.js';

interface ContactRole {
  contact_id: number;
  role_name: string;
}

interface ChannelPin {
  msg_id: number;
  channel_chat_id: number;
}

// Task 8: 4 页不同处理 — settings 隐藏 / work 卡片详情 / messages·groups 成员·置顶。
// renderRightDrawer 为同步函数 (rail.ts 未 await),内部异步渲染通过 void 触发。
// 移动端:右侧抽屉完全隐藏 (后续里程碑 M-A2 将改为 BottomSheet)。
export function renderRightDrawer(): void {
  // 移动端不渲染右侧抽屉
  if (window.matchMedia('(max-width:900px)').matches) return;

  const drawer = document.getElementById('right-drawer');
  if (!drawer) return;

  // 页4: settings — 不显示 detail panel
  if (state.currentPage === 'settings') {
    drawer.classList.add('collapsed');
    drawer.innerHTML = '';
    return;
  }

  // 页3: work + 选中卡片 — 渲染卡片详情 (dynamic import 避免循环依赖)
  if (state.currentPage === 'work' && state.currentCardId) {
    drawer.classList.remove('collapsed');
    void import('../work/cardDetail.js').then(({ renderCardDetail }) =>
      renderCardDetail(state.currentCardId!)
    );
    return;
  }

  // 页3: work 无选中卡片 — 隐藏
  if (state.currentPage === 'work') {
    drawer.classList.add('collapsed');
    drawer.innerHTML = '';
    return;
  }

  // 页1/页2: messages/groups — members/pin tab
  const collapsed = !state.rightDrawerOpen || !state.detailPanelOpen;
  drawer.classList.toggle('collapsed', collapsed);
  if (!state.detailPanelOpen) {
    showExpandButton();
    return;
  }

  // detail panel 展开时清理残留的 expand 按钮
  document.querySelectorAll('#chat-main .detail-expand').forEach((el) => el.remove());

  const tab = state.detailTab;
  const tabsHtml = `
    <span class="rd-tab ${tab === 'members' ? 'active' : ''}" data-tab="members">${iconSvg('users', { width: 14, height: 14 })} members</span>
    <span class="rd-tab ${tab === 'pin' ? 'active' : ''}" data-tab="pin">${iconSvg('pin', { width: 14, height: 14 })} pin</span>
    <span class="rd-flex"></span>
    <span class="rd-collapse" title="折叠">${iconSvg('chevron-right', { width: 16, height: 16 })}</span>
  `;
  drawer.innerHTML = `<div class="rd-tabs">${tabsHtml}</div><div id="rd-body" style="flex:1;overflow-y:auto"></div>`;

  drawer.querySelectorAll<HTMLElement>('.rd-tab').forEach((el) => {
    el.addEventListener('click', () => {
      state.detailTab = el.dataset.tab as 'members' | 'pin';
      renderRightDrawer();
    });
  });
  drawer.querySelector<HTMLElement>('.rd-collapse')?.addEventListener('click', () => {
    state.detailPanelOpen = false;
    saveState();
    renderRightDrawer();
  });
  void renderRdBody();
}

// detail panel 折叠时在 chat-main 右侧显示展开按钮
function showExpandButton(): void {
  const main = document.getElementById('chat-main');
  if (!main) return;
  if (main.querySelector('.detail-expand')) return;
  const btn = document.createElement('div');
  btn.className = 'detail-expand';
  btn.innerHTML = iconSvg('chevron-left', { width: 16, height: 16 });
  btn.title = '展开详情面板';
  btn.addEventListener('click', () => {
    state.detailPanelOpen = true;
    saveState();
    renderRightDrawer();
    btn.remove();
  });
  main.appendChild(btn);
}

async function renderRdBody(): Promise<void> {
  const body = document.getElementById('rd-body');
  if (!body) return;
  if (state.detailTab === 'members') {
    await renderMembers(body);
  } else {
    await renderPins(body);
  }
}

// 迁移自 rightDrawer.js: 按 role 分组成员,self 归 core,无 role 归 Members。
async function renderMembers(body: HTMLElement): Promise<void> {
  if (!state.currentChatId) {
    body.innerHTML = `<div style="padding:16px;color:var(--text-weak)">未选中频道</div>`;
    return;
  }
  try {
    const info = await call<{ members: MemberDto[] }>('get_chat_info', { chatId: state.currentChatId });
    let allRoles: ContactRole[] = [];
    try {
      allRoles = await call<ContactRole[]>('list_all_contact_roles', { workspaceId: state.currentWsId });
    } catch {}
    const contactRoles = new Map<number, string[]>();
    for (const r of allRoles) {
      if (!contactRoles.has(r.contact_id)) contactRoles.set(r.contact_id, []);
      contactRoles.get(r.contact_id)!.push(r.role_name);
    }
    const grouped = new Map<string, MemberDto[]>();
    grouped.set('core', []);
    grouped.set('Members', []);
    for (const m of info.members) {
      if (m.is_self) {
        grouped.get('core')!.push(m);
        continue;
      }
      const roles = contactRoles.get(m.contact_id);
      if (roles && roles.length > 0) {
        const primary = roles[0];
        if (!grouped.has(primary)) grouped.set(primary, []);
        grouped.get(primary)!.push(m);
      } else {
        grouped.get('Members')!.push(m);
      }
    }
    const order = ['core', 'Members'];
    for (const r of allRoles) {
      if (!order.includes(r.role_name) && grouped.has(r.role_name)) order.push(r.role_name);
    }
    const searchHtml = `<div class="rd-search"><input id="rd-member-search" placeholder="搜索成员..." /></div>`;
    const sectionResults = await Promise.all(
      order
        .filter((name) => grouped.has(name) && grouped.get(name)!.length > 0)
        .map(async (name) => {
          const list = grouped.get(name)!;
          const items = await Promise.all(
            list.map(async (m) => {
              const avatarHtml = await renderAvatarHtml(m);
              return `<div class="rd-member ${m.is_self ? '' : 'muted'}" data-name="${escapeAttr(m.name)}" ${m.is_self ? '' : `data-cid="${m.contact_id}" style="cursor:pointer"`}>
                ${avatarHtml}
                <span class="rd-name">${escapeHtml(m.name)}</span>
              </div>`;
            })
          );
          return `<div class="rd-group">${escapeHtml(name.toUpperCase())} · ${list.length}</div>${items.join('')}`;
        })
    );
    body.innerHTML =
      searchHtml + (sectionResults.join('') || `<div style="padding:16px;color:var(--text-weak)">无成员</div>`);
    const searchInput = body.querySelector<HTMLInputElement>('#rd-member-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        body.querySelectorAll<HTMLElement>('.rd-member').forEach((el) => {
          const name = el.dataset.name?.toLowerCase() || '';
          el.style.display = name.includes(q) ? '' : 'none';
        });
      });
    }
    body.querySelectorAll<HTMLElement>('.rd-member[data-cid]').forEach((el) => {
      el.addEventListener('click', async () => {
        const cid = Number(el.dataset.cid);
        const { renderMemberDetail } = await import('../components/memberDetail.js');
        await renderMemberDetail(body, cid);
      });
    });
  } catch (e) {
    body.innerHTML = `<div style="padding:16px;color:var(--text-weak)">加载失败</div>`;
    showToast(e instanceof Error ? e.message : String(e));
  }
}

// 迁移自 rightDrawer.js: pin 使用 channel_chat_id 拉取消息,点击跳转并高亮。
async function renderPins(body: HTMLElement): Promise<void> {
  if (!state.currentChatId) {
    body.innerHTML = `<div class="rd-empty">未选中频道</div>`;
    return;
  }
  let pins: ChannelPin[];
  try {
    pins = await call<ChannelPin[]>('get_channel_pins', { chatId: state.currentChatId });
  } catch {
    body.innerHTML = `<div class="rd-empty">加载失败</div>`;
    return;
  }
  if (pins.length === 0) {
    body.innerHTML = `<div class="rd-empty">无置顶消息</div>`;
    return;
  }
  const pinItems = await Promise.all(
    pins.map(async (p): Promise<string> => {
      try {
        const msgs = await call<MsgDto[]>('get_chat_msgs', { chatId: p.channel_chat_id });
        const msg = msgs.find((m) => m.msg_id === p.msg_id);
        if (!msg) return '';
        return `<div class="rd-pin-item" data-chat="${p.channel_chat_id}" data-msg="${p.msg_id}">
          <div class="rd-pin-from">${escapeHtml(msg.from_name)}</div>
          <div class="rd-pin-text">${escapeHtml((msg.text || '').slice(0, 60))}</div>
          <div class="rd-pin-time">${formatRelativeTime(msg.ts)}</div>
        </div>`;
      } catch {
        return '';
      }
    })
  );
  body.innerHTML = pinItems.filter(Boolean).join('') || `<div class="rd-empty">无置顶消息</div>`;
  body.querySelectorAll<HTMLElement>('.rd-pin-item').forEach((el) => {
    el.addEventListener('click', async () => {
      const chatId = Number(el.dataset.chat);
      const msgId = Number(el.dataset.msg);
      state.currentChatId = chatId;
      const { renderChatView } = await import('../chat/chatView.js');
      await renderChatView(chatId);
      setTimeout(() => {
        const msgEl = document.querySelector(`[data-msg="${msgId}"]`);
        if (msgEl) {
          msgEl.scrollIntoView({ behavior: 'smooth' });
          (msgEl as HTMLElement).style.background = 'var(--active)';
          setTimeout(() => {
            (msgEl as HTMLElement).style.background = '';
          }, 2000);
        }
      }, 200);
    });
  });
}

function formatRelativeTime(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts * 1000;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  return Math.floor(diff / 86400000) + '天前';
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
  );
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}

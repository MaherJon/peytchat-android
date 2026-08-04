import { call } from '../api.js';
import { state } from '../state.js';
import { showToast } from '../toast.js';
import { saveState } from '../persist.js';
import { iconSvg, type IconName } from '../components/icon.js';
import { renderAvatarHtml } from '../components/avatar.js';
import { getCurrentTheme, applyTheme } from '../theme.js';
import { showInlineConfirm } from '../components/inlineConfirm.js';
import { createInlineInput } from '../components/inlineInput.js';
import type { SettingsSection, SelfProfile } from '../types.js';

const sections: Array<{ id: SettingsSection; icon: IconName; label: string }> = [
  { id: 'account', icon: 'user', label: '账号' },
  { id: 'appearance', icon: 'palette', label: '外观' },
  { id: 'team', icon: 'users', label: '当前团队' },
  { id: 'notifications', icon: 'bell', label: '通知' },
  { id: 'plugins', icon: 'layout-grid', label: '插件' },
  { id: 'about', icon: 'info', label: '关于' },
];

export async function renderSettingsNav(panel: HTMLElement): Promise<void> {
  const itemsHtml = sections.map((s) => {
    const active = state.currentSettingsSection === s.id ? 'active' : '';
    return `<div class="settings-nav-item ${active}" data-section="${s.id}">
      ${iconSvg(s.icon, { width: 16, height: 16 })}
      <span>${escapeHtml(s.label)}</span>
    </div>`;
  }).join('');
  panel.innerHTML = `<div class="nav-header"><div class="nav-title">设置</div></div><div class="nav-list">${itemsHtml}</div>`;
  panel.querySelectorAll<HTMLElement>('.settings-nav-item').forEach((el) => {
    el.addEventListener('click', async () => {
      state.currentSettingsSection = el.dataset.section as SettingsSection;
      saveState();
      await renderSettingsNav(panel);
      const { renderMain } = await import('../shell/navPanel.js');
      await renderMain();
    });
  });
}

export async function renderSettingsMain(main: HTMLElement): Promise<void> {
  switch (state.currentSettingsSection) {
    case 'account': await renderAccount(main); break;
    case 'appearance': renderAppearance(main); break;
    case 'team': await renderTeam(main); break;
    case 'notifications': renderNotifications(main); break;
    case 'plugins': await renderPlugins(main); break;
    case 'about': renderAbout(main); break;
  }
}

async function renderPlugins(main: HTMLElement): Promise<void> {
  const { renderPluginSettings } = await import('../plugins/settings.js');
  await renderPluginSettings(main);
}

async function renderAccount(main: HTMLElement): Promise<void> {
  const avatarHtml = state.self ? await renderAvatarHtml(state.self) : '';
  main.innerHTML = `
    <div class="settings-section">
      <h2>账号</h2>
      <div class="settings-avatar-row">
        <div class="settings-avatar-large" id="settings-avatar">${avatarHtml}</div>
        <div class="settings-avatar-options" id="avatar-options" style="display:none">
          <button class="settings-btn" id="avatar-upload">${iconSvg('upload', { width: 14, height: 14 })} 上传</button>
          <button class="settings-btn settings-btn-danger" id="avatar-remove">${iconSvg('trash', { width: 14, height: 14 })} 移除</button>
        </div>
      </div>
      <div class="settings-field">
        <label>显示名</label>
        <input type="text" id="settings-name" value="${escapeAttr(state.self?.name || '')}" />
      </div>
      <div class="settings-field">
        <label>邮箱</label>
        <div class="settings-readonly">${escapeHtml(state.self?.addr || '—')}</div>
      </div>
    </div>
  `;
  const avatar = document.getElementById('settings-avatar');
  const options = document.getElementById('avatar-options');
  avatar?.addEventListener('click', () => {
    if (options) options.style.display = options.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('avatar-upload')?.addEventListener('click', () => triggerAvatarUpload(main));
  document.getElementById('avatar-remove')?.addEventListener('click', async () => {
    try {
      await call('update_profile', { name: null, avatarPath: '' });
      state.self = await call<SelfProfile>('get_self_profile');
      const { renderRail } = await import('../shell/rail.js');
      await renderRail();
      await renderAccount(main);
      showToast('头像已移除');
    } catch (e) { showToast(e instanceof Error ? e.message : String(e)); }
  });
  const nameInput = document.getElementById('settings-name');
  nameInput?.addEventListener('blur', async () => {
    const name = (nameInput as HTMLInputElement).value.trim();
    if (name && name !== state.self?.name) {
      try {
        await call('update_profile', { name, avatarPath: null });
        state.self = await call<SelfProfile>('get_self_profile');
        const { renderRail } = await import('../shell/rail.js');
        await renderRail();
        showToast('已保存');
      } catch (e) { showToast(e instanceof Error ? e.message : String(e)); }
    }
  });
}

function triggerAvatarUpload(main: HTMLElement): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buf));
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = await call<string>('save_avatar_from_bytes', { bytes, ext });
      await call('update_profile', { name: null, avatarPath: path });
      state.self = await call<SelfProfile>('get_self_profile');
      const { renderRail } = await import('../shell/rail.js');
      await renderRail();
      await renderAccount(main);
      showToast('头像已更新');
    } catch (e) { showToast(e instanceof Error ? e.message : String(e)); }
  });
  input.click();
}

function renderAppearance(main: HTMLElement): void {
  const current = getCurrentTheme();
  // 内置主题（渐变 swatch class）+ 插件注册主题（内联色）
  const builtin: Array<{ id: string; label: string; cls: string }> = [
    { id: 'nowint', label: 'Nowint', cls: 'swatch-nowint' },
    { id: 'violet', label: 'Violet', cls: 'swatch-violet' },
    { id: 'goldenhour', label: 'GoldenHour', cls: 'swatch-goldenhour' },
  ];
  const pluginThemes = window.__peytchat_themes || [];
  const themesHtml = [
    ...builtin.map((t) => `
      <div class="settings-theme ${current === t.id ? 'active' : ''}" data-theme="${t.id}">
        <div class="theme-swatch ${t.cls}"></div>
        <span>${escapeHtml(t.label)}</span>
      </div>`),
    ...pluginThemes.map((t) => `
      <div class="settings-theme ${current === t.id ? 'active' : ''}" data-theme="${t.id}">
        <div class="theme-swatch" style="background:${t.swatch}"></div>
        <span>${escapeHtml(t.name)}</span>
      </div>`),
  ].join('');
  main.innerHTML = `
    <div class="settings-section">
      <h2>外观</h2>
      <div class="settings-themes">
        ${themesHtml}
      </div>
    </div>
  `;
  main.querySelectorAll<HTMLElement>('.settings-theme').forEach((el) => {
    el.addEventListener('click', () => {
      const theme = el.dataset.theme as string;
      applyTheme(theme);
      main.querySelectorAll('.settings-theme').forEach((e) => e.classList.remove('active'));
      el.classList.add('active');
    });
  });
}

async function renderTeam(main: HTMLElement): Promise<void> {
  const ws = state.workspaces.find((w) => w.id === state.currentWsId);
  if (!ws) {
    main.innerHTML = `
      <div class="settings-section">
        <h2>当前团队</h2>
        <p class="settings-empty">未加入任何团队</p>
        <div class="settings-field">
          <label>加入 PEYT Studio</label>
          <div id="team-join-area"></div>
        </div>
      </div>
    `;
    const joinArea = document.getElementById('team-join-area');
    if (joinArea) {
      const input = createInlineInput({
        placeholder: '粘贴邀请链接 (dcgroup:... 或 OPENPGP4FPR:...)',
        confirmLabel: '加入',
        onConfirm: async (qr) => {
          try {
            const r = await call<{ workspace_id: number }>('join_peyt_studio', { qr });
            state.currentWsId = r.workspace_id;
            saveState();
            const { refreshWorkspaces, renderRail } = await import('../shell/rail.js');
            await refreshWorkspaces();
            await renderRail();
            await renderTeam(main);
            showToast('已加入 PEYT Studio');
          } catch (e) {
            showToast(e instanceof Error ? e.message : String(e));
            throw e;
          }
        },
      });
      joinArea.appendChild(input);
    }
    return;
  }
  let inviteLink = '';
  try { inviteLink = await call<string>('get_securejoin_qr', { chatId: ws.master_chat_id }); } catch {}
  const memberCount = state.wsMembers[ws.id] || 0;
  const channelCount = state.channels.filter((c) => c.workspace_id === ws.id).length;
  main.innerHTML = `
    <div class="settings-section">
      <h2>当前团队</h2>
      <div class="settings-field"><label>团队名</label><div class="settings-readonly">${escapeHtml(ws.name)}</div></div>
      <div class="settings-field"><label>成员数</label><div class="settings-readonly">${memberCount}</div></div>
      <div class="settings-field"><label>频道数</label><div class="settings-readonly">${channelCount}</div></div>
      <div class="settings-field">
        <label>邀请链接</label>
        <div class="settings-invite-row">
          <input type="text" readonly value="${escapeAttr(inviteLink)}" id="team-invite-input" />
          <button class="settings-btn" id="team-invite-copy">${iconSvg('copy', { width: 14, height: 14 })} 复制</button>
        </div>
      </div>
      <div class="settings-danger-zone">
        <button class="settings-btn settings-btn-danger" id="team-leave">${iconSvg('log-out', { width: 14, height: 14 })} 退出团队</button>
      </div>
    </div>
  `;
  document.getElementById('team-invite-copy')?.addEventListener('click', async () => {
    const input = document.getElementById('team-invite-input') as HTMLInputElement;
    try {
      await navigator.clipboard.writeText(input.value);
      showToast('邀请链接已复制');
    } catch (e) { showToast(e instanceof Error ? e.message : String(e)); }
  });
  const leaveBtn = document.getElementById('team-leave');
  leaveBtn?.addEventListener('click', () => {
    showInlineConfirm(leaveBtn, {
      message: '确定退出当前团队?退出后将无法查看团队频道。',
      confirmLabel: '退出',
      successLabel: '已退出团队',
      onConfirm: async () => {
        await call('leave_workspace', { id: ws.id });
        state.currentWsId = null;
        state.currentChatId = null;
        saveState();
        const { refreshWorkspaces, renderRail } = await import('../shell/rail.js');
        await refreshWorkspaces();
        await renderRail();
        await renderTeam(main);
      },
    });
  });
}

function renderNotifications(main: HTMLElement): void {
  const desktopEnabled = Notification.permission === 'granted';
  const badgeEnabled = localStorage.getItem('peyt.badgeEnabled') !== 'false';
  main.innerHTML = `
    <div class="settings-section">
      <h2>通知</h2>
      <div class="settings-toggle-row">
        <span>桌面通知</span>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-desktop" ${desktopEnabled ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="settings-toggle-row">
        <span>Dock 角标</span>
        <label class="toggle-switch">
          <input type="checkbox" id="toggle-badge" ${badgeEnabled ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>
  `;
  document.getElementById('toggle-desktop')?.addEventListener('change', async (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    if (checked && Notification.permission !== 'granted') {
      await Notification.requestPermission();
    }
  });
  document.getElementById('toggle-badge')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    localStorage.setItem('peyt.badgeEnabled', String(checked));
  });
}

function renderAbout(main: HTMLElement): void {
  main.innerHTML = `
    <div class="settings-section">
      <h2>关于</h2>
      <div class="settings-field"><label>版本</label><div class="settings-readonly">0.1.0</div></div>
      <div class="settings-danger-zone">
        <button class="settings-btn settings-btn-danger" id="about-logout">${iconSvg('log-out', { width: 14, height: 14 })} 登出</button>
      </div>
    </div>
  `;
  const logoutBtn = document.getElementById('about-logout');
  logoutBtn?.addEventListener('click', () => {
    showInlineConfirm(logoutBtn, {
      message: '确定登出当前账号?',
      confirmLabel: '登出',
      onConfirm: async () => {
        // 成功 → location.reload() 刷新页面,外层 toast 不会执行;
        // 失败 → throw 让 inlineConfirm 外层显示具体错误 (而非默认 "已删除")。
        await call('logout');
        location.reload();
      },
    });
  });
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function escapeAttr(s: string): string { return escapeHtml(s); }

// ── 移动端 Me 页面 (WeChat 风格分组卡片) ──────────────────────────────

export async function renderMePage(container: HTMLElement): Promise<void> {
  const avatarHtml = state.self ? await renderAvatarHtml(state.self) : '';
  const displayName = escapeHtml(state.self?.name || '未登录');
  const email = escapeHtml(state.self?.addr || '');

  container.innerHTML = `
    <div class="me-page">
      <!-- 用户资料卡片 -->
      <div class="me-card" id="me-profile-card">
        <div class="me-card-row" style="padding: 16px;">
          <div class="me-avatar-lg">${avatarHtml}</div>
          <div class="me-profile-info">
            <div class="me-profile-name">${displayName}</div>
            ${email ? `<div class="me-profile-email">${email}</div>` : ''}
          </div>
          <div class="me-arrow">${iconSvg('chevron-right', { width: 18, height: 18, strokeWidth: 1.5 })}</div>
        </div>
      </div>

      <!-- 设置分组 -->
      <div class="me-section-label">Settings</div>
      <div class="me-card">
        ${renderMeRow('bell', 'Notifications', 'me-notifications')}
        ${renderMeRow('palette', 'Appearance', 'me-appearance')}
        ${renderMeRow('message-circle', 'Chats', 'me-chats')}
        ${renderMeRow('package', 'Plugins', 'me-plugins')}
      </div>

      <!-- 关于分组 -->
      <div class="me-section-label">About</div>
      <div class="me-card">
        ${renderMeRow('info', 'About', 'me-about')}
        <div class="me-card-row me-row-danger" id="me-logout">
          <span class="me-row-icon">${iconSvg('log-out', { width: 20, height: 20, strokeWidth: 1.5 })}</span>
          <span class="me-row-label">Logout</span>
        </div>
      </div>
    </div>
  `;

  bindMePageEvents(container);
}

function renderMeRow(icon: string, label: string, id: string): string {
  return `
    <div class="me-card-row" id="${id}">
      <span class="me-row-icon">${iconSvg(icon as import('../components/icon.js').IconName, { width: 20, height: 20, strokeWidth: 1.5 })}</span>
      <span class="me-row-label">${escapeHtml(label)}</span>
      <span class="me-arrow">${iconSvg('chevron-right', { width: 16, height: 16, strokeWidth: 1.5 })}</span>
    </div>
  `;
}

function bindMePageEvents(container: HTMLElement): void {
  // Profile card → account settings
  container.querySelector('#me-profile-card')?.addEventListener('click', () => {
    showMeSubPage(container, 'account');
  });

  // Notifications
  container.querySelector('#me-notifications')?.addEventListener('click', () => {
    showMeSubPage(container, 'notifications');
  });

  // Appearance (theme switcher)
  container.querySelector('#me-appearance')?.addEventListener('click', () => {
    showMeSubPage(container, 'appearance');
  });

  // Chats settings
  container.querySelector('#me-chats')?.addEventListener('click', () => {
    showMeSubPage(container, 'chats');
  });

  // Plugins
  container.querySelector('#me-plugins')?.addEventListener('click', async () => {
    const { renderPluginSettings } = await import('../plugins/settings.js');
    const page = container.querySelector<HTMLElement>('.me-page');
    if (page) {
      page.innerHTML = '<div class="me-sub-page" id="me-sub-content"></div>';
      const sub = document.getElementById('me-sub-content');
      if (sub) {
        // Add back button
        const backBtn = document.createElement('button');
        backBtn.className = 'me-back-btn';
        backBtn.innerHTML = `${iconSvg('arrow-left', { width: 20, height: 20, strokeWidth: 1.5 })} Back`;
        backBtn.addEventListener('click', () => { void renderMePage(container); });
        sub.appendChild(backBtn);
        await renderPluginSettings(sub);
      }
    }
  });

  // About
  container.querySelector('#me-about')?.addEventListener('click', () => {
    showMeSubPage(container, 'about');
  });

  // Logout
  container.querySelector('#me-logout')?.addEventListener('click', () => {
    const el = container.querySelector('#me-logout') as HTMLElement;
    if (!el) return;
    showInlineConfirm(el, {
      message: '确定登出当前账号?',
      confirmLabel: 'Logout',
      onConfirm: async () => {
        await call('logout');
        location.reload();
      },
    });
  });
}

async function showMeSubPage(container: HTMLElement, section: string): Promise<void> {
  const page = container.querySelector<HTMLElement>('.me-page');
  if (!page) return;

  // 创建子页面
  page.innerHTML = '<div class="me-sub-page" id="me-sub-content"></div>';
  const sub = document.getElementById('me-sub-content');
  if (!sub) return;

  // 返回按钮
  const backBtn = document.createElement('button');
  backBtn.className = 'me-back-btn';
  backBtn.innerHTML = `${iconSvg('arrow-left', { width: 20, height: 20, strokeWidth: 1.5 })} Back`;
  backBtn.addEventListener('click', () => { void renderMePage(container); });
  sub.appendChild(backBtn);

  const content = document.createElement('div');
  content.className = 'me-sub-content';

  switch (section) {
    case 'account':
      await renderAccountContent(content);
      break;
    case 'notifications':
      renderNotificationsContent(content);
      break;
    case 'appearance':
      renderAppearanceContent(content);
      break;
    case 'chats':
      renderChatsContent(content);
      break;
    case 'about':
      renderAboutContent(content);
      break;
  }

  sub.appendChild(content);
}

async function renderAccountContent(container: HTMLElement): Promise<void> {
  const avatarHtml = state.self ? await renderAvatarHtml(state.self) : '';
  container.innerHTML = `
    <div class="me-sub-section">
      <div class="me-sub-title">Account</div>
      <div class="me-card">
        <div class="me-card-row" id="me-avatar-row" style="padding: 14px 16px;">
          <span class="me-row-label">Avatar</span>
          <div class="me-avatar-md">${avatarHtml}</div>
          <span class="me-arrow">${iconSvg('chevron-right', { width: 16, height: 16, strokeWidth: 1.5 })}</span>
        </div>
      </div>
      <div class="me-card">
        <div class="me-card-row" style="padding: 14px 16px;">
          <span class="me-row-label">Name</span>
          <input type="text" id="me-name-input" class="me-input" value="${escapeAttr(state.self?.name || '')}" />
        </div>
      </div>
      <div class="me-card">
        <div class="me-card-row" style="padding: 14px 16px;">
          <span class="me-row-label">Email</span>
          <span class="me-row-value">${escapeHtml(state.self?.addr || '—')}</span>
        </div>
      </div>
    </div>
  `;

  // Avatar upload
  container.querySelector('#me-avatar-row')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const buf = await file.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buf));
        const ext = (file.name.split('.').pop() || 'png').toLowerCase();
        const path = await call<string>('save_avatar_from_bytes', { bytes, ext });
        await call('update_profile', { name: null, avatarPath: path });
        state.self = await call<SelfProfile>('get_self_profile');
        showToast('Avatar updated');
        await renderAccountContent(container);
      } catch (e) { showToast(e instanceof Error ? e.message : String(e)); }
    });
    input.click();
  });

  // Name change
  const nameInput = container.querySelector('#me-name-input') as HTMLInputElement;
  nameInput?.addEventListener('blur', async () => {
    const name = nameInput.value.trim();
    if (name && name !== state.self?.name) {
      try {
        await call('update_profile', { name, avatarPath: null });
        state.self = await call<SelfProfile>('get_self_profile');
        showToast('Saved');
      } catch (e) { showToast(e instanceof Error ? e.message : String(e)); }
    }
  });
}

function renderNotificationsContent(container: HTMLElement): void {
  const desktopEnabled = Notification.permission === 'granted';
  container.innerHTML = `
    <div class="me-sub-section">
      <div class="me-sub-title">Notifications</div>
      <div class="me-card">
        <div class="me-card-row" style="padding: 14px 16px;">
          <span class="me-row-label">Desktop Notifications</span>
          <label class="toggle-switch">
            <input type="checkbox" id="me-toggle-desktop" ${desktopEnabled ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
  `;
  container.querySelector('#me-toggle-desktop')?.addEventListener('change', async (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    if (checked && Notification.permission !== 'granted') {
      await Notification.requestPermission();
    }
  });
}

function renderAppearanceContent(container: HTMLElement): void {
  const current = getCurrentTheme();
  const themes = [
    { id: 'nowint', label: 'Nowint', cls: 'swatch-nowint' },
    { id: 'violet', label: 'Violet', cls: 'swatch-violet' },
    { id: 'goldenhour', label: 'GoldenHour', cls: 'swatch-goldenhour' },
  ];
  container.innerHTML = `
    <div class="me-sub-section">
      <div class="me-sub-title">Appearance</div>
      <div class="me-card">
        ${themes.map((t) => `
          <div class="me-card-row me-theme-row ${current === t.id ? 'active' : ''}" data-theme="${t.id}" style="padding: 14px 16px;">
            <div class="theme-swatch ${t.cls}"></div>
            <span class="me-row-label">${escapeHtml(t.label)}</span>
            ${current === t.id ? `<span class="me-check">${iconSvg('check', { width: 16, height: 16, strokeWidth: 2 })}</span>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
  container.querySelectorAll<HTMLElement>('.me-theme-row').forEach((el) => {
    el.addEventListener('click', () => {
      const theme = el.dataset.theme!;
      applyTheme(theme);
      renderAppearanceContent(container);
    });
  });
}

function renderChatsContent(container: HTMLElement): void {
  container.innerHTML = `
    <div class="me-sub-section">
      <div class="me-sub-title">Chats</div>
      <div class="me-card">
        <div class="me-card-row" style="padding: 14px 16px;">
          <span class="me-row-label">Enter to Send</span>
          <label class="toggle-switch">
            <input type="checkbox" id="me-toggle-enter-send" checked />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
  `;
}

function renderAboutContent(container: HTMLElement): void {
  container.innerHTML = `
    <div class="me-sub-section">
      <div class="me-sub-title">About</div>
      <div class="me-card">
        <div class="me-card-row" style="padding: 14px 16px;">
          <span class="me-row-label">Version</span>
          <span class="me-row-value">0.5.2</span>
        </div>
      </div>
    </div>
  `;
}

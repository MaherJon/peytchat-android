import { call, transformBlobURL } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../toast.js";
import { saveState } from "../persist.js";
import { renderHomeView } from "../dialogs/homeView.js";
import { refreshChannels } from "./channelTree.js";
import { openWsWizard } from "../dialogs/wsWizard.js";
import { getCurrentTheme, applyTheme } from "../theme.js";

export async function refreshWorkspaces() {
  try {
    state.workspaces = await call("list_workspaces");
  } catch {}
}

export async function renderAppRail() {
  const rail = document.getElementById("ws-rail"); // 保留原 id 避免大改 HTML
  if (!rail) return;
  rail.className = "app-rail";
  // Task 12: renderWorkspaces 现在异步(并行拉取各 ws 真实未读),先 await 再拼字符串。
  const workspacesHtml = await renderWorkspaces();
  // Task 13: 底部头像支持 avatar 图片, fallback 首字母 + Contact::get_color() 背景色。
  const avatarUrl = state.self?.avatar ? await transformBlobURL(state.self.avatar) : null;
  const bg = colorHex(state.self?.color);
  const letter = (state.self?.name || "?").charAt(0).toUpperCase() || "?";
  const avatarHtml = avatarUrl
    ? `<img src="${escapeAttr(avatarUrl)}" class="app-avatar" id="app-avatar" alt="me" />`
    : `<div class="app-avatar" id="app-avatar" style="background:${bg}">${escapeHtml(letter)}</div>`;
  rail.innerHTML = `
    <div class="app-icon ${state.currentApp === "chat" ? "active" : ""}" data-app="chat" title="Chat · 聊天">Ch</div>
    <div class="app-icon ${state.currentApp === "work" ? "active" : ""}" data-app="work" title="Work · 协作">Wk</div>
    <div class="app-icon disabled" data-app="inbox" title="Inbox · 通知（SP6 启用）">In</div>
    <div class="app-separator"></div>
    ${workspacesHtml}
    <div class="app-flex"></div>
    <div class="app-icon settings" id="app-settings" title="设置">·</div>
    ${avatarHtml}
  `;
  bindAppIcons();
  bindWorkspaceIcons();
  bindSettingsIcon();
  bindAvatarMenu(avatarUrl, bg, letter, state.self?.name, state.self?.addr);
}

function bindAvatarMenu(avatarUrl, bg, letter, name, addr) {
  const el = document.getElementById("app-avatar");
  if (!el) return;
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    showUserMenu(el, avatarUrl, bg, letter, name, addr);
  });
}

function showUserMenu(anchor, avatarUrl, bg, letter, name, addr) {
  // 移除已有菜单
  document.querySelectorAll(".user-menu").forEach((m) => m.remove());
  const currentTheme = getCurrentTheme();
  const menu = document.createElement("div");
  menu.className = "user-menu";
  menu.innerHTML = `
    <div class="um-header">
      ${avatarUrl
        ? `<img src="${escapeAttr(avatarUrl)}" class="um-avatar" alt="" />`
        : `<div class="um-avatar" style="background:${bg}">${escapeHtml(letter)}</div>`}
      <div class="um-info">
        <div class="um-name">${escapeHtml(name || "?")}</div>
        <div class="um-addr">${escapeHtml(addr || "—")}</div>
      </div>
    </div>
    <div class="um-sep"></div>
    <div class="um-section">
      <div class="um-label">外观</div>
      <div class="um-themes">
        <div class="um-theme ${currentTheme === 'nowint' ? 'active' : ''}" data-theme="nowint">
          <div class="um-swatch um-swatch-nowint"></div>
          <span>Nowint</span>
        </div>
        <div class="um-theme ${currentTheme === 'violet' ? 'active' : ''}" data-theme="violet">
          <div class="um-swatch um-swatch-violet"></div>
          <span>Violet</span>
        </div>
        <div class="um-theme ${currentTheme === 'goldenhour' ? 'active' : ''}" data-theme="goldenhour">
          <div class="um-swatch um-swatch-goldenhour"></div>
          <span>GoldenHour</span>
        </div>
      </div>
    </div>
    <div class="um-sep"></div>
    <div class="um-item" id="um-account">账号设置</div>
    <div class="um-item um-danger" id="um-logout">登出</div>
  `;
  document.body.appendChild(menu);
  // 定位到头像上方，向右展开
  const rect = anchor.getBoundingClientRect();
  menu.style.bottom = (window.innerHeight - rect.top + 8) + "px";
  menu.style.left = rect.left + "px";
  // 主题切换
  menu.querySelectorAll(".um-theme").forEach((opt) => {
    opt.addEventListener("click", () => {
      const theme = opt.dataset.theme;
      applyTheme(theme);
      menu.querySelectorAll(".um-theme").forEach((o) => o.classList.remove("active"));
      opt.classList.add("active");
    });
  });
  // 账号设置 → 打开 right-drawer settings
  menu.querySelector("#um-account").addEventListener("click", async () => {
    menu.remove();
    state.rightDrawerOpen = true;
    state.detailPanelOpen = true;
    state.rightDrawerTab = "settings";
    saveState();
    const { renderRightDrawer } = await import("./rightDrawer.js");
    renderRightDrawer();
  });
  // 登出
  menu.querySelector("#um-logout").addEventListener("click", async () => {
    menu.remove();
    try {
      await call("logout");
      location.reload();
    } catch (e) { showToast(e.message || String(e)); }
  });
  // 点击外部关闭
  setTimeout(() => {
    document.addEventListener("click", function close(ev) {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener("click", close);
      }
    });
  }, 0);
}

function bindSettingsIcon() {
  const el = document.getElementById("app-settings");
  if (!el) return;
  el.addEventListener("click", async () => {
    state.rightDrawerOpen = true;
    state.detailPanelOpen = true;
    state.rightDrawerTab = "settings";
    saveState();
    const { renderRightDrawer } = await import("./rightDrawer.js");
    renderRightDrawer();
  });
}

// Task 13: 把 Contact::get_color() 返回的 u32 转成 #rrggbb。null/undefined → 默认 var(--border-strong)。
function colorHex(c) {
  if (!c && c !== 0) return "var(--border-strong)";
  return "#" + (c & 0xffffff).toString(16).padStart(6, "0");
}

// Task 12: 真实未读聚合 — 调 get_chatlist 取所有 chat,筛出属于该 ws 的
// (channels + master_chat_id),累加 unread。失败时为 0。
async function getWsUnread(wsId) {
  try {
    const chats = await call("get_chatlist");
    // 找到属于该 workspace 的所有频道（master_chat + channels）
    const wsChannels = state.channels.filter((c) => c.workspace_id === wsId);
    const wsChatIds = new Set(wsChannels.map((c) => c.chat_id));
    // 也加上 master_chat_id（需从 state.workspaces 找）
    const ws = state.workspaces.find((w) => w.id === wsId);
    if (ws) wsChatIds.add(ws.master_chat_id);
    return chats.filter((c) => wsChatIds.has(c.chat_id)).reduce((sum, c) => sum + (c.unread || 0), 0);
  } catch { return 0; }
}

async function renderWorkspaces() {
  // Task 12: 并行拉取所有 ws 的未读数,避免串行 N 次网络往返。
  // 注:getWsUnread 内部各自调 get_chatlist(N 次相同请求),SP4 可接受;
  // 后续可优化为一次 get_chatlist + 本地筛。失败时为 0。
  const unreadEntries = await Promise.all(
    state.workspaces.map(async (ws) => [ws.id, await getWsUnread(ws.id)])
  );
  const unreadMap = new Map(unreadEntries);
  const icons = state.workspaces.map((ws) => {
    const cls = state.currentWsId === ws.id && !state.homeMode ? "app-ws-icon active" : "app-ws-icon";
    const label = ws.icon || (ws.name || "?").charAt(0).toUpperCase();
    const wsUnread = unreadMap.get(ws.id) || 0;
    return `<div class="ws-icon-wrap">
      <div class="${cls}" data-id="${ws.id}" title="${escapeAttr(ws.name)}">${escapeHtml(label)}</div>
      <span class="ws-badge ${wsUnread > 0 ? "" : "zero"}">${wsUnread}</span>
    </div>`;
  }).join("");
  const homeCls = state.homeMode ? "app-ws-icon home active" : "app-ws-icon home";
  return `
    <div class="${homeCls}" id="ws-home" title="主页：私聊与非 workspace 群">·</div>
    <div class="ws-sep"></div>
    ${icons}
    <div class="ws-add" id="ws-add" title="创建/加入 workspace">+</div>
  `;
}

function bindAppIcons() {
  document.querySelectorAll(".app-icon[data-app]").forEach((el) => {
    el.addEventListener("click", async () => {
      if (el.classList.contains("disabled")) {
        const app = el.dataset.app;
        const msg = app === "work" ? "Work 协作模式将在 SP5 启用" : "Inbox 通知中心将在 SP6 启用";
        showToast(msg);
        return;
      }
      state.currentApp = el.dataset.app;
      saveState();
      renderAppRail();
      // 触发 nav tree 切换（Ruling A: 用 await import 而非 require，兼容 Vite ESM）
      const { renderChannelTree } = await import("./channelTree.js");
      renderChannelTree();
      // M3 修复：模式切换后同步主区内容，避免「频道树是 Chat、主区却是看板」错位。
      // - Work 模式：renderChannelTree 已在 currentChatId 非空时触发 renderMain；
      //   这里只补 currentChatId 为空时的空态。
      // - Chat 模式：原代码完全不同步主区，这里按 currentChatId 调 renderChatView。
      const main = document.getElementById("chat-main");
      if (state.currentApp === "chat") {
        if (state.currentChatId != null) {
          const { renderChatView } = await import("../chat/chatView.js");
          await renderChatView(state.currentChatId);
        } else if (main) {
          main.innerHTML = `<div class="empty">选择一个频道</div>`;
        }
      } else if (state.currentApp === "work") {
        if (state.currentChatId == null && main) {
          main.innerHTML = `<div class="empty">选择一个协作频道</div>`;
        }
      }
    });
  });
}

function bindWorkspaceIcons() {
  const rail = document.getElementById("ws-rail");
  rail.querySelectorAll(".app-ws-icon[data-id]").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = Number(el.dataset.id);
      state.currentWsId = id;
      state.homeMode = false;
      state.currentChatId = null;
      renderAppRail();
      await refreshChannels();
      const { renderChannelTree } = await import("./channelTree.js");
      renderChannelTree();
      document.getElementById("chat-main").innerHTML = `<div class="empty">选择一个频道</div>`;
      // M1 修复：切换 workspace 是高频导航操作，不应弹出设置面板。
      // 删除 rightDrawerOpen=true / rightDrawerTab="settings" 强制展开抽屉的副作用。
      saveState();
    });
  });
  document.getElementById("ws-home").addEventListener("click", () => {
    state.homeMode = true;
    state.currentWsId = null;
    state.currentChatId = null;
    renderAppRail();
    renderHomeView();
    saveState();
  });
  document.getElementById("ws-add").addEventListener("click", () => {
    openWsWizard(async () => {
      await refreshWorkspaces();
      renderAppRail();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}

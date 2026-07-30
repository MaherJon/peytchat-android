import { call } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../toast.js";
import { saveState } from "../persist.js";
import { renderHomeView } from "../dialogs/homeView.js";
import { refreshChannels } from "./channelTree.js";
import { openWsWizard } from "../dialogs/wsWizard.js";

export async function refreshWorkspaces() {
  try {
    state.workspaces = await call("list_workspaces");
  } catch {}
}

export function renderAppRail() {
  const rail = document.getElementById("ws-rail"); // 保留原 id 避免大改 HTML
  if (!rail) return;
  rail.className = "app-rail";
  rail.innerHTML = `
    <div class="app-icon ${state.currentApp === "chat" ? "active" : ""}" data-app="chat" title="Chat · 聊天">Ch</div>
    <div class="app-icon disabled" data-app="work" title="Work · 协作（SP5 启用）">Wk</div>
    <div class="app-icon disabled" data-app="inbox" title="Inbox · 通知（SP6 启用）">In</div>
    <div class="app-separator"></div>
    ${renderWorkspaces()}
    <div class="app-flex"></div>
    <div class="app-icon settings" title="设置">·</div>
    <div class="app-avatar">${escapeHtml((state.self?.name || "?").charAt(0).toUpperCase())}</div>
  `;
  bindAppIcons();
  bindWorkspaceIcons();
}

function renderWorkspaces() {
  const icons = state.workspaces.map((ws) => {
    const cls = state.currentWsId === ws.id && !state.homeMode ? "app-ws-icon active" : "app-ws-icon";
    const label = ws.icon || (ws.name || "?").charAt(0).toUpperCase();
    // 聚合未读:仅当前 ws 用 state.channels,其他 ws 显示 0(简化)
    const wsUnread = (state.currentWsId === ws.id)
      ? state.channels.reduce((sum, c) => sum + (c.unread || 0), 0)
      : 0;
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
      state.rightDrawerOpen = true;
      state.rightDrawerTab = "settings";
      const { renderRightDrawer } = await import("./rightDrawer.js");
      renderRightDrawer();
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

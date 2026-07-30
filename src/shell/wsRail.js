import { call } from "../api.js";
import { state } from "../state.js";
import { renderHomeView } from "../dialogs/homeView.js";
import { renderChannelTree, refreshChannels } from "./channelTree.js";
import { openWsWizard } from "../dialogs/wsWizard.js";

export async function refreshWorkspaces() {
  try {
    state.workspaces = await call("list_workspaces");
  } catch {}
}

export function renderWsRail() {
  const rail = document.getElementById("ws-rail");
  if (!rail) return;
  const icons = state.workspaces.map((ws) => {
    const cls = state.currentWsId === ws.id && !state.homeMode ? "ws-icon active" : "ws-icon inactive";
    const label = ws.icon || (ws.name || "?").charAt(0).toUpperCase();
    return `<div class="${cls}" data-id="${ws.id}" title="${escapeAttr(ws.name)}">${escapeHtml(label)}</div>`;
  }).join("");
  const homeCls = state.homeMode ? "ws-icon home active" : "ws-icon home";
  rail.innerHTML = `
    <div class="${homeCls}" id="ws-home" title="主页：私聊与非 workspace 群">·</div>
    <div class="ws-sep"></div>
    ${icons}
    <div class="ws-spacer"></div>
    <div class="ws-add" id="ws-add" title="创建/加入 workspace">+</div>
  `;
  rail.querySelectorAll(".ws-icon[data-id]").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = Number(el.dataset.id);
      state.currentWsId = id;
      state.homeMode = false;
      state.currentChatId = null;
      renderWsRail();
      await refreshChannels();
      renderChannelTree();
      document.getElementById("chat-main").innerHTML = `<div class="empty">选择一个频道</div>`;
      state.rightDrawerOpen = true;
      state.rightDrawerTab = "settings";
      const { renderRightDrawer } = await import("./rightDrawer.js");
      renderRightDrawer();
    });
  });
  document.getElementById("ws-home").addEventListener("click", () => {
    state.homeMode = true;
    state.currentWsId = null;
    state.currentChatId = null;
    renderWsRail();
    renderHomeView();
  });
  document.getElementById("ws-add").addEventListener("click", () => {
    openWsWizard(async () => {
      await refreshWorkspaces();
      renderWsRail();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}

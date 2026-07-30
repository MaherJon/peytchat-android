import { call } from "../api.js";
import { state } from "../state.js";
import { renderChatView } from "../chat/chatView.js";
import { openChannelCreateDialog } from "../dialogs/channelCreate.js";
import { renderRightDrawer } from "./rightDrawer.js";
import { renderHomeView } from "../dialogs/homeView.js";

export async function refreshChannels() {
  if (state.currentWsId == null) {
    state.channels = [];
    return;
  }
  try {
    state.channels = await call("list_channels", { workspaceId: state.currentWsId });
  } catch {
    state.channels = [];
  }
}

export function renderChannelTree() {
  const tree = document.getElementById("channel-tree");
  if (!tree) return;
  const ws = state.workspaces.find((w) => w.id === state.currentWsId);
  if (!ws) {
    tree.innerHTML = `<div class="empty">未选中 workspace</div>`;
    return;
  }
  // 按 category 分组
  const byCategory = {};
  for (const ch of state.channels) {
    if (!byCategory[ch.category]) byCategory[ch.category] = [];
    byCategory[ch.category].push(ch);
  }
  const categories = Object.keys(byCategory).sort();
  const catHtml = categories.map((cat) => {
    const chans = byCategory[cat].map((ch) => {
      const active = state.currentChatId === ch.chat_id ? "active" : "";
      const unread = ch.unread > 0 ? `<span class="ct-unread">${ch.unread}</span>` : "";
      return `<div class="ct-channel ${active}" data-id="${ch.chat_id}" title="${escapeAttr(ch.topic || '')}">${escapeHtml(ch.name)}${unread}</div>`;
    }).join("");
    return `
      <div class="ct-category" data-cat="${escapeAttr(cat)}">
        <span>${escapeHtml(cat)}</span><span>▾</span>
      </div>
      ${chans}
    `;
  }).join("");
  tree.innerHTML = `
    <div class="ct-header">
      <div class="ct-name">${escapeHtml(ws.name)}</div>
      <div class="ct-sub">${escapeHtml(ws.icon || "")} · ${state.channels.length} channels</div>
    </div>
    <div class="ct-list">${catHtml}</div>
    <div class="ct-user">
      <div class="ct-avatar">${state.self ? escapeHtml(state.self.name?.charAt(0) || "?") : "?"}</div>
      <div>
        <div class="ct-username">${escapeHtml(state.self?.name || "me")}</div>
        <div class="ct-userrole">core</div>
      </div>
    </div>
  `;
  tree.querySelectorAll(".ct-channel").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = Number(el.dataset.id);
      state.currentChatId = id;
      renderChannelTree();
      await renderChatView(id);
    });
  });
  // category 折叠（点击切换）
  tree.querySelectorAll(".ct-category").forEach((el) => {
    el.addEventListener("click", () => {
      let next = el.nextElementSibling;
      while (next && !next.classList.contains("ct-category")) {
        next.style.display = next.style.display === "none" ? "" : "none";
        next = next.nextElementSibling;
      }
      const arrow = el.querySelector("span:last-child");
      if (arrow) arrow.textContent = arrow.textContent === "▾" ? "▸" : "▾";
    });
  });
  // 右键 category 新建频道
  tree.querySelectorAll(".ct-category").forEach((el) => {
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openChannelCreateDialog(el.dataset.cat, async () => {
        await refreshChannels();
        renderChannelTree();
      });
    });
  });
  const ctUser = tree.querySelector(".ct-user");
  if (ctUser) {
    ctUser.style.cursor = "pointer";
    ctUser.onclick = async () => {
      state.homeMode = true;
      state.currentChatId = null;
      state.currentWsId = null;
      await renderHomeView();
      state.rightDrawerOpen = true;
      state.rightDrawerTab = "settings";
      renderRightDrawer();
    };
  }
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

import { call } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../toast.js";
import { renderChatView } from "../chat/chatView.js";
import { openChannelCreateDialog } from "../dialogs/channelCreate.js";
import { showContextMenu } from "../dialogs/contextMenu.js";
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
  try {
    const ws = state.workspaces.find((w) => w.id === state.currentWsId);
    if (ws?.master_chat_id) {
      const info = await call("get_chat_info", { chatId: ws.master_chat_id });
      state.wsMembers[state.currentWsId] = info.members?.length || 0;
    }
  } catch {}
}

export function renderChannelTree() {
  const tree = document.getElementById("channel-tree");
  if (!tree) return;
  const ws = state.workspaces.find((w) => w.id === state.currentWsId);
  if (!ws) {
    tree.innerHTML = `<div class="empty">未选中 workspace</div>`;
    return;
  }
  const collapsed = JSON.parse(localStorage.getItem("collapsedCategories") || "{}");
  const wsCats = collapsed[state.currentWsId] || {};
  state.collapsedCategories = collapsed;
  // 按 category 分组
  const byCategory = {};
  for (const ch of state.channels) {
    if (!byCategory[ch.category]) byCategory[ch.category] = [];
    byCategory[ch.category].push(ch);
  }
  const categories = Object.keys(byCategory).sort();
  const catHtml = categories.map((cat) => {
    const isCollapsed = wsCats[cat] === true;
    const arrow = isCollapsed ? "▸" : "▾";
    const chans = byCategory[cat].map((ch) => {
      const active = state.currentChatId === ch.chat_id ? "active" : "";
      const unread = ch.unread > 0 ? `<span class="ct-unread">${ch.unread}</span>` : "";
      return `<div class="ct-channel ${active}" data-id="${ch.chat_id}" title="${escapeAttr(ch.topic || '')}" ${isCollapsed ? 'style="display:none"' : ''}>${escapeHtml(ch.name)}${unread}</div>`;
    }).join("");
    return `
      <div class="ct-category" data-cat="${escapeAttr(cat)}">
        <span>${escapeHtml(cat)}</span><span>${arrow}</span>
      </div>
      ${chans}
    `;
  }).join("");
  tree.innerHTML = `
    <div class="ct-header">
      <div class="ct-name">${escapeHtml(ws.name)}</div>
      <div class="ct-sub">${escapeHtml(ws.icon || "")} · ${state.wsMembers[state.currentWsId] || 0} members</div>
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
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const id = Number(el.dataset.id);
      showContextMenu(e.clientX, e.clientY, [
        {
          label: "频道设置",
          action: () => {
            state.rightDrawerOpen = true;
            state.rightDrawerTab = "settings";
            renderRightDrawer();
          },
        },
        {
          label: "离开频道",
          action: async () => {
            if (!confirm("离开此频道?")) return;
            try {
              await call("leave_channel", { chatId: id });
              await refreshChannels();
              renderChannelTree();
              if (state.currentChatId === id) {
                state.currentChatId = null;
                document.getElementById("chat-main").innerHTML = `<div class="empty">选择一个频道</div>`;
              }
              showToast("已离开");
            } catch (err) {
              showToast(err.message || String(err));
            }
          },
        },
      ]);
    });
  });
  // category 折叠（点击切换，持久化到 localStorage）
  tree.querySelectorAll(".ct-category").forEach((el) => {
    el.addEventListener("click", () => {
      const catName = el.dataset.cat;
      const collapsed = JSON.parse(localStorage.getItem("collapsedCategories") || "{}");
      if (!collapsed[state.currentWsId]) collapsed[state.currentWsId] = {};
      collapsed[state.currentWsId][catName] = !collapsed[state.currentWsId][catName];
      localStorage.setItem("collapsedCategories", JSON.stringify(collapsed));
      state.collapsedCategories = collapsed;
      renderChannelTree();
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

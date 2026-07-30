import { call } from "../api.js";
import { state } from "../state.js";
import { renderAppRail, refreshWorkspaces } from "./appRail.js";
import { renderChannelTree, refreshChannels } from "./channelTree.js";
import { renderRightDrawer } from "./rightDrawer.js";
import { renderChatView } from "../chat/chatView.js";
import { renderHomeView } from "../dialogs/homeView.js";
import { loadState, saveState } from "../persist.js";
import { openSearch, closeSearch } from "../dialogs/search.js";
import { hideContextMenu } from "../dialogs/contextMenu.js";

export async function renderShell() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="shell">
      <div id="ws-rail" class="ws-rail"></div>
      <div id="channel-tree" class="channel-tree"></div>
      <div id="chat-main" class="chat-main"><div class="empty">选择一个频道</div></div>
      <div id="right-drawer" class="right-drawer collapsed"></div>
    </div>
  `;
  // 恢复持久化状态
  loadState();
  await refreshWorkspaces();
  try {
    state.self = await call("get_self_profile");
  } catch {}
  try {
    await call("validate_channels");
  } catch {}

  // 根据恢复的状态决定初始视图
  if (state.currentWsId != null && state.workspaces.find((w) => w.id === state.currentWsId)) {
    state.homeMode = false;
    renderAppRail();
    await refreshChannels();
    renderChannelTree();
    if (state.currentChatId != null) {
      const ch = state.channels.find((c) => c.chat_id === state.currentChatId);
      if (ch) {
        await renderChatView(state.currentChatId);
      } else {
        document.getElementById("chat-main").innerHTML = `<div class="empty">选择一个频道</div>`;
      }
    } else {
      document.getElementById("chat-main").innerHTML = `<div class="empty">选择一个频道</div>`;
    }
  } else {
    state.homeMode = true;
    state.currentWsId = null;
    renderAppRail();
    await renderHomeView();
    if (state.currentChatId != null) {
      try {
        const chats = await call("get_chatlist");
        if (chats.find((c) => c.chat_id === state.currentChatId)) {
          await renderChatView(state.currentChatId);
        }
      } catch {}
    }
  }

  // 注册全局事件刷新
  const { onEvent } = await import("../api.js");
  onEvent("MsgsChanged", () => {
    if (state.currentChatId) refreshCurrentChat();
    refreshSidebar();
    updateBadge();
  });
  onEvent("IncomingMsg", handleIncomingMsg);
  onEvent("ChatlistItemChanged", () => {
    refreshSidebar();
    if (state.homeMode) renderHomeView();
    updateBadge();
  });
  onEvent("ChatModified", () => {
    refreshSidebar();
    if (state.homeMode) renderHomeView();
  });
  onEvent("ContactsChanged", refreshSidebar);

  // 全局快捷键
  document.addEventListener("keydown", async (e) => {
    // Cmd+K / Ctrl+K 搜索
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      if (state.searchOpen) closeSearch();
      else openSearch();
      return;
    }
    // ESC 逐级关闭
    if (e.key === "Escape") {
      if (state.searchOpen) {
        closeSearch();
        return;
      }
      const overlay = document.querySelector(".overlay");
      if (overlay) {
        overlay.remove();
        return;
      }
      hideContextMenu();
      const replyPreview = document.getElementById("reply-preview");
      if (replyPreview) {
        const area = document.getElementById("composer-area");
        if (area) {
          delete area.dataset.replyTo;
          const { renderComposer } = await import("../chat/composer.js");
          renderComposer(state.currentChatId, () => {});
        }
        return;
      }
      if (state.rightDrawerOpen) {
        state.rightDrawerOpen = false;
        renderRightDrawer();
        return;
      }
    }
  });

  // 请求通知权限
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }

  // 初始 Dock 角标
  updateBadge();
}

async function handleIncomingMsg(e) {
  const chatId = e.chat_id;
  if (state.currentChatId === chatId) {
    await refreshCurrentChat();
  } else {
    try {
      const info = await call("get_chat_info", { chatId });
      const name = info.name || "新消息";
      const text = (e.text || "").slice(0, 50);
      if ("Notification" in window && Notification.permission === "granted") {
        const notif = new Notification(name, { body: text });
        notif.onclick = () => {
          state.currentChatId = chatId;
          state.homeMode = true;
          state.currentWsId = null;
          renderHomeView().then(() => renderChatView(chatId));
          window.focus();
        };
      }
    } catch {}
  }
  refreshSidebar();
  updateBadge();
}

async function updateBadge() {
  try {
    const chats = await call("get_chatlist");
    const total = chats.reduce((sum, c) => sum + (c.unread || 0), 0);
    if (window.__TAURI__?.app?.setBadgeCount) {
      await window.__TAURI__.app.setBadgeCount(total);
    }
  } catch {}
}

async function refreshCurrentChat() {
  if (state.currentChatId != null) {
    await renderChatView(state.currentChatId);
    saveState();
  }
}

async function refreshSidebar() {
  await refreshWorkspaces();
  await refreshChannels();
  renderAppRail();
  if (state.currentWsId != null && !state.homeMode) {
    renderChannelTree();
  }
  saveState();
}

import { call } from "../api.js";
import { state } from "../state.js";
import { renderAppRail, refreshWorkspaces } from "./appRail.js";
import { renderChannelTree, refreshChannels } from "./channelTree.js";
import { renderRightDrawer } from "./rightDrawer.js";
import { renderChatView, appendNewMessages } from "../chat/chatView.js";
import { renderHomeView } from "../dialogs/homeView.js";
import { loadState, saveState } from "../persist.js";
import { openSearch, closeSearch } from "../dialogs/search.js";
import { hideContextMenu } from "../dialogs/contextMenu.js";
import { showToast } from "../toast.js";
import { stateLabel, renderReactionsHtml, updateReactionsCache, clearReactionsCache } from "../chat/message.js";

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
    // Work 模式：renderChannelTree 已触发 renderMain，跳过 chat 渲染避免覆盖
    if (state.currentApp === "chat") {
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

  // Task 13: 自己的头像变了(本机设置 or 多设备同步) → 刷新 state.self + appRail 底部头像。
  // 不重渲染整个 shell,只更新 rail。
  onEvent("SelfavatarChanged", async () => {
    try {
      state.self = await call("get_self_profile");
      renderAppRail();
    } catch {}
  });

  // Task 8: 消息状态/反应/删除/会话删除等 13 个事件 handler
  onEvent("MsgDelivered", (e) => updateMsgState(e.msg_id, "delivered"));
  onEvent("MsgFailed", (e) => updateMsgState(e.msg_id, "failed"));
  onEvent("MsgDeleted", (e) => removeMsg(e.msg_id));
  onEvent("ReactionsChanged", (e) => refreshMsgReactions(e.msg_id));
  onEvent("MsgRead", (e) => updateMsgState(e.msg_id, "read"));
  onEvent("MsgsNoticed", () => { /* 未读分隔线清除,UI 自然刷新 */ });
  onEvent("ChatDeleted", async (e) => {
    // 从 state.channels 移除
    state.channels = state.channels.filter((c) => c.chat_id !== e.chat_id);
    if (state.currentChatId === e.chat_id) {
      state.currentChatId = null;
      state.currentMembers = [];
      state.messages = [];
      document.getElementById("chat-main").innerHTML = `<div class="empty">选择一个频道</div>`;
    }
    renderChannelTree();
    renderAppRail();
    saveState();
  });
  onEvent("ChatEphemeralTimerModified", () => {}); // no-op
  onEvent("IncomingReaction", (e) => refreshMsgReactions(e.msg_id));
  onEvent("IncomingMsgBunch", () => {}); // no-op
  onEvent("SecurejoinJoinerProgress", () => {}); // no-op
  onEvent("SecurejoinInviterProgress", () => {}); // no-op
  onEvent("WebxdcStatusUpdate", () => {}); // no-op
  onEvent("WebxdcRealtimeData", () => {}); // no-op
  onEvent("WebxdcInstanceDeleted", () => {}); // no-op

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
    // Task 9: 增量追加新消息,而非全量重渲染(保留 scroll 位置和已加载的历史)
    await appendNewMessages(state.currentChatId);
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

// Task 8 helpers: 消息状态/删除/反应实时更新
function updateMsgState(msgId, newState) {
  const msg = state.messages.find((m) => m.msg_id === msgId);
  if (msg) {
    msg.state = newState;
    const el = document.querySelector(`[data-msg="${msgId}"]`);
    if (el) {
      const stateEl = el.querySelector(".msg-state");
      if (stateEl) stateEl.textContent = stateLabel(newState);
      el.classList.remove("state-pending", "state-delivered", "state-failed", "state-read");
      el.classList.add("state-" + newState);
    }
  }
}

function removeMsg(msgId) {
  state.messages = state.messages.filter((m) => m.msg_id !== msgId);
  const el = document.querySelector(`[data-msg="${msgId}"]`);
  if (el) el.remove();
}

async function refreshMsgReactions(msgId) {
  try {
    const reactions = await call("get_reactions", { msgId });
    // 修复:同步更新 message.js 的 reactions 缓存,虚拟化重渲染时直接命中缓存
    updateReactionsCache(msgId, reactions);
    const msgEl = document.querySelector(`[data-msg="${msgId}"]`);
    if (!msgEl) return;
    let el = msgEl.querySelector(".msg-reactions");
    const html = renderReactionsHtml(reactions, msgId);
    if (el) {
      el.innerHTML = html;
    } else if (html) {
      // 之前没有 reactions 节点,新建一个插入到 reaction picker 之前
      el = document.createElement("div");
      el.className = "msg-reactions";
      el.innerHTML = html;
      const picker = msgEl.querySelector(".msg-reaction-picker");
      if (picker) msgEl.insertBefore(el, picker);
      else msgEl.appendChild(el);
    }
    // 重新绑定 reaction toggle(新 capsules 没有 listener)
    if (el) {
      el.querySelectorAll(".msg-reaction").forEach((r) => {
        r.addEventListener("click", async () => {
          const emoji = r.dataset.emoji;
          try {
            await call("send_reaction", { chatId: state.currentChatId, msgId, emoji });
          } catch (e) { showToast(e.message || String(e)); }
        });
      });
    }
  } catch {}
}

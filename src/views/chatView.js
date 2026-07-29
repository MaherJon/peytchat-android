import { call, onEvent } from "../api.js";
import { state } from "../state.js";
import { openChatInfoDialog } from "./chatInfo.js";

export async function renderChatView(chatId) {
  const panel = document.getElementById("chat-panel");
  panel.innerHTML = `
    <div class="chat-header" id="chat-header">
      <span id="chat-title"></span>
      <button id="chat-info-btn" class="link" title="会话信息">信息</button>
    </div>
    <div class="messages" id="messages"></div>
    <form class="composer" id="composer" hidden>
      <input id="msg-input" placeholder="输入消息…" autocomplete="off" />
      <button type="submit">发送</button>
    </form>
    <div id="request-actions" class="request-actions" hidden></div>
  `;

  const header = state.chatlist.find((c) => c.chat_id === chatId);
  document.getElementById("chat-title").textContent = header ? header.name : "";

  // Always load fresh chat info so we know whether it's a contact request.
  let info = null;
  try {
    info = await call("get_chat_info", { chatId });
  } catch (e) {
    console.error("[chatView] get_chat_info failed", e);
  }

  document.getElementById("chat-info-btn").addEventListener("click", () => {
    openChatInfoDialog(chatId, async () => {
      // After info dialog closes (e.g. member added / chat left / chat deleted),
      // refresh this view and the chatlist.
      await refreshChatlistExternally();
      const stillExists = state.chatlist.some((c) => c.chat_id === chatId);
      if (!stillExists) {
        document.getElementById("chat-panel").innerHTML = `<div class="empty">选择一个会话</div>`;
        state.currentChatId = null;
        return;
      }
      renderChatView(chatId);
    });
  });

  const isContactRequest = info?.is_contact_request === true || header?.is_contact_request === true;
  if (isContactRequest) {
    document.getElementById("composer").hidden = true;
    const reqBox = document.getElementById("request-actions");
    reqBox.hidden = false;
    reqBox.innerHTML = `
      <p class="request-hint">这是一个联系人请求。接受后才能回复消息。</p>
      <div class="request-buttons">
        <button type="button" id="accept-btn">接受</button>
        <button type="button" id="block-btn" class="link">阻止</button>
        <button type="button" id="delete-btn" class="link">删除</button>
      </div>
    `;
    document.getElementById("accept-btn").addEventListener("click", async () => {
      try {
        await call("accept_chat", { chatId });
        renderChatView(chatId);
        refreshChatlistExternally();
      } catch {}
    });
    document.getElementById("block-btn").addEventListener("click", async () => {
      if (!confirm("确定阻止此联系人？")) return;
      try {
        await call("block_chat", { chatId });
        refreshChatlistExternally();
        document.getElementById("chat-panel").innerHTML = `<div class="empty">选择一个会话</div>`;
        state.currentChatId = null;
      } catch {}
    });
    document.getElementById("delete-btn").addEventListener("click", async () => {
      if (!confirm("确定删除此会话？")) return;
      try {
        await call("delete_chat", { chatId });
        refreshChatlistExternally();
        document.getElementById("chat-panel").innerHTML = `<div class="empty">选择一个会话</div>`;
        state.currentChatId = null;
      } catch {}
    });
  } else {
    document.getElementById("composer").hidden = false;
  }

  await refreshMessages(chatId);
  // Mark noticed to clear unread badge (only when not a contact request).
  if (!isContactRequest) {
    try { await call("mark_chat_noticed", { chatId }); } catch {}
    refreshChatlistExternally();
  }

  onEvent("MsgsChanged", () => { if (state.currentChatId === chatId) refreshMessages(chatId); });
  onEvent("IncomingMsg", () => {
    if (state.currentChatId !== chatId) return;
    refreshMessages(chatId);
    call("mark_chat_noticed", { chatId }).catch(() => {});
  });
  onEvent("ChatModified", () => { if (state.currentChatId === chatId) renderChatView(chatId); });

  const form = document.getElementById("composer");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("msg-input");
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      try {
        await call("send_text", { chatId, text });
        await refreshMessages(chatId);
      } catch {
        /* 错误已由 showError 处理 */
      }
    });
  }
}

async function refreshMessages(chatId) {
  try {
    state.messages = await call("get_chat_msgs", { chatId });
  } catch {
    return;
  }
  const box = document.getElementById("messages");
  if (!box) return;
  box.innerHTML = state.messages.map((m) => `
    <div class="msg ${m.is_out ? "out" : "in"}">
      ${m.is_out ? "" : `<div class="msg-from">${escapeHtml(m.from_name)}</div>`}
      <div class="msg-text">${escapeHtml(m.text)}</div>
      ${m.state === "failed" ? `<div class="msg-failed">发送失败</div>` : ""}
    </div>
  `).join("");
  box.scrollTop = box.scrollHeight;
}

async function refreshChatlistExternally() {
  // Trigger a chatlist refresh by re-fetching and re-rendering the sidebar list.
  try {
    state.chatlist = await call("get_chatlist");
  } catch {
    return;
  }
  const ul = document.getElementById("chatlist");
  if (!ul) return;
  ul.querySelectorAll(".chat-item").forEach((el) => {
    const id = Number(el.dataset.id);
    const c = state.chatlist.find((x) => x.chat_id === id);
    if (!c) {
      el.remove();
      return;
    }
    el.classList.toggle("active", state.currentChatId === id);
    const unreadEl = el.querySelector(".unread, .badge-request");
    if (unreadEl) unreadEl.remove();
    if (c.is_contact_request) {
      const badge = document.createElement("span");
      badge.className = "badge-request";
      badge.textContent = "请求";
      el.appendChild(badge);
    } else if (c.unread > 0) {
      const badge = document.createElement("span");
      badge.className = "unread";
      badge.textContent = c.unread;
      el.appendChild(badge);
    }
    const lastEl = el.querySelector(".chat-last");
    if (lastEl && c.last_msg != null) lastEl.textContent = c.last_msg;
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

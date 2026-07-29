import { call, onEvent } from "../api.js";
import { state } from "../state.js";
import { renderChatView } from "./chatView.js";
import { openCreateGroupDialog } from "./group.js";

export async function renderChatList() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="main">
      <aside class="sidebar">
        <div class="sidebar-header">
          <span>会话</span>
          <button id="new-group" class="link">新建群组</button>
        </div>
        <ul id="chatlist" class="chatlist"></ul>
      </aside>
      <main id="chat-panel" class="chat-panel">
        <div class="empty">选择一个会话</div>
      </main>
    </div>
  `;

  document.getElementById("new-group").addEventListener("click", () => {
    openCreateGroupDialog(async () => { await refreshChatlist(); });
  });

  await refreshChatlist();
  onEvent("MsgsChanged", refreshChatlist);
  onEvent("IncomingMsg", refreshChatlist);
}

async function refreshChatlist() {
  state.chatlist = await call("get_chatlist");
  const ul = document.getElementById("chatlist");
  if (!ul) return;
  ul.innerHTML = state.chatlist.map((c) => `
    <li class="chat-item ${state.currentChatId === c.chat_id ? "active" : ""}" data-id="${c.chat_id}">
      <div class="avatar">${initial(c.name)}</div>
      <div class="chat-meta">
        <div class="chat-name">${escapeHtml(c.name)}</div>
        <div class="chat-last">${escapeHtml(c.last_msg || "")}</div>
      </div>
      ${c.unread > 0 ? `<span class="unread">${c.unread}</span>` : ""}
    </li>
  `).join("");
  ul.querySelectorAll(".chat-item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = Number(el.dataset.id);
      state.currentChatId = id;
      ul.querySelectorAll(".chat-item").forEach((x) => x.classList.remove("active"));
      el.classList.add("active");
      renderChatView(id);
    });
  });
}

function initial(name) {
  return (name || "?").charAt(0).toUpperCase();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

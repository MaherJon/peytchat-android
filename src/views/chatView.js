import { call, onEvent } from "../api.js";
import { state } from "../state.js";

export async function renderChatView(chatId) {
  const panel = document.getElementById("chat-panel");
  panel.innerHTML = `
    <div class="chat-header" id="chat-header"></div>
    <div class="messages" id="messages"></div>
    <form class="composer" id="composer">
      <input id="msg-input" placeholder="输入消息…" autocomplete="off" />
      <button type="submit">发送</button>
    </form>
  `;

  const header = state.chatlist.find((c) => c.chat_id === chatId);
  document.getElementById("chat-header").textContent = header ? header.name : "";

  await refreshMessages(chatId);
  onEvent("MsgsChanged", () => { if (state.currentChatId === chatId) refreshMessages(chatId); });
  onEvent("IncomingMsg", () => { if (state.currentChatId === chatId) refreshMessages(chatId); });

  const form = document.getElementById("composer");
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

async function refreshMessages(chatId) {
  state.messages = await call("get_chat_msgs", { chatId });
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

import { call } from "../api.js";
import { showToast } from "../toast.js";
import { state } from "../state.js";
import { renderChatView } from "../chat/chatView.js";
import { renderHomeView } from "./homeView.js";

export async function renderContactRequest(chatId, mainEl) {
  mainEl.innerHTML = `<div class="spinner"><span></span></div>`;
  try {
    const info = await call("get_chat_info", { chatId });
    const name = info.name || "未知";
    const members = info.members || [];
    const other = members.find((m) => !m.is_self) || members[0] || {};
    const email = other.addr || "";
    mainEl.innerHTML = `
      <div class="guide-card" style="padding:40px 20px">
        <div style="font-size:13px;color:var(--text);font-weight:600">${escapeHtml(name)}</div>
        <div style="font-size:11px;color:var(--text-mute)">${escapeHtml(email)}</div>
        <div style="font-size:10px;color:var(--text-weak);margin-top:8px">想与你建立联系</div>
        <div style="display:flex;gap:12px;margin-top:16px">
          <button id="cr-accept" style="background:var(--text);color:var(--panel);border:none;padding:8px 20px;border-radius:4px;font-size:11px;cursor:pointer">接受</button>
          <button id="cr-decline" style="background:transparent;border:1px solid var(--border-strong);color:var(--text-mute);padding:8px 20px;border-radius:4px;font-size:11px;cursor:pointer">拒绝</button>
        </div>
      </div>
    `;
    document.getElementById("cr-accept").addEventListener("click", async () => {
      try {
        await call("accept_chat", { chatId });
        showToast("已接受");
        state.currentChatId = chatId;
        await renderChatView(chatId);
      } catch (e) {
        showToast(e.message || String(e));
      }
    });
    document.getElementById("cr-decline").addEventListener("click", async () => {
      try {
        await call("block_chat", { chatId });
        showToast("已拒绝");
        state.currentChatId = null;
        await renderHomeView();
      } catch (e) {
        showToast(e.message || String(e));
      }
    });
  } catch (e) {
    mainEl.innerHTML = `<div class="guide-card">加载失败:${escapeHtml(e.message || String(e))}</div>`;
    showToast(e.message || String(e));
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

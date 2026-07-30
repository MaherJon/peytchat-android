import { call, transformBlobURL } from "../api.js";
import { showToast } from "../toast.js";
import { state } from "../state.js";
import { renderChatView } from "../chat/chatView.js";
import { renderHomeView } from "./homeView.js";
import { renderRightDrawer } from "../shell/rightDrawer.js";

// Task 13: 把 Contact::get_color() 返回的 u32 转成 #rrggbb。null/undefined → 默认 #222。
function colorHex(c) {
  if (!c && c !== 0) return "#222";
  return "#" + (c & 0xffffff).toString(16).padStart(6, "0");
}

export async function renderMemberDetail(body, contactId) {
  body.innerHTML = `<div class="spinner"><span></span></div>`;
  try {
    const info = await call("get_chat_info", { chatId: state.currentChatId });
    const member = (info.members || []).find((m) => m.contact_id === contactId);
    if (!member) {
      body.innerHTML = `<div style="padding:16px;color:#555">成员不存在</div>`;
      return;
    }
    // Task 13: 大头像 — 80×80,图片优先,否则首字母 + color 背景。
    const avatarUrl = member.avatar ? await transformBlobURL(member.avatar) : null;
    const bg = colorHex(member.color);
    const letter = (member.name || "?").charAt(0).toUpperCase() || "?";
    const avatarHtml = avatarUrl
      ? `<img src="${escapeHtml(avatarUrl)}" class="member-detail-avatar" alt="" />`
      : `<div class="member-detail-avatar" style="background:${bg}">${escapeHtml(letter)}</div>`;
    body.innerHTML = `
      <div class="rd-group">成员详情</div>
      <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;gap:10px;margin:8px 0">
          ${avatarHtml}
          <div>
            <div style="font-size:12px;font-weight:600;color:#e5e5e5">${escapeHtml(member.name)}</div>
            <div style="font-size:9px;color:#555">${escapeHtml(member.addr || "")}</div>
          </div>
        </div>
        <button id="md-msg" style="background:#161616;border:1px solid #222;color:#e5e5e5;padding:8px;border-radius:4px;font-size:11px;cursor:pointer;margin-top:8px">发消息</button>
        <button id="md-back" style="background:transparent;border:1px solid #222;color:#888;padding:8px;border-radius:4px;font-size:11px;cursor:pointer">返回成员列表</button>
      </div>
    `;
    document.getElementById("md-msg").addEventListener("click", async () => {
      try {
        const chatId = await call("create_chat_by_contact", { contactId });
        state.homeMode = true;
        state.currentWsId = null;
        state.currentChatId = chatId;
        state.rightDrawerOpen = false;
        renderRightDrawer();
        await renderHomeView();
        await renderChatView(chatId);
        showToast("已进入私聊");
      } catch (e) {
        showToast(e.message || String(e));
      }
    });
    document.getElementById("md-back").addEventListener("click", () => {
      state.rightDrawerTab = "members";
      renderRightDrawer();
    });
  } catch (e) {
    body.innerHTML = `<div style="padding:16px;color:#555">加载失败</div>`;
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

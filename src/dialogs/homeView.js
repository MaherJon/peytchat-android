import { call } from "../api.js";
import { state } from "../state.js";
import { renderChatView } from "../chat/chatView.js";

export async function renderHomeView() {
  const tree = document.getElementById("channel-tree");
  const main = document.getElementById("chat-main");
  if (!tree || !main) return;
  let chats = [];
  try {
    chats = await call("get_chatlist");
  } catch {}
  // 过滤：非 workspace 频道（不在 state.channels 跨所有 ws 的 chat_id 集合里）
  // SP1 简化：主页显示全部 chatlist，workspace 频道也在里面但不影响
  const wsChatIds = new Set(state.workspaces.flatMap((ws) => ws.master_chat_id ? [ws.master_chat_id] : []));
  const items = chats.map((c) => {
    const tag = c.is_group ? "群" : (c.is_self_talk ? "我" : "DM");
    const badge = c.is_contact_request ? `<span class="ct-unread" style="background:transparent;color:#888;border:1px solid #222">请求</span>` : (c.unread > 0 ? `<span class="ct-unread">${c.unread}</span>` : "");
    const active = state.currentChatId === c.chat_id ? "active" : "";
    return `<div class="ct-channel ${active}" data-id="${c.chat_id}"><span>[${tag}] ${escapeHtml(c.name)}</span>${badge}</div>`;
  }).join("");
  tree.innerHTML = `
    <div class="ct-header">
      <div class="ct-name">主页</div>
      <div class="ct-sub">DM 与非 workspace 群</div>
    </div>
    <div class="ct-list">${items || '<div style="padding:16px;color:#555">无会话</div>'}</div>
    <div class="ct-user">
      <div class="ct-avatar">${escapeHtml(state.self?.name?.charAt(0) || "?")}</div>
      <div>
        <div class="ct-username">${escapeHtml(state.self?.name || "me")}</div>
      </div>
    </div>
  `;
  main.innerHTML = `<div class="empty">选择一个会话</div>`;
  tree.querySelectorAll(".ct-channel").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = Number(el.dataset.id);
      state.currentChatId = id;
      tree.querySelectorAll(".ct-channel").forEach((x) => x.classList.remove("active"));
      el.classList.add("active");
      await renderChatView(id);
    });
  });
  const ctUser = tree.querySelector(".ct-user");
  if (ctUser) {
    ctUser.style.cursor = "pointer";
    ctUser.onclick = async () => {
      state.rightDrawerOpen = true;
      state.rightDrawerTab = "settings";
      const { renderRightDrawer } = await import("../shell/rightDrawer.js");
      renderRightDrawer();
    };
  }
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

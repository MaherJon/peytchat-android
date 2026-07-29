import { call } from "../api.js";
import { openMyQrDialog } from "./myQr.js";

/**
 * Show chat info dialog: members list, add-member (groups),
 * leave-group / delete-chat / show-qr actions.
 *
 * @param {number} chatId
 * @param {() => void} onClose
 */
export function openChatInfoDialog(chatId, onClose) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="dialog">
      <h2 id="info-title">会话信息</h2>
      <div id="info-body"><p class="hint">加载中…</p></div>
      <div id="info-error" class="error" style="display:none"></div>
      <div class="dialog-actions">
        <button type="button" id="info-close" class="link">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => { overlay.remove(); onClose(); };
  document.getElementById("info-close").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  (async () => {
    const errEl = document.getElementById("info-error");
    const body = document.getElementById("info-body");
    try {
      const info = await call("get_chat_info", { chatId });
      document.getElementById("info-title").textContent = info.name;

      const memberRows = info.members.map((m) => `
        <li class="member-item">
          <div class="avatar">${(m.name || m.addr || "?").charAt(0).toUpperCase()}</div>
          <div class="member-meta">
            <div class="member-name">${escapeHtml(m.name)}${m.is_self ? " (我)" : ""}</div>
            <div class="member-addr">${escapeHtml(m.addr)}</div>
          </div>
        </li>
      `).join("");

      const actions = [];
      if (info.is_group) {
        actions.push(`<button type="button" id="add-member-btn" class="link">添加成员</button>`);
        actions.push(`<button type="button" id="group-qr-btn" class="link">群组邀请二维码</button>`);
        actions.push(`<button type="button" id="leave-group-btn" class="link">退出群组</button>`);
      } else if (!info.is_self_talk) {
        actions.push(`<button type="button" id="delete-chat-btn" class="link">删除会话</button>`);
      }

      body.innerHTML = `
        <ul class="member-list">${memberRows}</ul>
        <div class="info-actions">${actions.join("")}</div>
        <div id="add-member-form" class="add-member-form" hidden>
          <input id="new-member-email" type="email" placeholder="成员邮箱" />
          <button type="button" id="confirm-add-member">添加</button>
        </div>
      `;

      const addMemberBtn = document.getElementById("add-member-btn");
      if (addMemberBtn) {
        addMemberBtn.addEventListener("click", () => {
          document.getElementById("add-member-form").hidden = false;
        });
        document.getElementById("confirm-add-member").addEventListener("click", async () => {
          const email = document.getElementById("new-member-email").value.trim();
          if (!email) return;
          try {
            await call("add_group_member", { chatId, email });
            // Reload info.
            overlay.remove();
            openChatInfoDialog(chatId, onClose);
          } catch (err) {
            errEl.textContent = typeof err === "object" && err?.message ? err.message : String(err);
            errEl.style.display = "block";
          }
        });
      }

      const groupQrBtn = document.getElementById("group-qr-btn");
      if (groupQrBtn) {
        groupQrBtn.addEventListener("click", () => {
          // Hide info dialog behind the QR dialog (don't close, so user can come back).
          openMyQrDialog(chatId);
        });
      }

      const leaveBtn = document.getElementById("leave-group-btn");
      if (leaveBtn) {
        leaveBtn.addEventListener("click", async () => {
          if (!confirm("确定退出此群组？")) return;
          try {
            await call("leave_group", { chatId });
            close();
          } catch (err) {
            errEl.textContent = typeof err === "object" && err?.message ? err.message : String(err);
            errEl.style.display = "block";
          }
        });
      }

      const deleteBtn = document.getElementById("delete-chat-btn");
      if (deleteBtn) {
        deleteBtn.addEventListener("click", async () => {
          if (!confirm("确定删除此会话？")) return;
          try {
            await call("delete_chat", { chatId });
            close();
          } catch (err) {
            errEl.textContent = typeof err === "object" && err?.message ? err.message : String(err);
            errEl.style.display = "block";
          }
        });
      }
    } catch (err) {
      body.innerHTML = "";
      errEl.textContent = typeof err === "object" && err?.message ? err.message : String(err);
      errEl.style.display = "block";
    }
  })();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

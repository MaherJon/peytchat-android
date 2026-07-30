import { call } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../toast.js";
import { renderChatView } from "../chat/chatView.js";
import { showContextMenu } from "./contextMenu.js";
import { openHomePlus } from "./homePlus.js";
import { renderContactRequest } from "./contactRequest.js";

export async function renderHomeView() {
  const tree = document.getElementById("channel-tree");
  const main = document.getElementById("chat-main");
  if (!tree || !main) return;
  let chats = [];
  try {
    chats = await call("get_chatlist");
  } catch {}
  const wsChatIds = new Set(
    state.workspaces.flatMap((ws) => (ws.master_chat_id ? [ws.master_chat_id] : []))
  );
  const items = chats.map((c) => {
    const tag = c.is_group ? "群" : c.is_self_talk ? "我" : "DM";
    const badge = c.is_contact_request
      ? `<span class="ct-unread" style="background:transparent;color:#888;border:1px solid #222">请求</span>`
      : c.unread > 0
        ? `<span class="ct-unread">${c.unread}</span>`
        : "";
    const active = state.currentChatId === c.chat_id ? "active" : "";
    return `<div class="ct-channel ${active}" data-id="${c.chat_id}"><span>[${tag}] ${escapeHtml(c.name)}</span>${badge}</div>`;
  }).join("");
  tree.innerHTML = `
    <div class="ct-header" style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div class="ct-name">主页</div>
        <div class="ct-sub">DM 与非 workspace 群</div>
      </div>
      <div id="home-plus" style="cursor:pointer;color:#888;font-size:14px;padding:0 8px" title="新建">+</div>
    </div>
    <div class="ct-list">${items || '<div class="guide-card" style="height:auto;padding:24px 16px"><div>还没有会话</div><div style="font-size:9px;color:#555;margin-top:4px">点 + 添加好友或创建群</div></div>'}</div>
    <div class="ct-user" style="cursor:pointer">
      <div class="ct-avatar">${escapeHtml(state.self?.name?.charAt(0) || "?")}</div>
      <div>
        <div class="ct-username">${escapeHtml(state.self?.name || "me")}</div>
      </div>
    </div>
  `;
  main.innerHTML = `<div class="empty">选择一个会话</div>`;
  document.getElementById("home-plus").addEventListener("click", () => openHomePlus());
  tree.querySelectorAll(".ct-channel").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = Number(el.dataset.id);
      const chat = chats.find((c) => c.chat_id === id);
      state.currentChatId = id;
      tree.querySelectorAll(".ct-channel").forEach((x) => x.classList.remove("active"));
      el.classList.add("active");
      if (chat?.is_contact_request) {
        await renderContactRequest(id, main);
      } else {
        await renderChatView(id);
      }
    });
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const id = Number(el.dataset.id);
      const chat = chats.find((c) => c.chat_id === id);
      if (!chat) return;
      const menuItems = [];
      if (chat.is_group) {
        menuItems.push({
          label: "改名",
          action: async () => {
            const name = prompt("新名称", chat.name);
            if (name) {
              try {
                await call("update_channel", { chatId: id, name });
                await renderHomeView();
              } catch (err) {
                showToast(err.message || String(err));
              }
            }
          },
        });
        menuItems.push({
          label: "退群",
          action: async () => {
            try {
              await call("leave_group", { chatId: id });
              await renderHomeView();
              showToast("已退出");
            } catch (err) {
              showToast(err.message || String(err));
            }
          },
        });
      } else {
        menuItems.push({
          label: "查看资料",
          action: async () => {
            state.rightDrawerOpen = true;
            state.rightDrawerTab = "members";
            const { renderRightDrawer } = await import("../shell/rightDrawer.js");
            renderRightDrawer();
          },
        });
        menuItems.push({
          label: "屏蔽",
          action: async () => {
            if (!confirm("屏蔽此会话?")) return;
            try {
              await call("block_chat", { chatId: id });
              await renderHomeView();
              showToast("已屏蔽");
            } catch (err) {
              showToast(err.message || String(err));
            }
          },
        });
      }
      menuItems.push({
        label: "删除会话",
        action: async () => {
          if (!confirm("删除此会话?")) return;
          try {
            await call("delete_chat", { chatId: id });
            state.currentChatId = null;
            await renderHomeView();
            showToast("已删除");
          } catch (err) {
            showToast(err.message || String(err));
          }
        },
      });
      showContextMenu(e.clientX, e.clientY, menuItems);
    });
  });
  const ctUser = tree.querySelector(".ct-user");
  if (ctUser) {
    ctUser.onclick = async () => {
      state.rightDrawerOpen = true;
      state.rightDrawerTab = "settings";
      const { renderRightDrawer } = await import("../shell/rightDrawer.js");
      renderRightDrawer();
    };
  }
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

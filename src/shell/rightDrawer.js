import { call } from "../api.js";
import { state } from "../state.js";
import { saveState } from "../persist.js";
import { renderSettingsPanel } from "../dialogs/settingsPanel.js";
import { showToast } from "../toast.js";

export function renderRightDrawer() {
  const drawer = document.getElementById("right-drawer");
  if (!drawer) return;
  const collapsed = !state.rightDrawerOpen || !state.detailPanelOpen;
  drawer.classList.toggle("collapsed", collapsed);
  if (!state.rightDrawerOpen) return;
  const tab = state.rightDrawerTab;
  const tabsHtml = `
    <span class="rd-tab ${tab === "members" ? "active" : ""}" data-tab="members">members</span>
    <span class="rd-tab ${tab === "pin" ? "active" : ""}" data-tab="pin">pin</span>
    <span class="rd-tab ${tab === "settings" ? "active" : ""}" data-tab="settings">settings</span>
    <span class="rd-flex"></span>
    <span class="rd-collapse" title="折叠">›</span>
  `;
  drawer.innerHTML = `<div class="rd-tabs">${tabsHtml}</div><div id="rd-body" style="flex:1;overflow-y:auto"></div>`;
  drawer.querySelectorAll(".rd-tab").forEach((el) => {
    el.addEventListener("click", () => {
      state.rightDrawerTab = el.dataset.tab;
      renderRightDrawer();
    });
  });
  drawer.querySelector(".rd-collapse").addEventListener("click", () => {
    state.detailPanelOpen = false;
    saveState();
    renderRightDrawer();
  });
  if (!state.detailPanelOpen) {
    const main = document.getElementById("chat-main");
    if (main && !main.querySelector(".detail-expand")) {
      const expandBtn = document.createElement("div");
      expandBtn.className = "detail-expand";
      expandBtn.innerHTML = "‹";
      expandBtn.title = "展开详情面板";
      expandBtn.addEventListener("click", () => {
        state.detailPanelOpen = true;
        saveState();
        renderRightDrawer();
        expandBtn.remove();
      });
      main.appendChild(expandBtn);
    }
  } else {
    document.querySelectorAll("#chat-main .detail-expand").forEach((el) => el.remove());
  }
  renderRdBody();
}

async function renderRdBody() {
  const body = document.getElementById("rd-body");
  if (!body) return;
  if (state.rightDrawerTab === "members") {
    await renderMembers(body);
  } else if (state.rightDrawerTab === "pin") {
    await renderPins(body);
  } else if (state.rightDrawerTab === "settings") {
    await renderSettingsPanel(body);
  }
}

async function renderMembers(body) {
  if (!state.currentChatId) {
    body.innerHTML = `<div style="padding:16px;color:#555">未选中频道</div>`;
    return;
  }
  try {
    const info = await call("get_chat_info", { chatId: state.currentChatId });
    // 拉 workspace 所有 contact_roles（联表返回 contact_id, role_id, role_name, role_color）
    let allRoles = [];
    try {
      allRoles = await call("list_all_contact_roles", { workspaceId: state.currentWsId });
    } catch {}
    // 构建 contact_id -> [role_name] 映射
    const contactRoles = new Map();
    for (const r of allRoles) {
      if (!contactRoles.has(r.contact_id)) contactRoles.set(r.contact_id, []);
      contactRoles.get(r.contact_id).push(r.role_name);
    }
    // 按 role 分组：self 归 "core"（SP1 约定 self 固定 core），其他按 contact_roles 归类
    // 无 role 的 contact 归入 "Members" 组（对齐 mockup 的 Core·2 / Members·3）
    const grouped = new Map(); // role_name -> [member]
    grouped.set("core", []);
    grouped.set("Members", []);
    for (const m of info.members) {
      if (m.is_self) {
        grouped.get("core").push(m);
        continue;
      }
      const roles = contactRoles.get(m.contact_id);
      if (roles && roles.length > 0) {
        const primaryRole = roles[0];
        if (!grouped.has(primaryRole)) grouped.set(primaryRole, []);
        grouped.get(primaryRole).push(m);
      } else {
        grouped.get("Members").push(m);
      }
    }
    // 渲染顺序：core 优先，然后其他 role，最后 Members
    const order = ["core", "Members"];
    for (const r of allRoles) {
      const name = r.role_name;
      if (!order.includes(name) && grouped.has(name)) order.push(name);
    }
    const searchHtml = `<div class="rd-search"><input id="rd-member-search" placeholder="搜索成员..." /></div>`;
    const html = order
      .filter((name) => grouped.has(name) && grouped.get(name).length > 0)
      .map((name) => {
        const list = grouped.get(name);
        const items = list.map((m) => `
          <div class="rd-member ${m.is_self ? '' : 'muted'}" data-name="${escapeHtml(m.name)}" ${m.is_self ? '' : `data-cid="${m.contact_id}" style="cursor:pointer"`}>
            <div class="rd-avatar">${escapeHtml(m.name.charAt(0).toUpperCase())}</div>
            <span class="rd-name">${escapeHtml(m.name)}</span>
          </div>
        `).join("");
        return `<div class="rd-group">${escapeHtml(name.toUpperCase())} · ${list.length}</div>${items}`;
      }).join("");
    body.innerHTML = searchHtml + (html || `<div style="padding:16px;color:#555">无成员</div>`);
    const searchInput = body.querySelector("#rd-member-search");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        const q = searchInput.value.toLowerCase();
        body.querySelectorAll(".rd-member").forEach((el) => {
          const name = el.dataset.name?.toLowerCase() || "";
          el.style.display = name.includes(q) ? "" : "none";
        });
      });
    }
    body.querySelectorAll(".rd-member[data-cid]").forEach((el) => {
      el.addEventListener("click", async () => {
        const cid = Number(el.dataset.cid);
        const { renderMemberDetail } = await import("../dialogs/memberDetail.js");
        await renderMemberDetail(body, cid);
      });
    });
  } catch (e) {
    body.innerHTML = `<div style="padding:16px;color:#555">加载失败</div>`;
    showToast(e.message || String(e));
  }
}

async function renderPins(body) {
  const pins = state.pins || [];
  if (pins.length === 0) {
    body.innerHTML = `<div class="rd-empty">无置顶消息</div>`;
    return;
  }
  // Task 12: 拉取每条 pin 的消息内容(并行),用 channel_chat_id 取频道消息,
  // 再 find 出 msg_id 对应的 MsgDto。若 pin 的 msg 不在最新 50 条内,get_chat_msgs
  // 返回的列表里找不到 → 该 pin 被 filter 掉(SP4 已知限制,见 task-12-brief Step 3)。
  const pinItems = await Promise.all(pins.map(async (p) => {
    try {
      const msgs = await call("get_chat_msgs", { chatId: p.channel_chat_id });
      const msg = msgs.find((m) => m.msg_id === p.msg_id);
      return msg ? { ...p, msg } : null;
    } catch { return null; }
  }));
  const valid = pinItems.filter(Boolean);
  if (valid.length === 0) {
    body.innerHTML = `<div class="rd-empty">无置顶消息</div>`;
    return;
  }
  body.innerHTML = valid.map((p) => `
    <div class="rd-pin-item" data-chat="${p.channel_chat_id}" data-msg="${p.msg_id}">
      <div class="rd-pin-from">${escapeHtml(p.msg.from_name)}</div>
      <div class="rd-pin-text">${escapeHtml((p.msg.text || "").slice(0, 60))}</div>
      <div class="rd-pin-time">${formatRelativeTime(p.msg.ts)}</div>
    </div>
  `).join("");
  // 点击跳转:切换 chat → 渲染 → 滚动到目标消息并短暂高亮
  body.querySelectorAll(".rd-pin-item").forEach((el) => {
    el.addEventListener("click", async () => {
      const chatId = Number(el.dataset.chat);
      const msgId = Number(el.dataset.msg);
      state.currentChatId = chatId;
      const { renderChatView } = await import("../chat/chatView.js");
      await renderChatView(chatId);
      setTimeout(() => {
        const msgEl = document.querySelector(`[data-msg="${msgId}"]`);
        if (msgEl) {
          msgEl.scrollIntoView({ behavior: "smooth" });
          msgEl.style.background = "#1f1f1f";
          setTimeout(() => { msgEl.style.background = ""; }, 2000);
        }
      }, 200);
    });
  });
}

// Task 12: pin tab 时间显示用相对时间格式。简单实现,避免引入额外 utils 模块。
function formatRelativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts * 1000;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return Math.floor(diff / 60000) + "分钟前";
  if (diff < 86400000) return Math.floor(diff / 3600000) + "小时前";
  return Math.floor(diff / 86400000) + "天前";
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

import { call } from "../api.js";
import { state } from "../state.js";

export function renderRightDrawer() {
  const drawer = document.getElementById("right-drawer");
  if (!drawer) return;
  drawer.className = state.rightDrawerOpen ? "right-drawer" : "right-drawer collapsed";
  if (!state.rightDrawerOpen) return;
  const tabs = ["members", "pin", "search"].map((t) => {
    const cls = state.rightDrawerTab === t ? "rd-tab active" : "rd-tab";
    return `<span class="${cls}" data-tab="${t}">${t}</span>`;
  }).join("");
  drawer.innerHTML = `<div class="rd-tabs">${tabs}</div><div id="rd-body" style="flex:1;overflow-y:auto"></div>`;
  drawer.querySelectorAll(".rd-tab").forEach((el) => {
    el.addEventListener("click", () => {
      state.rightDrawerTab = el.dataset.tab;
      renderRightDrawer();
    });
  });
  renderRdBody();
}

async function renderRdBody() {
  const body = document.getElementById("rd-body");
  if (!body) return;
  if (state.rightDrawerTab === "members") {
    await renderMembers(body);
  } else if (state.rightDrawerTab === "pin") {
    await renderPins(body);
  } else {
    body.innerHTML = `<div class="rd-group">SEARCH</div><div style="padding:8px 16px;color:#555">搜索功能将在后续子项目实现</div>`;
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
    const html = order
      .filter((name) => grouped.has(name) && grouped.get(name).length > 0)
      .map((name) => {
        const list = grouped.get(name);
        const items = list.map((m) => `
          <div class="rd-member ${m.is_self ? '' : 'muted'}">
            <div class="rd-avatar">${escapeHtml(m.name.charAt(0).toUpperCase())}</div>
            <span class="rd-name">${escapeHtml(m.name)}</span>
          </div>
        `).join("");
        return `<div class="rd-group">${escapeHtml(name.toUpperCase())} · ${list.length}</div>${items}`;
      }).join("");
    body.innerHTML = html || `<div style="padding:16px;color:#555">无成员</div>`;
  } catch (e) {
    body.innerHTML = `<div style="padding:16px;color:#555">加载失败</div>`;
  }
}

async function renderPins(body) {
  if (!state.currentChatId) {
    body.innerHTML = `<div style="padding:16px;color:#555">未选中频道</div>`;
    return;
  }
  try {
    const pins = await call("get_channel_pins", { chatId: state.currentChatId });
    if (pins.length === 0) {
      body.innerHTML = `<div style="padding:16px;color:#555">无置顶消息</div>`;
      return;
    }
    body.innerHTML = pins.map((p) => `<div style="padding:6px 16px;font-size:10px;color:#888;border-bottom:1px solid #1a1a1a">msg #${p.msg_id} · by ${p.pinned_by}</div>`).join("");
  } catch {
    body.innerHTML = `<div style="padding:16px;color:#555">加载失败</div>`;
  }
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

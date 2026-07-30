import { call } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../toast.js";
import { renderChatView } from "../chat/chatView.js";
import { openChannelCreateDialog } from "../dialogs/channelCreate.js";
import { showContextMenu } from "../dialogs/contextMenu.js";
import { renderRightDrawer } from "./rightDrawer.js";
import { renderHomeView } from "../dialogs/homeView.js";
import { saveState } from "../persist.js";

export async function refreshChannels() {
  if (state.currentWsId == null) {
    state.channels = [];
    return;
  }
  try {
    state.channels = await call("list_channels", { workspaceId: state.currentWsId });
  } catch {
    state.channels = [];
  }
  try {
    const ws = state.workspaces.find((w) => w.id === state.currentWsId);
    if (ws?.master_chat_id) {
      const info = await call("get_chat_info", { chatId: ws.master_chat_id });
      state.wsMembers[state.currentWsId] = info.members?.length || 0;
    }
  } catch {}
}

export async function renderChannelTree() {
  const tree = document.getElementById("channel-tree");
  if (!tree) return;
  tree.className = "nav-tree";
  if (state.currentApp === "work") {
    await renderWorkNavTree(tree);
    // 若已有选中的 card 频道，自动渲染主区域（供 shell.js 初始化路由）
    if (state.currentChatId != null) {
      renderMain();
    }
    return;
  }
  if (state.currentApp !== "chat") {
    // Inbox 等其他模式占位（SP6 启用）
    tree.innerHTML = `
      <div class="nav-placeholder">
        <div class="nav-placeholder-title">${escapeHtml(state.currentApp)}</div>
        <div class="nav-placeholder-desc">该模式将在后续 SP 启用</div>
      </div>
    `;
    return;
  }
  const ws = state.workspaces.find((w) => w.id === state.currentWsId);
  if (!ws) {
    tree.innerHTML = `<div class="empty">未选中 workspace</div>`;
    return;
  }
  const collapsed = JSON.parse(localStorage.getItem("collapsedCategories") || "{}");
  const wsCats = collapsed[state.currentWsId] || {};
  state.collapsedCategories = collapsed;
  // 按 category 分组
  const byCategory = {};
  for (const ch of state.channels) {
    if (!byCategory[ch.category]) byCategory[ch.category] = [];
    byCategory[ch.category].push(ch);
  }
  const categories = Object.keys(byCategory).sort();
  const catHtml = categories.map((cat) => {
    const isCollapsed = wsCats[cat] === true;
    const arrow = isCollapsed ? "▸" : "▾";
    const chans = byCategory[cat].map((ch) => {
      const active = state.currentChatId === ch.chat_id ? "active" : "";
      const unread = ch.unread > 0 ? `<span class="ct-unread">${ch.unread}</span>` : "";
      return `<div class="ct-channel ${active}" data-id="${ch.chat_id}" title="${escapeAttr(ch.topic || '')}" ${isCollapsed ? 'style="display:none"' : ''}>${escapeHtml(ch.name)}${unread}</div>`;
    }).join("");
    return `
      <div class="ct-category" data-cat="${escapeAttr(cat)}">
        <span>${escapeHtml(cat)}</span><span>${arrow}</span>
      </div>
      ${chans}
    `;
  }).join("");
  tree.innerHTML = `
    <div class="ct-header">
      <div class="ct-name">${escapeHtml(ws.name)}</div>
      <div class="ct-sub">${escapeHtml(ws.icon || "")} · ${state.wsMembers[state.currentWsId] || 0} members</div>
    </div>
    <div class="ct-list">${catHtml}</div>
    <div class="ct-user">
      <div class="ct-avatar">${state.self ? escapeHtml(state.self.name?.charAt(0) || "?") : "?"}</div>
      <div>
        <div class="ct-username">${escapeHtml(state.self?.name || "me")}</div>
        <div class="ct-userrole">core</div>
      </div>
    </div>
  `;
  tree.innerHTML += `
    <div class="nav-view-switcher">
      <span>视图：消息流</span>
      <span class="nav-view-icon" title="切换视图（SP7）">⇄</span>
    </div>
  `;
  tree.querySelectorAll(".ct-channel").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = Number(el.dataset.id);
      state.currentChatId = id;
      saveState();
      renderChannelTree();
      await renderChatView(id);
    });
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const id = Number(el.dataset.id);
      showContextMenu(e.clientX, e.clientY, [
        {
          label: "频道设置",
          action: () => {
            state.rightDrawerOpen = true;
            state.rightDrawerTab = "settings";
            renderRightDrawer();
          },
        },
        {
          label: "离开频道",
          action: async () => {
            if (!confirm("离开此频道?")) return;
            try {
              await call("leave_channel", { chatId: id });
              await refreshChannels();
              renderChannelTree();
              if (state.currentChatId === id) {
                state.currentChatId = null;
                document.getElementById("chat-main").innerHTML = `<div class="empty">选择一个频道</div>`;
              }
              showToast("已离开");
            } catch (err) {
              showToast(err.message || String(err));
            }
          },
        },
      ]);
    });
  });
  // category 折叠（点击切换，持久化到 localStorage）
  tree.querySelectorAll(".ct-category").forEach((el) => {
    el.addEventListener("click", () => {
      const catName = el.dataset.cat;
      const collapsed = JSON.parse(localStorage.getItem("collapsedCategories") || "{}");
      if (!collapsed[state.currentWsId]) collapsed[state.currentWsId] = {};
      collapsed[state.currentWsId][catName] = !collapsed[state.currentWsId][catName];
      localStorage.setItem("collapsedCategories", JSON.stringify(collapsed));
      state.collapsedCategories = collapsed;
      renderChannelTree();
    });
  });
  // 右键 category 新建频道
  tree.querySelectorAll(".ct-category").forEach((el) => {
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openChannelCreateDialog(el.dataset.cat, async () => {
        await refreshChannels();
        renderChannelTree();
      });
    });
  });
  const ctUser = tree.querySelector(".ct-user");
  if (ctUser) {
    ctUser.style.cursor = "pointer";
    ctUser.onclick = async () => {
      state.homeMode = true;
      state.currentChatId = null;
      state.currentWsId = null;
      await renderHomeView();
      state.rightDrawerOpen = true;
      state.rightDrawerTab = "settings";
      renderRightDrawer();
    };
  }
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

// SP5 Task 5: Work 模式 nav tree —— 列出当前 workspace 下 space_type='card' 的频道
async function renderWorkNavTree(tree) {
  if (state.currentWsId == null) {
    tree.innerHTML = `
      <div class="nav-placeholder">
        <div class="nav-placeholder-title">Work</div>
        <div class="nav-placeholder-desc">选择一个 workspace 查看协作频道</div>
      </div>
    `;
    return;
  }
  // 过滤出 space_type='card' 的频道（并行查询，失败时按 chat 处理）
  const channels = state.channels || [];
  let cardChannels = [];
  if (channels.length > 0) {
    try {
      const typed = await Promise.all(
        channels.map((ch) =>
          call("get_channel_space_type", { chatId: ch.chat_id })
            .then((st) => ({ ch, st }))
            .catch(() => ({ ch, st: "chat" }))
        )
      );
      cardChannels = typed.filter((x) => x.st === "card").map((x) => x.ch);
    } catch {
      cardChannels = [];
    }
  }
  if (cardChannels.length === 0) {
    tree.innerHTML = `
      <div class="nav-placeholder">
        <div class="nav-placeholder-title">Work</div>
        <div class="nav-placeholder-desc">该 workspace 暂无协作频道</div>
      </div>
    `;
    return;
  }
  const ws = state.workspaces.find((w) => w.id === state.currentWsId);
  const itemsHtml = cardChannels.map((ch) => `
    <div class="nav-item ${state.currentChatId === ch.chat_id ? "active" : ""}" data-chat="${ch.chat_id}" title="${escapeAttr(ch.topic || "")}">
      <span class="nav-icon">▣</span> ${escapeHtml(ch.name)}
    </div>
  `).join("");
  tree.innerHTML = `
    <div class="nav-header">${escapeHtml(ws?.name || "Work")}</div>
    <div class="nav-group">
      <div class="nav-group-title"><span class="caret">▾</span> 协作频道</div>
      <div class="nav-children">
        ${itemsHtml}
      </div>
    </div>
  `;
  tree.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", async () => {
      state.currentChatId = Number(item.dataset.chat);
      state.currentView = "kanban";
      state.currentCardId = null;
      // Work 模式 right drawer 是 Card 详情（Task 8），切换频道时关闭避免显示旧成员面板
      state.rightDrawerOpen = false;
      renderRightDrawer();
      saveState();
      renderChannelTree();
      await renderMain();
    });
  });
}

// SP5 Task 5: 按 state.currentView 渲染主区域。kanban.js/list.js 由 Task 6/7 创建，
// 在此之前 dynamic import 运行时失败，捕获后显示开发中提示以避免白屏。
export async function renderMain() {
  const main = document.getElementById("chat-main");
  if (!main) return;
  if (state.currentChatId == null) {
    main.innerHTML = `<div class="empty">选择一个协作频道</div>`;
    return;
  }
  if (state.currentView === "kanban") {
    try {
      // 用变量路径让 Rollup 无法静态分析（kanban.js 由 Task 6 创建）
      const mod = "../work/kanban.js";
      const { renderKanban } = await import(/* @vite-ignore */ mod);
      await renderKanban(state.currentChatId);
    } catch (e) {
      main.innerHTML = `<div class="empty">看板视图将在 SP5-T6 实现（kanban.js）</div>`;
      console.warn("[renderMain] kanban import failed:", e);
    }
  } else if (state.currentView === "list") {
    try {
      // 用变量路径让 Rollup 无法静态分析（list.js 由 Task 7 创建）
      const mod = "../work/list.js";
      const { renderList } = await import(/* @vite-ignore */ mod);
      await renderList(state.currentChatId);
    } catch (e) {
      main.innerHTML = `<div class="empty">列表视图将在 SP5-T7 实现（list.js）</div>`;
      console.warn("[renderMain] list import failed:", e);
    }
  }
}

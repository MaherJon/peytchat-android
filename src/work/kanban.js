import { call } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../toast.js";
import { renderCardDetail } from "./cardDetail.js";

// SP5 Task 6: 协作看板视图。三列 (Todo / In Progress / Done)，支持卡片状态
// 切换、新建卡片、点击卡片打开详情（Task 8 的 renderCardDetail）。
// 由 channelTree.js 的 renderMain 通过 dynamic import 调用，渲染到 #chat-main。
export async function renderKanban(chatId) {
  const main = document.getElementById("chat-main");
  if (!main) return;
  // 加载 cards
  let cards = [];
  try {
    cards = await call("list_cards", { workspaceId: state.currentWsId, chatId });
    state.cards = cards;
  } catch (e) {
    showToast("加载卡片失败: " + e.message);
  }
  const todoCards = cards.filter((c) => c.status === "todo");
  const ipCards = cards.filter((c) => c.status === "in_progress");
  const doneCards = cards.filter((c) => c.status === "done");

  main.innerHTML = `
    <div class="main-header">
      <div>
        <div class="main-title">协作看板</div>
        <div class="main-subtitle">${cards.length} 个卡片</div>
      </div>
      <div class="main-actions">
        <div class="view-toggle">
          <button class="view-btn active">看板</button>
          <button class="view-btn" onclick="window.__switchToList(${chatId})">列表</button>
        </div>
        <button class="btn btn-primary" onclick="window.__newCard(${chatId})">+ 新建</button>
      </div>
    </div>
    <div class="main-body">
      <div class="kanban">
        ${renderColumn("Todo", todoCards, "todo", chatId)}
        ${renderColumn("In Progress", ipCards, "in_progress", chatId)}
        ${renderColumn("Done", doneCards, "done", chatId)}
      </div>
    </div>
  `;
  // 绑定卡片点击
  main.querySelectorAll(".card").forEach((el) => {
    el.onclick = () => {
      const cardId = Number(el.dataset.cardId);
      state.currentCardId = cardId;
      main.querySelectorAll(".card").forEach((c) => c.classList.remove("selected"));
      el.classList.add("selected");
      renderCardDetail(cardId);
    };
  });
  // 绑定状态切换按钮
  main.querySelectorAll(".card-status-btn").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const cardId = Number(btn.dataset.cardId);
      const newStatus = btn.dataset.status;
      try {
        await call("update_card", { cardId, status: newStatus });
        await renderKanban(chatId);
      } catch (err) { showToast("更新状态失败: " + err.message); }
    };
  });
  // 暴露全局函数(简化,避免 import 循环)
  window.__switchToList = async (cid) => {
    state.currentView = "list";
    // list.js 由 Task 7 创建，用变量路径 + @vite-ignore 绕过构建期静态解析
    const mod = "./list.js";
    const { renderList } = await import(/* @vite-ignore */ mod);
    await renderList(cid);
  };
  window.__newCard = async (cid) => {
    const title = prompt("卡片标题:");
    if (!title) return;
    try {
      await call("create_card", {
        workspaceId: state.currentWsId,
        chatId: cid,
        type_: "task",
        title,
        description: null,
        assigneeContactId: null,
        dueDate: null,
      });
      showToast("已创建");
      await renderKanban(cid);
    } catch (e) { showToast("创建失败: " + e.message); }
  };
}

function renderColumn(title, cards, status, chatId) {
  return `
    <div class="kanban-col">
      <div class="kanban-col-header">
        <span class="kanban-col-title">${title}</span>
        <span class="kanban-col-count">${cards.length}</span>
      </div>
      <div class="kanban-col-body">
        ${cards.map((c) => renderCard(c, status)).join("")}
        <div class="card-add" onclick="window.__newCard(${chatId})">+ 添加卡片</div>
      </div>
    </div>
  `;
}

function renderCard(c, currentStatus) {
  const dueStr = c.due_date ? new Date(c.due_date * 1000).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : "";
  const isOverdue = c.due_date && c.due_date < Date.now() / 1000;
  const assigneeInitial = c.assignee_name ? c.assignee_name[0].toUpperCase() : "";
  return `
    <div class="card" data-card-id="${c.id}">
      <div class="card-title">${escapeHtml(c.title)}</div>
      <div class="card-meta">
        <span class="card-type ${c.type === 'task' ? 'task' : ''}">${c.type === 'task' ? 'Task' : 'Card'}</span>
        ${dueStr ? `<span class="card-due ${isOverdue ? 'overdue' : ''}">${dueStr}</span>` : ""}
        ${assigneeInitial ? `<span class="card-assignee">${escapeHtml(assigneeInitial)}</span>` : ""}
      </div>
      <div class="card-status-row">
        <button class="card-status-btn ${currentStatus === 'todo' ? 'active' : ''}" data-card-id="${c.id}" data-status="todo" title="Todo">·</button>
        <button class="card-status-btn ${currentStatus === 'in_progress' ? 'active' : ''}" data-card-id="${c.id}" data-status="in_progress" title="In Progress">·</button>
        <button class="card-status-btn ${currentStatus === 'done' ? 'active' : ''}" data-card-id="${c.id}" data-status="done" title="Done">·</button>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

import { call } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../toast.js";
import { renderCardDetail } from "./cardDetail.js";

// SP5 Task 7: 协作列表视图。表格形式展示卡片,支持列头排序、点击卡片打开
// 详情(Task 8 的 renderCardDetail)、切换到看板(Task 6 的 renderKanban)。
// 由 channelTree.js 的 renderMain 通过 dynamic import 调用,渲染到 #chat-main。
//
// 排序策略:brief 要求"排序后重新调用 renderList(chatId) 刷新"。但 renderList
// 内会重新调 list_cards 覆盖 state.cards,直接重排会被覆盖。因此用模块级
// currentSortField 记忆当前排序字段,renderList 在 fetch 后应用排序再渲染。
// 这样排序 / 新建 / 删除(由 cardDetail.js 调 renderList 触发)都能正确呈现。
let currentSortField = null;
export async function renderList(chatId) {
  const main = document.getElementById("chat-main");
  if (!main) return;
  let cards = [];
  try {
    cards = await call("list_cards", { workspaceId: state.currentWsId, chatId });
    state.cards = cards;
  } catch (e) {
    showToast("加载失败: " + e.message);
    cards = state.cards || [];
  }
  // 应用当前排序(若有)
  if (currentSortField && cards.length) {
    cards = [...cards].sort((a, b) => {
      const va = a[currentSortField] || "";
      const vb = b[currentSortField] || "";
      return String(va).localeCompare(String(vb));
    });
    state.cards = cards;
  }

  main.innerHTML = `
    <div class="main-header">
      <div>
        <div class="main-title">协作列表</div>
        <div class="main-subtitle">${cards.length} 个卡片</div>
      </div>
      <div class="main-actions">
        <div class="view-toggle">
          <button class="view-btn" onclick="window.__switchToKanban(${chatId})">看板</button>
          <button class="view-btn active">列表</button>
        </div>
        <button class="btn btn-primary" onclick="window.__newCard(${chatId})">+ 新建</button>
      </div>
    </div>
    <div class="main-body">
      <div class="list-view">
        <table class="list-table">
          <thead>
            <tr>
              <th class="th-sortable ${currentSortField === 'title' ? 'sorted' : ''}" onclick="window.__sortList('title')">标题</th>
              <th>类型</th>
              <th class="th-sortable ${currentSortField === 'status' ? 'sorted' : ''}" onclick="window.__sortList('status')">状态</th>
              <th class="th-sortable ${currentSortField === 'assignee_name' ? 'sorted' : ''}" onclick="window.__sortList('assignee_name')">指派</th>
              <th class="th-sortable ${currentSortField === 'due_date' ? 'sorted' : ''}" onclick="window.__sortList('due_date')">截止</th>
              <th class="th-sortable ${currentSortField === 'created_at' ? 'sorted' : ''}" onclick="window.__sortList('created_at')">创建</th>
            </tr>
          </thead>
          <tbody>
            ${cards.map((c) => renderRow(c)).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
  // 绑定行点击 → 打开详情
  main.querySelectorAll("tbody tr").forEach((tr) => {
    tr.onclick = () => {
      const cardId = Number(tr.dataset.cardId);
      state.currentCardId = cardId;
      main.querySelectorAll("tr").forEach((r) => r.classList.remove("selected"));
      tr.classList.add("selected");
      renderCardDetail(cardId);
    };
  });
  // 切换到看板:用变量路径 + @vite-ignore 绕过 Rollup 构建期静态解析
  window.__switchToKanban = async (cid) => {
    state.currentView = "kanban";
    const mod = "./kanban.js";
    const { renderKanban } = await import(/* @vite-ignore */ mod);
    await renderKanban(cid);
  };
  // 新建卡片:prompt + create_card,创建后重新拉取并应用排序
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
      await renderList(cid);
    } catch (e) { showToast("创建失败: " + e.message); }
  };
  // 列头排序:记忆字段后重新调用 renderList(chatId) 刷新(按 brief 要求)
  window.__sortList = (field) => {
    currentSortField = field;
    renderList(chatId);
  };
}

function renderRow(c) {
  const statusClass = c.status;
  const dueStr = c.due_date ? new Date(c.due_date * 1000).toLocaleDateString("zh-CN") : "—";
  const createdStr = c.created_at ? new Date(c.created_at * 1000).toLocaleDateString("zh-CN") : "—";
  return `
    <tr data-card-id="${c.id}">
      <td class="col-title">${escapeHtml(c.title)}</td>
      <td><span class="col-type ${c.type === 'task' ? 'task' : ''}">${c.type === 'task' ? 'Task' : 'Card'}</span></td>
      <td class="col-status ${statusClass}"><span class="dot"></span>${statusLabel(c.status)}</td>
      <td>${escapeHtml(c.assignee_name || "—")}</td>
      <td>${dueStr}</td>
      <td>${createdStr}</td>
    </tr>
  `;
}

function statusLabel(s) {
  return { todo: "Todo", in_progress: "In Progress", done: "Done" }[s] || s;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

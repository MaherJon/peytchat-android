import { call } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../toast.js";
import { saveState } from "../persist.js";

// SP5 Task 8: Card 详情面板。渲染到 #right-drawer，由 rightDrawer.js 在
// Work 模式 + state.currentCardId 有值时通过 dynamic import 调用。
// 标题/描述用 contenteditable，渲染后用 textContent 赋值以防 XSS。
export async function renderCardDetail(cardId) {
  const drawer = document.getElementById("right-drawer");
  if (!drawer) return;
  let card;
  try {
    card = await call("get_card", { cardId });
  } catch (e) {
    drawer.innerHTML = `<div class="detail-empty">加载失败</div>`;
    return;
  }
  const dueStr = card.due_date ? new Date(card.due_date * 1000).toISOString().split("T")[0] : "";
  drawer.innerHTML = `
    <div class="detail-tabs">
      <div class="detail-tab active">Card</div>
      <span class="detail-flex"></span>
      <span class="detail-close" id="card-close" title="关闭">✕</span>
    </div>
    <div class="detail-body">
      <div class="card-detail-title" contenteditable="true" id="card-title"></div>
      <div class="card-detail-row">
        <div class="card-detail-label">类型</div>
        <div class="card-detail-value"><span class="card-type ${card.type === 'task' ? 'task' : ''}">${card.type === 'task' ? 'Task' : 'Card'}</span></div>
      </div>
      <div class="card-detail-row">
        <div class="card-detail-label">状态</div>
        <div class="card-detail-value">
          <select id="card-status">
            <option value="todo" ${card.status === 'todo' ? 'selected' : ''}>Todo</option>
            <option value="in_progress" ${card.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
            <option value="done" ${card.status === 'done' ? 'selected' : ''}>Done</option>
          </select>
        </div>
      </div>
      <div class="card-detail-row">
        <div class="card-detail-label">指派</div>
        <div class="card-detail-value">${escapeHtml(card.assignee_name || "未指派")}</div>
      </div>
      <div class="card-detail-row">
        <div class="card-detail-label">截止</div>
        <div class="card-detail-value"><input type="date" id="card-due" value="${dueStr}" /></div>
      </div>
      <div class="card-detail-row">
        <div class="card-detail-label">描述</div>
        <div class="card-detail-desc" contenteditable="true" id="card-desc"></div>
      </div>
      <button class="btn btn-primary" id="card-save">保存</button>
      <button class="btn btn-ghost" id="card-delete">删除</button>
    </div>
  `;
  // 防止 XSS：contenteditable 元素用 textContent 设置初始内容
  drawer.querySelector("#card-title").textContent = card.title || "";
  drawer.querySelector("#card-desc").textContent = card.description || "";
  // M8 修复：顶部 ✕ 关闭按钮 — 清 currentCardId + 收起抽屉，让用户回到全宽看板。
  drawer.querySelector("#card-close").addEventListener("click", async () => {
    state.currentCardId = null;
    state.rightDrawerOpen = false;
    saveState();
    const { renderRightDrawer } = await import("../shell/rightDrawer.js");
    renderRightDrawer();
  });
  // 保存：只传实际改动的字段。
  // - Option<T> 字段 (title/status): 改动则传新值, 不改则 omit (undefined → JSON 缺失 → Rust None)
  // - Option<Option<T>> 字段 (description/dueDate/assigneeContactId):
  //   不改 → omit (undefined → None, 不更新); 清空 → null (Some(None), 清空); 更新 → value (Some(Some(v)))
  // assigneeContactId 在本面板无编辑 UI, 永远 omit (避免误清空)
  drawer.querySelector("#card-save").onclick = async () => {
    try {
      const title = drawer.querySelector("#card-title").textContent.trim();
      const status = drawer.querySelector("#card-status").value;
      const dueVal = drawer.querySelector("#card-due").value;
      const desc = drawer.querySelector("#card-desc").textContent.trim();

      const payload = { cardId };
      if (title !== (card.title || "")) payload.title = title;
      if (status !== card.status) payload.status = status;
      // description: 对比原始值 (card.description 可能为 null/undefined)
      if (desc !== (card.description || "")) {
        payload.description = desc || null;
      }
      // dueDate: 对比原始日期字符串 (dueStr, UTC yyyy-mm-dd)
      if (dueVal !== dueStr) {
        payload.dueDate = dueVal ? Math.floor(new Date(dueVal).getTime() / 1000) : null;
      }
      await call("update_card", payload);
      showToast("已保存");
    } catch (e) { showToast("保存失败: " + e.message); }
  };
  // 删除
  drawer.querySelector("#card-delete").onclick = async () => {
    if (!confirm("删除此卡片?")) return;
    try {
      await call("delete_card", { cardId });
      showToast("已删除");
      state.currentCardId = null;
      drawer.innerHTML = `<div class="detail-empty">选择一个卡片</div>`;
      // 刷新看板/列表视图（dynamic import 避免 static import 循环）。
      // Task 6/7 的 kanban.js/list.js 尚未创建，用变量路径绕过 Rollup 构建期
      // 静态解析；运行时若文件不存在则 catch 内提示删除失败（卡片实际已删除）。
      const view = state.currentView;
      if (view === "kanban") {
        const mod = "./kanban.js";
        const { renderKanban } = await import(/* @vite-ignore */ mod);
        await renderKanban(state.currentChatId);
      } else if (view === "list") {
        const mod = "./list.js";
        const { renderList } = await import(/* @vite-ignore */ mod);
        await renderList(state.currentChatId);
      }
    } catch (e) { showToast("删除失败: " + e.message); }
  };
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

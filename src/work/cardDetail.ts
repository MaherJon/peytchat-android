import { call } from '../api.js';
import { state } from '../state.js';
import { showToast } from '../toast.js';
import { saveState } from '../persist.js';
import { iconSvg } from '../components/icon.js';
import { showInlineConfirm } from '../components/inlineConfirm.js';
import type { CardDto } from '../types.js';

// SP5 Task 8 → Task 15: Card 详情面板。渲染到 #right-drawer,由 rightDrawer.ts 在
// Work 模式 + state.currentCardId 有值时通过 dynamic import 调用。
// 标题/描述用 contenteditable,渲染后用 textContent 赋值以防 XSS。
//
// 零弹窗约束:删除改用 showInlineConfirm (替代 confirm),关闭按钮 ✕ 改用 SVG。
export async function renderCardDetail(cardId: number): Promise<void> {
  const drawer = document.getElementById('right-drawer');
  if (!drawer) return;
  let card: CardDto;
  try {
    card = await call<CardDto>('get_card', { cardId });
  } catch (e) {
    drawer.innerHTML = `<div class="detail-empty">加载失败</div>`;
    return;
  }
  const dueStr = card.due_date ? new Date(card.due_date * 1000).toISOString().split('T')[0] : '';
  drawer.innerHTML = `
    <div class="detail-tabs">
      <div class="detail-tab active">Card</div>
      <span class="detail-flex"></span>
      <span class="detail-close" id="card-close" title="关闭">${iconSvg('x', { width: 16, height: 16 })}</span>
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
        <div class="card-detail-value">${escapeHtml(card.assignee_name || '未指派')}</div>
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
  // 防止 XSS:contenteditable 元素用 textContent 设置初始内容
  drawer.querySelector('#card-title')!.textContent = card.title || '';
  drawer.querySelector('#card-desc')!.textContent = card.description || '';
  // M8 修复:顶部 ✕ 关闭按钮 — 清 currentCardId + 收起抽屉,让用户回到全宽看板。
  drawer.querySelector<HTMLElement>('#card-close')!.addEventListener('click', async () => {
    state.currentCardId = null;
    state.rightDrawerOpen = false;
    saveState();
    const { renderRightDrawer } = await import('../shell/rightDrawer.js');
    renderRightDrawer();
  });
  // 保存:只传实际改动的字段。
  // - Option<T> 字段 (title/status): 改动则传新值, 不改则 omit (undefined → JSON 缺失 → Rust None)
  // - Option<Option<T>> 字段 (description/dueDate/assigneeContactId):
  //   不改 → omit (undefined → None, 不更新); 清空 → null (Some(None), 清空); 更新 → value (Some(Some(v)))
  // assigneeContactId 在本面板无编辑 UI, 永远 omit (避免误清空)
  drawer.querySelector<HTMLElement>('#card-save')!.onclick = async () => {
    try {
      const title = drawer.querySelector<HTMLInputElement>('#card-title')!.textContent!.trim();
      const status = drawer.querySelector<HTMLSelectElement>('#card-status')!.value;
      const dueVal = drawer.querySelector<HTMLInputElement>('#card-due')!.value;
      const desc = drawer.querySelector<HTMLInputElement>('#card-desc')!.textContent!.trim();

      const payload: Record<string, unknown> = { cardId };
      if (title !== (card.title || '')) payload.title = title;
      if (status !== card.status) payload.status = status;
      // description: 对比原始值 (card.description 可能为 null/undefined)
      if (desc !== (card.description || '')) {
        payload.description = desc || null;
      }
      // dueDate: 对比原始日期字符串 (dueStr, UTC yyyy-mm-dd)
      if (dueVal !== dueStr) {
        payload.dueDate = dueVal ? Math.floor(new Date(dueVal).getTime() / 1000) : null;
      }
      await call('update_card', payload);
      showToast('已保存');
    } catch (e) {
      showToast('保存失败: ' + (e instanceof Error ? e.message : String(e)));
    }
  };
  // 删除:showInlineConfirm 替代 confirm()。确认后清抽屉 + 刷新当前视图。
  const deleteBtn = drawer.querySelector<HTMLElement>('#card-delete')!;
  deleteBtn.onclick = () => {
    showInlineConfirm(deleteBtn, {
      message: '删除此卡片?',
      confirmLabel: '确认删除',
      successLabel: '已删除卡片',
      onConfirm: async () => {
        await call('delete_card', { cardId });
        state.currentCardId = null;
        drawer.innerHTML = `<div class="detail-empty">选择一个卡片</div>`;
        // 刷新看板/列表视图 (dynamic import 避免 static import 循环)
        const view = state.currentView;
        if (view === 'kanban') {
          const { renderKanban } = await import('./kanban.js');
          await renderKanban(state.currentChatId!);
        } else if (view === 'list') {
          const { renderList } = await import('./list.js');
          await renderList(state.currentChatId!);
        }
      },
    });
  };
}

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
  );
}

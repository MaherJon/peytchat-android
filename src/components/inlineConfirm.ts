import { showToast } from '../toast.js';

export interface InlineConfirmOpts {
  message: string;
  confirmLabel?: string;
  undoLabel?: string;
  onConfirm: () => Promise<void> | void;
  onUndo?: () => Promise<void> | void;
  autoCancelMs?: number;
}

export function showInlineConfirm(el: HTMLElement, opts: InlineConfirmOpts): void {
  const originalHtml = el.innerHTML;
  const confirmLabel = opts.confirmLabel ?? '确认删除';
  el.classList.add('inline-confirm-active');
  el.innerHTML = `
    <div class="inline-confirm-msg">${escapeHtml(opts.message)}</div>
    <div class="inline-confirm-actions">
      <button class="inline-confirm-yes">${escapeHtml(confirmLabel)}</button>
      <button class="inline-confirm-no">取消</button>
    </div>
  `;
  const yesBtn = el.querySelector<HTMLButtonElement>('.inline-confirm-yes')!;
  const noBtn = el.querySelector<HTMLButtonElement>('.inline-confirm-no')!;

  const timer = setTimeout(cancel, opts.autoCancelMs ?? 3000);

  function cancel(): void {
    clearTimeout(timer);
    el.classList.remove('inline-confirm-active');
    el.innerHTML = originalHtml;
  }

  yesBtn.addEventListener('click', async () => {
    clearTimeout(timer);
    el.innerHTML = originalHtml;
    el.classList.remove('inline-confirm-active');
    try {
      await opts.onConfirm();
      if (opts.onUndo) {
        showUndoToast(opts.undoLabel ?? '撤销', opts.onUndo);
      } else {
        showToast('已删除');
      }
    } catch {
      showToast('操作失败');
    }
  });
  noBtn.addEventListener('click', cancel);
}

function showUndoToast(label: string, onUndo: () => Promise<void> | void): void {
  const toast = document.createElement('div');
  toast.className = 'toast toast-with-action';
  toast.innerHTML = `<span>已删除</span><button class="toast-action">${escapeHtml(label)}</button>`;
  document.body.appendChild(toast);
  toast.classList.add('show');
  const btn = toast.querySelector<HTMLButtonElement>('.toast-action')!;
  const dismiss = (): void => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  };
  btn.addEventListener('click', async () => {
    try {
      await onUndo();
    } catch {
      showToast('撤销失败');
    }
    dismiss();
  });
  setTimeout(dismiss, 5000);
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

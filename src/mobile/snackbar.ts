// M-A3: Snackbar Manager
// 替代桌面 toast 的 Material Snackbar,支持 action/undo/retry/dismiss 和队列。
// 桌面端继续使用 src/toast.ts 的 showToast,不受影响。

import { applyTransition, animateExit, EASING, DURATION, prefersReducedMotion } from './animation.js';
import type { SnackbarOpts } from './types.js';

// ── 队列系统 ──────────────────────────────────────────────────────────
interface QueuedSnackbar {
  message: string;
  opts: SnackbarOpts;
}

const queue: QueuedSnackbar[] = [];
let currentSnackbar: HTMLElement | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

const DEFAULT_DURATION = 4000;
const ACTION_DURATION = 10000;

// ── API ────────────────────────────────────────────────────────────────

/**
 * 显示 Snackbar。自动排队:若已有 Snackbar 显示,新消息入队等待。
 *
 * @example
 * showSnackbar('消息已删除', { action: { label: '撤销', onClick: () => undo() } });
 * showSnackbar('发送失败', { action: { label: '重试', onClick: () => retry() } });
 * showSnackbar('操作成功');
 */
export function showSnackbar(message: string, opts: SnackbarOpts = {}): void {
  if (currentSnackbar) {
    // 已有显示中,入队
    queue.push({ message, opts });
    return;
  }
  renderSnackbar(message, opts);
}

/**
 * 立即关闭当前 Snackbar 并显示队列中的下一条。
 */
export function dismissSnackbar(): void {
  if (!currentSnackbar) return;

  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }

  const snackbar = currentSnackbar;
  currentSnackbar = null;

  if (prefersReducedMotion()) {
    snackbar.remove();
    showNext();
    return;
  }

  animateExit(snackbar, DURATION.sheetOut).then(() => {
    snackbar.remove();
    showNext();
  });
}

/**
 * 清空队列并关闭当前 Snackbar。
 */
export function clearSnackbarQueue(): void {
  queue.length = 0;
  dismissSnackbar();
}

// ── 渲染 ──────────────────────────────────────────────────────────────

function renderSnackbar(message: string, opts: SnackbarOpts): void {
  const snackbar = document.createElement('div');
  snackbar.className = 'snackbar';
  snackbar.setAttribute('role', 'status');
  snackbar.setAttribute('aria-live', 'polite');

  const actionHtml = opts.action
    ? `<button class="snackbar-action" type="button">${escapeHtml(opts.action.label)}</button>`
    : '';

  const dismissHtml = `<button class="snackbar-dismiss" type="button" aria-label="关闭">&times;</button>`;

  snackbar.innerHTML = `
    <span class="snackbar-text">${escapeHtml(message)}</span>
    ${actionHtml}
    ${dismissHtml}
  `;

  document.body.appendChild(snackbar);
  currentSnackbar = snackbar;

  // 绑定事件
  if (opts.action) {
    const actionBtn = snackbar.querySelector<HTMLButtonElement>('.snackbar-action')!;
    actionBtn.addEventListener('click', () => {
      opts.action!.onClick();
      dismissSnackbar();
    });
  }

  const dismissBtn = snackbar.querySelector<HTMLButtonElement>('.snackbar-dismiss')!;
  dismissBtn.addEventListener('click', () => dismissSnackbar());

  // 入场动画
  animateSnackbarIn(snackbar);

  // 自动消失
  const duration = opts.duration ?? (opts.action ? ACTION_DURATION : DEFAULT_DURATION);
  dismissTimer = setTimeout(() => {
    if (opts.onDismiss) opts.onDismiss();
    dismissSnackbar();
  }, duration);
}

function showNext(): void {
  if (queue.length === 0) return;
  const next = queue.shift()!;
  renderSnackbar(next.message, next.opts);
}

// ── 动画 ──────────────────────────────────────────────────────────────

function animateSnackbarIn(snackbar: HTMLElement): void {
  if (prefersReducedMotion()) {
    snackbar.style.transform = 'translateY(0)';
    snackbar.style.opacity = '1';
    return;
  }

  snackbar.style.transform = 'translateY(100%)';
  snackbar.style.opacity = '0';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      applyTransition(snackbar, 'transform, opacity', DURATION.snackbar, EASING.decelerate);
      snackbar.style.transform = 'translateY(0)';
      snackbar.style.opacity = '1';
    });
  });
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
  );
}

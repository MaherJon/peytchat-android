// M-A3: BottomSheet Manager
// 替代移动端所有弹窗/下拉菜单为 Material 风格的底部弹出面板。
// 支持拖拽关闭、点击外部关闭、嵌套滚动、半展开/全展开吸附点。
// 桌面端继续使用 dropdown / right drawer,不受影响。

import { iconSvg } from '../components/icon.js';
import { applyTransition, animateExit, EASING, DURATION, prefersReducedMotion } from './animation.js';
import type { BottomSheetOpts } from './types.js';

// ── 全局状态 ──────────────────────────────────────────────────────────
let currentSheet: HTMLElement | null = null;
let currentBackdrop: HTMLElement | null = null;
let currentOnDismiss: (() => void) | null = null;
let dragState: {
  startY: number;
  startTranslate: number;
  sheetHeight: number;
} | null = null;

const HANDLE_HEIGHT = 28; // 拖拽手柄区域高度(px)
const DISMISS_THRESHOLD = 0.3; // 拖动超过 30% 高度即关闭

// ── API ────────────────────────────────────────────────────────────────

/**
 * 显示 BottomSheet。
 * 同一时间只能有一个 Sheet,调用此函数会先关闭已存在的 Sheet。
 */
export function showBottomSheet(opts: BottomSheetOpts): void {
  hideBottomSheet(true); // 静默关闭已存在的

  const showHandle = opts.showHandle !== false;
  const titleHtml = opts.title
    ? `<div class="bs-title">${escapeHtml(opts.title)}</div>`
    : '';

  // 构建 Sheet DOM
  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', opts.title || '菜单');

  sheet.innerHTML = `
    ${showHandle ? `<div class="bs-handle"><div class="bs-handle-bar"></div></div>` : ''}
    ${titleHtml ? `<div class="bs-header">${titleHtml}</div>` : ''}
    <div class="bs-body" data-nested-scroll="${opts.nestedScroll !== false}">
    </div>
  `;

  // 填充内容
  const body = sheet.querySelector<HTMLElement>('.bs-body')!;
  if (typeof opts.content === 'string') {
    body.innerHTML = opts.content;
  } else {
    body.appendChild(opts.content);
  }

  // 背景遮罩
  const backdrop = document.createElement('div');
  backdrop.className = 'bs-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');

  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);

  currentSheet = sheet;
  currentBackdrop = backdrop;
  currentOnDismiss = opts.onDismiss ?? null;

  // 绑定事件
  bindSheetEvents(sheet, backdrop, opts);

  // 入场动画
  animateSheetIn(sheet, backdrop, opts.anchors?.partial);
}

/**
 * 关闭当前 BottomSheet。
 */
export function hideBottomSheet(silent = false): void {
  if (!currentSheet) return;

  const sheet = currentSheet;
  const backdrop = currentBackdrop;
  const onDismiss = currentOnDismiss;

  currentSheet = null;
  currentBackdrop = null;
  currentOnDismiss = null;
  dragState = null;

  if (prefersReducedMotion()) {
    sheet.remove();
    if (backdrop) backdrop.remove();
    if (!silent && onDismiss) onDismiss();
    return;
  }

  // 出场动画
  animateExit(sheet, DURATION.sheetOut).then(() => {
    sheet.remove();
  });
  if (backdrop) {
    applyTransition(backdrop, 'opacity', DURATION.sheetOut, EASING.accelerate);
    backdrop.style.opacity = '0';
    setTimeout(() => backdrop.remove(), DURATION.sheetOut + 10);
  }

  if (!silent && onDismiss) onDismiss();
}

/**
 * 是否有正在显示的 BottomSheet。
 */
export function isBottomSheetOpen(): boolean {
  return currentSheet !== null;
}

// ── 事件绑定 ──────────────────────────────────────────────────────────

function bindSheetEvents(
  sheet: HTMLElement,
  backdrop: HTMLElement,
  opts: BottomSheetOpts,
): void {
  // 点击背景关闭
  backdrop.addEventListener('click', () => hideBottomSheet());

  // 拖拽关闭 (仅在手柄区域触发)
  const handle = sheet.querySelector<HTMLElement>('.bs-handle');
  if (handle) {
    handle.addEventListener('touchstart', onDragStart, { passive: false });
    handle.addEventListener('mousedown', onDragStart);
  }

  // 全局 touchend/mouseup 用于完成拖拽
  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('touchend', onDragEnd);
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);

  // 嵌套滚动: 阻止 Sheet body 的滚动冒泡到背景
  const body = sheet.querySelector<HTMLElement>('.bs-body');
  if (body && opts.nestedScroll !== false) {
    body.addEventListener('touchmove', (e) => {
      e.stopPropagation();
    }, { passive: false });
  }
}

// ── 拖拽手势 ──────────────────────────────────────────────────────────

function onDragStart(e: MouseEvent | TouchEvent): void {
  if (!currentSheet) return;
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
  const rect = currentSheet.getBoundingClientRect();
  dragState = {
    startY: clientY,
    startTranslate: rect.top,
    sheetHeight: rect.height,
  };
}

function onDragMove(e: MouseEvent | TouchEvent): void {
  if (!dragState || !currentSheet) return;
  const clientY = 'touches' in e
    ? (e as TouchEvent).touches[0]?.clientY
    : (e as MouseEvent).clientY;
  if (clientY === undefined) return;

  const delta = clientY - dragState.startY;
  // 只允许向下拖拽 (delta > 0)
  if (delta < -10) return;

  // 阻止默认行为防止页面滚动
  if (delta > 5) e.preventDefault();

  const newTop = dragState.startTranslate + delta;
  currentSheet.style.transform = `translateY(${newTop - dragState.startTranslate + (window.innerHeight - dragState.sheetHeight - dragState.startTranslate)}px)`;
  // 简化: 直接用 translateY(delta)
  currentSheet.style.transform = `translateY(${Math.max(0, delta)}px)`;
  currentSheet.style.transition = 'none';

  // 背景透明度随拖拽距离递减
  if (currentBackdrop) {
    const progress = 1 - Math.min(1, delta / (dragState.sheetHeight * DISMISS_THRESHOLD));
    currentBackdrop.style.opacity = String(Math.max(0, progress));
  }
}

function onDragEnd(e: MouseEvent | TouchEvent): void {
  if (!dragState || !currentSheet) return;

  const clientY = 'changedTouches' in e
    ? (e as TouchEvent).changedTouches[0]?.clientY
    : (e as MouseEvent).clientY;
  const delta = clientY !== undefined ? clientY - dragState.startY : 0;

  if (delta > dragState.sheetHeight * DISMISS_THRESHOLD) {
    // 超过阈值,关闭
    hideBottomSheet();
  } else {
    // 弹回原位
    if (!prefersReducedMotion()) {
      applyTransition(currentSheet, 'transform', DURATION.sheetOut, EASING.decelerate);
    }
    currentSheet.style.transform = 'translateY(0)';
    if (currentBackdrop) {
      applyTransition(currentBackdrop, 'opacity', DURATION.sheetOut, EASING.decelerate);
      currentBackdrop.style.opacity = '1';
    }
  }
  dragState = null;
}

// ── 入场动画 ──────────────────────────────────────────────────────────

function animateSheetIn(
  sheet: HTMLElement,
  backdrop: HTMLElement,
  partialPct?: number,
): void {
  if (prefersReducedMotion()) {
    backdrop.style.opacity = '1';
    sheet.style.transform = 'translateY(0)';
    return;
  }

  // 初始: 在屏幕下方
  const startY = partialPct
    ? window.innerHeight * (1 - partialPct / 100)
    : 40; // 小幅偏移营造上滑感

  sheet.style.transform = `translateY(${startY}px)`;
  backdrop.style.opacity = '0';

  // 强制回流后开始动画
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      applyTransition(sheet, 'transform', DURATION.sheetIn, EASING.decelerate);
      sheet.style.transform = 'translateY(0)';

      applyTransition(backdrop, 'opacity', DURATION.sheetIn, EASING.decelerate);
      backdrop.style.opacity = '1';
    });
  });
}

// ── 便捷函数 ──────────────────────────────────────────────────────────

/**
 * 创建带图标的操作项行 (用于 BottomSheet 列表)。
 */
export function makeSheetAction(opts: {
  icon: string; // iconSvg 的 HTML
  label: string;
  danger?: boolean;
  onClick: () => void;
}): string {
  const dangerCls = opts.danger ? ' danger' : '';
  return `<div class="bs-action${dangerCls}" role="button" tabindex="0">
    <span class="bs-action-icon">${opts.icon}</span>
    <span class="bs-action-label">${escapeHtml(opts.label)}</span>
  </div>`;
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
  );
}

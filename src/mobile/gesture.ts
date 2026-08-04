// M-A3: Gesture Manager
// 增强移动端手势交互: swipe-right→reply, swipe-left→archive(预留), pull-to-refresh。
// 与 message.ts 中已有的 bindMobileMessageActions 互补 — 提供额外的手势增强。

import { haptic } from './haptic.js';
import { prefersReducedMotion } from './animation.js';

// ── 常量 ──────────────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 60;
const SWIPE_VERTICAL_MAX = 30;
const SWIPE_LEFT_COLOR = 'var(--text-mute)';
const SWIPE_RIGHT_COLOR = 'var(--text)';
const PULL_REFRESH_THRESHOLD = 80;
const PULL_MAX = 160;

// ── 类型 ──────────────────────────────────────────────────────────────

export interface GestureActions {
  /** 右滑 → 回复 */
  onSwipeRight?: (msgEl: HTMLElement, msgId: number) => void;
  /** 左滑 → 归档(预留) */
  onSwipeLeft?: (msgEl: HTMLElement, msgId: number) => void;
  /** 长按 */
  onLongPress?: (msgEl: HTMLElement, msgId: number, x: number, y: number) => void;
  /** 下拉刷新 */
  onPullRefresh?: () => Promise<void>;
}

interface SwipeState {
  startX: number;
  startY: number;
  msgEl: HTMLElement | null;
  swiping: boolean;
  direction: 'left' | 'right' | null;
  offset: number;
}

let swipeState: SwipeState = {
  startX: 0, startY: 0, msgEl: null, swiping: false, direction: null, offset: 0,
};

let pullState = {
  pulling: false,
  startY: 0,
  offset: 0,
  indicator: null as HTMLElement | null,
  refreshing: false,
};

// ── API ────────────────────────────────────────────────────────────────

/**
 * 在消息列表容器上绑定增强手势。
 * 在现有 bindMobileMessageActions 基础上增加:
 * - 左滑归档指示器
 * - 更好的触觉反馈
 *
 * @param container - 消息列表容器 (.messages)
 * @param actions - 手势回调
 */
export function initEnhancedGestures(
  container: HTMLElement,
  actions: GestureActions,
): void {
  // 附加到消息元素上,以增强形式添加 (不覆盖现有 touch handler)
  // 这里通过事件委托在容器级别监听
  container.addEventListener('touchstart', (e) => {
    const msgEl = (e.target as HTMLElement).closest('.msg') as HTMLElement | null;
    if (!msgEl) return;

    const touch = (e as TouchEvent).touches[0];
    swipeState.startX = touch.clientX;
    swipeState.startY = touch.clientY;
    swipeState.msgEl = msgEl;
    swipeState.swiping = false;
    swipeState.direction = null;
    swipeState.offset = 0;
  }, { passive: false });

  container.addEventListener('touchmove', (e) => {
    if (!swipeState.msgEl) return;
    const touch = (e as TouchEvent).touches[0];
    const dx = touch.clientX - swipeState.startX;
    const dy = Math.abs(touch.clientY - swipeState.startY);

    if (dy > SWIPE_VERTICAL_MAX) {
      resetSwipe();
      return;
    }

    if (Math.abs(dx) > 10 && !swipeState.swiping) {
      swipeState.swiping = true;
    }

    if (swipeState.swiping) {
      swipeState.direction = dx > 0 ? 'right' : 'left';
      swipeState.offset = Math.min(Math.abs(dx), 100);

      if (dx > 0 && actions.onSwipeRight) {
        updateSwipeIndicator(swipeState.msgEl, 'right', swipeState.offset);
      } else if (dx < 0 && actions.onSwipeLeft) {
        updateSwipeIndicator(swipeState.msgEl, 'left', swipeState.offset);
      }
    }
  }, { passive: false });

  container.addEventListener('touchend', () => {
    if (!swipeState.swiping || !swipeState.msgEl) {
      resetSwipe();
      return;
    }

    if (swipeState.offset >= SWIPE_THRESHOLD) {
      const msgIdStr = swipeState.msgEl.dataset.msg || '';
      const msgId = Number(msgIdStr);

      if (swipeState.direction === 'right' && actions.onSwipeRight) {
        haptic('medium');
        actions.onSwipeRight(swipeState.msgEl, msgId);
      } else if (swipeState.direction === 'left' && actions.onSwipeLeft) {
        haptic('light');
        actions.onSwipeLeft(swipeState.msgEl, msgId);
      }
    }

    resetSwipe();
  });

  container.addEventListener('touchcancel', () => resetSwipe());
}

/**
 * 在可滚动容器上绑定下拉刷新手势。
 *
 * @param container - 可滚动容器
 * @param onRefresh - 刷新回调,返回 Promise 在完成后结束刷新状态
 */
export function initPullToRefresh(
  container: HTMLElement,
  onRefresh: () => Promise<void>,
): void {
  const indicator = document.createElement('div');
  indicator.className = 'pull-refresh-indicator';
  indicator.innerHTML = '<div class="pull-refresh-spinner"></div>';
  container.parentElement?.insertBefore(indicator, container);

  pullState.indicator = indicator;

  container.addEventListener('touchstart', (e) => {
    // 仅在滚动到顶部时启用下拉刷新
    if (container.scrollTop > 5) return;
    const touch = (e as TouchEvent).touches[0];
    pullState.pulling = true;
    pullState.startY = touch.clientY;
    pullState.offset = 0;
  }, { passive: false });

  container.addEventListener('touchmove', (e) => {
    if (!pullState.pulling || pullState.refreshing) return;
    const touch = (e as TouchEvent).touches[0];
    const delta = touch.clientY - pullState.startY;

    if (delta < 0) {
      pullState.pulling = false;
      pullState.offset = 0;
      updatePullIndicator(0);
      return;
    }

    // rubber-band 效果: 超过阈值后增加阻力
    pullState.offset = delta > PULL_MAX
      ? PULL_MAX + (delta - PULL_MAX) * 0.3
      : delta;

    updatePullIndicator(Math.min(pullState.offset, PULL_MAX));
  }, { passive: false });

  container.addEventListener('touchend', async () => {
    if (!pullState.pulling) return;
    pullState.pulling = false;

    if (pullState.offset >= PULL_REFRESH_THRESHOLD && !pullState.refreshing) {
      pullState.refreshing = true;
      showRefreshingState();

      try {
        await onRefresh();
        haptic('success');
      } catch {
        haptic('error');
      } finally {
        pullState.refreshing = false;
        updatePullIndicator(0);
        hideRefreshingState();
      }
    } else {
      updatePullIndicator(0);
    }
    pullState.offset = 0;
  });
}

// ── 内部辅助 ──────────────────────────────────────────────────────────

function updateSwipeIndicator(msgEl: HTMLElement, direction: 'left' | 'right', offset: number): void {
  let indicator = msgEl.querySelector<HTMLElement>('.swipe-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'swipe-indicator';
    msgEl.style.position = 'relative';
    msgEl.appendChild(indicator);
  }

  const progress = Math.min(1, offset / SWIPE_THRESHOLD);
  indicator.style.opacity = String(progress);
  indicator.style.background = direction === 'right' ? SWIPE_RIGHT_COLOR : SWIPE_LEFT_COLOR;

  if (direction === 'right') {
    indicator.style.left = `${Math.max(0, offset - 28)}px`;
  } else {
    indicator.style.right = `${Math.max(0, offset - 28)}px`;
    indicator.style.left = 'auto';
  }

  // 消息整体随手指平移 (带阻力)
  const translateX = direction === 'right' ? offset * 0.5 : -offset * 0.5;
  msgEl.style.transform = `translateX(${translateX}px)`;
  if (!prefersReducedMotion()) {
    msgEl.style.transition = 'none';
  }
}

function resetSwipe(): void {
  if (swipeState.msgEl) {
    const indicator = swipeState.msgEl.querySelector<HTMLElement>('.swipe-indicator');
    if (indicator) indicator.remove();
    swipeState.msgEl.style.transform = '';
    if (!prefersReducedMotion()) {
      swipeState.msgEl.style.transition = 'transform 200ms cubic-bezier(0.4, 0.0, 0.2, 1)';
    }
  }
  swipeState = {
    startX: 0, startY: 0, msgEl: null, swiping: false, direction: null, offset: 0,
  };
}

function updatePullIndicator(offset: number): void {
  if (!pullState.indicator) return;
  pullState.indicator.style.height = `${offset}px`;
  pullState.indicator.style.opacity = String(Math.min(1, offset / PULL_REFRESH_THRESHOLD));
}

function showRefreshingState(): void {
  if (!pullState.indicator) return;
  pullState.indicator.classList.add('refreshing');
  pullState.indicator.style.height = '56px';
  pullState.indicator.style.opacity = '1';
}

function hideRefreshingState(): void {
  if (!pullState.indicator) return;
  pullState.indicator.classList.remove('refreshing');
  pullState.indicator.style.height = '0';
  pullState.indicator.style.opacity = '0';
}

// M-A3: Floating Action Button (FAB) Manager
// Material Design FAB,自动随滚动显隐。
// 向下滚动时隐藏,向上滚动时显示。

import { iconSvg } from '../components/icon.js';
import { applyTransition, EASING, DURATION, prefersReducedMotion } from './animation.js';
import type { FabOpts } from './types.js';
import { haptic } from './haptic.js';

// ── 全局状态 ──────────────────────────────────────────────────────────
const activeFabs = new Map<string, HTMLElement>();
let scrollBindings = new Map<string, () => void>();

/** 滚动方向追踪 */
interface ScrollTracker {
  lastY: number;
  visible: boolean;
  ticking: boolean;
}
const trackers = new Map<string, ScrollTracker>();

// ── API ────────────────────────────────────────────────────────────────

/**
 * 创建并显示一个 FAB。
 * 每个页面只能有一个 FAB (用 pageId 标识),重复调用会替换。
 *
 * @param pageId - 唯一标识符(如 'messages', 'groups', 'work')
 * @param opts - FAB 配置
 */
export function createFab(pageId: string, opts: FabOpts): void {
  // 移除已有的同 ID FAB
  removeFab(pageId);

  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.setAttribute('aria-label', opts.label || '操作');
  fab.setAttribute('role', 'button');

  if (opts.label) {
    fab.classList.add('fab-extended');
    fab.innerHTML = `
      ${iconSvg(opts.icon, { width: 24, height: 24, strokeWidth: 1.5 })}
      <span class="fab-label">${escapeHtml(opts.label)}</span>
    `;
  } else {
    fab.innerHTML = iconSvg(opts.icon, { width: 24, height: 24, strokeWidth: 1.5 });
  }

  fab.addEventListener('click', () => {
    haptic('light');
    opts.action();
  });

  // 入场动画
  animateFabIn(fab);

  document.body.appendChild(fab);
  activeFabs.set(pageId, fab);

  // 绑定滚动容器
  const scrollSelector = opts.scrollContainer || '.mobile-page-content';
  bindFabScroll(pageId, scrollSelector);
}

/**
 * 移除指定 FAB。
 */
export function removeFab(pageId: string): void {
  // 解绑滚动
  const unbind = scrollBindings.get(pageId);
  if (unbind) {
    unbind();
    scrollBindings.delete(pageId);
  }
  trackers.delete(pageId);

  const fab = activeFabs.get(pageId);
  if (fab) {
    if (prefersReducedMotion()) {
      fab.remove();
    } else {
      animateFabOut(fab).then(() => fab.remove());
    }
    activeFabs.delete(pageId);
  }
}

/**
 * 移除所有 FAB。
 */
export function removeAllFabs(): void {
  for (const pageId of activeFabs.keys()) {
    removeFab(pageId);
  }
}

/**
 * 手动设置 FAB 可见性。
 */
export function setFabVisible(pageId: string, visible: boolean): void {
  const fab = activeFabs.get(pageId);
  if (!fab) return;

  const tracker = trackers.get(pageId);
  if (tracker) tracker.visible = visible;

  if (visible) {
    animateFabIn(fab);
  } else {
    animateFabOut(fab);
  }
}

// ── 滚动联动 ──────────────────────────────────────────────────────────

function bindFabScroll(pageId: string, scrollSelector: string): void {
  const container = document.querySelector(scrollSelector);
  if (!container) return;

  const tracker: ScrollTracker = { lastY: 0, visible: true, ticking: false };
  trackers.set(pageId, tracker);

  const onScroll = (): void => {
    const scrollY = (container as HTMLElement).scrollTop;

    if (!tracker.ticking) {
      tracker.ticking = true;
      requestAnimationFrame(() => {
        const delta = scrollY - tracker.lastY;
        // 仅在滚动超过 16px 时触发显隐 (避免微小抖动)
        if (Math.abs(delta) > 16) {
          const scrollingDown = delta > 0;
          if (scrollingDown && tracker.visible) {
            setFabVisible(pageId, false);
          } else if (!scrollingDown && !tracker.visible) {
            setFabVisible(pageId, true);
          }
        }
        tracker.lastY = scrollY;
        tracker.ticking = false;
      });
    }
  };

  container.addEventListener('scroll', onScroll, { passive: true });
  scrollBindings.set(pageId, () => {
    container.removeEventListener('scroll', onScroll);
  });
}

// ── 动画 ──────────────────────────────────────────────────────────────

function animateFabIn(fab: HTMLElement): void {
  if (prefersReducedMotion()) {
    fab.style.transform = 'scale(1)';
    fab.style.opacity = '1';
    return;
  }

  fab.style.transform = 'scale(0)';
  fab.style.opacity = '0';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      applyTransition(fab, 'transform, opacity', DURATION.fab, EASING.decelerate);
      fab.style.transform = 'scale(1)';
      fab.style.opacity = '1';
    });
  });
}

async function animateFabOut(fab: HTMLElement): Promise<void> {
  if (prefersReducedMotion()) {
    fab.style.opacity = '0';
    return;
  }

  applyTransition(fab, 'transform, opacity', DURATION.fab, EASING.accelerate);
  fab.style.transform = 'scale(0.5)';
  fab.style.opacity = '0';

  return new Promise((resolve) => {
    fab.addEventListener('transitionend', () => resolve(), { once: true });
    setTimeout(() => resolve(), DURATION.fab + 20);
  });
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
  );
}

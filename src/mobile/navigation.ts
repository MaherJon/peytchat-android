// M-A3: Navigation Manager
// Android 风格的导航栈,支持 back button 回退和页面转场动画。
// 与现有的 mobileShell.ts enterMobileChat/leaveMobileChat 集成。

import { applyTransition, EASING, DURATION, prefersReducedMotion } from './animation.js';
import type { NavEntry } from './types.js';

// ── 导航栈 ────────────────────────────────────────────────────────────
const stack: NavEntry[] = [];

/**
 * 推入新页面到导航栈。
 * 触发从右侧滑入的转场动画。
 *
 * @param page - 页面标识符
 * @param params - 页面参数
 * @param title - 顶栏标题
 */
export function pushNavigation(
  page: string,
  params: Record<string, unknown> | undefined,
  title: string,
): void {
  stack.push({ page, params, title });
  updateBackButton();
}

/**
 * 弹出当前页面,返回上一页。
 * 触发向右滑出的转场动画。
 *
 * @returns 被弹出的条目,如果栈为空则返回 null
 */
export function popNavigation(): NavEntry | null {
  if (stack.length === 0) return null;
  const entry = stack.pop()!;
  updateBackButton();
  return entry;
}

/**
 * 获取当前栈顶页面,不弹出。
 */
export function peekNavigation(): NavEntry | null {
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

/**
 * 获取栈深度。
 */
export function navigationDepth(): number {
  return stack.length;
}

/**
 * 清空导航栈。
 */
export function clearNavigation(): void {
  stack.length = 0;
  updateBackButton();
}

/**
 * 处理硬件返回按钮。
 * 栈非空时弹出上一页;栈为空时不做任何事(不退出 app)。
 *
 * @returns true 表示已处理(消费了 back 事件), false 表示栈为空无法回退
 */
export function handleBackButton(): boolean {
  if (stack.length === 0) return false;
  popNavigation();
  return true;
}

/**
 * 应用页面转场动画。
 * 页面容器从 `direction` 方向滑入,旧容器向反方向滑出。
 *
 * @param container - 当前页面容器元素
 * @param direction - 'forward'(推入,从右滑入) | 'back'(回退,从左滑入)
 */
export function animatePageTransition(
  container: HTMLElement,
  direction: 'forward' | 'back',
): Promise<void> {
  if (prefersReducedMotion()) {
    container.style.transform = 'translateX(0)';
    container.style.opacity = '1';
    return Promise.resolve();
  }

  const fromX = direction === 'forward' ? '30px' : '-30px';

  return new Promise((resolve) => {
    container.style.transform = `translateX(${fromX})`;
    container.style.opacity = '0';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyTransition(container, 'transform, opacity', DURATION.page, EASING.standard);
        container.style.transform = 'translateX(0)';
        container.style.opacity = '1';
      });
    });

    container.addEventListener('transitionend', () => resolve(), { once: true });
    setTimeout(() => resolve(), DURATION.page + 50);
  });
}

// ── 内部辅助 ──────────────────────────────────────────────────────────

function updateBackButton(): void {
  const backBtn = document.getElementById('mobile-back-btn');
  if (!backBtn) return;

  if (stack.length > 0) {
    backBtn.style.display = '';
  } else if (!isInChat()) {
    // 不在聊天中且栈为空,隐藏返回按钮
    backBtn.style.display = 'none';
  }
}

function isInChat(): boolean {
  // 延迟导入避免循环依赖
  try {
    const { state } = (globalThis as Record<string, unknown>).__peytchat_state as { state: { currentChatId: number | null } } || {};
    return state?.currentChatId != null;
  } catch {
    return false;
  }
}

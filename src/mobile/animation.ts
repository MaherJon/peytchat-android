// M-A3: Material Design 动效系统
// 提供标准 Material easing 曲线和过渡辅助函数。
// 仅在移动端使用,桌面端保持现有动画体系。

/** Material Design 标准缓动曲线 */
export const EASING = {
  /** 标准曲线: 页面转场、FAB 动画 */
  standard: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
  /** 减速曲线: 元素进入屏幕 */
  decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
  /** 加速曲线: 元素离开屏幕 */
  accelerate: 'cubic-bezier(0.4, 0.0, 1, 1)',
} as const;

/** 标准时长(ms) */
export const DURATION = {
  /** 页面转场 */
  page: 300,
  /** BottomSheet 进入 */
  sheetIn: 250,
  /** BottomSheet 退出 */
  sheetOut: 200,
  /** FAB 显隐 */
  fab: 200,
  /** Snackbar 滑入 */
  snackbar: 250,
  /** 涟漪扩散 */
  ripple: 400,
} as const;

/**
 * 为元素应用 CSS transition。
 * 自动遵守 prefers-reduced-motion。
 */
export function applyTransition(
  el: HTMLElement,
  property: string,
  duration: number,
  easing: string = EASING.standard,
): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.style.transition = 'none';
    return;
  }
  el.style.transition = `${property} ${duration}ms ${easing}`;
}

/**
 * 检查用户是否偏好减少动效。
 */
export function prefersReducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 使用 requestAnimationFrame 执行动画帧回调。
 * 返回取消函数。
 */
export function animateFrame(cb: (dt: number) => void): () => void {
  let raf: number;
  let last = performance.now();
  const tick = (now: number) => {
    const dt = now - last;
    last = now;
    cb(dt);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/**
 * 为元素应用 enter 动画 (scale + opacity 浮现)。
 * 返回 Promise,在动画完成后 resolve。
 */
export function animateEnter(
  el: HTMLElement,
  duration: number = DURATION.sheetIn,
): Promise<void> {
  if (prefersReducedMotion()) {
    el.style.opacity = '1';
    el.style.transform = 'none';
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    el.style.opacity = '0';
    el.style.transform = 'scale(0.95) translateY(8px)';
    applyTransition(el, 'opacity, transform', duration, EASING.decelerate);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'scale(1) translateY(0)';
      });
    });

    el.addEventListener('transitionend', () => resolve(), { once: true });
    // 安全超时
    setTimeout(() => resolve(), duration + 50);
  });
}

/**
 * 为元素应用 exit 动画 (scale + opacity 消失)。
 * 返回 Promise,在动画完成后 resolve (调用方负责移除 DOM)。
 */
export function animateExit(
  el: HTMLElement,
  duration: number = DURATION.sheetOut,
): Promise<void> {
  if (prefersReducedMotion()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    applyTransition(el, 'opacity, transform', duration, EASING.accelerate);
    el.style.opacity = '0';
    el.style.transform = 'scale(0.97) translateY(4px)';

    el.addEventListener('transitionend', () => resolve(), { once: true });
    setTimeout(() => resolve(), duration + 50);
  });
}

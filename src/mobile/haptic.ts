// M-A3: 触觉反馈 (Web Vibration API + 优雅降级)
// 提供 Android 原生般的触觉反馈,不支持时静默 fallback。

import type { HapticType } from './types.js';

/** 各类型振动参数 */
const PATTERNS: Record<HapticType, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 40,
  success: [15, 50, 15],
  error: [50, 80, 100],
};

/** 检查振动是否可用 */
function isVibrationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

/**
 * 触发触觉反馈。
 * 不支持时静默降级,不报错。
 *
 * @example
 * haptic('light');     // 轻触
 * haptic('heavy');     // 长按/消息发送
 * haptic('success');   // 操作成功
 * haptic('error');     // 操作失败
 */
export function haptic(type: HapticType): void {
  if (!isVibrationSupported()) return;

  try {
    const pattern = PATTERNS[type];
    // Vibration API 在非用户手势触发的上下文中可能被忽略
    if (Array.isArray(pattern)) {
      navigator.vibrate(pattern);
    } else {
      navigator.vibrate(pattern);
    }
  } catch {
    // 静默失败
  }
}

/**
 * 带安全包装的振动:仅在用户交互回调中有效。
 * 在异步回调中使用此函数可能被浏览器拒绝。
 */
export function hapticSafe(type: HapticType): void {
  // 使用 setTimeout(0) 确保在微任务之后执行,
  // 某些浏览器要求在用户手势的同步上下文中调用 vibrate。
  if (!isVibrationSupported()) return;

  try {
    const pattern = PATTERNS[type];
    if (Array.isArray(pattern)) {
      navigator.vibrate(pattern);
    } else {
      navigator.vibrate(pattern);
    }
  } catch {
    // 静默失败
  }
}

export { isVibrationSupported };

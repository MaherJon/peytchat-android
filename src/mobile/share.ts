// M-A3: Android Share
// 使用 Web Share API 提供原生分享功能。
// 回退到剪贴板复制 + Snackbar 提示。

import { showSnackbar } from './snackbar.js';
import type { ShareData } from './types.js';

/**
 * 使用原生分享 (Web Share API)。
 * 不支持时自动回退到剪贴板复制。
 *
 * @example
 * await shareContent({ title: '消息', text: 'Hello', url: 'https://...' });
 */
export async function shareContent(data: ShareData): Promise<void> {
  // 优先使用 Web Share API
  if (navigator.share) {
    try {
      await navigator.share({
        title: data.title,
        text: data.text,
        url: data.url,
      });
      return;
    } catch (err) {
      // 用户取消分享不算错误
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // 其他错误回退到剪贴板
    }
  }

  // 回退: 复制到剪贴板
  await fallbackCopy(data);
}

/**
 * 分享文本消息。
 */
export async function shareText(text: string, title?: string): Promise<void> {
  await shareContent({ title, text });
}

/**
 * 分享 URL。
 */
export async function shareUrl(url: string, title?: string): Promise<void> {
  await shareContent({ title, url });
}

/**
 * 检查原生分享是否可用。
 */
export function isNativeShareAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.share;
}

// ── 回退 ──────────────────────────────────────────────────────────────

async function fallbackCopy(data: ShareData): Promise<void> {
  const text = data.text || data.url || data.title || '';
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    showSnackbar('已复制到剪贴板');
  } catch {
    // 最后的回退: 创建临时 textarea
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showSnackbar('已复制到剪贴板');
    } catch {
      showSnackbar('分享失败');
    }
    document.body.removeChild(textarea);
  }
}

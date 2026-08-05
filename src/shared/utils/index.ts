/**
 * shared/utils — 共享工具函数
 *
 * 从各模块中提取重复的工具函数,集中维护。
 * mobile/ 和 compat/ 都可以使用这些函数。
 */

/**
 * HTML 实体转义,防止 XSS。
 * 原先在 mobileShell.ts, mobileComposer.ts, composer.ts, message.ts 中重复定义。
 */
export function escapeHtml(s: string): string {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[c]!),
  );
}

/**
 * HTML 属性值转义 (与 escapeHtml 相同,保留别名语义)。
 */
export function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/**
 * 截断字符串到指定长度,超长时追加省略号。
 */
export function truncate(s: string, maxLen: number): string {
  if (!s || s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '…';
}

/**
 * 格式化时间戳(秒)为相对时间字符串。
 */
export function relativeTime(ts: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(ts * 1000).toLocaleDateString();
}

/**
 * 生成唯一临时 ID (用于乐观更新)。
 */
export function tmpId(): string {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 安全解析 JSON,失败返回 null。
 */
export function safeJsonParse<T = unknown>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

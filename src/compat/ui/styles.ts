/**
 * compat/ui/styles — 样式适配器
 *
 * 为移动端提供 CSS 变量、主题切换、响应式断点检测。
 * 适配桌面端 theme.ts 和 index.html 的 CSS 变量体系。
 */

import { MOBILE_BREAKPOINT } from '../../shared/constants/index.js';

/** 移动端 CSS 变量覆盖 */
export const MOBILE_CSS_VARS = {
  /** 移动端安全区域底部间距 */
  safeAreaBottom: 'env(safe-area-inset-bottom, 0px)',
  /** 移动端顶栏高度 */
  topBarHeight: '56px',
  /** 移动端底部导航栏高度 */
  bottomNavHeight: '60px',
  /** 移动端输入区域最大高度 */
  composerMaxHeight: '120px',
  /** 移动端触摸目标最小尺寸 */
  touchTargetMin: '44px',
  /** 移动端页面左右内边距 */
  pagePaddingX: '16px',
} as const;

/** 获取移动端断点宽度(px) */
export function getMobileBreakpoint(): number {
  return MOBILE_BREAKPOINT;
}

/** 检测当前是否为移动端视口 */
export function isMobileViewport(): boolean {
  return window.matchMedia(`(max-width:${MOBILE_BREAKPOINT}px)`).matches;
}

/**
 * 应用移动端主题。
 * 从桌面端 theme.ts 读取当前主题,并注入移动端 CSS 变量。
 */
export async function applyMobileTheme(): Promise<void> {
  try {
    const { getCurrentTheme } = await import('../../theme.js');
    const theme = getCurrentTheme();
    const root = document.documentElement;

    // 移动端特有 CSS 变量
    root.style.setProperty('--mobile-safe-bottom', MOBILE_CSS_VARS.safeAreaBottom);
    root.style.setProperty('--mobile-topbar-h', MOBILE_CSS_VARS.topBarHeight);
    root.style.setProperty('--mobile-bnav-h', MOBILE_CSS_VARS.bottomNavHeight);
    root.style.setProperty('--mobile-composer-max-h', MOBILE_CSS_VARS.composerMaxHeight);
    root.style.setProperty('--mobile-touch-min', MOBILE_CSS_VARS.touchTargetMin);
    root.style.setProperty('--mobile-px', MOBILE_CSS_VARS.pagePaddingX);

    // 应用当前主题的 data 属性
    if (theme) {
      root.setAttribute('data-theme', theme);
    }
  } catch (err) {
    console.warn('[compat/ui/styles] applyMobileTheme failed:', err);
  }
}

/**
 * 注入移动端基础样式。
 * 调用后会在 <head> 中插入移动端专用 <style> 标签。
 */
export function injectMobileStyles(): void {
  if (document.getElementById('mobile-adapt-styles')) return;

  const style = document.createElement('style');
  style.id = 'mobile-adapt-styles';
  style.textContent = `
    /* 移动端 Shell 布局 */
    .mobile-shell {
      display: flex;
      flex-direction: column;
      height: 100dvh;
      overflow: hidden;
      background: var(--bg, #f5f5f5);
    }

    .mobile-top-bar {
      display: flex;
      align-items: center;
      height: var(--mobile-topbar-h, 56px);
      padding: 0 var(--mobile-px, 16px);
      background: var(--topbar-bg, #fff);
      border-bottom: 1px solid var(--border, #e0e0e0);
      flex-shrink: 0;
      gap: 8px;
    }

    .mobile-title {
      flex: 1;
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary, #111);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mobile-back-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: var(--mobile-touch-min, 44px);
      height: var(--mobile-touch-min, 44px);
      border: none;
      background: none;
      color: var(--text-primary, #111);
      cursor: pointer;
      border-radius: 8px;
    }
    .mobile-back-btn:active {
      background: var(--hover-bg, rgba(0,0,0,0.05));
    }

    .mobile-top-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .mobile-menu-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: var(--mobile-touch-min, 44px);
      height: var(--mobile-touch-min, 44px);
      border: none;
      background: none;
      color: var(--text-primary, #111);
      cursor: pointer;
      border-radius: 8px;
    }
    .mobile-menu-btn:active {
      background: var(--hover-bg, rgba(0,0,0,0.05));
    }

    .mobile-page-container {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      padding-bottom: var(--mobile-bnav-h, 60px);
    }

    .mobile-page {
      min-height: 100%;
    }

    /* 底部导航栏 */
    .mobile-bottom-nav {
      display: flex;
      justify-content: space-around;
      align-items: center;
      height: var(--mobile-bnav-h, 60px);
      padding-bottom: var(--mobile-safe-bottom, 0px);
      background: var(--topbar-bg, #fff);
      border-top: 1px solid var(--border, #e0e0e0);
      flex-shrink: 0;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 100;
    }

    .bn-tab {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 4px 12px;
      min-width: var(--mobile-touch-min, 44px);
      min-height: var(--mobile-touch-min, 44px);
      color: var(--text-secondary, #666);
      cursor: pointer;
      border-radius: 8px;
      transition: color 0.15s;
    }
    .bn-tab.active {
      color: var(--accent, #4a90d9);
    }
    .bn-tab:active {
      background: var(--hover-bg, rgba(0,0,0,0.05));
    }

    .bn-label {
      font-size: 10px;
      line-height: 1;
    }

    /* 移动端输入区域 */
    .mobile-composer {
      background: var(--topbar-bg, #fff);
      border-top: 1px solid var(--border, #e0e0e0);
      padding: 8px var(--mobile-px, 16px);
      padding-bottom: calc(8px + var(--mobile-safe-bottom, 0px));
    }

    .mobile-composer-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }

    .mc-input {
      flex: 1;
      border: 1px solid var(--border, #e0e0e0);
      border-radius: 20px;
      padding: 8px 16px;
      font-size: 15px;
      line-height: 1.4;
      max-height: var(--mobile-composer-max-h, 120px);
      resize: none;
      outline: none;
      background: var(--input-bg, #f9f9f9);
      color: var(--text-primary, #111);
    }

    .mc-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: var(--mobile-touch-min, 44px);
      height: var(--mobile-touch-min, 44px);
      border: none;
      background: none;
      color: var(--text-secondary, #666);
      cursor: pointer;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .mc-btn:active {
      background: var(--hover-bg, rgba(0,0,0,0.05));
    }

    .mc-send-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      background: var(--accent, #4a90d9);
      color: #fff;
      cursor: pointer;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .mc-send-btn:disabled {
      opacity: 0.4;
      cursor: default;
    }

    .mc-emoji-picker {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 8px;
      background: var(--topbar-bg, #fff);
      border: 1px solid var(--border, #e0e0e0);
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      max-width: 280px;
    }

    .mc-emoji-item {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      font-size: 22px;
      cursor: pointer;
      border-radius: 8px;
    }
    .mc-emoji-item:active {
      background: var(--hover-bg, rgba(0,0,0,0.05));
    }

    /* 回复预览条 */
    .mobile-reply-preview {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      margin-bottom: 8px;
      background: var(--reply-bg, #f0f0f0);
      border-radius: 8px;
      border-left: 3px solid var(--accent, #4a90d9);
    }
    .reply-preview-body {
      flex: 1;
      overflow: hidden;
    }
    .reply-preview-name {
      font-size: 12px;
      font-weight: 600;
      color: var(--accent, #4a90d9);
    }
    .reply-preview-text {
      font-size: 12px;
      color: var(--text-secondary, #666);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .rp-cancel {
      cursor: pointer;
      color: var(--text-secondary, #666);
      padding: 4px;
    }

    /* @提及 / #频道 建议面板 */
    .mention-list {
      background: var(--topbar-bg, #fff);
      border: 1px solid var(--border, #e0e0e0);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      overflow: hidden;
      max-height: 140px;
      overflow-y: auto;
    }
    .mention-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 14px;
    }
    .mention-item.selected {
      background: var(--accent-light, #e8f0fe);
    }
    .mention-prefix {
      color: var(--accent, #4a90d9);
      font-weight: 600;
    }
  `;
  document.head.appendChild(style);
}

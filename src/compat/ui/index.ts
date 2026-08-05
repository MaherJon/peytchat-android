/**
 * compat/ui — UI 适配层统一入口
 *
 * 这是 mobile/ 与 desktop UI 之间的唯一适配表面。
 * mobile/ 从此文件导入 UI 适配器,不直接导入 src/pages/ 或 src/chat/ 等桌面 UI 模块。
 *
 * 当上游 Desktop UI 模块变更(路径重命名、导出 API 变更)时,
 * 只需更新此目录中的适配器,mobile/ 无需任何修改。
 *
 * 依赖规则:
 *   mobile/ → compat/ui/ → src/pages/, src/chat/, src/shell/, src/components/
 *   mobile/ → src/api.ts, src/state.ts (数据层直接使用,无适配)
 */

// ── Shell 适配器(移动端布局) ─────────────────────────────────────────────
export {
  renderMobileShell,
  navigateToMobilePage,
  enterMobileChat,
  leaveMobileChat,
  updateMobileTopBar,
} from './shell.js';

// ── Chat 适配器(聊天视图) ─────────────────────────────────────────────────
export {
  renderChatView,
  appendOptimisticMessage,
  appendNewMessages,
} from './chat.js';

// ── Pages 适配器(页面渲染) ────────────────────────────────────────────────
export { renderPage, type PageName } from './pages.js';

// ── Composer 适配器(消息编辑) ─────────────────────────────────────────────
export {
  renderComposer,
  type MobileComposerOnSent,
} from './composer.js';

// ── Navigation 适配器(底部导航 + 路由栈) ─────────────────────────────────
export {
  renderBottomNav,
  navigate,
  goBack,
  openChat,
  initNavigation,
  type NavigationEntry,
} from './navigation.js';

// ── Styles 适配器(CSS 变量 / 主题) ────────────────────────────────────────
export {
  applyMobileTheme,
  getMobileBreakpoint,
  isMobileViewport as checkMobileViewport,
  MOBILE_CSS_VARS,
  injectMobileStyles,
} from './styles.js';

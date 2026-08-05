/**
 * mobile/layouts/MobileShell — 移动端 Shell(兼容性重导出)
 *
 * 此文件保留用于向后兼容。
 * 实际实现在 compat/ui/shell.ts。
 * 所有新代码应直接从 compat/ui/shell.js 导入。
 */

export {
  renderMobileShell,
  navigateToMobilePage,
  enterMobileChat,
  leaveMobileChat,
  updateMobileTopBar,
} from '../../compat/ui/shell.js';

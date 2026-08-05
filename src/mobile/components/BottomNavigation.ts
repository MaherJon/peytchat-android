/**
 * mobile/components/BottomNavigation — 底部导航(兼容性重导出)
 *
 * 此文件保留用于向后兼容。
 * 实际实现在 compat/ui/navigation.ts。
 * 所有新代码应直接从 compat/ui/navigation.js 导入。
 */

export {
  renderBottomNav,
  navigate,
  goBack,
  openChat,
  initNavigation,
  type NavigationEntry,
} from '../../compat/ui/navigation.js';

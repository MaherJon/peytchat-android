import { call } from './api.js';
import { initTheme } from './theme.js';
import { renderShell } from './shell/shell.js';
import { state } from './state.js';
import { saveState } from './persist.js';
import { createNavBanner } from './components/navBanner.js';
import { renderRail } from './shell/rail.js';
import { renderNavPanel } from './shell/navPanel.js';

interface EnsurePeytResult {
  role: string;
  invite_qr?: string;
}

// 检测移动设备
function isMobileDevice(): boolean {
  if (window.innerWidth < 768) return true;
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 移动端 UI 设置：添加汉堡菜单、抽屉遮罩、点击切换
function setupMobileUI(): void {
  const body = document.body;
  if (!body.classList.contains('mobile')) return;

  // 1. 在 chat-header 内插入汉堡按钮 (位于标题左侧)
  const chatHeader = document.querySelector('.chat-header');
  if (!chatHeader) return;
  // 避免重复插入
  if (chatHeader.querySelector('.menu-toggle')) return;

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'menu-toggle';
  toggleBtn.setAttribute('aria-label', 'Toggle navigation');
  toggleBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
  chatHeader.insertBefore(toggleBtn, chatHeader.firstChild);

  // 2. 创建遮罩层
  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  document.body.appendChild(overlay);

  // 3. 获取抽屉元素 (channel-tree 或 nav-tree)
  const drawer = document.querySelector<HTMLElement>('.channel-tree, .nav-tree');
  if (!drawer) return;
  const drawerElement = drawer;

  // 4. 切换抽屉函数
  function toggleDrawer(open?: boolean): void {
    const shouldOpen = open !== undefined ? open : !drawerElement.classList.contains('open');
    drawerElement.classList.toggle('open', shouldOpen);
    overlay.classList.toggle('visible', shouldOpen);
    document.body.style.overflow = shouldOpen ? 'hidden' : '';
  }

  // 5. 绑定点击事件
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDrawer();
  });

  overlay.addEventListener('click', () => {
    toggleDrawer(false);
  });

  // 6. 点击抽屉内部不关闭（可自行添加）
  drawerElement.addEventListener('click', (e) => e.stopPropagation());

  // 7. 在切换页面/路由时自动关闭抽屉（可选）
  // 监听抽屉内的导航点击，自动关闭
  drawerElement.querySelectorAll('.nav-item, .ct-channel, .home-item').forEach(el => {
    el.addEventListener('click', () => {
      toggleDrawer(false);
    });
  });

  // 8. 窗口尺寸变化时，如果变为非移动端，则移除移动布局（但一般不会动态变）
}

async function boot(): Promise<void> {
  // 添加设备类
  if (isMobileDevice()) {
    document.body.classList.add('mobile');
  } else {
    document.body.classList.add('desktop');
  }

  initTheme();
  const configured = await call<boolean>('is_configured');
  if (configured) {
    await renderShell();
    // 已配置账号: 静默确保 PEYT Studio 存在 (existing/founder)
    await ensurePeytStudio();
    // 移动端 UI 改造
    setupMobileUI();
  } else {
    const { renderLogin } = await import('./views/login.js');
    renderLogin(async () => {
      await renderShell();
      // 首次登录: 创建 PEYT Studio, founder 显示 nav banner 欢迎指引
      await ensurePeytStudio();
      setupMobileUI();
    });
  }
}

async function ensurePeytStudio(): Promise<void> {
  try {
    const r = await call<EnsurePeytResult>('ensure_peyt_studio');
    // founder 且未关闭过 banner → 显示 PEYT Studio 欢迎指引(替代 peytInvite 弹窗)
    if (r.role === 'founder' && !state.peytBannerDismissed) {
      showPeytBanner(r.invite_qr || '');
    }
  } catch (e) {
    console.warn('[peyt] ensure failed', e);
  }
}

// Task 16: 首次登录 PEYT Studio 欢迎流程 — 在 nav panel 顶部插入 nav banner。
// founder 可复制邀请链接分享给同事,或点击"查看频道"跳转到 groups 页。
// 关闭 banner 后持久化 peytBannerDismissed,后续不再显示。
function showPeytBanner(inviteLink: string): void {
  const panel = document.getElementById('channel-tree');
  if (!panel) return;
  const banner = createNavBanner({
    title: 'PEYT Studio 已就绪',
    subtitle: '分享邀请链接给同事加入',
    inviteLink,
    onViewChannels: () => {
      state.currentPage = 'groups';
      saveState();
      void renderRail().then(() => {
        void renderNavPanel();
      });
    },
    onDismiss: () => {
      state.peytBannerDismissed = true;
      saveState();
    },
  });
  panel.insertBefore(banner, panel.firstChild);
}

boot();
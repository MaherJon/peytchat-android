import { state } from '../state.js';
import { navigateToMobilePage } from './mobileShell.js';
import { navigateToPage, NAV_PAGES } from './rail.js';
import { iconSvg } from '../components/icon.js';
import type { Page } from '../types.js';

// 移动端底部导航栏: 5 个主 tab (WeChat 风格)。
// Chats / Contacts / Groups / Work / Me

const MOBILE_TABS: Array<{ page: Page; icon: string; label: string }> = [
  { page: 'messages', icon: 'message-circle', label: 'Chats' },
  { page: 'contacts', icon: 'contact', label: 'Contacts' },
  { page: 'groups', icon: 'users', label: 'Groups' },
  { page: 'work', icon: 'layout-grid', label: 'Work' },
  { page: 'me', icon: 'user', label: 'Me' },
];

export function renderBottomNav(): void {
  const nav = document.getElementById('bottom-nav');
  if (!nav) return;

  nav.innerHTML = MOBILE_TABS
    .map((t) => {
      const active = state.currentPage === t.page ? 'active' : '';
      return `<div class="bn-tab ${active}" data-page="${t.page}" role="tab" aria-selected="${state.currentPage === t.page}">
        ${iconSvg(t.icon as import('../components/icon.js').IconName, { width: 24, height: 24, strokeWidth: 1.5 })}
        <span class="bn-label">${t.label}</span>
      </div>`;
    })
    .join('');

  nav.querySelectorAll<HTMLElement>('.bn-tab').forEach((el) => {
    el.addEventListener('click', () => {
      const page = el.dataset.page as Page;
      if (state.currentPage === page) return;
      void navigateToMobilePage(page);
    });
  });
}

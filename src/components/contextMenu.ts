import { iconSvg, type IconName } from './icon.js';

export interface ContextMenuItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  action: () => void | Promise<void>;
}

let currentMenu: HTMLElement | null = null;

export function showContextMenu(x: number, y: number, items: ContextMenuItem[]): void {
  hideContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.innerHTML = items.map((item) => {
    const iconHtml = item.icon ? iconSvg(item.icon, { width: 14, height: 14 }) : '';
    const dangerCls = item.danger ? ' danger' : '';
    return `<div class="context-menu-item${dangerCls}">${iconHtml}<span>${escapeHtml(item.label)}</span></div>`;
  }).join('');
  document.body.appendChild(menu);
  currentMenu = menu;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.querySelectorAll<HTMLElement>('.context-menu-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      hideContextMenu();
      void items[i].action();
    });
  });
  setTimeout(() => {
    document.addEventListener('click', hideContextMenu, { once: true });
  }, 0);
}

export function hideContextMenu(): void {
  if (currentMenu) {
    currentMenu.remove();
    currentMenu = null;
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

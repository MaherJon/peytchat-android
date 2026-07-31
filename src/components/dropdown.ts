import { iconSvg, type IconName } from './icon.js';

export interface DropdownItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  action: () => void;
}

export interface DropdownOpts {
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  onClose?: () => void;
}

let currentDropdown: HTMLElement | null = null;
let closeOnOutsideHandler: ((e: MouseEvent) => void) | null = null;
let closeOnEscHandler: ((e: KeyboardEvent) => void) | null = null;
let currentOnClose: (() => void) | null = null;

export function showDropdown(anchor: HTMLElement, items: DropdownItem[], opts: DropdownOpts = {}): void {
  hideDropdown();
  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  menu.innerHTML = items.map((item) => {
    const iconHtml = item.icon ? iconSvg(item.icon, { width: 16, height: 16 }) : '';
    const dangerCls = item.danger ? ' danger' : '';
    return `<div class="dropdown-item${dangerCls}" data-label="${escapeAttr(item.label)}">${iconHtml}<span>${escapeHtml(item.label)}</span></div>`;
  }).join('');
  document.body.appendChild(menu);
  currentDropdown = menu;
  currentOnClose = opts.onClose ?? null;

  const rect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const pos = opts.position ?? 'bottom-left';
  if (pos.includes('bottom')) {
    menu.style.top = `${rect.bottom + 4}px`;
  } else {
    menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
  }
  if (pos.includes('left')) {
    menu.style.left = `${rect.left}px`;
  } else {
    menu.style.left = `${rect.right - menuRect.width}px`;
  }

  menu.querySelectorAll<HTMLElement>('.dropdown-item').forEach((el, i) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const item = items[i];
      hideDropdown();
      item.action();
    });
  });

  closeOnOutsideHandler = (e: MouseEvent) => {
    if (currentDropdown && !currentDropdown.contains(e.target as Node) && e.target !== anchor) {
      hideDropdown();
    }
  };
  closeOnEscHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') hideDropdown();
  };

  setTimeout(() => {
    if (closeOnOutsideHandler) document.addEventListener('click', closeOnOutsideHandler);
    if (closeOnEscHandler) document.addEventListener('keydown', closeOnEscHandler);
  }, 0);
}

export function hideDropdown(): void {
  if (currentDropdown) {
    currentDropdown.remove();
    currentDropdown = null;
  }
  if (closeOnOutsideHandler) {
    document.removeEventListener('click', closeOnOutsideHandler);
    closeOnOutsideHandler = null;
  }
  if (closeOnEscHandler) {
    document.removeEventListener('keydown', closeOnEscHandler);
    closeOnEscHandler = null;
  }
  if (currentOnClose) {
    const cb = currentOnClose;
    currentOnClose = null;
    cb();
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function escapeAttr(s: string): string { return escapeHtml(s); }

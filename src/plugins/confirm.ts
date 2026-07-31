import { showToast } from '../toast.js';

/**
 * Lightweight floating confirm for small icon buttons (delete/uninstall).
 * Does not replace the anchor element, so listeners survive cancellation.
 */
export function showPluginConfirm(
  anchor: HTMLElement,
  message: string,
  onConfirm: () => Promise<void> | void,
): void {
  // Remove any existing confirm card
  document.querySelectorAll('.plugin-confirm').forEach((e) => e.remove());

  const card = document.createElement('div');
  card.className = 'plugin-confirm';
  card.innerHTML = `
    <span class="plugin-confirm-msg">${escapeHtml(message)}</span>
    <div class="plugin-confirm-actions">
      <button class="plugin-confirm-yes">确认</button>
      <button class="plugin-confirm-no">取消</button>
    </div>
  `;
  document.body.appendChild(card);

  // Position just below the anchor, right-aligned to it
  const rect = anchor.getBoundingClientRect();
  card.style.top = `${rect.bottom + 6}px`;
  card.style.right = `${window.innerWidth - rect.right}px`;

  const close = (): void => {
    card.remove();
    document.removeEventListener('click', outside);
  };
  const outside = (e: MouseEvent): void => {
    if (!card.contains(e.target as Node)) close();
  };
  setTimeout(() => document.addEventListener('click', outside), 0);

  card.querySelector('.plugin-confirm-yes')!.addEventListener('click', async () => {
    close();
    try {
      await onConfirm();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  });
  card.querySelector('.plugin-confirm-no')!.addEventListener('click', close);
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]!);
}

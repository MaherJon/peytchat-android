let toastEl: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(msg: string): void {
  // M-A3: 移动端使用 Snackbar,桌面端保持 toast
  if (window.matchMedia('(max-width:900px)').matches) {
    import('./mobile/snackbar.js').then(({ showSnackbar }) => {
      showSnackbar(msg);
    }).catch(() => {
      // 回退到旧 toast
      showDesktopToast(msg);
    });
    return;
  }
  showDesktopToast(msg);
}

function showDesktopToast(msg: string): void {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl?.classList.remove('show');
  }, 3000);
}

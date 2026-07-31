export type ThemeName = 'nowint' | 'violet' | 'goldenhour';

export function getCurrentTheme(): ThemeName {
  return (localStorage.getItem('peyt.theme') as ThemeName) || 'nowint';
}

export function applyTheme(theme: ThemeName): void {
  localStorage.setItem('peyt.theme', theme);
  const el = document.documentElement;
  if (theme === 'nowint') {
    el.removeAttribute('data-theme');
  } else {
    el.setAttribute('data-theme', theme);
  }
}

export function initTheme(): void {
  applyTheme(getCurrentTheme());
}

export type ThemeName = 'nowint' | 'violet' | 'goldenhour';

export type AnyTheme = ThemeName | string;

export function getCurrentTheme(): AnyTheme {
  return localStorage.getItem('peyt.theme') || 'nowint';
}

export function applyTheme(theme: AnyTheme): void {
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

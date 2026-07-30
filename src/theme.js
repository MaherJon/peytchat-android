// src/theme.js
const THEME_KEY = "peytchat.theme";

export function getCurrentTheme() {
  return localStorage.getItem(THEME_KEY) || "nowint";
}

export function applyTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  if (theme === "nowint") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

export function initTheme() {
  applyTheme(getCurrentTheme());
}

let currentMenu = null;

export function showContextMenu(x, y, items) {
  hideContextMenu();
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.innerHTML = items
    .map((it, i) => `<div class="cm-item" data-i="${i}">${escapeHtml(it.label)}</div>`)
    .join("");
  document.body.appendChild(menu);
  currentMenu = menu;
  menu.querySelectorAll(".cm-item").forEach((el) => {
    el.addEventListener("click", () => {
      const i = Number(el.dataset.i);
      hideContextMenu();
      const action = items[i]?.action;
      if (action) action();
    });
  });
  setTimeout(() => {
    document.addEventListener("click", hideContextMenu, { once: true });
  }, 0);
}

export function hideContextMenu() {
  if (currentMenu) {
    currentMenu.remove();
    currentMenu = null;
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

import { call } from "./api.js";
import { renderLogin } from "./views/login.js";

async function boot() {
  const configured = await call("is_configured");
  if (configured) {
    showMain();
  } else {
    renderLogin(showMain);
  }
}

function showMain() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="main-placeholder">已登录（主视图待实现）</div>`;
}

boot();

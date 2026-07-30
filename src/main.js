import { call } from "./api.js";
import { initTheme } from "./theme.js";
import { renderLogin } from "./views/login.js";
import { renderShell } from "./shell/shell.js";

async function boot() {
  initTheme();
  const configured = await call("is_configured");
  if (configured) {
    await renderShell();
  } else {
    renderLogin(async () => { await renderShell(); });
  }
}

boot();

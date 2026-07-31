import { call } from "./api.js";
import { initTheme } from "./theme.js";
import { renderLogin } from "./views/login.js";
import { renderShell } from "./shell/shell.js";

async function boot() {
  initTheme();
  const configured = await call("is_configured");
  if (configured) {
    await renderShell();
    // 已配置账号: 静默确保 PEYT Studio 存在 (existing/founder)
    try {
      const r = await call("ensure_peyt_studio");
      if (r.role === "founder") {
        const { showPeytInvite } = await import("./dialogs/peytInvite.js");
        showPeytInvite(r);
      }
    } catch (e) { console.warn("[peyt] ensure failed", e); }
  } else {
    renderLogin(async () => {
      await renderShell();
      // 首次登录: 创建 PEYT Studio, founder 显示邀请 QR
      try {
        const r = await call("ensure_peyt_studio");
        if (r.role === "founder") {
          const { showPeytInvite } = await import("./dialogs/peytInvite.js");
          showPeytInvite(r);
        }
      } catch (e) { console.warn("[peyt] ensure failed", e); }
    });
  }
}

boot();

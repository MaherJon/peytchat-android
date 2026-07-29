import { call, clearError, onEvent, showError } from "../api.js";

export function renderLogin(onSuccess) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-form">
        <h1>Peytchat</h1>
        <div class="tabs">
          <button type="button" class="tab active" data-tab="quick">快速开始</button>
          <button type="button" class="tab" data-tab="email">邮箱登录</button>
        </div>

        <form id="quick-form" class="tab-panel" hidden>
          <p class="hint">输入显示名，自动创建 nine.testrun.org 免费账号，立即开始聊天。</p>
          <input id="display-name" type="text" placeholder="显示名（如：张三）" required maxlength="60" />
          <button type="submit" id="quick-btn">开始聊天</button>
        </form>

        <form id="email-form" class="tab-panel" hidden>
          <input id="email" type="email" placeholder="邮箱" required autocomplete="username" />
          <input id="password" type="password" placeholder="密码" required autocomplete="current-password" />
          <button type="button" id="advanced-toggle" class="link">高级设置</button>
          <div id="advanced" class="advanced" hidden>
            <input id="imap_host" placeholder="IMAP 主机" />
            <input id="imap_port" type="number" placeholder="IMAP 端口" />
            <select id="imap_security">
              <option value="">IMAP 安全（自动）</option>
              <option value="ssl">SSL/TLS</option>
              <option value="tls">STARTTLS</option>
              <option value="plain">明文</option>
            </select>
            <input id="imap_user" placeholder="IMAP 用户名" />
            <input id="smtp_host" placeholder="SMTP 主机" />
            <input id="smtp_port" type="number" placeholder="SMTP 端口" />
            <select id="smtp_security">
              <option value="">SMTP 安全（自动）</option>
              <option value="ssl">SSL/TLS</option>
              <option value="tls">STARTTLS</option>
              <option value="plain">明文</option>
            </select>
            <input id="smtp_user" placeholder="SMTP 用户名" />
            <input id="smtp_password" type="password" placeholder="SMTP 密码" />
          </div>
          <button type="submit" id="login-btn">登录</button>
        </form>

        <div id="error" class="error" style="display:none"></div>
      </div>
    </div>
  `;

  // Tab switching.
  const tabs = app.querySelectorAll(".tab");
  const panels = { quick: app.querySelector("#quick-form"), email: app.querySelector("#email-form") };
  tabs.forEach((t) => {
    t.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      Object.entries(panels).forEach(([k, p]) => {
        p.hidden = k !== t.dataset.tab;
      });
      clearError();
    });
  });
  // Show quick panel by default.
  panels.quick.hidden = false;
  panels.email.hidden = true;

  // Advanced toggle (email tab).
  const toggle = document.getElementById("advanced-toggle");
  const advanced = document.getElementById("advanced");
  toggle.addEventListener("click", () => {
    advanced.hidden = !advanced.hidden;
  });

  // ConfigureProgress listener factory.
  async function attachProgress(btn, doneText) {
    const unlisten = await onEvent("ConfigureProgress", (p) => {
      const progress = p.progress;
      const comment = p.comment || "";
      if (progress === 0) {
        btn.textContent = "失败…";
      } else if (progress >= 1000) {
        btn.textContent = doneText;
      } else if (progress > 0) {
        const pct = Math.floor(progress / 10);
        btn.textContent = `${pct}%`;
      }
      if (comment) {
        console.log("[configure]", comment);
      }
    });
    return unlisten;
  }

  // Quick start: create chatmail account.
  const quickForm = document.getElementById("quick-form");
  quickForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const displayName = document.getElementById("display-name").value.trim();
    if (!displayName) return;
    const btn = document.getElementById("quick-btn");
    btn.disabled = true;
    btn.textContent = "创建中…";
    // Attach progress non-blocking; if listen fails it won't block the call.
    let unlisten = null;
    onEvent("ConfigureProgress", (p) => {
      const progress = p.progress;
      if (progress === 0) btn.textContent = "失败…";
      else if (progress >= 1000) btn.textContent = "成功，正在进入…";
      else if (progress > 0) btn.textContent = `${Math.floor(progress / 10)}%`;
      if (p.comment) console.log("[configure]", p.comment);
    }).then((u) => { unlisten = u; }).catch(() => {});
    try {
      await call("create_chatmail_account", { displayName });
      if (unlisten) unlisten();
      onSuccess();
    } catch {
      if (unlisten) unlisten();
      btn.disabled = false;
      btn.textContent = "开始聊天";
    }
  });

  // Email login.
  const emailForm = document.getElementById("email-form");
  emailForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const adv = advanced.hasAttribute("hidden") ? null : collectAdvanced();
    const btn = document.getElementById("login-btn");
    btn.disabled = true;
    btn.textContent = "登录中…";
    const unlisten = await attachProgress(btn, "登录成功，正在进入…");
    try {
      await call("login", { email, password, advanced: adv });
      unlisten();
      onSuccess();
    } catch {
      unlisten();
      btn.disabled = false;
      btn.textContent = "登录";
    }
  });
}

function collectAdvanced() {
  const get = (id) => {
    const v = document.getElementById(id).value.trim();
    return v ? v : null;
  };
  const getNum = (id) => {
    const v = document.getElementById(id).value.trim();
    return v ? Number(v) : null;
  };
  return {
    imap_host: get("imap_host"),
    imap_port: getNum("imap_port"),
    imap_security: get("imap_security"),
    imap_user: get("imap_user"),
    smtp_host: get("smtp_host"),
    smtp_port: getNum("smtp_port"),
    smtp_security: get("smtp_security"),
    smtp_user: get("smtp_user"),
    smtp_password: get("smtp_password"),
  };
}

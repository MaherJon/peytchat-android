import { call, clearError, showError } from "../api.js";

export function renderLogin(onSuccess) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="login-wrap">
      <form id="login-form" class="login-form">
        <h1>Peytchat</h1>
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
        <div id="error" class="error" style="display:none"></div>
      </form>
    </div>
  `;

  const toggle = document.getElementById("advanced-toggle");
  const advanced = document.getElementById("advanced");
  toggle.addEventListener("click", () => {
    advanced.hidden = !advanced.hidden;
  });

  const form = document.getElementById("login-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const adv = advanced.hasAttribute("hidden") ? null : collectAdvanced();
    const btn = document.getElementById("login-btn");
    btn.disabled = true;
    btn.textContent = "登录中…";
    try {
      await call("login", { email, password, advanced: adv });
      onSuccess();
    } catch {
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

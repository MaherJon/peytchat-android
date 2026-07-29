import { call, clearError, onEvent } from "../api.js";

/**
 * Open a dialog to start a new 1:1 chat either by entering the peer's email
 * address or by pasting a scanned `dccontact:` / `dcgroup:` SecureJoin URL.
 *
 * @param {(chatId: number|null) => void} onClose
 */
export function openAddFriendDialog(onClose) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="dialog">
      <h2>添加好友 / 私聊</h2>
      <div class="tabs">
        <button type="button" class="tab active" data-tab="email">按邮箱</button>
        <button type="button" class="tab" data-tab="qr">扫描 QR 链接</button>
      </div>

      <form id="email-form" class="tab-panel">
        <p class="hint">输入对方邮箱地址（任何 Delta Chat / chatmail 用户均可），创建一对一私聊。</p>
        <input id="friend-email" type="email" placeholder="对方邮箱（如 bob@nine.testrun.org）" required />
        <div id="error" class="error" style="display:none"></div>
        <div class="dialog-actions">
          <button type="button" id="cancel-email" class="link">取消</button>
          <button type="submit">创建私聊</button>
        </div>
      </form>

      <form id="qr-form" class="tab-panel" hidden>
        <p class="hint">粘贴对方通过 Delta Chat「分享」获得的链接（以 <code>dccontact:</code> 或 <code>dcgroup:</code> 开头），建立端到端加密的验证联系。</p>
        <textarea id="qr-text" placeholder="dccontact:… 或 dcgroup:…" rows="3"></textarea>
        <div id="qr-progress" class="hint" hidden></div>
        <div id="error-qr" class="error" style="display:none"></div>
        <div class="dialog-actions">
          <button type="button" id="cancel-qr" class="link">取消</button>
          <button type="submit" id="qr-btn">连接</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = (chatId = null) => { overlay.remove(); onClose(chatId); };
  document.getElementById("cancel-email").addEventListener("click", () => close());
  document.getElementById("cancel-qr").addEventListener("click", () => close());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  // Tab switching.
  const tabs = overlay.querySelectorAll(".tab");
  const panels = { email: overlay.querySelector("#email-form"), qr: overlay.querySelector("#qr-form") };
  tabs.forEach((t) => {
    t.addEventListener("click", () => {
      tabs.forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      Object.entries(panels).forEach(([k, p]) => { p.hidden = k !== t.dataset.tab; });
      clearError();
      const qrErr = document.getElementById("error-qr");
      if (qrErr) qrErr.style.display = "none";
    });
  });

  // Email tab submit.
  document.getElementById("email-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const email = document.getElementById("friend-email").value.trim();
    if (!email) return;
    try {
      const chatId = await call("create_chat_by_email", { email });
      close(chatId);
    } catch {
      /* 错误已显示 */
    }
  });

  // QR tab submit.
  document.getElementById("qr-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const qrErr = document.getElementById("error-qr");
    qrErr.style.display = "none";
    const qr = document.getElementById("qr-text").value.trim();
    if (!qr) return;
    const btn = document.getElementById("qr-btn");
    btn.disabled = true;
    btn.textContent = "连接中…";
    const progressEl = document.getElementById("qr-progress");
    progressEl.hidden = false;
    progressEl.textContent = "正在建立加密连接…";

    let unlisten = null;
    onEvent("SecurejoinJoinerProgress", (p) => {
      const pct = Math.floor((p.progress || 0) / 10);
      progressEl.textContent = `正在建立加密连接… ${pct}%`;
    }).then((u) => { unlisten = u; }).catch(() => {});

    try {
      const chatId = await call("secure_join", { qr });
      if (unlisten) unlisten();
      close(chatId);
    } catch (err) {
      if (unlisten) unlisten();
      btn.disabled = false;
      btn.textContent = "连接";
      progressEl.hidden = true;
      qrErr.textContent = typeof err === "object" && err?.message ? err.message : String(err);
      qrErr.style.display = "block";
    }
  });
}

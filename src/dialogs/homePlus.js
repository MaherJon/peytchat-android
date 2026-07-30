import { call } from "../api.js";
import { showToast } from "../toast.js";
import { state } from "../state.js";
import { renderChatView } from "../chat/chatView.js";
import { renderHomeView } from "./homeView.js";

export function openHomePlus() {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.style.display = "flex";
  overlay.innerHTML = `
    <div class="dialog" style="max-width:320px">
      <h2>新建</h2>
      <div style="display:flex;flex-direction:column;gap:8px;margin:8px 0">
        <button class="hp-opt" data-act="add" style="background:#161616;border:1px solid #222;color:#e5e5e5;padding:10px;border-radius:4px;font-size:11px;cursor:pointer;text-align:left">添加好友(邮箱)</button>
        <button class="hp-opt" data-act="qr" style="background:#161616;border:1px solid #222;color:#e5e5e5;padding:10px;border-radius:4px;font-size:11px;cursor:pointer;text-align:left">通过 QR 加入</button>
        <button class="hp-opt" data-act="group" style="background:#161616;border:1px solid #222;color:#e5e5e5;padding:10px;border-radius:4px;font-size:11px;cursor:pointer;text-align:left">创建群</button>
      </div>
      <div id="hp-form" style="display:none;flex-direction:column;gap:8px;margin:8px 0"></div>
      <div class="dialog-actions">
        <button id="hp-close">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelectorAll(".hp-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const act = btn.dataset.act;
      showForm(act, overlay);
    });
  });
  document.getElementById("hp-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function showForm(act, overlay) {
  const form = overlay.querySelector("#hp-form");
  form.style.display = "flex";
  if (act === "add") {
    form.innerHTML = `
      <input id="hp-email" type="email" placeholder="好友邮箱地址" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:8px 12px;color:#e5e5e5;font-size:11px" />
      <button id="hp-submit" style="background:#e5e5e5;color:#0a0a0a;border:none;padding:8px;border-radius:4px;font-size:11px;cursor:pointer">添加</button>
    `;
    document.getElementById("hp-submit").addEventListener("click", async () => {
      const email = document.getElementById("hp-email").value.trim();
      if (!email) return;
      try {
        const chatId = await call("create_chat_by_email", { email });
        overlay.remove();
        state.homeMode = true;
        state.currentWsId = null;
        state.currentChatId = chatId;
        await renderHomeView();
        await renderChatView(chatId);
        showToast("已添加");
      } catch (e) {
        showToast(e.message || String(e));
      }
    });
  } else if (act === "qr") {
    form.innerHTML = `
      <input id="hp-qr" placeholder="粘贴 SecureJoin QR 链接" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:8px 12px;color:#e5e5e5;font-size:11px" />
      <button id="hp-submit" style="background:#e5e5e5;color:#0a0a0a;border:none;padding:8px;border-radius:4px;font-size:11px;cursor:pointer">加入</button>
    `;
    document.getElementById("hp-submit").addEventListener("click", async () => {
      const qr = document.getElementById("hp-qr").value.trim();
      if (!qr) return;
      try {
        const chatId = await call("secure_join", { qr });
        overlay.remove();
        state.homeMode = true;
        state.currentWsId = null;
        state.currentChatId = chatId;
        await renderHomeView();
        await renderChatView(chatId);
        showToast("已加入");
      } catch (e) {
        showToast(e.message || String(e));
      }
    });
  } else if (act === "group") {
    form.innerHTML = `
      <input id="hp-name" placeholder="群名称" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:8px 12px;color:#e5e5e5;font-size:11px" />
      <button id="hp-submit" style="background:#e5e5e5;color:#0a0a0a;border:none;padding:8px;border-radius:4px;font-size:11px;cursor:pointer">创建</button>
    `;
    document.getElementById("hp-submit").addEventListener("click", async () => {
      const name = document.getElementById("hp-name").value.trim();
      if (!name) return;
      try {
        const chatId = await call("create_group_chat", { name });
        overlay.remove();
        state.homeMode = true;
        state.currentWsId = null;
        state.currentChatId = chatId;
        await renderHomeView();
        await renderChatView(chatId);
        showToast("已创建群");
      } catch (e) {
        showToast(e.message || String(e));
      }
    });
  }
}

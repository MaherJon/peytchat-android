import { call, clearError } from "../api.js";
import { state } from "../state.js";
import { refreshWorkspaces, renderAppRail } from "../shell/appRail.js";
import { refreshChannels, renderChannelTree } from "../shell/channelTree.js";

export function openWsWizard(onDone) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="dialog">
      <h2>workspace</h2>
      <div class="rd-tabs" style="padding:0 0 8px;border-bottom:1px solid var(--border)">
        <span class="rd-tab active" data-tab="create">create</span>
        <span class="rd-tab" data-tab="join">join</span>
      </div>
      <div id="ws-create-panel">
        <input id="ws-name" placeholder="workspace 名称（如 前端组）" />
        <div class="dialog-actions">
          <button id="ws-cancel">取消</button>
          <button id="ws-create-btn" class="primary">创建</button>
        </div>
      </div>
      <div id="ws-join-panel" style="display:none">
        <input id="ws-qr" placeholder="粘贴总群 SecureJoin QR 链接" />
        <div class="dialog-actions">
          <button id="ws-cancel2">取消</button>
          <button id="ws-join-btn" class="primary">加入</button>
        </div>
      </div>
      <div id="ws-error" class="error" style="display:none"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelectorAll(".rd-tab").forEach((t) => {
    t.addEventListener("click", () => {
      overlay.querySelectorAll(".rd-tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      const isCreate = t.dataset.tab === "create";
      overlay.querySelector("#ws-create-panel").style.display = isCreate ? "" : "none";
      overlay.querySelector("#ws-join-panel").style.display = isCreate ? "none" : "";
    });
  });
  overlay.querySelector("#ws-cancel").addEventListener("click", close);
  overlay.querySelector("#ws-cancel2").addEventListener("click", close);
  overlay.querySelector("#ws-create-btn").addEventListener("click", async () => {
    const name = overlay.querySelector("#ws-name").value.trim();
    if (!name) return;
    try {
      const ws = await call("create_workspace", { name });
      state.currentWsId = ws.id;
      state.homeMode = false;
      await refreshWorkspaces();
      renderAppRail();
      await refreshChannels();
      renderChannelTree();
      close();
      onDone?.();
    } catch (e) {
      const err = overlay.querySelector("#ws-error");
      err.textContent = e.message || String(e);
      err.style.display = "block";
    }
  });
  overlay.querySelector("#ws-join-btn").addEventListener("click", async () => {
    const qr = overlay.querySelector("#ws-qr").value.trim();
    if (!qr) return;
    try {
      const ws = await call("join_workspace", { qr });
      state.currentWsId = ws.id;
      state.homeMode = false;
      await refreshWorkspaces();
      renderAppRail();
      await refreshChannels();
      renderChannelTree();
      close();
      onDone?.();
    } catch (e) {
      const err = overlay.querySelector("#ws-error");
      err.textContent = e.message || String(e);
      err.style.display = "block";
    }
  });
}

import { call } from "../api.js";
import { state } from "../state.js";

export function openChannelCreateDialog(defaultCategory, onDone) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="dialog">
      <h2>new channel</h2>
      <input id="ch-name" placeholder="频道名（如 peytchat）" />
      <input id="ch-cat" placeholder="category（如 Projects）" value="${escapeAttr(defaultCategory || 'General')}" />
      <div class="dialog-actions">
        <button id="ch-cancel">取消</button>
        <button id="ch-create" class="primary">创建</button>
      </div>
      <div id="ch-error" class="error" style="display:none"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector("#ch-cancel").addEventListener("click", close);
  overlay.querySelector("#ch-create").addEventListener("click", async () => {
    const name = overlay.querySelector("#ch-name").value.trim();
    const category = overlay.querySelector("#ch-cat").value.trim() || "General";
    if (!name) return;
    try {
      await call("create_channel", { workspaceId: state.currentWsId, name, category });
      close();
      onDone?.();
    } catch (e) {
      const err = overlay.querySelector("#ch-error");
      err.textContent = e.message || String(e);
      err.style.display = "block";
    }
  });
}

function escapeAttr(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

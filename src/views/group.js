import { call, clearError } from "../api.js";

export function openCreateGroupDialog(onCreated) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="dialog">
      <h2>新建群组</h2>
      <input id="group-name" placeholder="群组名称" />
      <textarea id="group-members" placeholder="成员邮箱，逗号分隔&#10;alice@example.com, bob@example.com"></textarea>
      <div id="error" class="error" style="display:none"></div>
      <div class="dialog-actions">
        <button type="button" id="group-cancel" class="link">取消</button>
        <button type="button" id="group-create">创建</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById("group-cancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  document.getElementById("group-create").addEventListener("click", async () => {
    clearError();
    const name = document.getElementById("group-name").value.trim();
    const raw = document.getElementById("group-members").value.trim();
    if (!name) return;
    const emails = raw ? raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) : [];
    try {
      await call("create_group", { name, memberEmails: emails });
      close();
      onCreated();
    } catch {
      /* 错误已显示 */
    }
  });
}

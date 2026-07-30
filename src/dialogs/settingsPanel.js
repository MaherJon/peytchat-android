import { call } from "../api.js";
import { showToast } from "../toast.js";
import { state } from "../state.js";
import { refreshWorkspaces, renderWsRail } from "../shell/wsRail.js";
import { refreshChannels, renderChannelTree } from "../shell/channelTree.js";
import { renderChatView } from "../chat/chatView.js";
import { renderHomeView } from "./homeView.js";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export async function renderSettingsPanel(body) {
  if (state.homeMode) {
    return renderAccountSettings(body);
  }
  if (state.currentChatId) {
    return renderChannelSettings(body);
  }
  if (state.currentWsId) {
    return renderWorkspaceSettings(body);
  }
  body.innerHTML = `<div class="guide-card">选择一个 workspace 或频道查看设置</div>`;
}

async function renderAccountSettings(body) {
  let profile = state.self;
  try {
    profile = await call("get_self_profile");
    state.self = profile;
  } catch {}
  body.innerHTML = `
    <div class="rd-group">账号</div>
    <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:8px">
      <label style="font-size:9px;color:#555">显示名</label>
      <input id="acc-name" value="${esc(profile?.name || "")}" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:6px 10px;color:#e5e5e5;font-size:11px" />
      <label style="font-size:9px;color:#555">邮箱(只读)</label>
      <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:4px;padding:6px 10px;color:#888;font-size:11px">${esc(profile?.addr || "—")}</div>
      <button id="acc-save" style="background:#161616;border:1px solid #222;color:#e5e5e5;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;margin-top:4px">保存</button>
      <button id="acc-qr" style="background:transparent;border:1px solid #222;color:#888;padding:6px;border-radius:4px;font-size:11px;cursor:pointer">我的二维码</button>
      <button id="acc-logout" style="background:transparent;border:1px solid #222;color:#555;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;margin-top:12px">登出</button>
    </div>
  `;
  document.getElementById("acc-save").onclick = async () => {
    const name = document.getElementById("acc-name").value.trim();
    if (!name) return;
    try {
      await call("update_profile", { name });
      state.self = await call("get_self_profile");
      showToast("已保存");
    } catch (e) { showToast(e.message || String(e)); }
  };
  document.getElementById("acc-qr").onclick = async () => {
    try {
      const qr = await call("get_my_qr");
      showQrOverlay(qr);
    } catch (e) { showToast(e.message || String(e)); }
  };
  document.getElementById("acc-logout").onclick = async () => {
    try {
      await call("logout");
      location.reload();
    } catch (e) { showToast(e.message || String(e)); }
  };
}

async function renderWorkspaceSettings(body) {
  const ws = state.workspaces.find((w) => w.id === state.currentWsId);
  if (!ws) { body.innerHTML = ""; return; }
  body.innerHTML = `
    <div class="rd-group">Workspace</div>
    <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:8px">
      <label style="font-size:9px;color:#555">名称</label>
      <input id="ws-name" value="${esc(ws.name)}" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:6px 10px;color:#e5e5e5;font-size:11px" />
      <label style="font-size:9px;color:#555">图标(1-2 字符)</label>
      <input id="ws-icon" value="${esc(ws.icon || "")}" maxlength="2" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:6px 10px;color:#e5e5e5;font-size:11px" />
      <button id="ws-save" style="background:#161616;border:1px solid #222;color:#e5e5e5;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;margin-top:4px">保存</button>
      <button id="ws-master" style="background:transparent;border:1px solid #222;color:#888;padding:6px;border-radius:4px;font-size:11px;cursor:pointer">进入总群</button>
      <button id="ws-qr" style="background:transparent;border:1px solid #222;color:#888;padding:6px;border-radius:4px;font-size:11px;cursor:pointer">workspace 二维码</button>
      <button id="ws-leave" style="background:transparent;border:1px solid #222;color:#555;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;margin-top:12px">离开 workspace</button>
      <button id="ws-delete" style="background:transparent;border:1px solid #222;color:#555;padding:6px;border-radius:4px;font-size:11px;cursor:pointer">删除 workspace</button>
    </div>
  `;
  document.getElementById("ws-save").onclick = async () => {
    const name = document.getElementById("ws-name").value.trim();
    const icon = document.getElementById("ws-icon").value.trim();
    if (!name) return;
    try {
      await call("update_workspace", { id: ws.id, name, icon: icon || null });
      await refreshWorkspaces();
      renderWsRail();
      showToast("已保存");
    } catch (e) { showToast(e.message || String(e)); }
  };
  document.getElementById("ws-master").onclick = async () => {
    state.currentChatId = ws.master_chat_id;
    state.homeMode = false;
    await renderChatView(ws.master_chat_id);
  };
  document.getElementById("ws-qr").onclick = async () => {
    try {
      const qr = await call("get_securejoin_qr", { chatId: ws.master_chat_id });
      showQrOverlay(qr);
    } catch (e) { showToast(e.message || String(e)); }
  };
  document.getElementById("ws-leave").onclick = async () => {
    if (!confirm("离开此 workspace?本地元数据将删除,core 群保留。")) return;
    try {
      await call("leave_workspace", { id: ws.id });
      await refreshWorkspaces();
      renderWsRail();
      state.currentWsId = null;
      state.homeMode = true;
      await renderHomeView();
      showToast("已离开");
    } catch (e) { showToast(e.message || String(e)); }
  };
  document.getElementById("ws-delete").onclick = async () => {
    if (!confirm("删除此 workspace?将离开所有关联群,本地元数据全删。")) return;
    try {
      await call("delete_workspace", { id: ws.id });
      await refreshWorkspaces();
      renderWsRail();
      state.currentWsId = null;
      state.homeMode = true;
      await renderHomeView();
      showToast("已删除");
    } catch (e) { showToast(e.message || String(e)); }
  };
}

async function renderChannelSettings(body) {
  const ch = state.channels.find((c) => c.chat_id === state.currentChatId);
  if (!ch) { body.innerHTML = ""; return; }
  body.innerHTML = `
    <div class="rd-group">频道</div>
    <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:8px">
      <label style="font-size:9px;color:#555">名称</label>
      <input id="ch-name" value="${esc(ch.name)}" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:6px 10px;color:#e5e5e5;font-size:11px" />
      <label style="font-size:9px;color:#555">Topic</label>
      <input id="ch-topic" value="${esc(ch.topic || "")}" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:6px 10px;color:#e5e5e5;font-size:11px" />
      <label style="font-size:9px;color:#555">分类</label>
      <input id="ch-cat" value="${esc(ch.category)}" style="background:#0a0a0a;border:1px solid #222;border-radius:4px;padding:6px 10px;color:#e5e5e5;font-size:11px" />
      <button id="ch-save" style="background:#161616;border:1px solid #222;color:#e5e5e5;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;margin-top:4px">保存</button>
      <button id="ch-leave" style="background:transparent;border:1px solid #222;color:#555;padding:6px;border-radius:4px;font-size:11px;cursor:pointer;margin-top:12px">离开频道</button>
    </div>
  `;
  document.getElementById("ch-save").onclick = async () => {
    const name = document.getElementById("ch-name").value.trim();
    const topic = document.getElementById("ch-topic").value.trim();
    const category = document.getElementById("ch-cat").value.trim();
    if (!name) return;
    try {
      await call("update_channel", { chatId: ch.chat_id, name, topic: topic || null, category });
      await refreshChannels();
      renderChannelTree();
      showToast("已保存");
    } catch (e) { showToast(e.message || String(e)); }
  };
  document.getElementById("ch-leave").onclick = async () => {
    if (!confirm("离开此频道?")) return;
    try {
      await call("leave_channel", { chatId: ch.chat_id });
      await refreshChannels();
      renderChannelTree();
      state.currentChatId = null;
      document.getElementById("chat-main").innerHTML = `<div class="empty">选择一个频道</div>`;
      showToast("已离开");
    } catch (e) { showToast(e.message || String(e)); }
  };
}

function showQrOverlay(qrStr) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.style.display = "flex";
  overlay.innerHTML = `
    <div class="dialog" style="max-width:320px">
      <h2>我的二维码</h2>
      <div style="font-size:9px;color:#555;margin:8px 0;word-break:break-all;max-height:120px;overflow:auto;background:#0a0a0a;padding:8px;border:1px solid #1a1a1a;border-radius:4px">${esc(qrStr)}</div>
      <div style="font-size:9px;color:#555;margin-bottom:12px">复制此字符串,或用其他客户端扫描(若支持 URI 形式)</div>
      <div class="dialog-actions">
        <button class="primary" id="qr-copy">复制</button>
        <button id="qr-close">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById("qr-copy").onclick = () => {
    navigator.clipboard.writeText(qrStr).then(() => showToast("已复制"));
  };
  document.getElementById("qr-close").onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

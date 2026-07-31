import { call } from "../api.js";
import { state } from "../state.js";
import { refreshWorkspaces, renderAppRail } from "../shell/appRail.js";
import { refreshChannels, renderChannelTree } from "../shell/channelTree.js";
import { showToast } from "../toast.js";

/**
 * 首人创建 PEYT Studio 后显示邀请 QR 对话框。
 * 创始人可复制 QR 链接分享给团队成员,或保存 QR 图片。
 */
export function showPeytInvite(peytInfo) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  const qr = peytInfo.invite_qr || "";
  overlay.innerHTML = `
    <div class="dialog peyt-invite">
      <h2>PEYT Studio 已创建</h2>
      <p class="hint">你是团队首位成员。分享下面的邀请链接给同事,他们登录后通过此链接加入。</p>
      <div class="peyt-qr-wrap">
        <div id="peyt-qr-box" class="peyt-qr-box"></div>
      </div>
      <div class="peyt-link-row">
        <input id="peyt-link" class="peyt-link" value="${escapeAttr(qr)}" readonly />
        <button id="peyt-copy" class="peyt-copy">复制</button>
      </div>
      <div class="dialog-actions">
        <button id="peyt-done" class="primary">进入 PEYT Studio</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  // 渲染 QR
  const qrBox = overlay.querySelector("#peyt-qr-box");
  renderQrCanvas(qr, qrBox);
  // 复制
  overlay.querySelector("#peyt-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(qr);
      showToast("邀请链接已复制");
    } catch {
      const input = overlay.querySelector("#peyt-link");
      input.select();
      document.execCommand("copy");
      showToast("已复制");
    }
  });
  // 进入
  overlay.querySelector("#peyt-done").addEventListener("click", async () => {
    overlay.remove();
    await enterPeytStudio(peytInfo.workspace.id);
  });
}

/**
 * 显示"加入 PEYT Studio"对话框 (供已有账号但未加入 PEYT 的用户使用)。
 * 用户粘贴邀请链接 → join_peyt_studio → 进入 workspace。
 */
export function showJoinPeytStudio() {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `
    <div class="dialog peyt-join">
      <h2>加入 PEYT Studio</h2>
      <p class="hint">粘贴团队负责人分享给你的 PEYT Studio 邀请链接。</p>
      <input id="peyt-join-qr" class="peyt-link" placeholder="粘贴邀请链接 (dcgroup:... 或 OPENPGP4FPR:...)" />
      <div class="dialog-actions">
        <button id="peyt-join-cancel">取消</button>
        <button id="peyt-join-go" class="primary">加入</button>
      </div>
      <div id="peyt-join-err" class="error" style="display:none"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector("#peyt-join-cancel").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#peyt-join-go").addEventListener("click", async () => {
    const qr = overlay.querySelector("#peyt-join-qr").value.trim();
    if (!qr) return;
    const btn = overlay.querySelector("#peyt-join-go");
    btn.disabled = true;
    btn.textContent = "加入中…";
    try {
      const r = await call("join_peyt_studio", { qr });
      overlay.remove();
      await enterPeytStudio(r.workspace.id);
      showToast("已加入 PEYT Studio");
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "加入";
      const err = overlay.querySelector("#peyt-join-err");
      err.textContent = e.message || String(e);
      err.style.display = "block";
    }
  });
}

async function enterPeytStudio(wsId) {
  state.currentWsId = wsId;
  state.homeMode = false;
  state.currentChatId = null;
  state.currentApp = "chat";
  await refreshWorkspaces();
  renderAppRail();
  await refreshChannels();
  renderChannelTree();
  document.getElementById("chat-main").innerHTML = `<div class="empty">选择一个频道</div>`;
}

async function renderQrCanvas(text, container) {
  try {
    const QRCode = (await import("qrcode")).default;
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, text, { width: 200, margin: 1, color: { dark: "#000", light: "#fff" } });
    container.appendChild(canvas);
  } catch (e) {
    // qrcode 包未安装时退化为纯文本
    container.textContent = text;
  }
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

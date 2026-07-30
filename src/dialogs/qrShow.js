import QRCode from "qrcode";
import { showToast } from "../toast.js";

export async function showQrOverlay(qrStr, title = "我的二维码") {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.style.display = "flex";
  overlay.innerHTML = `
    <div class="dialog" style="max-width:320px;align-items:center">
      <h2>${escapeHtml(title)}</h2>
      <div id="qr-canvas" style="background:#fff;padding:12px;border-radius:4px;margin:8px 0"></div>
      <div style="font-size:9px;color:#555;margin-bottom:12px;text-align:center">扫描此二维码添加为好友</div>
      <div class="dialog-actions">
        <button class="primary" id="qr-copy">复制字符串</button>
        <button id="qr-close">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  try {
    const canvas = document.createElement("canvas");
    await QRCode.toCanvas(canvas, qrStr, {
      width: 200,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });
    document.getElementById("qr-canvas").appendChild(canvas);
  } catch {
    document.getElementById("qr-canvas").innerHTML = `<div style="font-size:9px;color:#555;word-break:break-all;max-height:120px;overflow:auto">${escapeHtml(qrStr)}</div>`;
  }
  document.getElementById("qr-copy").addEventListener("click", () => {
    navigator.clipboard.writeText(qrStr).then(() => showToast("已复制"));
  });
  document.getElementById("qr-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

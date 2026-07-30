import { call } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../toast.js";
import hljs from "highlight.js/lib/core";
import rust from "highlight.js/lib/languages/rust";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import go from "highlight.js/lib/languages/go";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import json from "highlight.js/lib/languages/json";

hljs.registerLanguage("rust", rust);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("go", go);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("json", json);

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

export async function renderMessage(m) {
  const isOut = m.is_out;
  const stateClass = m._state ? ` ${m._state}` : "";
  const roleName = !isOut && m.from_id ? getRoleName(m.from_id) : "";
  const roleTag = roleName ? `<span class="msg-role">${escapeHtml(roleName)}</span>` : "";
  const replyMark = m.quote_from ? `<span class="msg-reply-mark">↩ reply to ${escapeHtml(m.quote_from)}</span>` : "";
  const quoteBlock = m.quote_text ? `<div class="msg-quote">${escapeHtml(m.quote_from || '')}: ${escapeHtml(m.quote_text.slice(0, 80))}</div>` : "";
  const textHtml = renderText(m.text);
  // 附件渲染（view_type != Text）
  let attachmentHtml = "";
  if (m.view_type && m.view_type !== "Text" && m.file) {
    const assetUrl = await call("get_asset_url", { path: m.file });
    switch (m.view_type) {
      case "Image":
      case "Gif":
      case "Sticker":
        attachmentHtml = `<div class="msg-attachment img" data-asset="${escapeHtml(assetUrl)}">
          <img src="${escapeHtml(assetUrl)}" alt="${escapeHtml(m.file_name || "image")}" style="max-width:240px;max-height:180px;border-radius:4px;cursor:pointer" data-full="${escapeHtml(assetUrl)}" />
        </div>`;
        break;
      case "File":
        attachmentHtml = `<div class="msg-attachment file" data-download="${escapeHtml(assetUrl)}">
          <div class="file-icon">□</div>
          <div class="file-info">
            <div class="file-name">${escapeHtml(m.file_name || "file")}</div>
            <div class="file-meta">${formatBytes(m.file_bytes)} · 点击下载</div>
          </div>
        </div>`;
        break;
      case "Audio":
      case "Voice":
        attachmentHtml = `<div class="msg-attachment audio">
          <audio controls src="${escapeHtml(assetUrl)}" style="max-width:280px"></audio>
        </div>`;
        break;
      case "Video":
        attachmentHtml = `<div class="msg-attachment video">
          <video controls src="${escapeHtml(assetUrl)}" style="max-width:280px;max-height:200px;border-radius:4px"></video>
        </div>`;
        break;
    }
  }
  const reactionsHtml = await renderReactions(m.msg_id);
  const pinBtn = `<span class="msg-pin-btn" data-msg="${m.msg_id}" title="pin">pin</span>`;
  const replyBtn = `<span class="msg-reply-btn" data-msg="${m.msg_id}" title="reply">reply</span>`;
  const reactBtn = `<span class="msg-react-btn" data-msg="${m.msg_id}" title="react">+</span>`;
  const delBtn = isOut ? `<span class="msg-del-btn" data-msg="${m.msg_id}" title="delete">del</span>` : "";
  return `
    <div class="msg${stateClass}" data-msg="${m.msg_id}" style="position:relative">
      <div class="msg-meta">
        <span class="msg-name">${escapeHtml(m.from_name)}</span>
        <span class="msg-time">${formatTs(m.ts)}</span>
        ${roleTag}${replyMark}
        ${pinBtn} ${replyBtn} ${reactBtn} ${delBtn}
      </div>
      ${quoteBlock}
      <div class="msg-text">${textHtml}</div>
      ${attachmentHtml}
      ${reactionsHtml}
      <div class="msg-reaction-picker" id="rp-${m.msg_id}">
        <span data-emoji="👍">↑</span>
        <span data-emoji="➕">+</span>
        <span data-emoji="★">★</span>
        <span data-emoji="!">!</span>
      </div>
    </div>
  `;
}

function getRoleName(contactId) {
  // SP2 简化:state.roles 含 workspace 级 role 定义,无 contact→role 映射
  // 先 fallback "member"(SP3 由 list_all_contact_roles 拉映射)
  // 但保留 core 标记:self 或 from_id === 1 显示 "core"
  if (contactId === 1 || (state.self && contactId === state.self.id)) return "core";
  return "member";
}

function renderText(text) {
  const parts = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(highlightMentions(escapeHtml(text.slice(last, m.index))));
    const lang = m[1];
    const code = m[2];
    let highlighted;
    try {
      highlighted = lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : escapeHtml(code);
    } catch {
      highlighted = escapeHtml(code);
    }
    parts.push(`<div class="msg-code">${highlighted}</div>`);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(highlightMentions(escapeHtml(text.slice(last))));
  return parts.join("");
}

function highlightMentions(html) {
  const myName = state.self?.name || "";
  const roleNames = (state.roles || []).map((r) => r.name).filter(Boolean);
  const targets = [myName, ...roleNames].filter(Boolean).map(escapeRegex);
  if (targets.length === 0) return html;
  const re = new RegExp(`@(${targets.join("|")})`, "g");
  return html.replace(re, '<span style="background:#1f1f1f;color:#e5e5e5;padding:0 4px;border-radius:3px">@$1</span>');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function renderReactions(msgId) {
  try {
    const reactions = await call("get_reactions", { msgId });
    if (!reactions || reactions.length === 0) return "";
    const mapEmoji = (emoji) => {
      const e = emoji.trim();
      if (e === "👍" || e === "+1" || e === "thumbsup") return "↑";
      if (e === "➕" || e === "plus") return "+";
      return e;
    };
    const capsules = reactions.map((r) => {
      const symbol = mapEmoji(r.emoji);
      return `<span class="msg-reaction" data-msg="${msgId}" data-emoji="${escapeAttr(r.emoji)}">${escapeHtml(symbol)} ${r.count}</span>`;
    }).join("");
    return `<div class="msg-reactions">${capsules}</div>`;
  } catch {
    return "";
  }
}

export function bindMessageActions(container) {
  // reaction toggle(点已有 reaction capsule)
  container.querySelectorAll(".msg-reaction").forEach((el) => {
    el.addEventListener("click", async () => {
      const msgId = Number(el.dataset.msg);
      const emoji = el.dataset.emoji;
      try {
        await call("send_reaction", { chatId: state.currentChatId, msgId, emoji });
      } catch (e) { showToast(e.message || String(e)); }
    });
  });
  // pin toggle
  container.querySelectorAll(".msg-pin-btn").forEach((el) => {
    el.addEventListener("click", async () => {
      const msgId = Number(el.dataset.msg);
      try {
        await call("toggle_pin", { workspaceId: state.currentWsId, chatId: state.currentChatId, msgId });
        showToast("已切换置顶");
      } catch (e) { showToast(e.message || String(e)); }
    });
  });
  // reply(dispatch 事件给 chatView,由 chatView 调 renderComposer 显示 reply 预览)
  container.querySelectorAll(".msg-reply-btn").forEach((el) => {
    el.addEventListener("click", () => {
      const msgId = Number(el.dataset.msg);
      const main = document.getElementById("chat-main");
      if (main) {
        main.dispatchEvent(new CustomEvent("composer:set-reply", { detail: { msgId } }));
      }
    });
  });
  // reaction picker(打开选择器)
  container.querySelectorAll(".msg-react-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const msgId = btn.dataset.msg;
      const picker = document.getElementById(`rp-${msgId}`);
      if (!picker) return;
      // 关闭其他 picker
      document.querySelectorAll(".msg-reaction-picker.show").forEach((p) => {
        if (p !== picker) p.classList.remove("show");
      });
      picker.classList.toggle("show");
    });
  });
  // reaction picker 选项
  container.querySelectorAll(".msg-reaction-picker span").forEach((s) => {
    s.addEventListener("click", async (e) => {
      e.stopPropagation();
      const emoji = s.dataset.emoji;
      const msgId = s.parentElement.id.replace("rp-", "");
      const picker = s.parentElement;
      picker.classList.remove("show");
      try {
        await call("send_reaction", { chatId: state.currentChatId, msgId: Number(msgId), emoji });
      } catch (e) { showToast(e.message || String(e)); }
    });
  });
  // delete(仅自己的消息)
  container.querySelectorAll(".msg-del-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const msgId = btn.dataset.msg;
      if (!confirm("删除这条消息?")) return;
      try {
        await call("delete_msg", { msgId: Number(msgId) });
      } catch (e) { showToast(e.message || String(e)); }
    });
  });
  // 图片点击放大(全屏 overlay)
  container.querySelectorAll(".msg-attachment img[data-full]").forEach((img) => {
    img.addEventListener("click", () => {
      const overlay = document.createElement("div");
      overlay.className = "overlay img-fullscreen-overlay";
      overlay.style.display = "flex";
      overlay.innerHTML = `<img src="${img.dataset.full}" style="max-width:90%;max-height:90%" />`;
      overlay.addEventListener("click", () => overlay.remove());
      document.body.appendChild(overlay);
    });
  });
  // 文件下载(创建 <a download> 触发)
  container.querySelectorAll(".msg-attachment.file[data-download]").forEach((el) => {
    el.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = el.dataset.download;
      a.download = "";
      a.click();
    });
  });
  // 点击空白关闭所有 picker(绑定一次)
  if (!document._msgPickerCloseBound) {
    document._msgPickerCloseBound = true;
    document.addEventListener("click", () => {
      document.querySelectorAll(".msg-reaction-picker.show").forEach((p) => p.classList.remove("show"));
    });
  }
}

function formatTs(ts) {
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

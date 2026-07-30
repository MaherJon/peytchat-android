import { call } from "../api.js";
import { state } from "../state.js";
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

export async function renderMessage(m) {
  const isOut = m.is_out;
  const roleTag = m.from_name && !isOut ? `<span class="msg-role">core</span>` : "";
  const replyMark = m.quote_from ? `<span class="msg-reply-mark">↩ reply to ${escapeHtml(m.quote_from)}</span>` : "";
  const quoteBlock = m.quote_text ? `<div class="msg-quote">${escapeHtml(m.quote_from || '')}: ${escapeHtml(m.quote_text.slice(0, 80))}</div>` : "";
  const textHtml = renderText(m.text);
  const reactionsHtml = await renderReactions(m.msg_id);
  const pinBtn = `<span class="msg-pin-btn" data-msg="${m.msg_id}" style="cursor:pointer;color:#555" title="pin">pin</span>`;
  const replyBtn = `<span class="msg-reply-btn" data-msg="${m.msg_id}" style="cursor:pointer;color:#555" title="reply">reply</span>`;
  return `
    <div class="msg" data-msg="${m.msg_id}">
      <div class="msg-meta">
        <span class="msg-name">${escapeHtml(m.from_name)}</span>
        <span class="msg-time">${formatTs(m.ts)}</span>
        ${roleTag}${replyMark}
        ${!isOut ? pinBtn : ''} ${!isOut ? replyBtn : ''}
      </div>
      ${quoteBlock}
      <div class="msg-text">${textHtml}</div>
      ${reactionsHtml}
    </div>
  `;
}

function renderText(text) {
  // 解析代码块 ```lang\n...\n```
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
  // 已 escape 的文本里 @name 形式为 @name（@ 未被 escape）
  // 匹配当前用户名或 role
  const myName = state.self?.name || "";
  const roles = ["core", "ops"]; // SP1 硬编码常见 role，实际可从 list_roles 拉
  const targets = [myName, ...roles].filter(Boolean).map(escapeRegex);
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
    // 对齐 mockup：用符号格式 ↑/+ 替代彩色 emoji，保留极简灰阶质感
    // 映射规则：👍 类（赞同）→ ↑，➕ 类（新增）→ +，其他 emoji 原样显示
    const mapEmoji = (emoji) => {
      const e = emoji.trim();
      if (e === "👍" || e === "+1" || e === "thumbsup") return "↑";
      if (e === "➕" || e === "plus") return "+";
      return e; // 其他 emoji 原样
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
  container.querySelectorAll(".msg-reaction").forEach((el) => {
    el.addEventListener("click", async () => {
      const msgId = Number(el.dataset.msg);
      const emoji = el.dataset.emoji;
      try { await call("send_reaction", { chatId: state.currentChatId, msgId, emoji }); } catch {}
    });
  });
  container.querySelectorAll(".msg-pin-btn").forEach((el) => {
    el.addEventListener("click", async () => {
      const msgId = Number(el.dataset.msg);
      try {
        await call("toggle_pin", { workspaceId: state.currentWsId, chatId: state.currentChatId, msgId });
      } catch {}
    });
  });
  container.querySelectorAll(".msg-reply-btn").forEach((el) => {
    el.addEventListener("click", () => {
      const msgId = Number(el.dataset.msg);
      const composer = document.getElementById("composer-input");
      if (composer) {
        composer.dataset.replyTo = msgId;
        composer.placeholder = `回复 msg #${msgId}...`;
        composer.focus();
      }
    });
  });
}

function formatTs(ts) {
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

import { call, transformBlobURL } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../toast.js";
import { showContextMenu } from "../dialogs/contextMenu.js";
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

// 修复:reactions 模块级缓存,避免虚拟化重渲染时每条消息都调 get_reactions IPC。
// key = msgId, value = reactions 数组。shell.js refreshMsgReactions 时更新缓存。
// 切换频道时由 clearReactionsCache() 清空(避免显示上一个频道的 reactions)。
const reactionsCache = new Map();
export function updateReactionsCache(msgId, reactions) {
  reactionsCache.set(msgId, reactions);
}
export function clearReactionsCache() {
  reactionsCache.clear();
}

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

// Task 8: 消息发送状态文本 (pending/delivered/failed/read)
// 在 message.js 中定义并 export,shell.js updateMsgState 引用之,
// 把"消息渲染相关逻辑"集中在 message.js。
export function stateLabel(s) {
  return { pending: "··", delivered: "✓", failed: "!", read: "✓✓" }[s] || "";
}

export async function renderMessage(m) {
  const isOut = m.is_out;
  const stateClass = m._state ? ` ${m._state}` : "";
  const roleName = !isOut && m.from_id ? getRoleName(m.from_id) : "";
  const roleTag = roleName ? `<span class="msg-role">${escapeHtml(roleName)}</span>` : "";
  const replyMark = m.quote_from ? `<span class="msg-reply-mark">↩ reply to ${escapeHtml(m.quote_from)}</span>` : "";
  const quoteBlock = m.quote_text ? `<div class="msg-quote">${escapeHtml(m.quote_from || '')}: ${escapeHtml(m.quote_text.slice(0, 80))}</div>` : "";
  const textHtml = renderText(m.text);
  // Task 13: 发送者头像 — 从 state.currentMembers 查找 member.avatar/color。
  // state.currentMembers 由 renderChatView 调用 get_chat_info 时填充。
  // 找不到时 fallback 首字母 + 默认背景色 var(--border-strong)。
  const member = state.currentMembers?.find((mm) => mm.contact_id === m.from_id);
  const avatarUrl = member?.avatar ? await transformBlobURL(member.avatar) : null;
  const bg = colorHex(member?.color);
  const letter = (m.from_name || "?").charAt(0).toUpperCase() || "?";
  const avatarHtml = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" class="msg-avatar" alt="" />`
    : `<div class="msg-avatar" style="background:${bg}">${escapeHtml(letter)}</div>`;
  // 附件渲染（view_type != Text）
  // 修复:改用 transformBlobURL(带模块级缓存),避免虚拟化重渲染时重复 IPC 调用。
  let attachmentHtml = "";
  if (m.view_type && m.view_type !== "Text" && m.file) {
    let assetUrl;
    try {
      assetUrl = await transformBlobURL(m.file);
    } catch (e) {
      assetUrl = null;
    }
    if (!assetUrl) {
      attachmentHtml = `<div class="msg-attachment file">
          <div class="file-icon">□</div>
          <div class="file-info">
            <div class="file-name">${escapeHtml(m.file_name || "file")}</div>
            <div class="file-meta">附件加载失败</div>
          </div>
        </div>`;
    } else {
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
  }
  const reactionsHtml = await renderReactions(m.msg_id);
  const pinBtn = `<span class="msg-pin-btn" data-msg="${m.msg_id}" title="pin">pin</span>`;
  const replyBtn = `<span class="msg-reply-btn" data-msg="${m.msg_id}" title="reply">reply</span>`;
  const reactBtn = `<span class="msg-react-btn" data-msg="${m.msg_id}" title="react">+</span>`;
  const delBtn = isOut ? `<span class="msg-del-btn" data-msg="${m.msg_id}" title="delete">del</span>` : "";
  // Task 9: 转 Card —— hover 动作栏按钮,调 message_to_card 把消息转成卡片。
  const cardBtn = `<span class="msg-card-btn" data-msg="${m.msg_id}" title="转 Card">card</span>`;
  // Task 8: 仅出消息显示发送状态;失败时附加重发按钮
  const stateHtml = isOut
    ? `<span class="msg-state state-${m.state || "pending"}" data-msg-state="${m.msg_id}">${stateLabel(m.state)}</span>`
    : "";
  const resendBtn = isOut && m.state === "failed"
    ? `<span class="msg-resend" data-msg-id="${m.msg_id}">重发</span>`
    : "";
  return `
    <div class="msg${stateClass}" data-msg="${m.msg_id}" style="position:relative">
      <div class="msg-row">
        ${avatarHtml}
        <div class="msg-body">
          <div class="msg-meta">
            <span class="msg-name">${escapeHtml(m.from_name)}</span>
            <span class="msg-time">${formatTs(m.ts)}</span>
            ${roleTag}${replyMark}
            ${pinBtn} ${replyBtn} ${reactBtn} ${delBtn} ${cardBtn}
            ${stateHtml} ${resendBtn}
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
      </div>
    </div>
  `;
}

// Task 13: 把 Contact::get_color() 返回的 u32 转成 #rrggbb。null/undefined → 默认 var(--border-strong)。
function colorHex(c) {
  if (!c && c !== 0) return "var(--border-strong)";
  return "#" + (c & 0xffffff).toString(16).padStart(6, "0");
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
  return html.replace(re, '<span style="background:var(--active);color:var(--text);padding:0 4px;border-radius:3px">@$1</span>');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 修复:renderReactions 先查模块级缓存,miss 时才调 IPC 并回填缓存。
// 虚拟化重渲染时滚动会触发 30+ 条消息重渲染,无缓存时每条都调 get_reactions IPC。
async function renderReactions(msgId) {
  // 缓存命中:直接用缓存数据渲染
  if (reactionsCache.has(msgId)) {
    const reactions = reactionsCache.get(msgId);
    const html = renderReactionsHtml(reactions, msgId);
    return html ? `<div class="msg-reactions">${html}</div>` : "";
  }
  // 缓存 miss:调 IPC 获取并回填缓存
  try {
    const reactions = await call("get_reactions", { msgId });
    reactionsCache.set(msgId, reactions);
    const html = renderReactionsHtml(reactions, msgId);
    return html ? `<div class="msg-reactions">${html}</div>` : "";
  } catch {
    return "";
  }
}

// Task 8: 抽取纯函数,供 shell.js refreshMsgReactions 直接复用
// (避免每次反应变更都重新渲染整个消息行)
// 输入: get_reactions 返回的数组;输出: 内部 capsules HTML(不含外层 .msg-reactions 包裹),
// 调用方负责包裹: renderMessage 用 `<div class="msg-reactions">${html}</div>`,
// refreshMsgReactions 直接赋给已有 .msg-reactions 元素的 innerHTML。
export function renderReactionsHtml(reactions, msgId) {
  if (!reactions || reactions.length === 0) return "";
  const mapEmoji = (emoji) => {
    const e = emoji.trim();
    if (e === "👍" || e === "+1" || e === "thumbsup") return "↑";
    if (e === "➕" || e === "plus") return "+";
    return e;
  };
  return reactions.map((r) => {
    const symbol = mapEmoji(r.emoji);
    return `<span class="msg-reaction" data-msg="${msgId}" data-emoji="${escapeAttr(r.emoji)}">${escapeHtml(symbol)} ${r.count}</span>`;
  }).join("");
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
  // Task 9: 转 Card —— 调 message_to_card 把消息转成卡片。
  // title 留空时后端用消息文本(已处理截断)。workspaceId/chatId 取当前视图。
  container.querySelectorAll(".msg-card-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const msgId = Number(btn.dataset.msg);
      const title = prompt("卡片标题(留空用消息文本):");
      if (title === null) return; // 取消
      try {
        await call("message_to_card", {
          msgId,
          workspaceId: state.currentWsId,
          chatId: state.currentChatId,
          type_: "task",
          title: title || null,
        });
        showToast("已转为 Card");
      } catch (e) { showToast("转换失败: " + (e.message || String(e))); }
    });
  });
  // Task 8: 重发失败消息(仅 is_out + state=failed 时渲染此按钮)
  // 注意: removeMsg 逻辑在 shell.js 中,这里就近实现(避免 message.js 反向依赖 shell.js)
  container.querySelectorAll(".msg-resend").forEach((el) => {
    el.addEventListener("click", async () => {
      const msgId = Number(el.dataset.msgId);
      const msg = state.messages.find((m) => m.msg_id === msgId);
      if (msg) {
        try {
          await call("send_text", { chatId: state.currentChatId, text: msg.text });
          // 移除旧的失败消息行 + 从 state.messages 清除
          const msgEl = document.querySelector(`[data-msg="${msgId}"]`);
          if (msgEl) msgEl.remove();
          state.messages = state.messages.filter((m) => m.msg_id !== msgId);
        } catch (e) { showToast("重发失败: " + (e.message || String(e))); }
      }
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
  // M4 修复：消息右键菜单（Discord/微信/Telegram 桌面端 IM 主要交互）。
  // 复用 contextMenu.js 的 showContextMenu + 现有 action 逻辑（pin/reply/react/del/card）。
  container.querySelectorAll(".msg").forEach((el) => {
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const msgId = Number(el.dataset.msg);
      const msg = state.messages.find((m) => m.msg_id === msgId);
      const items = [];
      if (msg?.text) {
        items.push({
          label: "复制文本",
          action: () => {
            try {
              navigator.clipboard?.writeText(msg.text);
              showToast("已复制");
            } catch (err) { showToast("复制失败"); }
          },
        });
      }
      items.push({
        label: "回复",
        action: () => {
          const main = document.getElementById("chat-main");
          if (main) main.dispatchEvent(new CustomEvent("composer:set-reply", { detail: { msgId } }));
        },
      });
      items.push({
        label: "置顶",
        action: async () => {
          try {
            await call("toggle_pin", { workspaceId: state.currentWsId, chatId: state.currentChatId, msgId });
            showToast("已切换置顶");
          } catch (err) { showToast(err.message || String(err)); }
        },
      });
      items.push({
        label: "👍 反应",
        action: async () => {
          try {
            await call("send_reaction", { chatId: state.currentChatId, msgId, emoji: "👍" });
          } catch (err) { showToast(err.message || String(err)); }
        },
      });
      items.push({
        label: "转为 Card",
        action: async () => {
          const title = prompt("卡片标题(留空用消息文本):");
          if (title === null) return;
          try {
            await call("message_to_card", {
              msgId,
              workspaceId: state.currentWsId,
              chatId: state.currentChatId,
              type_: "task",
              title: title || null,
            });
            showToast("已转为 Card");
          } catch (err) { showToast("转换失败: " + (err.message || String(err))); }
        },
      });
      if (msg?.is_out) {
        items.push({
          label: "删除",
          action: async () => {
            if (!confirm("删除这条消息?")) return;
            try { await call("delete_msg", { msgId }); } catch (err) { showToast(err.message || String(err)); }
          },
        });
      }
      showContextMenu(e.clientX, e.clientY, items);
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

import { call } from "../api.js";
import { state } from "../state.js";
import { showToast } from "../toast.js";

export function renderComposer(chatId, onSent) {
  const area = document.getElementById("composer-area");
  if (!area) return;
  // reply 预览条(若 composer-area.dataset.replyTo 设置)
  let replyPreview = "";
  if (area.dataset.replyTo) {
    const replyMsg = state.messages.find((m) => String(m.msg_id) === String(area.dataset.replyTo));
    if (replyMsg) {
      replyPreview = `
        <div class="reply-preview" id="reply-preview">
          <span>↩ 回复 ${escapeHtml(replyMsg.from_name)}: ${escapeHtml((replyMsg.text || "").slice(0, 40))}</span>
          <span class="rp-cancel" id="rp-cancel">×</span>
        </div>
      `;
    }
  }
  area.innerHTML = `
    ${replyPreview}
    <div class="composer">
      <textarea id="composer-input" placeholder="发消息到频道..." rows="1"></textarea>
    </div>
  `;
  const input = document.getElementById("composer-input");
  // reply cancel
  const rpCancel = document.getElementById("rp-cancel");
  if (rpCancel) {
    rpCancel.onclick = () => {
      delete area.dataset.replyTo;
      renderComposer(chatId, onSent);
    };
  }
  // 自适应高度
  input.oninput = () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  };
  // keydown
  input.onkeydown = async (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      await send(chatId, input, area, onSent);
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      await send(chatId, input, area, onSent);
    } else if (e.key === "Escape") {
      if (area.dataset.replyTo) {
        delete area.dataset.replyTo;
        renderComposer(chatId, onSent);
      }
    }
  };
  input.focus();
}

async function send(chatId, input, area, onSent) {
  const text = input.value.trim();
  if (!text) return;
  const replyTo = area.dataset.replyTo;
  // 乐观更新:插入临时消息
  const tmpId = `tmp_${Date.now()}`;
  const tmpMsg = {
    msg_id: tmpId,
    from_id: state.self?.id || 0,
    from_name: state.self?.name || "我",
    text,
    ts: Math.floor(Date.now() / 1000),
    is_out: true,
    _state: "sending",
    quote_from: null,
    quote_text: null,
  };
  state.messages.push(tmpMsg);
  // 渲染临时消息到 DOM
  const messagesEl = document.getElementById("messages");
  if (messagesEl) {
    const { renderMessage } = await import("./message.js");
    messagesEl.insertAdjacentHTML("beforeend", await renderMessage(tmpMsg));
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  // 清空输入
  input.value = "";
  input.style.height = "auto";
  // 发送
  try {
    if (replyTo) {
      await call("send_reply", { chatId, text, quoteMsgId: Number(replyTo) });
      delete area.dataset.replyTo;
      renderComposer(chatId, onSent);
    } else {
      await call("send_text", { chatId, text });
    }
    // onSent 触发全量刷新(会替换临时消息)
    if (onSent) await onSent();
  } catch (e) {
    // 标记临时消息为 failed
    tmpMsg._state = "failed";
    const el = messagesEl?.querySelector(`[data-msg="${tmpId}"]`);
    if (el) {
      el.classList.remove("sending");
      el.classList.add("failed");
      el.onclick = async () => {
        // 点击重发
        input.value = text;
        tmpMsg._state = "sending";
        el.classList.remove("failed");
        el.classList.add("sending");
        el.onclick = null;
        await send(chatId, input, area, onSent);
      };
    }
    showToast(e.message || String(e));
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

import { call } from "../api.js";
import { state } from "../state.js";

export function renderComposer(chatId) {
  return `
    <div class="composer">
      <input id="composer-input" placeholder="发消息到频道..." autocomplete="off" />
    </div>
  `;
}

export function bindComposer(chatId, onSent) {
  const input = document.getElementById("composer-input");
  if (!input) return;
  input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    const replyTo = input.dataset.replyTo;
    delete input.dataset.replyTo;
    input.placeholder = "发消息到频道...";
    try {
      if (replyTo) {
        await call("send_reply", { chatId, text, quoteMsgId: Number(replyTo) });
      } else {
        await call("send_text", { chatId, text });
      }
      onSent?.();
    } catch {}
  });
}

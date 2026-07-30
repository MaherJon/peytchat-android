import { call } from "../api.js";
import { state } from "../state.js";
import { renderMessage, bindMessageActions } from "./message.js";
import { renderComposer, bindComposer } from "./composer.js";
import { renderRightDrawer } from "../shell/rightDrawer.js";

export async function renderChatView(chatId) {
  const main = document.getElementById("chat-main");
  if (!main) return;
  // 获取频道 topic
  let topic = "";
  try {
    topic = (await call("get_channel_topic", { chatId })) || "";
  } catch {}
  // 获取 pin 数量
  let pinCount = 0;
  try {
    const pins = await call("get_channel_pins", { chatId });
    pinCount = pins.length;
  } catch {}
  main.innerHTML = `
    <div class="chat-header">
      <div>
        <span class="ch-title">${escapeHtml(channelName(chatId))}</span>
        <span class="ch-topic">${escapeHtml(topic)}</span>
      </div>
      <div class="ch-actions">
        <span id="act-pin">pin · ${pinCount}</span>
        <span id="act-search">search</span>
        <span id="act-info">info</span>
      </div>
    </div>
    <div class="messages" id="messages"></div>
    ${renderComposer(chatId)}
  `;
  document.getElementById("act-pin").addEventListener("click", () => {
    state.rightDrawerOpen = true;
    state.rightDrawerTab = "pin";
    renderRightDrawer();
  });
  document.getElementById("act-info").addEventListener("click", () => {
    state.rightDrawerOpen = !state.rightDrawerOpen;
    state.rightDrawerTab = "members";
    renderRightDrawer();
  });
  document.getElementById("act-search").addEventListener("click", () => {
    state.rightDrawerOpen = true;
    state.rightDrawerTab = "search";
    renderRightDrawer();
  });
  await refreshMessages(chatId);
  bindComposer(chatId, () => refreshMessages(chatId));
  try { await call("mark_chat_noticed", { chatId }); } catch {}
}

async function refreshMessages(chatId) {
  let msgs = [];
  try {
    msgs = await call("get_chat_msgs", { chatId });
  } catch {
    return;
  }
  state.messages = msgs;
  const box = document.getElementById("messages");
  if (!box) return;
  const html = await Promise.all(msgs.map(renderMessage));
  box.innerHTML = html.join("");
  bindMessageActions(box);
  box.scrollTop = box.scrollHeight;
}

function channelName(chatId) {
  const ch = state.channels.find((c) => c.chat_id === chatId);
  return ch ? ch.name : `#${chatId}`;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

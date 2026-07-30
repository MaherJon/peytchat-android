import { call } from "../api.js";
import { state } from "../state.js";
import { renderMessage, bindMessageActions } from "./message.js";
import { renderComposer, bindComposer } from "./composer.js";
import { renderRightDrawer } from "../shell/rightDrawer.js";

let loadingEarlier = false;

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
  // 重置分页状态
  state.messagesOldestId = null;
  state.noMoreMsgs = false;
  await refreshMessages(chatId);
  bindComposer(chatId, () => refreshMessages(chatId));
  bindScrollListener(chatId);
  try { await call("mark_chat_noticed", { chatId }); } catch {}
}

async function refreshMessages(chatId) {
  let msgs = [];
  try {
    msgs = await call("get_chat_msgs", { chatId, beforeMsgId: null });
  } catch {
    return;
  }
  state.messages = msgs;
  // items oldest-first: 数组首条为本页最旧消息
  state.messagesOldestId = msgs.length > 0 ? msgs[0].msg_id : null;
  state.noMoreMsgs = false;
  const box = document.getElementById("messages");
  if (!box) return;
  const html = await Promise.all(msgs.map(renderMessage));
  box.innerHTML = html.join("");
  bindMessageActions(box);
  box.scrollTop = box.scrollHeight;
}

async function loadEarlier(chatId) {
  if (loadingEarlier) return;
  if (!state.messagesOldestId || state.noMoreMsgs) return;
  loadingEarlier = true;
  let older = [];
  try {
    older = await call("get_chat_msgs", { chatId, beforeMsgId: state.messagesOldestId });
  } catch {
    loadingEarlier = false;
    return;
  }
  // 切换聊天期间异步返回:丢弃过期结果
  if (state.currentChatId !== chatId) {
    loadingEarlier = false;
    return;
  }
  if (older.length === 0) {
    state.noMoreMsgs = true;
    loadingEarlier = false;
    return;
  }
  const box = document.getElementById("messages");
  if (!box) {
    loadingEarlier = false;
    return;
  }
  const prevHeight = box.scrollHeight;
  const prevTop = box.scrollTop;
  state.messages = [...older, ...state.messages];
  state.messagesOldestId = older[0].msg_id;
  const html = await Promise.all(state.messages.map(renderMessage));
  box.innerHTML = html.join("");
  bindMessageActions(box);
  // 保持视觉位置:补偿新增高度
  box.scrollTop = prevTop + (box.scrollHeight - prevHeight);
  loadingEarlier = false;
}

function bindScrollListener(chatId) {
  const box = document.getElementById("messages");
  if (!box) return;
  box.addEventListener("scroll", () => {
    if (box.scrollTop === 0) {
      loadEarlier(chatId);
    }
  });
}

function channelName(chatId) {
  const ch = state.channels.find((c) => c.chat_id === chatId);
  return ch ? ch.name : `#${chatId}`;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

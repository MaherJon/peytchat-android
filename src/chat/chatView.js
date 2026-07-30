import { call } from "../api.js";
import { state } from "../state.js";
import { renderMessage, bindMessageActions } from "./message.js";
import { renderComposer } from "./composer.js";
import { renderRightDrawer } from "../shell/rightDrawer.js";
import { showToast } from "../toast.js";
import { saveState } from "../persist.js";

let loadingEarlier = false;

export async function renderChatView(chatId) {
  const main = document.getElementById("chat-main");
  if (!main) return;
  // Task 9: 同频道且已有消息且 DOM 已渲染 → 跳过全量重渲染,
  // 保留分页状态(state.messages / messagesOldestId / noMoreMsgs)和 scroll 位置。
  // 新消息由 appendNewMessages 增量追加。
  if (
    state.currentChatId === chatId &&
    state.messages.length > 0 &&
    document.getElementById("messages")
  ) {
    state.homeMode = false;
    return;
  }
  // 切换到不同频道时才重置分页状态(避免每次调用都清空已加载的历史)
  if (state.currentChatId !== chatId) {
    state.messages = [];
    state.messagesOldestId = null;
    state.noMoreMsgs = false;
  }
  state.currentChatId = chatId;
  state.homeMode = false;
  // 加载态
  main.innerHTML = `<div class="spinner"><span></span></div>`;
  try {
    // 拉 roles(用于 role tag 和 @mention)
    if (state.currentWsId != null) {
      try {
        state.roles = await call("list_roles", { workspaceId: state.currentWsId });
      } catch {}
    }
    // 拉频道信息(topic + pins)
    let topic = "";
    let pinCount = 0;
    try { topic = (await call("get_channel_topic", { chatId })) || ""; } catch {}
    try {
      const pins = await call("get_channel_pins", { chatId });
      pinCount = pins.length;
    } catch {}
    // 渲染骨架
    main.innerHTML = `
      <div class="chat-header">
        <div>
          <span class="ch-title">${escapeHtml(channelName(chatId))}</span>
          <span class="ch-topic">${escapeHtml(topic)}</span>
        </div>
        <div class="ch-actions">
          <span id="act-pin">pin · ${pinCount}</span>
          <span id="act-info">info</span>
        </div>
      </div>
      <div class="messages" id="messages"></div>
      <div id="composer-area"></div>
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
    // 分页状态已在函数开头按频道切换判断重置,此处不再重复
    await refreshMessages(chatId);
    renderComposer(chatId, () => refreshMessages(chatId));
    bindScrollListener(chatId);
    try { await call("mark_chat_noticed", { chatId }); } catch {}
    saveState();
    // 监听 message.js reply 按钮 dispatch 的事件
    if (!main._replyListenerBound) {
      main._replyListenerBound = true;
      main.addEventListener("composer:set-reply", (e) => {
        const msgId = e.detail.msgId;
        const area = document.getElementById("composer-area");
        if (area) {
          area.dataset.replyTo = msgId;
          renderComposer(state.currentChatId, () => refreshMessages(state.currentChatId));
        }
      });
    }
  } catch (e) {
    main.innerHTML = `<div class="guide-card">加载失败:${escapeHtml(e.message || String(e))}</div>`;
    showToast(e.message || String(e));
  }
}

// Task 9: 增量追加新消息,避免全量重渲染丢失 scroll 位置和已加载的历史。
// 由 shell.js refreshCurrentChat 在收到实时事件(MsgsChanged / IncomingMsg)时调用。
// renderMessage 已在文件顶部静态导入,此处直接复用(无需 require / 动态 import)。
export async function appendNewMessages(chatId) {
  if (state.currentChatId !== chatId) return;
  const box = document.getElementById("messages");
  if (!box) return; // 频道未渲染,跳过(下次 renderChatView 会全量拉取)
  try {
    // 只拉取最新的 50 条,找出 state.messages 里没有的新消息
    const msgs = await call("get_chat_msgs", { chatId, beforeMsgId: null });
    const existingIds = new Set(state.messages.map((m) => m.msg_id));
    const newMsgs = msgs.filter((m) => !existingIds.has(m.msg_id));
    if (newMsgs.length === 0) return;
    // 记录追加前是否在底部,用于决定是否自动滚到新消息
    const wasAtBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 50;
    // 计算追加前的最后一条消息的日期,用于决定是否需要插入日期分隔线
    const lastExisting = state.messages.length > 0 ? state.messages[state.messages.length - 1] : null;
    let prevDate = lastExisting ? formatDate(new Date(lastExisting.ts * 1000)) : null;
    // 若此前为空频道(显示引导卡片),先清空
    if (state.messages.length === 0) box.innerHTML = "";
    state.messages.push(...newMsgs);
    // 拼接新消息 HTML(含必要的日期分隔线)
    let html = "";
    for (const m of newMsgs) {
      const dateStr = formatDate(new Date(m.ts * 1000));
      if (dateStr !== prevDate) {
        html += `<div class="msg-date-divider">${dateStr}</div>`;
        prevDate = dateStr;
      }
      html += await renderMessage(m);
    }
    // 用临时容器承载新节点,仅对新消息绑定交互动作(避免对已有消息重复绑定)
    const temp = document.createElement("div");
    temp.innerHTML = html;
    bindMessageActions(temp);
    while (temp.firstChild) box.appendChild(temp.firstChild);
    // 用户原本在底部时,自动滚到新消息
    if (wasAtBottom) box.scrollTop = box.scrollHeight;
  } catch (e) {
    console.error("appendNewMessages failed:", e);
  }
}

async function refreshMessages(chatId) {
  let msgs = [];
  try {
    msgs = await call("get_chat_msgs", { chatId, beforeMsgId: null });
  } catch (e) {
    showToast(e.message || String(e));
    return;
  }
  state.messages = msgs;
  state.messagesOldestId = msgs.length > 0 ? msgs[0].msg_id : null;
  state.noMoreMsgs = false;
  const box = document.getElementById("messages");
  if (!box) return;
  if (msgs.length === 0) {
    box.innerHTML = `<div class="guide-card">这个频道还没有消息,发第一条吧</div>`;
    return;
  }
  await renderMessagesWithDateDividers(box, msgs);
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
  } catch (e) {
    showToast(e.message || String(e));
    loadingEarlier = false;
    return;
  }
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
  state.noMoreMsgs = older.length < 50;
  await renderMessagesWithDateDividers(box, state.messages);
  bindMessageActions(box);
  box.scrollTop = prevTop + (box.scrollHeight - prevHeight);
  loadingEarlier = false;
}

async function renderMessagesWithDateDividers(box, msgs) {
  const html = await Promise.all(msgs.map(async (m) => {
    const d = new Date(m.ts * 1000);
    const dateStr = formatDate(d);
    const divider = `<div class="msg-date-divider">${dateStr}</div>`;
    const msgHtml = await renderMessage(m);
    return { divider, msgHtml, dateStr };
  }));
  let out = "";
  let prevDate = null;
  for (const item of html) {
    if (item.dateStr !== prevDate) {
      out += item.divider;
      prevDate = item.dateStr;
    }
    out += item.msgHtml;
  }
  box.innerHTML = out;
}

function formatDate(d) {
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "今天";
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "昨天";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
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

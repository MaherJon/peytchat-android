import { call } from "../api.js";
import { state } from "../state.js";
import { renderMessage, bindMessageActions } from "./message.js";
import { renderComposer } from "./composer.js";
import { renderRightDrawer } from "../shell/rightDrawer.js";
import { showToast } from "../toast.js";
import { saveState } from "../persist.js";

let loadingEarlier = false;

// Task 11: 消息虚拟化常量。
// ITEM_HEIGHT 是估算值(约 60px),实际消息高度不一(含附件/代码块会更高),
// spacer 用此估算值,滚动条位置约略正确但非像素级精准 — SP4 可接受,后续可改实测高度。
const ITEM_HEIGHT = 60;
const BUFFER = 20; // 上下各 buffer 20 条
const VIEWPORT = 30; // 可视区约 30 条

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
// Task 11: 改为 push 到 state.messages 后调 renderVisibleMessages 重算可视区,
// 不再直接 append DOM(否则新节点会接到 bottom spacer 之后,破坏虚拟化布局)。
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
    state.messages.push(...newMsgs);
    if (wasAtBottom) {
      // 用户在底部 → 渲染新的底部范围(含新消息),并滚到底
      const end = state.messages.length;
      const start = Math.max(0, end - VIEWPORT - 2 * BUFFER);
      await renderVisibleMessages(box, start, end);
      box.scrollTop = box.scrollHeight;
    } else {
      // 用户滚在上方 → 仅刷新 spacers / 可视区(scrollTop 未变,可视范围不变)
      const { start, end } = getVisibleRange(box.scrollTop, box.clientHeight, ITEM_HEIGHT);
      await renderVisibleMessages(box, start, end);
    }
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
  // Task 11: 虚拟化渲染 — 初始展示底部(最新消息)范围,spacers 撑住总高度,
  // bindMessageActions 由 renderVisibleMessages 内部对 temp 容器调用。
  const end = msgs.length;
  const start = Math.max(0, end - VIEWPORT - 2 * BUFFER);
  await renderVisibleMessages(box, start, end);
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
  const prevTop = box.scrollTop;
  const prevCount = state.messages.length;
  state.messages = [...older, ...state.messages];
  state.messagesOldestId = older[0].msg_id;
  state.noMoreMsgs = older.length < 50;
  // Task 11: 虚拟化下用估算 ITEM_HEIGHT 维持 scroll 位置。
  // prepended N 条 → 用户原看消息下移 N 条 → 新 scrollTop ≈ prevTop + N*ITEM_HEIGHT。
  // 先按目标 scrollTop 算可视范围,渲染后再赋值(避免浏览器按旧 scrollHeight 钳位)。
  const addedCount = state.messages.length - prevCount;
  const targetScrollTop = prevTop + addedCount * ITEM_HEIGHT;
  const { start, end } = getVisibleRange(targetScrollTop, box.clientHeight, ITEM_HEIGHT);
  await renderVisibleMessages(box, start, end);
  box.scrollTop = targetScrollTop;
  loadingEarlier = false;
}

// Task 11: 虚拟化 — 只渲染 scrollTop ± (BUFFER + VIEWPORT/2) 范围的消息,
// 上下用 spacer div 撑住总高度(估算 ITEM_HEIGHT),保持滚动条约略正确。
function getVisibleRange(scrollTop, clientHeight, itemHeight) {
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - BUFFER);
  const end = Math.min(state.messages.length, start + VIEWPORT + 2 * BUFFER);
  return { start, end };
}

// Task 11: 渲染 [start, end) 范围消息 + 上下 spacer。
// renderMessage 返回 HTML 字符串(Task 9 已确认),沿用 temp-container 解析模式 +
// 仅对本次渲染节点调用 bindMessageActions(box 清空后旧绑定随节点销毁,无需重复绑定)。
// 日期分隔线:若 visible 首条日期与上一条(state.messages[start-1])不同,补一条顶部 divider。
async function renderVisibleMessages(box, start, end) {
  const visible = state.messages.slice(start, end);
  box.innerHTML = "";
  const spacerTop = document.createElement("div");
  spacerTop.style.height = (start * ITEM_HEIGHT) + "px";
  box.appendChild(spacerTop);
  let prevDate = null;
  if (start > 0 && state.messages.length > 0) {
    prevDate = formatDate(new Date(state.messages[start - 1].ts * 1000));
  }
  const temp = document.createElement("div");
  let html = "";
  for (const m of visible) {
    const dateStr = formatDate(new Date(m.ts * 1000));
    if (dateStr !== prevDate) {
      html += `<div class="msg-date-divider">${dateStr}</div>`;
      prevDate = dateStr;
    }
    html += await renderMessage(m);
  }
  temp.innerHTML = html;
  bindMessageActions(temp);
  while (temp.firstChild) box.appendChild(temp.firstChild);
  const spacerBottom = document.createElement("div");
  spacerBottom.style.height = ((state.messages.length - end) * ITEM_HEIGHT) + "px";
  box.appendChild(spacerBottom);
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
  let scrollTimer = null;
  box.addEventListener("scroll", () => {
    // 顶部触发分页(loadEarlier 内部有 loadingEarlier / noMoreMsgs 守卫)
    if (box.scrollTop === 0) {
      loadEarlier(chatId);
    }
    // Task 11: 100ms debounce 重算可视区。fire-and-forget,错误吞掉避免 unhandledrejection。
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const { start, end } = getVisibleRange(box.scrollTop, box.clientHeight, ITEM_HEIGHT);
      renderVisibleMessages(box, start, end).catch(() => {});
    }, 100);
  });
}

function channelName(chatId) {
  const ch = state.channels.find((c) => c.chat_id === chatId);
  return ch ? ch.name : `#${chatId}`;
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

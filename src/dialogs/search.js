import { call } from "../api.js";
import { state } from "../state.js";
import { renderChatView } from "../chat/chatView.js";

let searchTimer = null;

export function openSearch() {
  if (state.searchOpen) return;
  state.searchOpen = true;
  const overlay = document.createElement("div");
  overlay.className = "overlay search-overlay";
  overlay.style.display = "flex";
  overlay.id = "search-overlay";
  overlay.innerHTML = `
    <div class="search-dialog">
      <input id="search-input" placeholder="搜索消息 / 频道 / 成员" autocomplete="off" />
      <div id="search-results" class="search-results"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = document.getElementById("search-input");
  input.focus();
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearch(input.value.trim()), 200);
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeSearch();
  });
}

export function closeSearch() {
  const overlay = document.getElementById("search-overlay");
  if (overlay) overlay.remove();
  state.searchOpen = false;
}

async function doSearch(q) {
  const resultsEl = document.getElementById("search-results");
  if (!resultsEl) return;
  if (!q) {
    resultsEl.innerHTML = "";
    return;
  }
  const lower = q.toLowerCase();
  const sections = [];
  // 1. 消息(只搜已加载的 state.messages)
  const msgMatches = (state.messages || [])
    .filter((m) => (m.text || "").toLowerCase().includes(lower))
    .slice(0, 5);
  if (msgMatches.length > 0) {
    const items = msgMatches
      .map(
        (m) =>
          `<div class="sr-item" data-type="msg" data-id="${m.msg_id}"><span class="sr-type">消息</span><span class="sr-content">${escapeHtml(m.from_name)}: ${escapeHtml((m.text || "").slice(0, 60))}</span></div>`
      )
      .join("");
    sections.push(`<div class="sr-section">消息</div>${items}`);
  }
  // 2. 频道(state.channels)
  const chanMatches = (state.channels || [])
    .filter((c) => (c.name || "").toLowerCase().includes(lower))
    .slice(0, 5);
  if (chanMatches.length > 0) {
    const items = chanMatches
      .map(
        (c) =>
          `<div class="sr-item" data-type="channel" data-id="${c.chat_id}"><span class="sr-type">频道</span><span class="sr-content">#${escapeHtml(c.name)}</span></div>`
      )
      .join("");
    sections.push(`<div class="sr-section">频道</div>${items}`);
  }
  // 3. 成员(当前频道 members)
  try {
    if (state.currentChatId) {
      const info = await call("get_chat_info", { chatId: state.currentChatId });
      const memMatches = (info.members || [])
        .filter((m) => (m.name || "").toLowerCase().includes(lower))
        .slice(0, 5);
      if (memMatches.length > 0) {
        const items = memMatches
          .map(
            (m) =>
              `<div class="sr-item" data-type="member" data-id="${m.contact_id}"><span class="sr-type">成员</span><span class="sr-content">${escapeHtml(m.name)}</span></div>`
          )
          .join("");
        sections.push(`<div class="sr-section">成员</div>${items}`);
      }
    }
  } catch {}
  resultsEl.innerHTML = sections.join("") || `<div class="sr-empty">无结果</div>`;
  resultsEl.querySelectorAll(".sr-item").forEach((el) => {
    el.addEventListener("click", async () => {
      const type = el.dataset.type;
      const id = el.dataset.id;
      if (type === "channel") {
        state.currentChatId = Number(id);
        closeSearch();
        await renderChatView(Number(id));
      } else if (type === "msg") {
        closeSearch();
        await renderChatView(state.currentChatId);
        const msgEl = document.querySelector(`[data-msg="${id}"]`);
        if (msgEl) {
          msgEl.scrollIntoView({ behavior: "smooth" });
          msgEl.style.background = "#1f1f1f";
          setTimeout(() => {
            msgEl.style.background = "";
          }, 2000);
        }
      } else if (type === "member") {
        closeSearch();
        state.rightDrawerOpen = true;
        state.rightDrawerTab = "members";
        const { renderRightDrawer } = await import("../shell/rightDrawer.js");
        renderRightDrawer();
        setTimeout(async () => {
          const body = document.getElementById("rd-body");
          if (body) {
            const { renderMemberDetail } = await import("./memberDetail.js");
            await renderMemberDetail(body, Number(id));
          }
        }, 100);
      }
    });
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

import { call } from "../api.js";
import { state } from "../state.js";
import { renderWsRail, refreshWorkspaces } from "./wsRail.js";
import { renderChannelTree, refreshChannels } from "./channelTree.js";
import { renderRightDrawer } from "./rightDrawer.js";
import { renderChatView } from "../chat/chatView.js";
import { renderHomeView } from "../dialogs/homeView.js";

export async function renderShell() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="shell">
      <div id="ws-rail" class="ws-rail"></div>
      <div id="channel-tree" class="channel-tree"></div>
      <div id="chat-main" class="chat-main"><div class="empty">选择一个频道</div></div>
      <div id="right-drawer" class="right-drawer collapsed"></div>
    </div>
  `;
  await refreshWorkspaces();
  try {
    state.self = await call("get_self_profile");
  } catch {}
  renderWsRail();
  // 默认进入主页区
  state.homeMode = true;
  renderHomeView();
  // 注册全局事件刷新
  const { onEvent } = await import("../api.js");
  onEvent("MsgsChanged", () => { if (state.currentChatId) refreshCurrentChat(); });
  onEvent("IncomingMsg", () => { if (state.currentChatId) refreshCurrentChat(); });
  onEvent("ChatlistItemChanged", refreshSidebar);
  onEvent("ChatModified", refreshSidebar);
  onEvent("ContactsChanged", refreshSidebar);
}

async function refreshCurrentChat() {
  if (state.currentChatId != null) {
    await renderChatView(state.currentChatId);
  }
}

async function refreshSidebar() {
  await refreshWorkspaces();
  await refreshChannels();
}

import { state } from "./state.js";

const KEYS = {
  currentWsId: "peytchat.currentWsId",
  currentChatId: "peytchat.currentChatId",
  homeMode: "peytchat.homeMode",
};

export function saveState() {
  try {
    if (state.currentWsId != null) {
      localStorage.setItem(KEYS.currentWsId, String(state.currentWsId));
    } else {
      localStorage.removeItem(KEYS.currentWsId);
    }
    if (state.currentChatId != null) {
      localStorage.setItem(KEYS.currentChatId, String(state.currentChatId));
    } else {
      localStorage.removeItem(KEYS.currentChatId);
    }
    localStorage.setItem(KEYS.homeMode, state.homeMode ? "1" : "0");
  } catch {}
}

export function loadState() {
  try {
    const wsId = localStorage.getItem(KEYS.currentWsId);
    const chatId = localStorage.getItem(KEYS.currentChatId);
    const homeMode = localStorage.getItem(KEYS.homeMode);
    state.currentWsId = wsId ? Number(wsId) : null;
    state.currentChatId = chatId ? Number(chatId) : null;
    state.homeMode = homeMode === "1";
  } catch {}
}

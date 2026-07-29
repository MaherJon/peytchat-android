import { call } from "./api.js";
import { renderLogin } from "./views/login.js";
import { renderChatList } from "./views/chatList.js";

async function boot() {
  const configured = await call("is_configured");
  if (configured) {
    await renderChatList();
  } else {
    renderLogin(async () => { await renderChatList(); });
  }
}

boot();

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export async function call(cmd, args) {
  try {
    return await invoke(cmd, args);
  } catch (err) {
    showError(err);
    throw err;
  }
}

export async function onEvent(typ, cb) {
  return listen("dc-event", (e) => {
    if (e.payload && e.payload.typ === typ) cb(e.payload);
  });
}

// Task 13: 把 blobdir 绝对路径转成 webview 可加载的 asset:// URL。
// 失败时返回 null,调用方需自行 fallback 到首字母头像。
// SP4 review: 模块级缓存,避免虚拟列表滚动时对同一 path 重复 IPC 调用。
const blobUrlCache = new Map();
export async function transformBlobURL(path) {
  if (!path) return null;
  if (blobUrlCache.has(path)) return blobUrlCache.get(path);
  try {
    const url = await call("get_asset_url", { path });
    blobUrlCache.set(path, url);
    return url;
  } catch {
    return null;
  }
}

export function showError(err) {
  const el = document.getElementById("error");
  if (!el) return;
  const msg = typeof err === "object" && err !== null
    ? (err.message || JSON.stringify(err))
    : String(err);
  el.textContent = msg;
  el.style.display = "block";
}

export function clearError() {
  const el = document.getElementById("error");
  if (el) el.style.display = "none";
}

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
  await listen("dc-event", (e) => {
    if (e.payload && e.payload.typ === typ) cb(e.payload);
  });
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

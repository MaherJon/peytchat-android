const blobCache = new Map<string, string>();

export interface DcEvent {
  typ: string;
  [key: string]: unknown;
}

export async function call<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(cmd, args);
  } catch (err) {
    showError(err);
    throw err;
  }
}

export async function onEvent(typ: string, cb: (payload: DcEvent) => void): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen('dc-event', (ev) => {
    const payload = ev.payload as DcEvent;
    if (payload.typ === typ) cb(payload);
  });
}

export async function transformBlobURL(path: string): Promise<string> {
  if (!path) return '';
  if (blobCache.has(path)) return blobCache.get(path)!;
  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    const url = convertFileSrc(path);
    blobCache.set(path, url);
    return url;
  } catch {
    return '';
  }
}

export function showError(err: unknown): void {
  const el = document.getElementById('error');
  if (el) {
    el.textContent = err instanceof Error ? err.message : String(err);
    el.style.display = 'block';
  }
}

export function clearError(): void {
  const el = document.getElementById('error');
  if (el) el.style.display = 'none';
}

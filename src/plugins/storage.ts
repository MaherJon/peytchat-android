/** Shared plugin-scoped localStorage helpers, used by both the plugin API
 *  (peytchat.store) and the settings UI (设置 → 插件). */
const prefix = (name: string, key: string): string => `plugin:${name}:${key}`;

export function getPluginSetting<T = unknown>(name: string, key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(prefix(name, key)) || 'null') as T;
  } catch {
    return null;
  }
}

export function setPluginSetting(name: string, key: string, val: unknown): void {
  localStorage.setItem(prefix(name, key), JSON.stringify(val));
}

export function deletePluginSetting(name: string, key: string): void {
  localStorage.removeItem(prefix(name, key));
}

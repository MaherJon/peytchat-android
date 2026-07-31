import { call } from '../api.js';
import { createPluginApi } from './api.js';
import type { PluginApi, PluginStatus } from './types.js';

interface LoadedPlugin {
  api: PluginApi;
  unloadCallbacks: Array<() => void>;
  title: string;
}

const loadedPlugins = new Map<string, LoadedPlugin>();

/** Load every enabled plugin (called once at app boot). */
export async function loadPlugins(): Promise<void> {
  let list: PluginStatus[];
  try {
    list = await call<PluginStatus[]>('list_plugins');
  } catch {
    return; // backend not ready / no plugin dir yet
  }
  for (const p of list) {
    if (!p.enabled) continue;
    await loadPlugin(p.name, p.title);
  }
}

/** Load a single plugin by name. Safe if already loaded. */
export async function loadPlugin(name: string, title?: string): Promise<void> {
  if (loadedPlugins.has(name)) return;

  let js: string;
  try {
    js = await call<string>('get_plugin_js', { name });
  } catch {
    console.warn(`[plugins] Failed to load ${name}`);
    return;
  }

  const unloadCallbacks: Array<() => void> = [];
  const api = createPluginApi(name, unloadCallbacks);

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('peytchat', js);
    fn(api);
  } catch (err) {
    console.error(`[plugins] Error executing ${name}:`, err);
    return;
  }

  loadedPlugins.set(name, { api, unloadCallbacks, title: title || name });
  console.log(`[plugins] Loaded: ${name}`);
}

/** Unload a plugin, running its cleanup callbacks. */
export function unloadPlugin(name: string): void {
  const entry = loadedPlugins.get(name);
  if (!entry) return;
  for (const cb of entry.unloadCallbacks) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
  loadedPlugins.delete(name);
  console.log(`[plugins] Unloaded: ${name}`);
}

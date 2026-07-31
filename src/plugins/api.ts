import { call, onEvent } from '../api.js';
import type { PluginApi, PluginThemeConfig } from './types.js';

/**
 * Build the API object handed to a plugin when it loads.
 * Each API surface is scoped/cleaned up via the unload callbacks.
 */
export function createPluginApi(pluginName: string, unloadCallbacks: Array<() => void>): PluginApi {
  // Plugin-scoped localStorage
  const storeKey = (key: string): string => `plugin:${pluginName}:${key}`;

  return {
    sendText(chatId, text) {
      return call('send_text', { chatId, text });
    },

    async onMessage(cb) {
      return onEvent('IncomingMsg', (payload) => {
        if (payload.chat_id != null) cb(payload as Record<string, unknown>);
      });
    },

    addCSS(css) {
      const tag = document.createElement('style');
      tag.textContent = css;
      tag.setAttribute('data-plugin', pluginName);
      document.head.appendChild(tag);
      unloadCallbacks.push(() => tag.remove());
      return () => tag.remove();
    },

    registerTheme(config: PluginThemeConfig) {
      const themeId = `plugin-${pluginName}-${config.id}`;
      // Inject the [data-theme="<id>"] block, matching the built-in themes.
      let css = `[data-theme="${themeId}"] {\n`;
      for (const [k, v] of Object.entries(config.vars)) css += `  ${k}: ${v};\n`;
      if (config.gradient) css += `  --theme-gradient: ${config.gradient};\n`;
      if (config.mask) css += `  --theme-mask: ${config.mask};\n`;
      css += '}';
      const tag = document.createElement('style');
      tag.textContent = css;
      tag.setAttribute('data-plugin-theme', themeId);
      document.head.appendChild(tag);

      // Register in the picker registry.
      if (!window.__peytchat_themes) window.__peytchat_themes = [];
      window.__peytchat_themes.push({
        id: themeId,
        name: config.name || config.id,
        swatch: config.swatch || config.vars['--text'] || '#888',
      });

      unloadCallbacks.push(() => {
        tag.remove();
        window.__peytchat_themes = (window.__peytchat_themes || []).filter((t) => t.id !== themeId);
      });
    },

    onCommand(name, cb) {
      if (!window.__peytchat_commands) window.__peytchat_commands = {};
      window.__peytchat_commands[name] = cb;
      unloadCallbacks.push(() => {
        delete window.__peytchat_commands![name];
      });
    },

    registerLLM(name, config) {
      if (!window.__peytchat_llms) window.__peytchat_llms = {};
      window.__peytchat_llms[name] = config;
      unloadCallbacks.push(() => {
        delete window.__peytchat_llms![name];
      });
    },

    http: {
      async get<T = unknown>(url: string): Promise<T> {
        return (await fetch(url)).json() as Promise<T>;
      },
      async post<T = unknown>(url: string, body: unknown): Promise<T> {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        return r.json() as Promise<T>;
      },
    },

    store: {
      get<T = unknown>(key: string): T | null {
        try {
          return JSON.parse(localStorage.getItem(storeKey(key)) || 'null') as T;
        } catch {
          return null;
        }
      },
      set(key: string, val: unknown) {
        localStorage.setItem(storeKey(key), JSON.stringify(val));
      },
      delete(key: string) {
        localStorage.removeItem(storeKey(key));
      },
    },

    log: {
      info: (msg) => console.log(`[${pluginName}]`, msg),
      warn: (msg) => console.warn(`[${pluginName}]`, msg),
      error: (msg) => console.error(`[${pluginName}]`, msg),
    },
  };
}

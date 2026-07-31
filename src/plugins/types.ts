/** A plugin entry from the GitHub registry. */
export interface RegistryPlugin {
  name: string;
  version: string;
  title: string;
  description: string;
  author: string;
  /** "theme" | "chatbot" | "llm" | "general" */
  type: string;
  entry: string;
}

/** Status of an installed plugin. */
export interface PluginStatus {
  name: string;
  title: string;
  description: string;
  plugin_type: string;
  version: string;
  author: string;
  enabled: boolean;
}

/** Theme registration config for theme plugins. */
export interface PluginThemeConfig {
  id: string;
  name: string;
  vars: Record<string, string>;
  gradient?: string;
  mask?: string;
  swatch?: string;
}

/** A theme registered by a plugin, listed in the appearance picker. */
export interface RegisteredPluginTheme {
  id: string;
  name: string;
  swatch: string;
}

/** The API object passed to each plugin. */
export interface PluginApi {
  sendText(chatId: number, text: string): Promise<unknown>;
  onMessage(cb: (payload: Record<string, unknown>) => void): Promise<() => void>;
  addCSS(css: string): () => void;
  registerTheme(config: PluginThemeConfig): void;
  onCommand(name: string, cb: (args: string, chatId: number) => unknown): void;
  registerLLM(name: string, config: Record<string, unknown>): void;
  http: {
    get<T = unknown>(url: string): Promise<T>;
    post<T = unknown>(url: string, body: unknown): Promise<T>;
  };
  store: {
    get<T = unknown>(key: string): T | null;
    set(key: string, val: unknown): void;
    delete(key: string): void;
  };
  log: {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
  };
}

declare global {
  interface Window {
    __peytchat_themes?: Array<{ id: string; name: string; swatch: string }>;
    __peytchat_commands?: Record<string, (args: string, chatId: number) => unknown>;
    __peytchat_llms?: Record<string, Record<string, unknown>>;
  }
}

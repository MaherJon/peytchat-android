import { call } from '../api.js';
import { state } from '../state.js';
import { showToast } from '../toast.js';
import { loadPlugin, unloadPlugin } from './manager.js';
import type { PluginStatus, RegistryPlugin } from './types.js';

/**
 * Plugin page (rail entry). Nav panel shows 市场 / 已安装 toggles,
 * main panel renders the selected view.
 */
export async function renderPluginsNav(panel: HTMLElement): Promise<void> {
  const tabs: Array<{ id: 'market' | 'installed'; label: string }> = [
    { id: 'market', label: '插件市场' },
    { id: 'installed', label: '已安装' },
  ];
  panel.innerHTML = `
    <div class="nav-header"><div class="nav-title">插件</div></div>
    <div class="nav-list">
      ${tabs
        .map(
          (t) => `<div class="nav-chat-item ${state.pluginsTab === t.id ? 'active' : ''}" data-tab="${t.id}">
            ${t.label}
          </div>`,
        )
        .join('')}
    </div>
  `;
  panel.querySelectorAll<HTMLElement>('.nav-chat-item[data-tab]').forEach((el) => {
    el.addEventListener('click', async () => {
      state.pluginsTab = el.dataset.tab as 'market' | 'installed';
      panel.querySelectorAll('.nav-chat-item').forEach((x) => x.classList.remove('active'));
      el.classList.add('active');
      const { renderMain } = await import('../shell/navPanel.js');
      await renderMain();
    });
  });
}

export async function renderPluginsMain(main: HTMLElement): Promise<void> {
  if (state.pluginsTab === 'installed') {
    await renderInstalled(main);
  } else {
    await renderMarket(main);
  }
}

async function renderMarket(main: HTMLElement): Promise<void> {
  main.innerHTML = `
    <div class="settings-section">
      <h2>插件市场</h2>
      <div id="plugin-market-list"><div class="plugin-empty">加载插件列表…</div></div>
    </div>
  `;
  const pane = document.getElementById('plugin-market-list')!;

  const [available, installed] = await Promise.all([
    call<RegistryPlugin[]>('fetch_registry').catch(() => null),
    call<PluginStatus[]>('list_plugins').catch(() => []),
  ]);

  if (!available || available.length === 0) {
    pane.innerHTML = `<div class="plugin-empty">暂无可用插件</div>`;
    return;
  }

  const installedMap = new Map(installed.map((p) => [p.name, p]));

  pane.innerHTML = `<div class="plugin-list">${available
    .map((plugin) => {
      const inst = installedMap.get(plugin.name);
      const isInstalled = !!inst;
      return `
        <div class="plugin-row" data-name="${plugin.name}">
          <span class="p-name">${esc(plugin.title)}</span>
          <span class="plugin-desc">${esc(plugin.description)}</span>
          ${isInstalled
            ? `<span class="plugin-badge">已安装</span><button class="settings-btn plugin-uninstall" data-name="${plugin.name}">删除</button>`
            : `<button class="settings-btn plugin-install" data-name="${plugin.name}">安装</button>`}
        </div>`;
    })
    .join('')}</div>`;

  pane.querySelectorAll<HTMLButtonElement>('.plugin-install').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '安装中…';
      try {
        const plugin = await call<RegistryPlugin>('install_plugin', { name: btn.dataset.name });
        await loadPlugin(plugin.name, plugin.title);
        showToast(`已安装 ${plugin.title}`);
        await renderMarket(main);
      } catch (e) {
        btn.disabled = false;
        btn.textContent = '安装';
        showToast(e instanceof Error ? e.message : String(e));
      }
    });
  });

  pane.querySelectorAll<HTMLButtonElement>('.plugin-uninstall').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`删除插件 "${btn.dataset.name}"？`)) return;
      try {
        unloadPlugin(btn.dataset.name!);
        await call('uninstall_plugin', { name: btn.dataset.name });
        await renderMarket(main);
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e));
      }
    });
  });
}

async function renderInstalled(main: HTMLElement): Promise<void> {
  main.innerHTML = `
    <div class="settings-section">
      <div class="plugin-installed-head">
        <button class="plugin-zip-btn" id="plugin-zip-btn" title="从磁盘安装 .zip 插件">+</button>
        <h2>已安装插件</h2>
      </div>
      <div class="plugin-list" id="plugin-installed-list"><div class="plugin-empty">加载中…</div></div>
    </div>
  `;

  document.getElementById('plugin-zip-btn')!.addEventListener('click', () => {
    document.getElementById('plugin-zip-input')!.click();
  });
  document.getElementById('plugin-zip-input')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const plugin = await call<RegistryPlugin>('install_plugin_from_zip', {
        data_base64: btoa(binary),
      });
      await loadPlugin(plugin.name, plugin.title);
      showToast(`已安装 ${plugin.title}`);
      await renderInstalled(main);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
    (e.target as HTMLInputElement).value = '';
  });

  const listEl = document.getElementById('plugin-installed-list')!;
  const installed = await call<PluginStatus[]>('list_plugins').catch(() => []);

  if (installed.length === 0) {
    listEl.innerHTML = `<div class="plugin-empty">还没有安装插件</div>`;
    return;
  }

  listEl.innerHTML = installed
    .map(
      (p) => `
        <div class="plugin-row" data-name="${p.name}">
          <span class="p-name">${esc(p.title)}</span>
          <label class="p-toggle">
            <input type="checkbox" class="lm-toggle" data-name="${p.name}" ${p.enabled ? 'checked' : ''}>
            <span>启用</span>
          </label>
          <button class="settings-btn plugin-uninstall" data-name="${p.name}">删除</button>
        </div>`,
    )
    .join('');

  listEl.querySelectorAll<HTMLInputElement>('.lm-toggle').forEach((cb) => {
    cb.addEventListener('change', async () => {
      const name = cb.dataset.name!;
      try {
        await call('toggle_plugin', { name, enabled: cb.checked });
        if (cb.checked) await loadPlugin(name);
        else unloadPlugin(name);
      } catch {
        cb.checked = !cb.checked;
      }
    });
  });

  listEl.querySelectorAll<HTMLButtonElement>('.plugin-uninstall').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`删除插件 "${btn.dataset.name}"？`)) return;
      try {
        unloadPlugin(btn.dataset.name!);
        await call('uninstall_plugin', { name: btn.dataset.name });
        await renderInstalled(main);
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e));
      }
    });
  });
}

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]!);
}

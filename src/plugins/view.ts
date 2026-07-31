import { call } from '../api.js';
import { showToast } from '../toast.js';
import { loadPlugin, unloadPlugin } from './manager.js';
import type { PluginStatus, RegistryPlugin } from './types.js';

/**
 * Plugin management view rendered inside the Settings page (zero-popup).
 * Two inline tabs: 市场 (marketplace) and 已安装 (local installed).
 */
export async function renderPluginsMain(main: HTMLElement): Promise<void> {
  main.innerHTML = `
    <div class="settings-section">
      <h2>插件</h2>
      <div class="plugin-tabs">
        <button class="plugin-tab active" data-tab="market">插件市场</button>
        <button class="plugin-tab" data-tab="local">已安装</button>
      </div>
      <div id="plugin-market-pane"></div>
      <div id="plugin-local-pane" hidden></div>
    </div>
  `;

  const marketPane = document.getElementById('plugin-market-pane')!;
  const localPane = document.getElementById('plugin-local-pane')!;

  main.querySelectorAll<HTMLButtonElement>('.plugin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      main.querySelectorAll('.plugin-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      marketPane.hidden = tab.dataset.tab !== 'market';
      localPane.hidden = tab.dataset.tab !== 'local';
      if (tab.dataset.tab === 'local') void renderLocal(localPane);
      else void renderMarket(marketPane);
    });
  });

  await renderMarket(marketPane);
}

async function renderMarket(pane: HTMLElement): Promise<void> {
  pane.innerHTML = `<div class="plugin-empty">加载插件列表…</div>`;
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
      const isEnabled = inst?.enabled ?? false;
      return `
        <div class="plugin-row" data-name="${plugin.name}">
          <span class="p-name">${esc(plugin.title)}</span>
          ${isInstalled
            ? `
              <label class="p-toggle">
                <input type="checkbox" class="mk-toggle" data-name="${plugin.name}" ${isEnabled ? 'checked' : ''}>
                <span>启用</span>
              </label>
              <button class="settings-btn plugin-uninstall" data-name="${plugin.name}">删除</button>`
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
        await renderMarket(pane);
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
        await renderMarket(pane);
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e));
      }
    });
  });

  pane.querySelectorAll<HTMLInputElement>('.mk-toggle').forEach((cb) => {
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
}

async function renderLocal(pane: HTMLElement): Promise<void> {
  // Install-from-disk control (zip), always visible at top.
  pane.innerHTML = `
    <div class="plugin-local-install">
      <button class="settings-btn" id="plugin-zip-btn">${iconPlus()} 从 .zip 安装</button>
      <input id="plugin-zip-input" type="file" accept=".zip" style="display:none" />
    </div>
    <div class="plugin-list" id="plugin-local-list"><div class="plugin-empty">加载中…</div></div>
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
      await renderLocal(pane);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
    (e.target as HTMLInputElement).value = '';
  });

  const listEl = document.getElementById('plugin-local-list')!;
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
        await renderLocal(pane);
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e));
      }
    });
  });
}

function iconPlus(): string {
  return '<span style="font-size:13px;line-height:1">+</span>';
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

import { call } from '../api.js';
import { showToast } from '../toast.js';
import { iconSvg } from '../components/icon.js';
import { loadPlugin, unloadPlugin } from './manager.js';
import { PERMISSION_LABELS, getPluginPermissions, setPluginPermissions } from './permissions.js';
import type { PluginStatus } from './types.js';

/**
 * Plugin settings (Settings → 插件): manage installed plugins and their
 * granted permissions. Marketplace / install live in the plugins page.
 */
export async function renderPluginSettings(main: HTMLElement): Promise<void> {
  main.innerHTML = `
    <div class="settings-section">
      <h2>插件</h2>
      <div id="plugin-settings-list"><div class="plugin-empty">加载中…</div></div>
    </div>
  `;

  const listEl = document.getElementById('plugin-settings-list')!;
  const installed = await call<PluginStatus[]>('list_plugins').catch(() => []);

  if (installed.length === 0) {
    listEl.innerHTML = `<div class="plugin-empty">还没有安装插件<br><span style="font-size:10px;color:var(--text-faint)">前往左侧「插件」页安装</span></div>`;
    return;
  }

  listEl.innerHTML = installed
    .map(
      (p) => `
        <div class="plugin-settings-card" data-name="${p.name}">
          <div class="plugin-settings-head">
            <span class="p-name">${esc(p.title)}</span>
            <span class="plugin-enable-wrap">
              <label class="toggle-switch">
                <input type="checkbox" class="ps-enable" data-name="${p.name}" ${p.enabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </span>
            <button class="plugin-icon-btn danger ps-uninstall" data-name="${p.name}" title="卸载">${iconSvg('trash', { width: 14, height: 14 })}</button>
          </div>
          <div class="plugin-perms">
            ${PERMISSION_LABELS.map((perm) => {
              const granted = getPluginPermissions(p.name).includes(perm.id);
              return `
                <label class="plugin-perm">
                  <input type="checkbox" class="ps-perm" data-plugin="${p.name}" data-perm="${perm.id}" ${granted ? 'checked' : ''}>
                  <span class="plugin-perm-label">${esc(perm.label)}</span>
                  <span class="plugin-perm-desc">${esc(perm.desc)}</span>
                </label>`;
            }).join('')}
          </div>
        </div>`,
    )
    .join('');

  // Enable / disable plugin
  listEl.querySelectorAll<HTMLInputElement>('.ps-enable').forEach((cb) => {
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

  // Permission toggles
  listEl.querySelectorAll<HTMLInputElement>('.ps-perm').forEach((cb) => {
    cb.addEventListener('change', () => {
      const plugin = cb.dataset.plugin!;
      const perm = cb.dataset.perm as (typeof PERMISSION_LABELS)[number]['id'];
      const current = getPluginPermissions(plugin);
      const next = cb.checked
        ? [...current, perm]
        : current.filter((p) => p !== perm);
      setPluginPermissions(plugin, next);
      showToast(cb.checked ? `已授权 ${perm}` : `已撤销 ${perm}`);
    });
  });

  // Uninstall
  listEl.querySelectorAll<HTMLButtonElement>('.ps-uninstall').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`卸载插件 "${btn.dataset.name}"？`)) return;
      try {
        unloadPlugin(btn.dataset.name!);
        await call('uninstall_plugin', { name: btn.dataset.name });
        showToast('已卸载');
        await renderPluginSettings(main);
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

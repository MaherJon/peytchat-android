import { state } from './state.js';
import type { Page, CurrentView, SettingsSection, WorkTab } from './types.js';

export function saveState(): void {
  try {
    const persistKeys: Array<[string, unknown]> = [
      ['peyt.currentPage', state.currentPage],
      ['peyt.currentSettingsSection', state.currentSettingsSection],
      ['peyt.currentWsId', state.currentWsId],
      ['peyt.currentChatId', state.currentChatId],
      ['peyt.currentView', state.currentView],
      ['peyt.detailPanelOpen', state.detailPanelOpen],
      ['peyt.peytBannerDismissed', state.peytBannerDismissed],
      ['peyt.currentWorkTab', state.currentWorkTab],
    ];
    for (const [key, val] of persistKeys) {
      if (val == null) localStorage.removeItem(key);
      else localStorage.setItem(key, String(val));
    }
    // viewPrefs 是 Record<number, CurrentView>,需 JSON 序列化
    localStorage.setItem('peyt.viewPrefs', JSON.stringify(state.viewPrefs));
  } catch {}
}

export function loadState(): void {
  try {
    const page = localStorage.getItem('peyt.currentPage') as Page | null;
    if (page) state.currentPage = page;
    const section = localStorage.getItem('peyt.currentSettingsSection') as SettingsSection | null;
    if (section) state.currentSettingsSection = section;
    const wsId = localStorage.getItem('peyt.currentWsId');
    if (wsId) state.currentWsId = Number(wsId);
    const chatId = localStorage.getItem('peyt.currentChatId');
    if (chatId) state.currentChatId = Number(chatId);
    const view = localStorage.getItem('peyt.currentView') as CurrentView | null;
    if (view) state.currentView = view;
    const detail = localStorage.getItem('peyt.detailPanelOpen');
    if (detail) state.detailPanelOpen = detail === 'true';
    const banner = localStorage.getItem('peyt.peytBannerDismissed');
    if (banner) state.peytBannerDismissed = banner === 'true';
    const workTab = localStorage.getItem('peyt.currentWorkTab') as WorkTab | null;
    if (workTab) state.currentWorkTab = workTab;
    const prefs = localStorage.getItem('peyt.viewPrefs');
    if (prefs) {
      try { state.viewPrefs = JSON.parse(prefs); } catch { state.viewPrefs = {}; }
    }
  } catch {}
}

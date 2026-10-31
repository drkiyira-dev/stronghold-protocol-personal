import { useLayoutEffect } from '/vendor/hooks.module.js';
import { createStore, useStore } from '/js/store.js';
import { settingsStore } from '/js/ui/settingsStore.js';
import { menuPolicy, readVisualPreference, saveVisualPreference } from './visual-policy.mjs';

const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const fineQuery = matchMedia('(hover: hover) and (pointer: fine)');
const storage = () => { try { return localStorage; } catch { return null; } };
export const menuVisuals = createStore({ motion: readVisualPreference(storage()),
  reduced: reducedQuery.matches, fine: fineQuery.matches, visible: !document.hidden, saved: true });
export function setMenuMotion(motion) {
  menuVisuals.set({ motion, saved: saveVisualPreference(storage(), motion) });
}
export function useMenuPolicy() {
  const prefs = useStore(s => s, Object.is, menuVisuals);
  const quality = useStore(s => s.quality, Object.is, settingsStore);
  return menuPolicy(prefs, quality);
}
// Reuses upstream's first-frame renderer for user-owned animated backgrounds.
export function useMenuStill() { return !useMenuPolicy().ambient; }

/** Mounted once by the existing App. No timer, frame loop, observer or WebGL context. */
export function VisualRuntime() {
  useLayoutEffect(() => {
    const apply = () => {
      const p = menuPolicy(menuVisuals.get(), settingsStore.get().quality);
      document.documentElement.dataset.menuMotion = p.enabled ? 'on' : 'off';
      document.documentElement.dataset.menuQuality = p.tier;
      document.documentElement.dataset.menuPaused = String(!p.active);
    };
    const environment = () => menuVisuals.set({ reduced: reducedQuery.matches,
      fine: fineQuery.matches, visible: !document.hidden });
    const offVisuals = menuVisuals.subscribe(apply), offSettings = settingsStore.subscribe(apply);
    reducedQuery.addEventListener('change', environment);
    fineQuery.addEventListener('change', environment);
    document.addEventListener('visibilitychange', environment);
    environment();
    return () => {
      offVisuals(); offSettings();
      reducedQuery.removeEventListener('change', environment);
      fineQuery.removeEventListener('change', environment);
      document.removeEventListener('visibilitychange', environment);
      for (const key of ['menuMotion', 'menuQuality', 'menuPaused']) delete document.documentElement.dataset[key];
    };
  }, []);
  return null;
}

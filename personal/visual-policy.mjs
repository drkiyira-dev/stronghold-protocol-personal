// Shared presentation preference. Never stored in a match/checkpoint or sent to the engine.
export const VISUAL_PREF_KEY = 'sp.pref.personal.visuals.v1';
export function readVisualPreference(storage) {
  try {
    const value = JSON.parse(storage?.getItem(VISUAL_PREF_KEY) || 'null');
    return value?.version === 1 && typeof value.motion === 'boolean' ? value.motion : true;
  } catch { return true; }
}
export function saveVisualPreference(storage, motion) {
  try {
    if (!storage) return false;
    storage.setItem(VISUAL_PREF_KEY, JSON.stringify({ version: 1, motion: !!motion }));
    return true;
  } catch { return false; }
}
export function menuPolicy({ motion = true, reduced = false, visible = true, fine = false }, quality) {
  const tier = ['low', 'medium', 'high'].includes(quality) ? quality : 'medium';
  const enabled = motion && !reduced;
  const active = enabled && visible;
  return { tier, enabled, active, ambient: active && tier !== 'low',
    particles: active ? { low: 0, medium: 8, high: 18 }[tier] : 0,
    parallax: active && fine && tier === 'high' };
}

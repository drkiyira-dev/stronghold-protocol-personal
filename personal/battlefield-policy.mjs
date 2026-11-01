import { menuPolicy } from './visual-policy.mjs';

// Presentation profiles, not weather/game rules. IDs and tile keys come from the
// pinned upstream stages. Other stages keep their existing presentation.
export const BATTLEFIELD_PROFILES = Object.freeze({
  act2autochess_m03: Object.freeze({ kind: 'vent', tile: 'tile_smog' }),
  act2autochess_m04: Object.freeze({ kind: 'water', tile: 'tile_deepsea' }),
});
export const ENVIRONMENT_LIMITS = Object.freeze({ low: 0, medium: 8, high: 24 });

export function battlefieldPolicy(preferences, quality, { ended = false, available = true, official = false } = {}) {
  const p = menuPolicy(preferences, quality);
  const active = p.ambient && !ended && available;
  return { tier: p.tier, active, extras: active && !official ? ENVIRONMENT_LIMITS[p.tier] : 0 };
}

// Use the renderer's parsed, visible field. Never alter rows, heights, devices,
// deployment legality, paths, or a cosmetic plugin's unfamiliar tile definition.
export function environmentTiles(stage, grid) {
  const profile = BATTLEFIELD_PROFILES[stage?.id];
  if (!profile || !Array.isArray(grid)) return [];
  const points = [];
  for (const row of grid) for (const t of row) {
    if (!t.drawn || t.scenery || !t.focus || t.r >= 13 || t.r < 0) continue;
    if (stage.tiles?.[stage.rows?.[t.r]?.[t.c]]?.tileKey !== profile.tile) continue;
    points.push({ row: t.r, col: t.c, z: t.h + 0.025, kind: profile.kind });
  }
  return points;
}

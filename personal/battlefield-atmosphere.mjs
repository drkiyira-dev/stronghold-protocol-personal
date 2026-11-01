import { battlefieldPolicy, environmentTiles } from './battlefield-policy.mjs';

/** Optional presentation on the EXISTING Pixi layer, camera and ticker.
 * Borrow upstream fxAtlas textures; no requests, render targets, filters,
 * WebGL contexts, timers, RAFs, simulation messages or random-state writes.
 */
export class BattlefieldAtmosphere {
  constructor({ P, tiles, layer, textures, preferences, settings, canvas, available = () => true }) {
    Object.assign(this, { P, tiles, layer, textures, preferences, settings, canvas, available });
    this.clock = 0; this.meshes = []; this.stage = null; this.grid = null;
    this.profile = null; this.smokeTiles = new Set(); this.signature = ''; this.official = false; this.ended = false;
    this.error = null; this.destroyed = false; this.active = false; this.budget = 0;
    this.root = new P.Container();
    this.root.label = 'personal-battlefield-atmosphere';
    this.root.eventMode = 'none'; this.root.interactiveChildren = false;
    layer.addChild(this.root);
    // Hide/release immediately on static/reduced/hidden even if the renderer's
    // ticker has already stopped. No observer or duplicate visibility listener.
    this.unsubscribe = preferences.subscribe(() => this.sync());
    // A lost WebGL context can stop the renderer before another frame. Release
    // our geometry on the event; Pixi retains responsibility for GPU recovery.
    this.contextChanged = () => this.sync();
    canvas?.addEventListener('webglcontextlost', this.contextChanged);
    canvas?.addEventListener('webglcontextrestored', this.contextChanged);
  }
  sync() {
    if (this.destroyed) return;
    const p = battlefieldPolicy(this.preferences.get(), this.settings().quality,
      { ended: this.ended, available: this.available(), official: this.official });
    this.active = p.active; this.budget = this.error ? 0 : p.extras; this.tier = p.tier;
    if (!this.budget) this.clear();
    // Upstream smoke remains the ONLY steam emitter. Low/static does not leave
    // a frozen opaque puff above a deployment tile. Water retains its base tile.
    for (const a of this.tiles.animSprites || []) if (a.kind === 'smog') a.sprite.visible = this.active;
  }
  step(dt, { official = false, ended = false } = {}) {
    if (this.destroyed) return;
    try {
      this.official = official; this.ended = ended;
      if (this.stage !== this.tiles.stage || this.grid !== this.tiles.grid) {
        this.clear(); this.stage = this.tiles.stage; this.grid = this.tiles.grid;
        this.profile = environmentTiles(this.stage, this.grid);
        this.smokeTiles = new Set(this.profile.filter(p => p.kind === 'vent').map(p => `${p.row},${p.col}`));
      }
      this.sync();
      if (this.active) this.clock += Math.min(0.1, Math.max(0, Number(dt) || 0));
      const copies = this.tier === 'high' ? 2 : 1;
      const sources = (this.profile || []).flatMap(p => p.kind === 'water' && copies === 2 ? [p, p] : [p]).slice(0, this.budget);
      const signature = sources.map(p => `${p.kind}:${p.row}:${p.col}`).join('|');
      if (signature !== this.signature) {
        this.clear();
        const tex = this.textures();
        for (const [i, point] of sources.entries()) {
          // A projected quad, using Pixi's own mesh: ripples stay on the water
          // tile through camera flights instead of sliding across units or HUD.
          const vertices = new Float32Array(8);
          const mesh = new this.P.SimpleMesh(tex[point.kind === 'water' ? 'ring' : 'soft'], vertices);
          mesh.eventMode = 'none'; mesh.tint = point.kind === 'water' ? 0x94e7ed : 0x8bb9bd;
          mesh.blendMode = this.P.BLEND_MODES.ADD;
          this.root.addChild(mesh); this.meshes.push({ mesh, vertices, point, phase: i * 0.61803398875 % 1 });
        }
        this.signature = signature;
      }
    } catch (error) { this.fail(error); }
  }
  draw(cam) {
    if (this.destroyed || this.error || !cam) return;
    try {
      for (const { mesh, vertices, point: p, phase } of this.meshes) {
        const k = (this.clock * (p.kind === 'water' ? 0.22 : 0.12) + phase) % 1;
        const radius = p.kind === 'water' ? 0.08 + 0.37 * k : 0.44;
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (let i = 0; i < 4; i++) {
          const q = cam.project(p.col + corners[i][0] * radius, p.row + corners[i][1] * radius, p.z);
          vertices[i * 2] = q.x; vertices[i * 2 + 1] = q.y;
        }
        mesh.alpha = p.kind === 'water' ? 0.26 * Math.sin(k * Math.PI) : 0.12 + 0.07 * Math.sin(k * Math.PI * 2);
      }
      // Enhance upstream's existing steam in-place, without a second emitter.
      // No global weather overlay: only actual smog tiles on this mapped stage.
      if (this.active && this.stage?.id === 'act2autochess_m03' && !this.official) {
        let smoke = 0;
        for (const a of this.tiles.animSprites || []) if (a.kind === 'smog') {
          // Budget the current focused field, not the first (possibly hidden)
          // player's tiles in row order. Other terrain never consumes its budget.
          if (!this.smokeTiles.has(`${a.r},${a.c}`)) { a.sprite.visible = false; continue; }
          a.sprite.visible = smoke++ < (this.tier === 'high' ? 16 : 8);
          const k = (this.clock * 0.18 * a.sp + a.phase) % 1, px = a.s || 40;
          a.sprite.position.set(a.x + (k - 0.3) * px * 0.18, a.y - k * px * 0.6);
          a.sprite.scale.set(px / 128 * (0.5 + k * 0.9), px / 128 * (0.45 + k * 0.55));
          a.sprite.alpha = 0.36 * Math.sin(k * Math.PI);
        }
      }
    } catch (error) { this.fail(error); }
  }
  clear() {
    for (const { mesh } of this.meshes) mesh.destroy({ children: true, texture: false, baseTexture: false });
    this.meshes = []; this.signature = '';
  }
  fail(error) {
    this.error = String(error?.message || error); this.clear();
    // Rendering is optional. A failed effect must not skip the engine's frame.
  }
  stats() {
    return { profile: this.profile?.[0]?.kind || null, active: this.active, tier: this.tier,
      meshes: this.meshes.length, budget: this.budget, clock: this.clock, official: this.official,
      extraTextures: 0, extraContexts: 0, error: this.error };
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this.unsubscribe?.(); this.clear();
    this.canvas?.removeEventListener('webglcontextlost', this.contextChanged);
    this.canvas?.removeEventListener('webglcontextrestored', this.contextChanged);
    this.root.destroy({ children: true }); this.profile = null; this.smokeTiles.clear(); this.stage = null; this.grid = null;
  }
}

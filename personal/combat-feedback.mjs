// Cosmetic confirmation only. Reuse TileField's projected, terrain-aware
// highlights; never issue commands, move units, or create a second render loop.
export class CombatFeedback {
  constructor({ tiles, preferences, settings, canvas, available = () => true }) {
    Object.assign(this, { tiles, preferences, settings, canvas, available });
    this.previous = null;
    this.skills = new Set();
    this.cues = [];
    this.counts = { deploy: 0, move: 0, retreat: 0, skill: 0 };
    this.error = null;
    this.destroyed = false;
    this.lost = false;
    this.unsubscribe = preferences.subscribe(() => { if (!this.budget()) this.clear(); });
    this.onLost = () => { this.lost = true; this.clear(); };
    this.onRestored = () => { this.lost = false; };
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
  }

  budget() {
    const p = this.preferences.get(), q = this.settings().quality;
    return this.destroyed || this.error || this.lost || !this.available()
      || p.motion === false || p.reduced || p.visible === false || q === 'low' ? 0 : q === 'high' ? 4 : 2;
  }

  guard(fn) {
    if (this.destroyed || this.error) return;
    try { fn(); } catch (error) { this.error = String(error?.message || error); this.clear(); }
  }

  // Called with committed private state, never the dragged/held view position.
  // The first snapshot (including save restore/reconnect) establishes a baseline.
  prep(entries, world, editable) {
    this.guard(() => {
      const next = new Map(entries.filter(e => e.piece.kind !== 'item').map(e => [e.uid,
        { area: e.area, at: world(e) }]).filter(([, e]) => e.at));
      if (editable && this.previous) for (const [uid, now] of next) {
        const old = this.previous.get(uid);
        if (now.area === 'board' && (!old || old.area !== 'board')) this.add('deploy', now.at);
        else if (old?.area === 'board' && now.area === 'board'
          && (old.at.x !== now.at.x || old.at.y !== now.at.y)) this.add('move', now.at);
        else if (old?.area === 'board' && (now.area === 'hand' || now.area === 'temp')) this.add('retreat', old.at);
      }
      this.previous = editable ? next : null;
    });
  }

  // Existing official/plugin effects win. Only an actual, timely activation
  // gets a small ground emphasis alongside the upstream procedural skill FX.
  skill(view, on, { handled = false, late = false } = {}) {
    this.guard(() => {
      if (!view) return;
      const id = view.id;
      if (!on) { this.skills.delete(id); return; }
      if (this.skills.has(id)) return;
      this.skills.add(id);
      if (this.skills.size > 256) this.skills.delete(this.skills.values().next().value);
      if (!handled && !late && view.info?.side === 'ally' && view.info?.kind !== 'device') this.add('skill', view);
    });
  }

  add(kind, at) {
    const budget = this.budget();
    if (!budget || !Number.isFinite(at?.x) || !Number.isFinite(at?.y)) return;
    const cell = [Math.round(at.y), Math.round(at.x)];
    // Coalesce bursts on the same cell; cap our groups independently of upstream.
    const existing = this.cues.find(c => c.cell[0] === cell[0] && c.cell[1] === cell[1]);
    if (existing) this.remove(existing);
    while (this.cues.length >= budget) this.remove(this.cues[0]);
    const group = [0, 1, 2, 3].map(i => 'personal-combat-' + i).find(key => !this.cues.some(c => c.group === key));
    const cue = { kind, cell, age: 0, duration: kind === 'skill' ? .42 : .32, group };
    this.cues.push(cue);
    this.counts[kind]++;
    this.draw(cue);
  }

  draw(cue) {
    const fade = Math.max(0, 1 - cue.age / cue.duration);
    this.tiles.setHighlights([cue.cell], {
      color: cue.kind === 'skill' ? 0xffd37a : cue.kind === 'retreat' ? 0x95c9ff : 0x9ff0dc,
      fill: cue.kind === 'retreat' ? 0 : .14 * fade,
      line: .9 * fade,
    }, cue.group);
  }

  step(dt, ended = false) {
    this.guard(() => {
      const cap = ended ? 0 : this.budget();
      while (this.cues.length > cap) this.remove(this.cues[0]);
      for (const cue of [...this.cues]) {
        cue.age += Math.min(.1, Math.max(0, Number(dt) || 0));
        if (cue.age >= cue.duration) this.remove(cue);
        else this.draw(cue);
      }
    });
  }

  remove(cue) {
    this.cues.splice(this.cues.indexOf(cue), 1);
    this.tiles.clearHighlights(cue.group);
  }
  clear() {
    for (const cue of this.cues.splice(0)) {
      try { this.tiles.clearHighlights(cue.group); } catch { /* optional renderer unavailable */ }
    }
  }
  reset() { this.clear(); this.previous = null; this.skills.clear(); }
  stats() { return { active: this.cues.length, budget: this.budget(), counts: { ...this.counts }, error: this.error }; }
  destroy() {
    if (this.destroyed) return;
    this.reset(); this.destroyed = true;
    this.unsubscribe();
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
  }
}

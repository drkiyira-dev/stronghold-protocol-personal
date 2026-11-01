import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { battlefieldPolicy, environmentTiles } from './battlefield-policy.mjs';
import { BattlefieldAtmosphere } from './battlefield-atmosphere.mjs';
import { BATTLEFIELD_ADAPTERS } from './battlefield-build.mjs';
import { parseStage } from '../upstream/public/js/render/tiles.js';

const stages = JSON.parse(await readFile(new URL('../upstream/data/stages.json', import.meta.url)));
test('environment profiles follow actual tile keys, never introduce weather or alter map data', () => {
  const before = JSON.stringify(stages);
  for (const [id, count, kind] of [['act2autochess_m03', 8, 'vent'], ['act2autochess_m04', 12, 'water']]) {
    const grid = parseStage(stages[id]);
    assert.equal(environmentTiles(stages[id], grid).length, count);
    assert.ok(environmentTiles(stages[id], grid).every(p => p.kind === kind));
    for (const row of grid) for (const tile of row) tile.focus = false;
    assert.deepEqual(environmentTiles(stages[id], grid), []);
  }
  assert.deepEqual(environmentTiles(stages.act1autochess_m01, parseStage(stages.act1autochess_m01)), []);
  const custom = structuredClone(stages.act2autochess_m04); custom.tiles.d.tileKey = 'tile_road';
  assert.deepEqual(environmentTiles(custom, parseStage(custom)), []);
  assert.equal(JSON.stringify(stages), before);
});
test('one v12 preference controls budgets, reduced motion, visibility, completion and WebGL loss', () => {
  assert.deepEqual(['low', 'medium', 'high'].map(q => battlefieldPolicy({}, q).extras), [0, 8, 24]);
  for (const pref of [{ motion: false }, { reduced: true }, { visible: false }]) {
    assert.equal(battlefieldPolicy(pref, 'high').active, false);
  }
  for (const state of [{ ended: true }, { available: false }]) assert.equal(battlefieldPolicy({}, 'high', state).extras, 0);
  assert.deepEqual(battlefieldPolicy({}, 'high', { official: true }), { tier: 'high', active: true, extras: 0 });
});

function fixture() {
  let prefs = {}, quality = 'high', lost = false;
  const listeners = new Set(), contextListeners = new Map(), live = new Set(), textures = { ring: {}, soft: {} };
  const canvas = { addEventListener: (type, fn) => contextListeners.set(type, fn), removeEventListener: type => contextListeners.delete(type) };
  class Container {
    constructor() { this.children = []; }
    addChild(child) { this.children.push(child); child.parent = this; }
    destroy() { this.parent?.children.splice(this.parent.children.indexOf(this), 1); }
  }
  class Mesh extends Container {
    constructor(texture, vertices, uv, index) {
      super(); this.texture = texture; this.vertices = vertices;
      assert.equal(uv.length, 8); assert.deepEqual([...index], [0, 1, 2, 0, 2, 3]); live.add(this);
    }
    destroy(options) { assert.equal(options.texture, false); assert.equal(options.baseTexture, false); live.delete(this); super.destroy(); }
  }
  const tiles = { stage: stages.act2autochess_m04, grid: parseStage(stages.act2autochess_m04), animSprites: [] };
  const atmosphere = new BattlefieldAtmosphere({ P: { Container, SimpleMesh: Mesh, BLEND_MODES: { ADD: 1 } },
    tiles, canvas, layer: new Container(), textures: () => textures, settings: () => ({ quality }), available: () => !lost,
    preferences: { get: () => prefs, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } } });
  return { atmosphere, tiles, live, listeners, contextListeners, setQuality(q) { quality = q; }, lose() { lost = true; contextListeners.get('webglcontextlost')?.(); },
    preference(p) { prefs = p; for (const fn of listeners) fn(); } };
}
test('owned geometry is bounded, reused and immediately released; no borrowed textures destroyed', () => {
  const f = fixture(), a = f.atmosphere;
  a.step(0.1); assert.equal(f.live.size, 24); const first = [...f.live];
  a.step(0.1); assert.deepEqual([...f.live], first);
  f.setQuality('medium'); a.step(0.1); assert.equal(f.live.size, 8);
  f.preference({ visible: false }); assert.equal(f.live.size, 0);
  const frozen = a.clock; a.step(99); assert.equal(a.clock, frozen);
  f.preference({ visible: true }); a.step(99); assert.ok(a.clock <= frozen + 0.100001);
  assert.equal(f.live.size, 8);
  a.step(0.1, { official: true }); assert.equal(f.live.size, 0); assert.equal(a.stats().official, true);
  a.step(0.1); assert.equal(f.live.size, 8);
  a.step(0.1, { ended: true }); assert.equal(f.live.size, 0);
  a.step(0.1); f.lose(); assert.equal(f.live.size, 0, 'loss releases without waiting for a frame');
  a.destroy(); a.destroy(); assert.equal(f.listeners.size, 0); assert.equal(f.contextListeners.size, 0); assert.equal(f.live.size, 0);
});
test('camera-projected ripples stay inside real water tiles and stage replacement drops all old geometry', () => {
  const f = fixture(), a = f.atmosphere; a.step(0.1);
  const projections = [];
  a.draw({ project(x, y, z) { projections.push([x, y, z]); return { x: x * 20, y: y * 10 - z }; } });
  assert.equal(projections.length, 24 * 4);
  for (const { point: p, vertices } of a.meshes) for (let i = 0; i < 8; i += 2) {
    assert.ok(Math.abs(vertices[i] / 20 - p.col) < 0.5);
    assert.ok(Math.abs((vertices[i + 1] + p.z) / 10 - p.row) < 0.5);
  }
  f.tiles.stage = stages.act1autochess_m01; f.tiles.grid = parseStage(f.tiles.stage);
  a.step(0.1); assert.equal(f.live.size, 0); a.destroy();
});
test('a failed cosmetic draw is contained and releases geometry instead of throwing into the frame', () => {
  const f = fixture(); f.atmosphere.step(0.1);
  assert.doesNotThrow(() => f.atmosphere.draw({ project() { throw Error('context unavailable'); } }));
  assert.equal(f.live.size, 0); assert.match(f.atmosphere.stats().error, /context unavailable/);
  f.atmosphere.step(0.1); assert.equal(f.live.size, 0); f.atmosphere.destroy();
});
test('medium steam budget follows the current camera focus instead of hidden players first', () => {
  const f = fixture(), a = f.atmosphere;
  f.tiles.stage = stages.act2autochess_m03; f.tiles.grid = parseStage(f.tiles.stage);
  const points = environmentTiles(f.tiles.stage, f.tiles.grid);
  f.tiles.animSprites = points.flatMap(p => [0, 1].map(() => ({ kind: 'smog', r: p.row, c: p.col,
    sp: 1, phase: 0, x: 0, y: 0, s: 40, sprite: { visible: true, position: { set() {} }, scale: { set() {} } } })));
  for (const row of f.tiles.grid) for (const tile of row) tile.focus = tile.r >= 10 && tile.c < 10;
  f.setQuality('medium'); a.step(.1); a.draw({ project: (x, y) => ({ x, y }) });
  const visible = f.tiles.animSprites.filter(x => x.sprite.visible);
  assert.equal(visible.length, 4); assert.ok(visible.every(x => x.r >= 10 && x.c < 10));
  f.preference({ motion: false }); assert.ok(f.tiles.animSprites.every(x => !x.sprite.visible)); a.destroy();
});
test('generated renderer seams match pinned upstream and fail closed on incompatible sources', async () => {
  for (const [file, adapt] of BATTLEFIELD_ADAPTERS) {
    const source = await readFile(new URL('../upstream/public/' + file, import.meta.url), 'utf8');
    assert.notEqual(adapt(source), source); assert.throws(() => adapt(''), /changed/);
  }
});

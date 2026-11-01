import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CombatFeedback } from './combat-feedback.mjs';
import { adaptCombatFeedback, adaptCombatUnderframe } from './combat-feedback-build.mjs';
import { adaptBattlefieldView } from './battlefield-build.mjs';

function fixture() {
  let pref = {}, quality = 'high';
  const highlights = new Map([['legal', {}]]), listeners = new Set(), context = new Map();
  const tiles = { setHighlights: (cells, style, key) => highlights.set(key, { cells, style }), clearHighlights: key => highlights.delete(key) };
  const feedback = new CombatFeedback({ tiles, settings: () => ({ quality }),
    preferences: { get: () => pref, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } },
    canvas: { addEventListener: (name, fn) => context.set(name, fn), removeEventListener: name => context.delete(name) } });
  return { feedback, highlights, tiles, listeners, context, quality: q => { quality = q; },
    preference: p => { pref = p; for (const fn of listeners) fn(); } };
}
const piece = (uid, area, x = 2, y = 10) => ({ uid, area, piece: { kind: 'chess' }, x, y });
const world = e => ({ x: e.x, y: e.y });

test('committed placement/move/retreat only; first restore, duplicates, turn, sale and read-only views stay quiet', () => {
  const { feedback: f, highlights } = fixture();
  f.prep([piece(1, 'board')], world, true);
  f.prep([piece(1, 'board')], world, true);
  assert.equal(f.stats().active, 0);
  f.prep([piece(1, 'hand')], world, true);
  assert.deepEqual(highlights.get(f.cues[0].group).cells, [[10, 2]]);
  assert.equal(f.cues[0].kind, 'retreat');
  f.prep([piece(1, 'board')], world, true);
  f.prep([piece(1, 'board', 3)], world, true);
  f.prep([], world, true); // sale/disappearance is not retreat
  assert.deepEqual(f.stats().counts, { deploy: 1, move: 1, retreat: 1, skill: 0 });
  f.reset(); f.prep([piece(2, 'board')], world, false);
  f.prep([piece(2, 'board')], world, true);
  assert.equal(f.stats().active, 0);
  assert.ok(highlights.has('legal'), 'never clear original interaction highlights');
});

test('confirmed coordinate transform, not held/dragged coordinates; token split receives one cue', () => {
  const { feedback: f, highlights } = fixture();
  const entries = [piece(1, 'hand')];
  f.prep(entries, world, true);
  const token = { ...piece(2, 'board', 5, 11), piece: { kind: 'token' } };
  const original = JSON.stringify(token);
  f.prep([...entries, token], e => ({ x: 19 - e.x, y: 19 - e.y }), true);
  assert.deepEqual(highlights.get(f.cues[0].group).cells, [[8, 14]]);
  assert.equal(f.stats().counts.deploy, 1);
  assert.equal(JSON.stringify(token), original);
});

test('skill emphasis is edge-triggered from real ally events; official/plugin/late/enemy events retain their own effects', () => {
  const { feedback: f } = fixture(), v = { id: 12, x: 2.1, y: 10.1, info: { side: 'ally', kind: 'op' } };
  f.skill(v, true); f.skill(v, true); assert.equal(f.stats().counts.skill, 1);
  f.skill(v, false); f.skill(v, true, { handled: true });
  f.skill(v, false); f.skill(v, true, { late: true });
  f.skill({ ...v, id: 13, info: { side: 'enemy' } }, true);
  assert.equal(f.stats().counts.skill, 1);
  f.skill(v, false); f.skill(v, true); assert.equal(f.stats().counts.skill, 2);
});

test('bounded highlights expire on the original ticker and respect all v12 preferences immediately', () => {
  const f = fixture(), a = f.feedback;
  a.prep([], world, true);
  a.prep(Array.from({ length: 20 }, (_, i) => piece(i, 'board', i)), world, true);
  assert.equal(a.stats().active, 4); assert.equal(f.highlights.size, 5);
  f.quality('medium'); a.step(.01); assert.equal(a.stats().active, 2);
  for (let i = 0; i < 5; i++) a.step(.1);
  assert.equal(a.stats().active, 0);
  for (const pref of [{ motion: false }, { reduced: true }, { visible: false }]) {
    f.preference({}); a.add('move', { x: 1, y: 2 }); f.preference(pref);
    assert.equal(a.stats().active, 0); a.add('move', { x: 1, y: 2 }); assert.equal(a.stats().active, 0);
  }
  f.preference({}); f.quality('low'); a.add('move', { x: 1, y: 2 }); assert.equal(a.stats().active, 0);
  f.quality('high'); a.add('move', { x: 1, y: 2 }); a.step(0, true); assert.equal(a.stats().active, 0);
  a.add('move', { x: 1, y: 2 }); f.context.get('webglcontextlost')(); assert.equal(a.stats().active, 0);
  a.add('move', { x: 1, y: 2 }); assert.equal(a.stats().active, 0);
  f.context.get('webglcontextrestored')(); a.add('move', { x: 1, y: 2 }); assert.equal(a.stats().active, 1);
  a.destroy(); a.destroy(); assert.equal(f.listeners.size, 0); assert.equal(f.context.size, 0);
  assert.deepEqual([...f.highlights.keys()], ['legal']);
});

test('hidden updates establish state without replaying confirmations when motion resumes; cosmetics fail closed', () => {
  const f = fixture(), a = f.feedback;
  a.prep([piece(1, 'hand')], world, true); f.preference({ visible: false });
  a.prep([piece(1, 'board')], world, true); f.preference({});
  a.prep([piece(1, 'board')], world, true); assert.equal(a.stats().counts.deploy, 0);
  f.tiles.setHighlights = () => { throw Error('render unavailable'); };
  assert.doesNotThrow(() => a.prep([piece(1, 'hand')], world, true));
  assert.equal(a.stats().error, 'render unavailable'); assert.equal(a.stats().active, 0);
});

test('rapid coalescing cannot reuse another active cue group or erase its highlight', () => {
  const { feedback: f, highlights } = fixture();
  f.add('skill', { x: 1, y: 10 });
  const first = f.cues[0].group;
  for (let i = 0; i < 40; i++) f.add('move', { x: 2, y: 10 });
  assert.equal(f.cues.length, 2);
  assert.equal(new Set(f.cues.map(c => c.group)).size, 2);
  assert.deepEqual(highlights.get(first).cells, [[10, 1]]);
  f.remove(f.cues[1]); assert.ok(highlights.has(first));
});

test('build seams preserve upstream effect precedence and fail on drift; feedback ignores speculative holds', async () => {
  const app = await readFile(new URL('../upstream/public/js/render/app.js', import.meta.url), 'utf8');
  const adapted = adaptCombatFeedback(adaptBattlefieldView(app));
  assert.equal(adapted.match(/wiring\.skill\(v, !!e\[2\]\)/g).length, 1);
  assert.equal(adapted.match(/pluginFx\.skill\(v, !!e\[2\]\)/g).length, 1);
  assert.match(adapted, /combatFeedback\.prep\(list, e => \{\s+const t = pieceTile\(e\);\s+return t && boardWorld/);
  assert.throws(() => adaptCombatFeedback(''), /changed/);
  const ui = await readFile(new URL('../upstream/public/js/ui/underframe.js', import.meta.url), 'utf8');
  assert.match(adaptCombatUnderframe(ui), /<svg key=\$\{uid\} class="uframe__dia"/);
  assert.throws(() => adaptCombatUnderframe(''), /changed/);
});

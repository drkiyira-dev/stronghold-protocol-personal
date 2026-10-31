import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { VISUAL_PREF_KEY, readVisualPreference, saveVisualPreference, menuPolicy } from './visual-policy.mjs';
import { VISUAL_ADAPTERS, VISUAL_EN } from './visuals-build.mjs';

test('menu preferences recover from corrupt, missing and future schemas without touching saves', () => {
  for (const raw of [null, '{', '{}', '{"version":2,"motion":false}', '{"version":1,"motion":"false"}']) {
    assert.equal(readVisualPreference({ getItem: key => { assert.equal(key, VISUAL_PREF_KEY); return raw; } }), true);
  }
  const values = new Map([['player-checkpoint', 'untouched']]);
  const storage = { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) };
  assert.ok(saveVisualPreference(storage, false));
  assert.equal(readVisualPreference(storage), false);
  assert.equal(values.get('player-checkpoint'), 'untouched');
});
test('private/quota-denied storage is a recoverable preference failure', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.equal(readVisualPreference(denied), true);
  assert.equal(saveVisualPreference(denied, false), false);
  assert.equal(saveVisualPreference(null, true), false);
});
test('quality budgets are bounded and coarse pointers never enable parallax', () => {
  assert.deepEqual(['low', 'medium', 'high'].map(q => menuPolicy({ fine: true }, q).particles), [0, 8, 18]);
  assert.equal(menuPolicy({ fine: false }, 'high').parallax, false);
  assert.equal(menuPolicy({ fine: true }, 'medium').parallax, false);
  assert.equal(menuPolicy({ fine: true }, 'high').parallax, true);
  assert.equal(menuPolicy({}, 'unknown').tier, 'medium');
  assert.equal(menuPolicy({}, 'low').ambient, false);
});
test('system reduced motion, user static and background tabs all suspend ambient work', () => {
  for (const env of [{ reduced: true }, { motion: false }, { visible: false }]) {
    const p = menuPolicy({ fine: true, ...env }, 'high');
    assert.equal(p.ambient, false); assert.equal(p.parallax, false); assert.equal(p.particles, 0);
  }
  assert.equal(menuPolicy({ motion: true, reduced: true }, 'high').enabled, false);
});
test('all visual seams match the pinned upstream and fail closed when their anchors disappear', async () => {
  for (const [file, adapt] of VISUAL_ADAPTERS) {
    const source = await readFile(new URL('../upstream/public/' + file, import.meta.url), 'utf8');
    assert.notEqual(adapt(source), source, file);
    assert.throws(() => adapt(''), /changed/, file);
  }
});
test('new menu preference copy has English translations', async () => {
  const source = await readFile(new URL('./visuals.mjs', import.meta.url), 'utf8');
  for (const [, label] of source.matchAll(/\bt\('([^']+)'\)/g)) assert.ok(VISUAL_EN[label], label);
});

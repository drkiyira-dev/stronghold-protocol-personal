import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { PREVIEW_INIT } from './battlefield-preview.mjs';

test('QA startup mutes before the client loads without resetting other preferences', () => {
  for (const previous of [JSON.stringify({ bgm: .4, quality: 'medium', muted: false }), '{broken']) {
    const values = new Map([['sp.pref.settings', previous]]);
    runInNewContext(PREVIEW_INIT, { URL, location: 'http://127.0.0.1:4183/?seed=5',
      localStorage: { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) } });
    const preferences = JSON.parse(values.get('sp.pref.settings'));
    assert.equal(preferences.muted, true);
    if (previous !== '{broken') { assert.equal(preferences.bgm, .4); assert.equal(preferences.quality, 'medium'); }
    assert.equal(JSON.parse(values.get('stronghold.personal.challenge')).seed, 5);
  }
});

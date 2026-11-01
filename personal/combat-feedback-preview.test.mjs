import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('native QA inspector publishes hidden-page state and re-enables its button when RAF is suspended', async () => {
  const source = (await readFile(new URL('./combat-feedback-probe.mjs', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  const nodes = new Map(), sent = [], cancelled = [];
  const panel = { style: {}, querySelector: key => { if (!nodes.has(key)) nodes.set(key, {}); return nodes.get(key); } };
  runInNewContext(source, {
    document: { createElement: () => panel, body: { append() {} } },
    MutationObserver: class { observe() {} },
    store: { get: () => ({ match: { private: {}, public: { phase: 'PREP', round: 2 } } }) },
    navigator: { userAgent: 'QA suspended-RAF fixture' },
    __SP_VIEW__: { raw: { stats: () => ({ combatFeedback: { active: 0, budget: 0, error: null } }) } },
    fetch: async (url, request) => { sent.push(JSON.parse(request.body)); return { ok: true }; },
    requestAnimationFrame: () => 9, cancelAnimationFrame: id => cancelled.push(id), setTimeout, clearTimeout,
  });
  const button = nodes.get('#cf-inspect');
  await button.onclick({ target: button });
  assert.equal(button.disabled, false);
  assert.equal(sent.length, 1); assert.equal(sent[0].round, 2);
  assert.equal(sent[0].stats.budget, 0, 'do not manufacture visible-frame acceptance');
  assert.deepEqual(cancelled, [9]);
  assert.equal(JSON.parse(nodes.get('pre').textContent).phase, 'combat-feedback');
});

test('QA retains actual insertion-time result styles after the transient dialog detaches', async () => {
  const source = (await readFile(new URL('./combat-feedback-probe.mjs', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  const nodes = new Map(), sent = [], box = {};
  let observe, attached = true;
  const dialog = { dataset: {}, textContent: 'BATTLE OVER', querySelector: () => box };
  const panel = { style: {}, querySelector: key => { if (!nodes.has(key)) nodes.set(key, {}); return nodes.get(key); } };
  const computed = element => attached
    ? element === box ? { animationName: 'personal-result-in' } : { pointerEvents: 'none' }
    : { animationName: '', pointerEvents: '' };
  runInNewContext(source, {
    document: { createElement: () => panel, body: { append() {} }, querySelector: () => attached ? dialog : null },
    MutationObserver: class { constructor(fn) { observe = fn; } observe() {} },
    getComputedStyle: computed,
    store: { get: () => ({ match: { private: {}, public: { phase: 'PREP', round: 2 } } }) },
    navigator: { userAgent: 'QA detached-dialog fixture' },
    fetch: async (url, request) => { sent.push(JSON.parse(request.body)); return { ok: true }; },
    requestAnimationFrame: () => 9, cancelAnimationFrame() {}, setTimeout, clearTimeout,
  });
  observe(); observe(); // An unrelated DOM mutation must not duplicate the result.
  attached = false; observe();
  assert.equal(computed(box).animationName, '', 'a late style read loses the evidence');
  const button = nodes.get('#cf-inspect'); await button.onclick({ target: button });
  assert.equal(sent[0].results.length, 1);
  assert.equal(sent[0].results[0].animation, 'personal-result-in');
  assert.equal(sent[0].results[0].pointerEvents, 'none');
  assert.equal(sent[0].results[0].text, 'BATTLE OVER');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from '../upstream/test/match/harness.js';
import { VirtualScheduler } from '../upstream/server/match/scheduler.js';
import { createRng } from '../upstream/server/sim/rng.js';
import { collectViolations } from '../upstream/server/match/invariants.js';
import { captureCheckpoint, restoreCheckpoint, validateCheckpoint } from './checkpoint.mjs';

function restore(snapshot, data) {
  const scheduler = new VirtualScheduler({ start: snapshot.savedAt });
  const sent = [];
  const m = restoreCheckpoint(JSON.parse(JSON.stringify(snapshot)), {
    data, scheduler, send: (id, msg) => { sent.push([id, msg]); return true; }, broadcast() {}, onEnd() {},
  });
  return { m, scheduler, sent };
}
function buyAndPlace(m) {
  const p = m.order[0];
  for (let i = 0; i < p.shop.slots.length; i++) {
    if (p.shop.slots[i]?.kind !== 'chess' || p.priceOf(p.shop.slots[i]) > p.funds) continue;
    assert.equal(p.buy(i).ok, true);
    const unit = p.hand.find(x => x?.kind === 'chess');
    if (!unit) continue;
    for (const key of p.deployMap().keys()) {
      const [row, col] = key.split(',').map(Number);
      if (p.board.has(key) || !p._legal(unit, row, col)) continue;
      assert.equal(p.move(unit.uid, { area: 'board', row, col }, 'RIGHT').ok, true);
      break;
    }
  }
  assert.ok(p.board.size > 0);
}
function nextPrep(m, scheduler, target) {
  let steps = 0;
  while (!m.ended && !(m.phase === 'PREP' && m.round === target)) {
    if (++steps > 200000) throw new Error('phase did not advance');
    const p = m.order[0];
    if (m.phase === 'PREP' && !p.ready) {
      if (p.personalChoice) m.handle(p.playerId, { t: 'g.choice', idx: 0, choiceId: p.personalChoice.id });
      p.resolveTemp();
      assert.equal(m.handle(p.playerId, { t: 'g.ready', ready: true }).ok, true);
    }
    if (m.phase === 'SP_DRAFT' && m.spTurn() === p.playerId) {
      const idx = m.sp.cards.map(c => c.idx).find(k => m.sp.taken[k] == null);
      assert.equal(m.handle(p.playerId, { t: 'g.choice', idx }).ok, true);
    }
    if (!scheduler.runNext()) throw new Error(`No continuation in ${m.phase}`);
  }
  assert.equal(m.phase, 'PREP');
  assert.equal(m.round, target);
  assert.deepEqual(collectViolations(m), []);
}
function compareState(a, b) {
  assert.deepEqual(captureCheckpoint(a).state, captureCheckpoint(b).state);
  assert.deepEqual(a.order[0].privateView(), b.order[0].privateView());
  assert.deepEqual(a.publicView(), b.publicView());
}

test('run identity survives changed room codes and real restore; same-seed new matches stay distinct', () => {
  const a=makeMatch({mode:'solo',seed:812,botRehearsal:0}),b=makeMatch({mode:'solo',seed:812,botRehearsal:0});
  a.start();a.toPrep(1);b.start();b.toPrep(1);
  const first=captureCheckpoint(a.m),second=captureCheckpoint(b.m);
  let restored;
  try {
    assert.equal(typeof first.runId,'string');assert.notEqual(first.runId,second.runId);
    restored=restore({...first,options:{...first.options,roomCode:'NEWROOM'}},a.m.data);
    const next=captureCheckpoint(restored.m);
    assert.equal(next.runId,first.runId);assert.deepEqual(next.state,first.state);
    assert.throws(()=>validateCheckpoint({...first,runId:{}},a.m.data),/身份/);
  } finally {restored?.m.dispose();a.m.dispose();b.m.dispose();}
});

test('JSON PREP checkpoint preserves board, money, shop, bonds, loadout, stock and six RNG streams', () => {
  const h = makeMatch({ mode: 'solo', seed: 832, botRehearsal: 0 });
  h.start(); h.toPrep(1); buyAndPlace(h.m);
  const ps = h.m.order[0];
  ps.shop.frozen = true;
  ps.shop.slots.forEach(s => { if (s && !s.sold) s.frozen = true; });
  const before = captureCheckpoint(h.m);
  const r = restore(before, h.m.data);
  assert.equal(validateCheckpoint(before, h.m.data), true);
  compareState(h.m, r.m);
  assert.equal(r.m.order[0].bandId, ps.bandId);
  assert.equal(r.m.order[0].funds, ps.funds);
  assert.equal(r.m.order[0].shop.frozen, true);
  assert.equal(r.scheduler.pending(), 0);
  r.m.onReconnect(ps.playerId);
  assert.ok(r.sent.some(([, msg]) => msg.t === 'm.private'));
  assert.ok(r.sent.some(([, msg]) => msg.t === 'm.public'));
  compareState(h.m, r.m);
  r.m.dispose(); h.m.dispose();
});

test('restored real combat and the next round produce identical settlement, stock, income and shop', () => {
  const h = makeMatch({ mode: 'solo', seed: 1234, botRehearsal: 0 });
  h.start(); h.toPrep(1); buyAndPlace(h.m);
  const r = restore(captureCheckpoint(h.m), h.m.data);
  nextPrep(h.m, h.sched, 2);
  nextPrep(r.m, r.scheduler, 2);
  compareState(h.m, r.m);
  assert.deepEqual(r.m.lastResults, h.m.lastResults);
  assert.equal(h.m.errorCount, 0);
  assert.equal(r.m.errorCount, 0);
  // Repeat from a later checkpoint; R3 includes a choice phase before PREP.
  const later = restore(captureCheckpoint(h.m), h.m.data);
  nextPrep(h.m, h.sched, 3);
  nextPrep(later.m, later.scheduler, 3);
  compareState(h.m, later.m);
  later.m.dispose(); r.m.dispose(); h.m.dispose();
});

test('raw negative chess stock, item debt and a zero RNG state survive losslessly', () => {
  const h = makeMatch({ mode: 'solo', seed: 31, botRehearsal: 0 });
  h.start(); h.toPrep(1);
  const p = h.m.order[0];
  const [id, entry] = [...h.m.pool.entries].find(([id, e]) => e.cap > 0 && e.cap <= 12 && h.m.gd.goldenIdOf(id));
  const golden = h.m.gd.goldenIdOf(id);
  const count = Math.floor(entry.cap / h.m.gd.goldenCopies) + 1;
  for (let i = 0; i < count; i++) p.acquireChess(golden, { source: 'test', silent: true });
  const deficit = -entry.left;
  assert.ok(deficit > 0);
  const itemId = Object.keys(h.m.data.items).find(k => !h.m.gd.item(k).isGolden && h.m.itemPool.cap(k) === 4 && h.m.gd.item(k).goldenId);
  const goldenItem = h.m.gd.item(itemId).goldenId;
  for (let i = 0; i < 3; i++) p.acquireItem(goldenItem, { displayed: true, silent: true });
  assert.equal(h.m.itemPool.debtOf(itemId), 2);
  const rng = createRng((-0x6d2b79f5) >>> 0); rng();
  assert.equal(rng.state(), 0);
  h.m.rngMeta = rng;
  assert.deepEqual(collectViolations(h.m), []);
  const r = restore(captureCheckpoint(h.m), h.m.data);
  assert.equal(r.m.pool.entries.get(id).left, -deficit);
  assert.deepEqual(r.m.itemPool.debt, h.m.itemPool.debt);
  assert.equal(r.m.rngMeta.state(), 0);
  for (let i = 0; i < 20; i++) assert.equal(r.m.rngMeta(), h.m.rngMeta());
  r.m.dispose(); h.m.dispose();
});

test('rejects wrong phases, active autoplay, changed data, incompatible versions and identity overrides', () => {
  const h = makeMatch({ mode: 'solo', seed: 832, botRehearsal: 0 });
  assert.throws(() => captureCheckpoint(h.m), /仅可保存休整期/);
  h.start(); h.toPrep(1);
  const snapshot = captureCheckpoint(h.m);
  h.m.order[0].autoplay = true;
  assert.throws(() => captureCheckpoint(h.m), /手动操作/);
  h.m.order[0].autoplay = false;
  assert.throws(() => validateCheckpoint({ ...snapshot, version: 2 }, h.m.data), /版本不兼容/);
  assert.throws(() => validateCheckpoint(snapshot, { ...h.m.data, config: { ...h.m.data.config, checkpointTest: true } }), /不同版本/);
  assert.throws(() => restoreCheckpoint(snapshot, { data: h.m.data, seed: 7 }), /不能覆盖 seed/);
  assert.throws(() => validateCheckpoint({ ...snapshot, state: {} }, h.m.data), /局面格式/);
  h.m.dispose();
});

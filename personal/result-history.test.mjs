import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildRecord, recordToResult} from '../upstream/public/js/ui/stats.js';
import {normalizeResult} from '../upstream/public/js/ui/gameLogic/result.js';

const config = JSON.parse(await readFile(new URL('../upstream/data/config.json', import.meta.url), 'utf8'));

test('saved results recover their mode round limit after reload without a live match', () => {
  for (const [modeId, lastRound] of [
    ['mode_single_funny', 9], ['mode_training_1', 4],
    ['mode_single_normal', 14], ['mode_multi_funny', 14],
  ]) {
    const payload = {
      victory: true, roundsPassed: lastRound, modeId,
      difficulty: config.modes[modeId].difficulty, seed: 42,
      players: [{playerId: 'p1', seat: 0, name: 'Doctor', lp: 25, stats: {kills: 109}}],
    };
    const saved = JSON.parse(JSON.stringify(buildRecord(payload, {myId: 'p1', now: 1})));
    const replay = recordToResult(saved);
    assert.ok(replay);
    assert.equal(replay.lastRound, undefined, 'old records lack a round limit');
    const view = normalizeResult(replay, null, config);
    assert.equal(view.lastRound, lastRound, modeId);
    assert.equal(view.roundsPassed, lastRound);
    assert.equal(view.players[0].lp, 25);
    assert.equal(view.players[0].stats.kills, 109);
  }
});

test('recorded and live round limits take precedence over current mode defaults', () => {
  const res = {modeId: 'mode_single_funny', roundsPassed: 9};
  assert.equal(normalizeResult({...res, lastRound: 12}, {lastRound: 10}, config).lastRound, 12);
  assert.equal(normalizeResult(res, {lastRound: 10}, config).lastRound, 10);
  assert.equal(normalizeResult({}, {modeId: res.modeId}, config).lastRound, 9);
  assert.equal(normalizeResult({modeId: 'unknown'}, null, config).lastRound, 14);
  assert.equal(normalizeResult(null, null).lastRound, 14);
  const hidden = normalizeResult({modeId: 'mode_single_hard', roundsPassed: 15, hiddenCleared: true}, null, config);
  assert.equal(hidden.lastRound, 14);
  assert.equal(hidden.hiddenReached, true);
});

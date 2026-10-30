import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createLocalServer } from '../dist/personal/local-server.js';
import { createBattleFromSpec, compactResult, battleProgress } from '../upstream/server/sim/spec.js';
import { DataSource } from '../upstream/server/sim/simdata.js';
import { StateReceiver, STATE_DELTA_VERSION } from '../upstream/shared/stateDelta.js';

const dataUrl = new URL('../upstream/data/', import.meta.url);
const data = Object.fromEntries(await Promise.all((await readdir(dataUrl)).filter(name => name.endsWith('.json') && !name.startsWith('local-')).map(async name => [name.slice(0, -5), JSON.parse(await readFile(new URL(name, dataUrl), 'utf8'))])));

test('original worker host supports solo briefing, original roster, shop, placement, real battle and settlement', { timeout: 30000 }, async () => {
  const frames = [];
  const receiver = new StateReceiver();
  let rid = 0;
  const server = await createLocalServer({ data, emit: frame => {
    if (frame.t === 'm.state') {
      const decoded = receiver.receive(frame);
      assert.equal(decoded.resync, false);
      if (decoded.message) frames.push(decoded.message);
    } else frames.push(frame);
  } });
  const wait = async predicate => {
    const started = Date.now();
    while (Date.now() - started < 16000) {
      const result = frames.findLast(predicate);
      if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Missing frame; recent: ${JSON.stringify(frames.slice(-4))}`);
  };
  const request = async message => {
    const id = ++rid;
    server.receive({ ...message, rid: id });
    return wait(frame => frame.rid === id);
  };
  const ok = async message => {
    const reply = await request(message);
    assert.equal(reply.t, 'ok', `${message.t}: ${JSON.stringify(reply)}`);
    return reply;
  };
  try {
    const welcome = await request({ t: 'hello', name: '个人测试博士', version: 1, delta: STATE_DELTA_VERSION });
    assert.equal(welcome.t, 'welcome');
    assert.ok(welcome.playerId);
    assert.ok(welcome.diyKitted.length > 100, 'original operator kit catalogue remains available');
    const denied = await request({ t: 'room.create', mode: 'coop', difficulty: 'FUNNY' });
    assert.equal(denied.t, 'error');
    assert.match(denied.detail, /独立模拟/);
    await ok({ t: 'room.create', mode: 'solo', difficulty: 'FUNNY' });
    await ok({ t: 'room.loadout', entries: {}, ops: {} });
    await ok({ t: 'room.ownership', notOwned: [] });
    await ok({ t: 'room.diy', picks: {} });
    await ok({ t: 'room.skins', skins: {} });
    await ok({ t: 'room.start' });
    const briefing = await wait(frame => frame.t === 'm.public' && frame.phase === 'INFO_CHECK');
    assert.equal(briefing.modeId, 'mode_single_funny');
    await ok({ t: 'g.infoReady' });
    await wait(frame => frame.t === 'm.public' && frame.phase === 'BAND_DRAFT');
    await ok({ t: 'g.band', bandId: 'band_sarkazb' });
    await wait(frame => frame.t === 'm.public' && frame.phase === 'PREP' && frame.round === 1);
    const offer = await wait(frame => frame.t === 'm.private' && frame.shop?.slots?.length && frame.funds >= 2);
    const slot = offer.shop.slots.findIndex(item => item?.kind === 'chess' && item.price <= offer.funds);
    assert.ok(slot >= 0);
    await ok({ t: 'g.buy', slot });
    const inventory = await wait(frame => frame.t === 'm.private' && frame.hand?.some(Boolean));
    const piece = inventory.hand.find(Boolean);
    assert.ok(data.chess[piece.id], 'recruited piece is an original character record');
    let placed = false;
    for (const [row, col] of [[9, 3], [10, 3], [11, 3], [12, 3], [9, 5], [10, 5], [11, 5], [12, 5]]) {
      const reply = await request({ t: 'g.move', uid: piece.uid, to: { area: 'board', row, col }, dir: 'RIGHT' });
      if (reply.t === 'ok') { placed = true; break; }
    }
    assert.ok(placed, 'original board accepts a legal deployment');
    await ok({ t: 'g.ready', ready: true });
    const start = await wait(frame => frame.t === 'b.start' && frame.authoritative);
    const battle = createBattleFromSpec(start.spec, new DataSource(data, null), { recordEvents: false, quiet: true });
    let steps = 0;
    while (!battle.finished && steps++ < 100000) battle.step();
    assert.ok(battle.finished, 'original battle engine terminates');
    const progress = battleProgress(battle);
    server.receive({ t: 'b.progress', battleId: start.battleId, gt: progress.gt, killed: Math.min(progress.killed, progress.total), total: progress.total, done: progress.done, leaks: progress.leaks });
    await ok({ t: 'b.result', battleId: start.battleId, result: compactResult(battle.result()) });
    await wait(frame => frame.t === 'm.public' && frame.phase === 'PREP' && frame.round === 2);
    const saved = await wait(frame => frame.t === 'local.checkpoint' && frame.snapshot.round === 2);
    const restoredFrames = [];
    const restoredReceiver = new StateReceiver();
    const restoredServer = await createLocalServer({data, emit: frame => {
      if (frame.t === 'm.state') {
        const decoded = restoredReceiver.receive(frame);
        assert.equal(decoded.resync, false);
        if (decoded.message) restoredFrames.push(decoded.message);
      } else restoredFrames.push(frame);
    }});
    try {
      restoredServer.receive({t:'local.identity', playerId:welcome.playerId});
      restoredServer.receive({t:'hello',name:'继续演习',version:1,delta:STATE_DELTA_VERSION,rid:1});
      restoredServer.receive({t:'local.restore',snapshot:saved.snapshot});
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.ok(restoredFrames.some(f => f.t === 'local.restored'), JSON.stringify(restoredFrames.slice(-3)));
      assert.ok(restoredFrames.some(f => f.t === 'm.public' && f.phase === 'PREP' && f.round === 2));
      const restoredMatch = [...restoredServer.lobby.rooms.values()].find(r => r.match).match;
      assert.equal(restoredMatch.order[0].playerId, welcome.playerId);
      assert.equal(restoredMatch.order[0].board.size, 1);
    } finally { restoredServer.dispose(); }
    const fatal = frames.filter(frame => frame.t === 'error' && frame.rid == null);
    assert.deepEqual(fatal, []);
    await ok({ t: 'g.leave' });
  } finally {
    server.dispose();
  }
});

test('idle-title timeout can reconnect, and a later transport close preserves the room and identity', async t => {
  let clock = 1000;
  const frames = [];
  t.mock.timers.enable({apis:['setInterval']});
  const server = await createLocalServer({data, now:()=>clock, emit:frame=>frames.push(frame)});
  const flush = () => new Promise(resolve=>setImmediate(resolve));
  try {
    for (let cycle=0;cycle<3;cycle++) {
      const before=frames.length;
      clock += 150000;
      t.mock.timers.tick(150000);
      await flush();
      assert.ok(frames.slice(before).some(f=>f.t==='local.closed' && f.code===4002), 'original pre-hello timeout was exercised');
      server.receive({t:'ping',c:clock});
      await flush();
      assert.ok(frames.slice(before).some(f=>f.t==='pong'&&f.c===clock), 'title heartbeat recovers before Start is clicked');
      assert.equal(server.registry.size,0,'a heartbeat does not create a player');
    }
    server.receive({t:'hello',name:'闲置后开始',version:1,rid:1});
    await flush();
    const welcome=frames.find(f=>f.t==='welcome' && f.rid===1);
    assert.ok(welcome,'a timed-out title must still be able to start a session');
    server.receive({t:'room.create',mode:'solo',difficulty:'FUNNY',rid:2});
    await flush();
    assert.ok(frames.some(f=>f.t==='ok'&&f.rid===2));
    const session=server.registry.byPlayerId.get(welcome.playerId);
    const room=server.lobby.roomOf(session);
    assert.ok(room);
    session.ws.close(1001,'test transport interruption');
    server.receive({t:'hello',name:'恢复连接',token:welcome.token,version:1,rid:3});
    await flush();
    const restored=frames.find(f=>f.t==='welcome'&&f.rid===3);
    assert.equal(restored?.playerId,welcome.playerId);
    assert.equal(server.lobby.roomOf(session),room,'transport recovery keeps the current solo room');
    assert.equal(server.registry.size,1);
  } finally {server.dispose();t.mock.timers.reset();}
});

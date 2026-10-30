import test from 'node:test';import assert from 'node:assert/strict';
import {makeMatch} from '../upstream/test/match/harness.js';
import {VirtualScheduler} from '../upstream/server/match/scheduler.js';
import {captureRoomCheckpoint,restoreRoomCheckpoint,releaseRoomCheckpoint} from './room-checkpoint.mjs';
import {checkpointCodec} from './checkpoint.mjs';
const identity={engineHash:'a'.repeat(64),dataHash:'b'.repeat(64)};
test('multiplayer PREP restores all players, pool, RNG and timer without redrawing AI decisions',()=>{
 const h=makeMatch({mode:'coop',humans:2,bots:1,seed:413,botRehearsal:0});h.start();h.toPrep(1);
 while(!h.m.order.filter(p=>p.isBot).every(p=>p.ready))assert.ok(h.sched.runNext());
 const snapshot=captureRoomCheckpoint(h.m,identity),scheduler=new VirtualScheduler({start:snapshot.savedAt+100000});let m;
 try{m=restoreRoomCheckpoint(JSON.parse(JSON.stringify(snapshot)),identity,{data:h.m.data,scheduler,seed:999,send(){},broadcast(){},onEnd(){}});
  assert.equal(m.seed,h.m.seed,'platform wiring must not replace saved gameplay seed');assert.equal(m.deadline,0);assert.equal(m.personalRecoveryWaiting,true);
  const state=checkpointCodec.decode(snapshot.state);
  assert.deepEqual(m.pool.entries,h.m.pool.entries);assert.deepEqual(m.itemPool.debt,h.m.itemPool.debt);
  for(const [i,p]of m.order.entries()){assert.deepEqual(p.board,h.m.order[i].board);assert.equal(p.ready,h.m.order[i].ready);assert.equal(p.bandId,h.m.order[i].bandId);assert.equal(p.funds,h.m.order[i].funds);}
  for(const k of checkpointCodec.RNG_NAMES)assert.equal(m[k].state(),state.rng[k]);
  releaseRoomCheckpoint(m);assert.equal(m.deadline-scheduler.now(),snapshot.remainingMs);assert.equal(m.personalRecoveryWaiting,false);
  assert.throws(()=>restoreRoomCheckpoint({...snapshot,engineHash:'wrong'},identity,{data:h.m.data}),/不兼容/);
 }finally{m?.dispose();h.m.dispose();}
});
test('restore rejects incomplete player state and unsupported runtime capture',()=>{
 const h=makeMatch({mode:'coop',humans:2,seed:414});h.start();h.toPrep(1);const s=captureRoomCheckpoint(h.m,identity);
 try{const bad=structuredClone(s);bad.state.players.pop();assert.throws(()=>restoreRoomCheckpoint(bad,identity,{data:h.m.data}),/全员状态/);
  h.m.order[0].autoplay=true;assert.throws(()=>captureRoomCheckpoint(h.m,identity),/托管/);
 }finally{h.m.dispose();}
});

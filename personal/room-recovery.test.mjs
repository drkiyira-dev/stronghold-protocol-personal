import test from 'node:test';import assert from 'node:assert/strict';import {fork} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {TestClient} from '../upstream/test/helpers/wsClient.js';import {attachWsSimClient} from '../upstream/test/match/simClient.js';import {DataSource} from '../upstream/server/sim/simdata.js';import {getData} from '../upstream/server/data.js';
test('two authenticated WS players recover committed PREP after SIGKILL, reject stale epochs, survive interrupted commit and retain final settlement',{timeout:120000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'stronghold-restart-'));let processHandle,url,seq=0;const clients=[];
 const boot=(storagePath=directory)=>new Promise((resolve,reject)=>{const child=fork(new URL('./fixtures/recovery-process.mjs',import.meta.url),[storagePath],{stdio:['ignore','ignore','pipe','ipc']});processHandle=child;let errors='';child.stderr.on('data',b=>errors+=b);const timer=setTimeout(()=>reject(new Error('Recovery boot timeout: '+errors)),15000);child.once('error',reject);child.once('exit',code=>{if(code){clearTimeout(timer);reject(new Error('Boot failed: '+errors));}});child.on('message',m=>{if(m.ready){clearTimeout(timer);url=m.url;resolve();}});});
 const ipc=action=>new Promise(resolve=>{const rid=++seq,handler=m=>{if(m.rid===rid){processHandle.off('message',handler);resolve(m);}};processHandle.on('message',handler);processHandle.send({rid,action});});
 const kill=()=>new Promise(resolve=>{processHandle.once('exit',resolve);processHandle.kill('SIGKILL');});
 const post=(c,body)=>fetch(url+'/api/personal/recovery',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${c.token}`},body:JSON.stringify(body)});
 const player=async(name,token)=>{const c=await TestClient.connect(url.replace('http','ws')+'/ws');clients.push(c);const welcome=await c.hello(name,token);c.id=welcome.playerId;c.token=welcome.token;
  c.ws.on('message',raw=>{const m=JSON.parse(raw);if(m.t==='personal.recovery')c.epoch=m.epoch;});const send=c.send.bind(c);c.send=msg=>send({...msg,...(/^[gb]\./.test(msg.t)&&msg.personalEpoch===undefined?{personalEpoch:c.epoch}:{})});
  assert.equal((await post(c,{action:'register',protocol:1})).status,200);return c;};
 const ok=async(c,msg)=>{const r=await c.request(msg,10000);assert.equal(r.t,'ok',JSON.stringify(r));return r;};
 const accept=async(c,recovery)=>{const r=await post(c,{action:'accept',epoch:recovery.epoch,revision:recovery.checkpoint.revision});assert.equal(r.status,200);return r.json();};
 const sim=c=>{c.sim=attachWsSimClient(c,{pace:'instant',ds:new DataSource(getData(),null),withCs:true});};
 function normalize(snapshot){const s=structuredClone(snapshot.state);delete s.match.battlePrefix;for(const entry of s.players)delete entry.player.connected;return s;}
 try{
  await boot();let a=await player('A'),b=await player('B');const tokens=[a.token,b.token],ids=[a.id,b.id];
  const capability=await (await fetch(url+'/api/personal/info')).json();assert.equal(capability.roomRecovery.mode,'committed-prep');
  await ok(a,{t:'room.create',mode:'coop',difficulty:'NORMAL'});const room=await a.waitFor('room.state');await ok(b,{t:'room.join',code:room.code});await ok(b,{t:'room.ready',ready:true});await ok(a,{t:'room.start'});
  for(const c of [a,b]){await c.waitFor('m.public',p=>p.phase==='INFO_CHECK',15000);await ok(c,{t:'g.infoReady'});}
  const pending=new Map([a,b].map(c=>[c.id,c]));while(pending.size){const p=await a.waitFor('m.public',p=>p.phase==='BAND_DRAFT'&&pending.has(p.draft?.turn),40000);const taken=new Set(Object.values(p.draft.picks));const band=Object.values(getData().bands).find(x=>(!Array.isArray(x.modeTypeList)||x.modeTypeList.includes('MULTI'))&&!taken.has(x.bandId));await ok(pending.get(p.draft.turn),{t:'g.band',bandId:band.bandId});pending.delete(p.draft.turn);}
  await a.waitFor('personal.recovery',s=>s.checkpoint?.round===1&&s.enabled,15000);await b.waitFor('personal.recovery',s=>s.checkpoint?.round===1&&s.enabled,15000);
  await ok(a,{t:'g.ready',ready:true});await ok(b,{t:'g.ready',ready:true});await a.waitFor('m.public',p=>p.phase==='COMBAT',10000);
  const before=(await ipc('inspect')).rooms[0],oldEpoch=before.epoch;assert.equal(before.committed.snapshot.round,1);await kill();
  await boot();a=await player('A',tokens[0]);b=await player('B',tokens[1]);assert.deepEqual([a.id,b.id],ids);
  const state=await a.waitFor('personal.recovery',s=>s.status==='awaiting-consent'&&s.enabled,10000);
  const recovered=(await ipc('inspect')).rooms[0];assert.equal(recovered.runId,before.runId);assert.notEqual(recovered.epoch,oldEpoch);assert.deepEqual(normalize(recovered.state),normalize(before.committed.snapshot));
  assert.equal((await post({token:'forged'},{action:'accept',epoch:state.epoch,revision:state.checkpoint.revision})).status,401);
  assert.equal((await post(a,{action:'accept',epoch:oldEpoch,revision:state.checkpoint.revision})).status,400);
  assert.equal((await a.request({t:'g.ready',ready:true})).t,'error');assert.equal((await accept(a,state)).waiting,true);assert.equal((await ipc('inspect')).rooms[0].phase,'PREP');
  sim(a);sim(b);await accept(b,state);
  assert.equal((await a.request({t:'g.ready',ready:true,personalEpoch:oldEpoch})).t,'error');
  await a.waitFor('personal.recovery',s=>s.checkpoint?.round===2,45000);const round2=(await ipc('inspect')).rooms[0].committed;
  await ipc('crash-next-commit');a.send({t:'g.refresh'});await new Promise(resolve=>processHandle.once('exit',resolve));
  a.sim.close();b.sim.close();await boot();a=await player('A',tokens[0]);b=await player('B',tokens[1]);
  const state2=await a.waitFor('personal.recovery',s=>s.status==='awaiting-consent'&&s.enabled,10000);const afterFailure=(await ipc('inspect')).rooms[0];assert.equal(afterFailure.committed.revision,round2.revision);assert.deepEqual(afterFailure.committed.snapshot,round2.snapshot);
  await accept(a,state2);await accept(b,state2);await ipc('backup');await ipc('fail-writes');await ipc('finish');
  await a.waitFor('personal.recovery',s=>s.message.includes('最终结算尚未提交'),5000);assert.equal(a.log.some(m=>m.t==='m.result'),false);assert.equal((await ipc('inspect')).rooms[0].committed.status,'prep');
  await ipc('resume-writes');const final=await a.waitFor('m.result',()=>true,10000);assert.equal(final.reason,'defeat');await kill();
  await boot();a=await player('A',tokens[0]);const replayed=await a.waitFor('m.result',()=>true,10000);assert.deepEqual(replayed,final);assert.equal((await ipc('inspect')).rooms.length,0,'completed room cannot revive old PREP');
  await kill();await boot(directory+'/backup');a=await player('A',tokens[0]);b=await player('B',tokens[1]);
  const restoredBackup=await a.waitFor('personal.recovery',s=>s.status==='awaiting-consent'&&s.enabled,10000);assert.equal(restoredBackup.checkpoint.round,2);
  assert.equal((await a.request({t:'g.leave',personalEpoch:oldEpoch})).t,'error');await ok(a,{t:'g.leave'});await b.waitFor('room.closed',()=>true,5000);
  await kill();await boot(directory+'/backup');a=await player('A',tokens[0]);assert.equal((await ipc('inspect')).rooms.length,0,'a departure invalidates the recovery room durably');
 }finally{for(const c of clients){c.sim?.close();await c.terminate();}if(processHandle?.exitCode===null&&processHandle?.signalCode===null)await new Promise(resolve=>{processHandle.once('exit',resolve);processHandle.kill('SIGTERM');});await rm(directory,{recursive:true,force:true});}
});

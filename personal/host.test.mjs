import {fileURLToPath} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';
import {startPersonalServer} from './host.mjs';
import {TestClient} from '../upstream/test/helpers/wsClient.js';
import {getData} from '../upstream/server/data.js';
import {attachWsSimClient} from '../upstream/test/match/simClient.js';
import {DataSource} from '../upstream/server/sim/simdata.js';
const quiet={info(){},warn(){},error(){},debug(){}};
test('self-hosted service: two real WebSocket players share a room, reconnect, simulate combat and reach round 2', {timeout:110000},async()=>{
 const app=await startPersonalServer({port:0,log:quiet,seedFn:()=>69}),clients=[];
 const player=async(name,token)=>{const c=await TestClient.connect(`ws://127.0.0.1:${app.port}/ws`);clients.push(c);const w=await c.hello(name,token);c.id=w.playerId;c.token=w.token;c.sim=attachWsSimClient(c,{pace:'instant',ds:new DataSource(getData(),null),withCs:true});return c;};
 const ok=async(c,msg)=>{const r=await c.request(msg,15000);assert.equal(r.t,'ok',`${msg.t}: ${JSON.stringify(r)}`);return r;};
 try{
   assert.equal((await fetch(app.url+'/?server=local')).status,200);const info=await (await fetch(app.url+'/api/personal/info')).json();assert.equal(info.multiplayer,true);assert.equal(info.coach,false);
   const a=await player('LAN A'),b=await player('LAN B');await ok(a,{t:'room.create',mode:'coop',difficulty:'NORMAL'});const room=await a.waitFor('room.state');await ok(b,{t:'room.join',code:room.code});const shared=await b.waitFor('room.state',s=>s.players?.length>=2 || s.seats?.filter(Boolean).length>=2);assert.equal(shared.code,room.code);
   await ok(b,{t:'room.ready',ready:true});await ok(a,{t:'room.start'});for(const c of [a,b]){await c.waitFor('m.public',p=>p.phase==='INFO_CHECK',15000);await ok(c,{t:'g.infoReady'});}
   const pending=new Map([a,b].map(c=>[c.id,c]));
   while(pending.size){const pub=await a.waitFor('m.public',p=>p.phase==='BAND_DRAFT'&&pending.has(p.draft?.turn),40000);const taken=new Set(Object.values(pub.draft.picks));const band=Object.values(getData().bands).find(x=>(!Array.isArray(x.modeTypeList)||x.modeTypeList.includes('MULTI'))&&!taken.has(x.bandId));await ok(pending.get(pub.draft.turn),{t:'g.band',bandId:band.bandId});pending.delete(pub.draft.turn);}
   await a.waitFor('m.public',p=>p.phase==='PREP'&&p.round===1,15000);
   await b.terminate();b.sim.close();const b2=await player('LAN B',b.token);assert.equal(b2.id,b.id);const resumed=await b2.waitFor('m.public',p=>p.phase==='PREP',15000);assert.equal(resumed.players.find(p=>p.playerId===b.id).connected,true);assert.equal((await b2.waitFor('m.private')).playerId,b.id);
   await ok(a,{t:'g.ready',ready:true});await ok(b2,{t:'g.ready',ready:true});const next=await a.waitFor('m.public',p=>p.phase==='PREP'&&p.round===2,45000);assert.equal(next.players.length,2);assert.ok(a.sim.starts.length>0);assert.ok(a.sim.log.some(m=>m.t==='b.result'));assert.ok(b2.sim.log.some(m=>m.t==='b.result'));
 }finally{for(const c of clients){c.sim?.close();await c.terminate();}await app.close();}
});

test('example data-only Mod composes a real room content set with a custom operator and training income', {timeout:30000},async()=>{
 const app=await startPersonalServer({port:0,log:quiet,pluginsDir:fileURLToPath(new URL('./examples/',import.meta.url))});let c;
 try{
   c=await TestClient.connect(`ws://127.0.0.1:${app.port}/ws`);await c.hello('Mod test');
   const ok=async message=>{const r=await c.request(message,12000);assert.equal(r.t,'ok',JSON.stringify(r));};
   await ok({t:'room.create',mode:'solo',difficulty:'FUNNY'});await ok({t:'room.setPlugins',plugins:[{id:'personal-lab'}]});
   const room=await c.waitFor('room.state',r=>r.content?.plugins?.some(p=>p.id==='personal-lab'),12000);const cs=room.content.cs;
   await ok({t:'room.contentReady',cs,ok:true});await ok({t:'room.start'});await c.waitFor('m.public',p=>p.phase==='INFO_CHECK',12000);await ok({t:'g.infoReady'});await c.waitFor('m.public',p=>p.phase==='BAND_DRAFT',10000);await ok({t:'g.band',bandId:'band_sarkazb'});
   const prep=await c.waitFor('m.private',p=>p.funds===12,10000);assert.equal(prep.funds,12);
   const chess=await (await fetch(app.url+`/cs/${cs.slice(0,16)}/data/chess.json`)).json();assert.ok(Object.values(chess).some(x=>x.charId==='char_x_personal_lab_guard'));
 }finally{await c?.terminate();await app.close();}
});

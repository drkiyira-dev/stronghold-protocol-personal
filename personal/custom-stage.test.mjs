import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadOriginalStage,validateStageDescriptor,isOriginalStageRecord} from './custom-stage.mjs';
import {createLocalServer} from '../dist/personal/local-server.js';
import {StateReceiver,STATE_DELTA_VERSION} from '../upstream/shared/stateDelta.js';
import {createBattleFromSpec,compactResult,battleProgress} from '../upstream/server/sim/spec.js';
import {DataSource} from '../upstream/server/sim/simdata.js';
import {Grid} from '../upstream/server/sim/grid.js';
import {environmentTiles,battlefieldPolicy} from './battlefield-policy.mjs';
import {parseStage} from '../upstream/public/js/render/tiles.js';
import {captureCheckpoint} from './checkpoint.mjs';

const fetcher=async url=>{try{return new Response(await readFile(new URL('../dist'+url.split('?')[0],import.meta.url)));}catch{return new Response('',{status:404});}};
const stage=await loadOriginalStage(fetcher),d=stage.descriptor;
const baseContent=JSON.parse(await readFile(new URL('../dist/personal/content-identity.json',import.meta.url),'utf8'));
const original=Object.fromEntries(await Promise.all(Object.keys(stage.data).map(async name=>[name,JSON.parse(await readFile(new URL('../upstream/data/'+name+'.json',import.meta.url),'utf8'))])));

test('bundled data-only plugin keeps official records and all eight standard maps unchanged',()=>{
  assert.equal(d.rounds,3);assert.equal(d.seed,20261102);
  for(const [file,records]of Object.entries(original)){
    if(file==='config'){for(const [id,mode]of Object.entries(records.modes))assert.deepEqual(stage.data.config.modes[id],mode);continue;}
    for(const [id,record]of Object.entries(records)){
      if(file==='choices'&&id==='schedule'){for(const [mode,value]of Object.entries(record))assert.deepEqual(stage.data.choices.schedule[mode],value);}
      else assert.deepEqual(stage.data[file][id],record,`${file}.${id}`);
    }
  }
  assert.notDeepEqual(stage.data.stages[d.stageId].rows,original.stages.act1autochess_m01.rows);
});
test('both routes and each checkpoint are reachable using the actual upstream Grid',()=>{
  const terrain=stage.data.stages[d.stageId],grid=new Grid({...terrain,legend:terrain.tiles},{r0:0,r1:18,c0:0,c1:20});
  const counts=[];
  for(let r=1;r<=d.rounds;r++){
    const w=stage.data.waves[stage.data.config.modes[d.modeId].rounds[r].template];
    counts.push(w.totalCount);assert.equal(w.routes.length,2);
    for(const route of w.routes){const points=[route.start,...route.checkpoints,route.end];for(let i=1;i<points.length;i++)assert.ok(grid.findPath(...points[i-1],...points[i]));}
    for(const spawn of w.spawns)assert.ok(original.enemies[spawn.key]);
  }
  assert.deepEqual(counts,[8,12,14]);
  assert.ok(terrain.deployTiles.normal.melee.length>5);assert.ok(terrain.deployTiles.normal.rangedOnly.length>5);
});
test('content load fails closed on missing resources, corruption, or unsupported metadata',async()=>{
  await assert.rejects(loadOriginalStage(async()=>new Response('',{status:404})),/unavailable/);
  await assert.rejects(loadOriginalStage(async url=>{
    const r=await fetcher(url);return url.includes('/data/stages.json')?new Response((await r.text())+' '):r;
  }),/checksum/);
  await assert.rejects(loadOriginalStage(async url=>{
    const r=await fetcher(url);if(url.endsWith('rainfall-defense.json')){const value=await r.json();return Response.json({...value,maxLeaks:5});}return r;
  }),/metadata checksum/);
  assert.throws(()=>validateStageDescriptor({...d,savePolicy:'standard'}),/Unsupported/);
});
test('rain uses the existing bounded quality policy and procedural tiles',()=>{
  const terrain=stage.data.stages[d.stageId],grid=parseStage(terrain),points=environmentTiles(terrain,grid);
  assert.ok(points.some(p=>p.kind==='rain'));assert.ok(points.some(p=>p.kind==='lamp'));assert.ok(points.some(p=>p.kind==='mist'));
  assert.ok(points.every(p=>p.row>=9&&p.row<=12));
  assert.equal(battlefieldPolicy({motion:false,visible:true},'high').extras,0);
  assert.equal(battlefieldPolicy({motion:true,visible:true},'low').extras,0);
});

async function campaign({empty=false,reverse=false}={}){
  const frames=[],receiver=new StateReceiver();let sequence=0;
  const server=await createLocalServer({data:original,content:baseContent,loadStage:async()=>stage,emit:m=>{
    if(m.t==='m.state'){const r=receiver.receive(m);assert.equal(r.resync,false);if(r.message)frames.push(r.message);}else frames.push(m);
  }});
  const wait=async predicate=>{for(let n=0;n<2400;n++){const f=frames.findLast(predicate);if(f)return f;await new Promise(r=>setTimeout(r,10));}throw new Error('Missing frame: '+JSON.stringify(frames.slice(-3)));};
  const request=async(t,fields={})=>{const rid=++sequence;server.receive({t,rid,...fields});return wait(m=>m.rid===rid);};
  const ok=async(t,fields={})=>{const r=await request(t,fields);assert.notEqual(r.t,'error',JSON.stringify(r));return r;};
  const outcomes=[];
  try{
    server.receive({t:'local.identity',playerId:'p_v15_test'});
    await ok('hello',{name:'V15QA',version:1,delta:STATE_DELTA_VERSION});
    assert.equal(frames.find(m=>m.t==='welcome').content.vanilla,baseContent.cs,'browser authority requires the actual vanilla identity');
    server.receive({t:'local.stage',id:d.id,requestId:'stage-test'});await wait(m=>m.t==='local.stage-set');
    const openingStart=frames.length;
    await ok('room.create',{mode:'solo',difficulty:'FUNNY'});
    const openings=frames.slice(openingStart).filter(m=>m.t==='room.state');
    assert.ok(openings.length);assert.ok(openings.every(m=>m.content?.modeId===d.modeId),'never publish a vanilla room while custom content is pending');
    assert.equal((await request('room.start')).code,'CONTENT_NOT_READY');
    await ok('room.contentReady',{cs:d.cs});await ok('room.start');
    await wait(m=>m.t==='m.public'&&m.phase==='INFO_CHECK');await ok('g.infoReady');
    await wait(m=>m.t==='m.public'&&m.phase==='BAND_DRAFT');await ok('g.band',{bandId:'band_sarkazb'});
    for(let round=1;round<=d.rounds;round++){
      await wait(m=>m.t==='m.public'&&m.phase==='PREP'&&m.round===round);
      const match=[...server.lobby.rooms.values()][0].match,ps=match.order[0];
      assert.equal(match.stageId,d.stageId);assert.throws(()=>captureCheckpoint(match),/不支持存档/);
      if(!empty){
        const slots=ps.shop.slots.map((_,i)=>i);if(reverse)slots.reverse();
        for(const slot of slots){const item=ps.shop.slots[slot];if(item?.kind==='chess'&&ps.priceOf(item)<=ps.funds)await ok('g.buy',{slot});}
        for(const piece of ps.hand.filter(p=>p?.kind==='chess')){
          const def=stage.data.chess[piece.id];
          const cells=def.position==='RANGED'?[[10,5],[10,6],[11,3],[9,6],[12,5],[10,8]]:[[11,4],[11,7],[10,4],[9,4],[9,7],[12,7]];
          let placed=false;
          for(const [row,col]of cells){if(ps.board.has(`${row},${col}`))continue;const r=await request('g.move',{uid:piece.uid,to:{area:'board',row,col},dir:'RIGHT'});if(r.t==='ok'){placed=true;break;}}
          assert.equal(placed,true);
        }
      }
      await ok('g.ready',{ready:true});
      const start=await wait(m=>m.t==='b.start'&&m.authoritative&&m.battleId.includes('.'+round+'.'));
      assert.equal(start.spec.cs,d.cs);
      const battle=createBattleFromSpec(start.spec,new DataSource(stage.data,null),{recordEvents:false,quiet:true});
      let steps=0;while(!battle.finished&&steps++<40000){battle.step();if(steps%500===0)await new Promise(r=>setTimeout(r,2));}
      assert.ok(battle.finished);
      const result=compactResult(battle.result()),progress=battleProgress(battle),personal=Object.values(result.perPlayer)[0];
      outcomes.push({killed:result.killed,leaks:personal.leaked.length,damage:personal.damageDealt,healing:personal.healingDone,time:result.time});
      server.receive({t:'b.progress',cs:d.cs,battleId:start.battleId,gt:progress.gt,killed:Math.min(progress.killed,progress.total),total:progress.total,done:progress.done,leaks:progress.leaks});
      await ok('b.result',{cs:d.cs,battleId:start.battleId,result});
      if(outcomes.reduce((n,o)=>n+o.leaks,0)>d.maxLeaks)break;
    }
    const result=await wait(m=>m.t==='m.result');
    assert.equal(result.personalStage.id,d.id);assert.equal(result.test,undefined);
    assert.equal(result.players[0].reward,0);assert.equal(result.players[0].trophies,0);
    assert.equal(frames.some(m=>m.t==='local.checkpoint'||m.t==='local.clear-checkpoint'),false);
    await ok('room.leave');await ok('room.create',{mode:'solo',difficulty:'FUNNY'});
    assert.equal(frames.findLast(m=>m.t==='room.state').content.vanilla,true);
    await ok('room.start');const briefing=await wait(m=>m.t==='m.public'&&m.modeId==='mode_single_funny');
    assert.equal(briefing.stageId,'act1autochess_m01');
    return {outcomes,victory:result.victory,roundsPassed:result.roundsPassed};
  }finally{server.dispose();}
}
test('real upstream simulation completes every assault reproducibly; empty defence loses and standard mode returns',{timeout:120000},async()=>{
  const first=await campaign();assert.equal(first.victory,true);assert.equal(first.roundsPassed,3);
  const repeated=await campaign();assert.deepEqual(repeated,first);
  const alternate=await campaign({reverse:true});assert.equal(alternate.victory,true);
  const empty=await campaign({empty:true});assert.equal(empty.victory,false);assert.ok(empty.outcomes[0].leaks>4);
});


test('cancelled or unknown stage loads cannot install content',async()=>{
  const frames=[];let release;
  const server=await createLocalServer({data:original,emit:m=>frames.push(m),loadStage:()=>new Promise(r=>{release=r;})});
  const tick=()=>new Promise(r=>setImmediate(r));
  try{
    server.receive({t:'local.stage',id:d.id,requestId:'cancel-me'});await tick();
    assert.equal(typeof release,'function');server.receive({t:'local.stage-cancel',requestId:'cancel-me'});
    release(stage);await tick();await tick();
    assert.ok(frames.some(m=>m.t==='local.stage-cleared'));assert.equal(frames.some(m=>m.t==='local.stage-set'),false);
    server.receive({t:'local.stage',id:'unknown',requestId:'bad'});assert.ok(frames.some(m=>m.t==='local.stage-error'&&m.requestId==='bad'));
  }finally{server.dispose();}
});


test('original stage statistics are not imported as misleading legacy replay summaries',()=>{
  assert.ok(isOriginalStageRecord({content:{plugins:['rainfall-defense@0.1.0']}}));
  assert.ok(isOriginalStageRecord({content:{plugins:[{id:'rainfall-defense'}]}}));
  assert.equal(isOriginalStageRecord({content:{plugins:['rainfall-defense-other@0.1.0']}}),false);
  assert.equal(isOriginalStageRecord({content:null}),false);
});

test('abandoning with g.leave clears stage selection even when the following room.leave fails',async()=>{
  const frames=[];let rid=0;
  const server=await createLocalServer({data:original,content:baseContent,loadStage:async()=>stage,emit:m=>frames.push(m)});
  const wait=async predicate=>{for(let n=0;n<500;n++){const m=frames.findLast(predicate);if(m)return m;await new Promise(r=>setTimeout(r,10));}throw Error('Missing protocol frame');};
  const request=async(t,fields={})=>{const id=++rid;server.receive({t,rid:id,...fields});return wait(m=>m.rid===id);};
  const ok=async(t,fields={})=>{const m=await request(t,fields);assert.notEqual(m.t,'error',JSON.stringify(m));};
  try{
    await ok('hello',{name:'V15Abandon',version:1});
    server.receive({t:'local.stage',id:d.id,requestId:'abandon'});await wait(m=>m.t==='local.stage-set');
    await ok('room.create',{mode:'solo',difficulty:'FUNNY'});await ok('room.contentReady',{cs:d.cs});await ok('room.start');
    await ok('g.leave');assert.ok(frames.some(m=>m.t==='local.stage-cleared'));
    assert.equal((await request('room.leave')).code,'NOT_IN_ROOM');
    assert.equal(frames.some(m=>m.t==='local.checkpoint'||m.t==='local.clear-checkpoint'),false);
    await ok('room.create',{mode:'solo',difficulty:'FUNNY'});
    assert.equal(frames.findLast(m=>m.t==='room.state').content.vanilla,true);
    await ok('room.start');assert.equal(frames.findLast(m=>m.t==='m.public').modeId,'mode_single_funny');
  }finally{server.dispose();}
});

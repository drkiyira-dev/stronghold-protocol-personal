import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {VERSIONS,DEFAULT_VERSION} from '../upstream/shared/versions.js';
import {getData,getVersionData} from '../upstream/server/data.js';
import {GameData} from '../upstream/server/match/gamedata.js';
import {setupMatchWaves} from '../upstream/server/match/waves.js';
import {createRng,deriveSeed} from '../upstream/server/sim/rng.js';
import {buildBoard,AREAS} from '../upstream/public/js/render/board3d/layout.js';
import {loadBoardPack,loadScenePack,resetBoardPack} from '../upstream/public/js/render/board3d/load.js';
import {startPersonalServer} from './host.mjs';
import {TestClient} from '../upstream/test/helpers/wsClient.js';
import {attachWsSimClient} from '../upstream/test/match/simClient.js';
import {DataSource} from '../upstream/server/sim/simdata.js';
const quiet={info(){},warn(){},error(){},debug(){}};

test('missing, rejected and incompatible optional scene assets retain the upstream fallback',async t=>{
  const assets={local:async()=>({groups:{}}),localUrl:()=>null,image:async()=>{throw new Error('image unavailable');}};
  assert.equal(await loadBoardPack(assets),null);assert.equal(await loadScenePack(assets,'act1autochess_m05'),null);
  assets.localUrl=(g,n)=>'https://maps.invalid/'+g+'/'+n;
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('offline');});resetBoardPack();
  assert.equal(await loadBoardPack(assets),null);assert.equal(await loadScenePack(assets,'act1autochess_m05'),null);
  globalThis.fetch.mock.mockImplementation(async()=>new Response(JSON.stringify({version:999})));
  resetBoardPack();assert.equal(await loadScenePack(assets,'act1autochess_m05'),null);resetBoardPack();
});

test('all official version maps are shipped unchanged and obey original mode pools',async()=>{
  for(const version of VERSIONS){
    const directory=version.dir;
    const source=await readFile(new URL('../upstream/data/'+directory+'stages.json',import.meta.url));
    assert.deepEqual(await readFile(new URL('../dist/data/'+directory+'stages.json',import.meta.url)),source);
    const data=getVersionData(version.id,{log:quiet});
    for(const [mode,config]of Object.entries(data.config.modes)){
      if(!config.stages?.length)continue;
      const gd=new GameData(data,mode);
      for(let seed=1;seed<=16;seed++){
        const id=setupMatchWaves(gd,createRng(deriveSeed(seed,'setup'))).stageId;
        assert.ok(config.stages.includes(id),version.id+':'+mode+':'+id);
        assert.ok(data.stages[id].active);
      }
    }
    // Rendering consumes the original coordinates/devices, including inactive
    // records used for unite scenes. No assets or second geometry engine needed.
    for(const stage of Object.values(data.stages))for(const area of Object.values(AREAS)){
      const board=buildBoard(stage,{area});
      assert.ok(board);assert.ok(Array.isArray(board.devices));
      for(const d of board.devices)assert.ok(d.r>=0&&d.r<stage.size[0]&&d.c>=0&&d.c<stage.size[1],stage.id);
    }
  }
});

test('self-hosted official version negotiation runs each isolated engine through combat and settlement',{timeout:180000},async()=>{
  // Separate servers keep this test serial and release all child hosts between versions.
  for(const version of VERSIONS){
    const app=await startPersonalServer({port:0,log:quiet,seedFn:()=>69});let client;
    const data=version.id===DEFAULT_VERSION?getData():getVersionData(version.id,{log:quiet});
    const ok=async msg=>{const r=await client.request(msg,20000);assert.equal(r.t,'ok',version.id+':'+JSON.stringify(r));return r;};
    try{
      assert.deepEqual(app.versions.ids,VERSIONS.map(v=>v.id));
      client=await TestClient.connect(app.url.replace('http','ws')+'/ws');
      const welcome=await client.hello('Map QA');assert.equal(welcome.versions.length,4);
      await ok({t:'room.create',mode:'solo',difficulty:'HARD',version:version.id});
      const room=await client.waitFor('room.state',r=>(r.version||DEFAULT_VERSION)===version.id,15000);
      if(room.content?.cs)await ok({t:'room.contentReady',cs:room.content.cs,ok:true});
      client.sim=attachWsSimClient(client,{pace:'instant',ds:new DataSource(data,null),withCs:true});
      await ok({t:'room.start'});
      await client.waitFor('m.public',p=>p.phase==='INFO_CHECK',15000);await ok({t:'g.infoReady'});
      await client.waitFor('m.public',p=>p.phase==='BAND_DRAFT',15000);
      const band=Object.values(data.bands).find(x=>!Array.isArray(x.modeTypeList)||x.modeTypeList.includes('SINGLE'));
      await ok({t:'g.band',bandId:band.bandId});
      await client.waitFor('m.public',p=>p.phase==='PREP'&&p.round===1,15000);
      const privateState=await client.waitFor('m.private');assert.ok(privateState);
      await ok({t:'g.ready',ready:true});
      await client.waitFor('m.public',p=>p.phase==='PREP'&&p.round===2,30000);
      assert.ok(client.sim.log.some(m=>m.t==='b.result'),version.id);
      if(version.id!==DEFAULT_VERSION){const match=[...app.lobby.rooms.values()][0].match;assert.ok(match.hosted,'reuse upstream isolated host');assert.equal(match.personalCommitted,undefined,'do not claim checkpoint persistence for other versions');}
    }finally{client?.sim?.close();await client?.terminate();await app.close();}
  }
});

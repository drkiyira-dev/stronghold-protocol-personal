// QA-only UI, outside dist/ and production. Actual original loaders; no fixture rules.
import {BoardScene} from '/js/render/board3d/scene.js';
import {loadScenePack,loadBoardPack,resetBoardPack} from '/js/render/board3d/load.js';
import {createAssets} from '/js/assets.js';
import {audio} from '/js/audio.js';
import {store} from '/js/store.js';
import {net} from '/js/net.js';
import {data} from '/js/data.js';
import {updateSettings} from '/js/ui/settings.js';
const report={ua:navigator.userAgent,staticOnly:true,errors:[],phase:'idle',audioBeforeGesture:audio.ctx?.state||null};
let board=null,starts=0;
const originalStart=AudioBufferSourceNode.prototype.start;
AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer?.length>1)starts++;return originalStart.apply(this,args);};
const set=BoardScene.prototype.setScenePack;
BoardScene.prototype.setScenePack=function(id,pack){const result=set.call(this,id,pack);if(pack){board=this;report.scene={id,chunks:pack.chunks.length,textures:Object.keys(pack.images.tex).length,lightmaps:pack.images.lm.filter(Boolean).length,active:this.official===pack};}return result;};
for(const e of ['error','unhandledrejection'])window.addEventListener(e,event=>report.errors.push(event.message||String(event.reason)));
const panel=document.createElement('aside');panel.style.cssText='position:fixed;top:4px;left:4px;z-index:99999;background:#111e;color:#fff;padding:8px;max-width:365px;font:12px monospace';
panel.innerHTML='<strong>STATIC PREVIEW QA · localhost only</strong><br><button id="static-audio">音频检查</button> <button id="static-scenes">检查 11 张场景</button><br><button id="static-prepare">准备对局</button> <button id="static-fight">战斗至第二回合</button><br><button id="static-evict">清除测试素材缓存</button><pre id="static-status">导入自己的素材包后刷新，再开始检查。</pre>';
document.body.append(panel);const status=panel.querySelector('pre');status.style.cssText='white-space:pre-wrap;max-height:190px;overflow:auto';
async function publish(){report.render=board?.stats()||null;report.transport=document.documentElement.dataset.personalTransport;await fetch('/__static-result',{method:'POST',body:JSON.stringify(report)});status.textContent=JSON.stringify(report,null,2);}
async function until(predicate,timeout=90000){const start=Date.now();while(!await predicate()){if(Date.now()-start>timeout)throw Error('Timed out: '+report.phase);await new Promise(r=>setTimeout(r,200));}}
async function inspectAudio(){
  updateSettings({muted:false,bgm:0,voice:0,uiSfx:0.4,sfx:0.25});await until(()=>audio.ctx?.state==='running',10000);
  const manifest=await(await fetch('/data/assets.json')).json(),clip=manifest.audio.sfx.ui.click;
  const buffer=await audio._buffer(clip);audio.sfx('click');
  await until(()=>starts>0||!buffer,10000);
  report.audio={url:clip,https:clip.startsWith('https:'),decodedSeconds:buffer?.duration||0,context:audio.ctx?.state,starts,volumes:{...audio.volumes},failedBufferIsNull:await audio._buffer('/__absent.mp3')===null};
  report.cors=[];
  for(const probe of await(await fetch('/static-source-probes.json')).json()){
    try{const r=await fetch(probe.url,{mode:'cors',credentials:'omit',signal:AbortSignal.timeout(8000)});report.cors.push({...probe,readable:r.ok,status:r.status});await r.body?.cancel();}
    catch(error){report.cors.push({...probe,readable:false,error:error.name});}
  }
  report.phase='audio checked';await publish();
}
async function inspectScenes(){
  report.phase='checking scenes';report.sceneChecks=[];await publish();
  const manifest=await(await fetch('/data/local-assets.json')).json();
  const cache=await caches.open('sp-imported-assets-v1'),keys=await cache.keys();
  report.cache={names:await caches.keys(),keys:keys.length,sample:keys.slice(0,2).map(r=>r.url),index:!!await cache.match('/sp-imported-index.json')};
  report.controlled=!!navigator.serviceWorker.controller;
  report.cachedSceneGroups=Object.keys(manifest.groups).filter(g=>/^scene\/act/.test(g)).length;
  if(report.cachedSceneGroups){
    const assets=createAssets({manifest:{},localManifest:manifest});
    const pack=await loadBoardPack(assets);report.tileTable=!!pack?.tiles?.materials;resetBoardPack();
  }
  for(const group of Object.keys(manifest.groups).filter(g=>/^scene\/act/.test(g))){
    const pack=await loadScenePack(createAssets({manifest:{},localManifest:manifest}),group.slice(6));
    if(!pack?.chunks.length||pack.images.lm.filter(Boolean).length!==pack.doc.lightmaps)throw Error('Incomplete scene '+group);
    report.sceneChecks.push({stage:pack.stage,chunks:pack.chunks.length,textures:Object.keys(pack.images.tex).length,lightmaps:pack.doc.lightmaps});
    resetBoardPack();await publish();
  }
  report.phase='scenes checked';await publish();
}
async function prepare(){
  report.phase='preparing';updateSettings({muted:true,quality:'low'});await publish();
  await net.request('room.create',{mode:'solo',difficulty:'FUNNY'});
  await until(()=>store.get().room?.seats.filter(s=>s&&!s.isBot).every(s=>s.content==null||s.content==='ready'));
  await net.request('room.start');await until(()=>store.get().match.public?.phase==='INFO_CHECK');await net.request('g.infoReady');
  await until(()=>store.get().match.public?.phase==='BAND_DRAFT');const band=Object.values(data.get('bands')).find(x=>!Array.isArray(x.modeTypeList)||x.modeTypeList.includes('SINGLE'));await net.request('g.band',{bandId:band.bandId});
  await until(()=>store.get().match.public?.phase==='PREP');report.stage=store.get().match.public.stageId;
  if(report.cachedSceneGroups)await until(()=>report.scene?.active&&board?.stats().frames>2);
  const p=store.get().match.private,chess=data.get('chess'),slot=p.shop.slots.findIndex(s=>s&&s.kind==='chess'&&!s.sold&&s.price<=p.funds&&chess[s.id]);
  if(slot<0)throw Error('Fixture needs an affordable operator');await net.request('g.buy',{slot});const piece=store.get().match.private.hand.find(x=>x?.kind==='chess');
  // Upstream canPlace allows both melee and ranged operators on these ground tiles.
  for(const [row,col]of data.get('stages')[report.stage].deployTiles.normal.melee){try{await net.request('g.move',{uid:piece.uid,to:{area:'board',row,col},dir:'RIGHT'});report.deployed={row,col};break;}catch{}}
  if(!report.deployed)throw Error('No valid deployment tile');report.phase='ready';await publish();
}
async function fight(){if(report.phase!=='ready')return;report.phase='combat';await publish();await net.request('g.ready',{ready:true});await until(()=>store.get().match.public?.phase==='PREP'&&store.get().match.public.round===2);report.phase='complete';report.round=2;await publish();}
async function evict(){await(await import('/js/assetCache.js')).clearImportedAssets();report.phase='cache cleared; reload to verify fallback';await publish();}
for(const [id,action]of [['static-audio',inspectAudio],['static-scenes',inspectScenes],['static-prepare',prepare],['static-fight',fight],['static-evict',evict]])panel.querySelector('#'+id).onclick=async e=>{e.target.disabled=true;try{await action();}catch(error){report.errors.push(error.stack||String(error));report.phase='failed';await publish();}};
await publish();

// Test-only overlay, served by scenes.browser.mjs; never included in dist.
import {BoardScene} from '/js/render/board3d/scene.js';
import {store} from '/js/store.js';
import {net} from '/js/net.js';
import {data} from '/js/data.js';
import {updateSettings} from '/js/ui/settings.js';
const live=new URL(location).searchParams.get('sceneQA')==='live';
const report={ua:navigator.userAgent,live,errors:[],phase:'idle'},errors=report.errors;
let board=null;
window.addEventListener('error',e=>errors.push(e.message));
window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.message||e.reason)));
const set=BoardScene.prototype.setScenePack;
BoardScene.prototype.setScenePack=function(id,pack){const result=set.call(this,id,pack);if(pack){board=this;report.scene={id,chunks:pack.chunks.length,vertices:pack.chunks.reduce((sum,c)=>sum+c.position.length/3,0),textures:Object.keys(pack.images.tex).length,lightmaps:pack.images.lm.filter(Boolean).length,expectedLightmaps:pack.doc.lightmaps,active:this.official===pack};}return result;};
const panel=document.createElement('aside');
panel.style.cssText='position:fixed;top:4px;left:4px;z-index:99999;background:#111;color:#fff;padding:8px;max-width:360px;font:12px monospace';
panel.innerHTML='<strong>LOCAL SCENE QA</strong><br><button id="scene-prepare">1. 准备地图验收</button> <button id="scene-fight">2. 战斗并检查结算</button><pre id="scene-status">先在大厅选择「卫戍协议 · 上半」版本 V1_1。</pre>';
document.body.append(panel);
const status=panel.querySelector('pre');status.style.cssText='white-space:pre-wrap;max-height:155px;overflow:auto';
async function publish(){report.render=board?.stats()||null;await fetch('/__scene-result',{method:'POST',body:JSON.stringify(report)});status.textContent=JSON.stringify(report,null,2);}
async function until(predicate,timeout=90000){const start=Date.now();while(!predicate()){if(Date.now()-start>timeout)throw Error('Timed out: '+report.phase);await new Promise(r=>setTimeout(r,200));}}
async function prepare(){
  report.phase='preparing';updateSettings({muted:true,quality:'low'});await publish();
  if(!live){const {audio}=await import('/js/audio.js');report.audioFailure={context:audio.ctx?.state,bufferIsNull:await audio._buffer('/__scene-audio-failure.mp3')===null};}
  await net.request('room.create',{mode:'solo',difficulty:'HARD',version:'act1autochess@V1_1'});
  await until(()=>store.get().room?.seats.filter(s=>s&&!s.isBot).every(s=>s.content==='ready'));
  await net.request('room.start');await until(()=>store.get().match.public?.phase==='INFO_CHECK');await net.request('g.infoReady');
  await until(()=>store.get().match.public?.phase==='BAND_DRAFT');const band=Object.values(data.get('bands')).find(x=>!Array.isArray(x.modeTypeList)||x.modeTypeList.includes('SINGLE'));await net.request('g.band',{bandId:band.bandId});
  await until(()=>store.get().match.public?.phase==='PREP');report.stage=store.get().match.public.stageId;
  if(live){report.phase='loading original scene';await publish();await until(()=>report.scene?.active&&board?.stats().frames>2);}
  const p=store.get().match.private,chess=data.get('chess');const slot=p.shop.slots.findIndex(s=>s&&s.kind==='chess'&&!s.sold&&s.price<=p.funds&&chess[s.id]?.position==='MELEE');
  if(slot<0)throw Error('Fixture needs an affordable melee operator');await net.request('g.buy',{slot});const piece=store.get().match.private.hand.find(x=>x?.kind==='chess');
  for(const [row,col]of data.get('stages')[report.stage].deployTiles.normal.melee){try{await net.request('g.move',{uid:piece.uid,to:{area:'board',row,col},dir:'RIGHT'});report.deployed={row,col};break;}catch{}}
  if(!report.deployed)throw Error('No valid deployment tile');report.phase='ready';await publish();
}
async function fight(){if(report.phase!=='ready')return;report.phase='combat';await publish();await net.request('g.ready',{ready:true});await until(()=>store.get().match.public?.phase==='PREP'&&store.get().match.public.round===2);report.round=2;report.phase='complete';await publish();}
for(const [id,action]of [['scene-prepare',prepare],['scene-fight',fight]])panel.querySelector('#'+id).onclick=async e=>{e.target.disabled=true;try{await action();}catch(error){errors.push(error.stack||String(error));report.phase='failed';await publish();}};
await publish();

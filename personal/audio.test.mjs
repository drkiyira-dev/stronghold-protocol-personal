import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {adaptAudio,adaptAudioSettings} from './audio-build.mjs';
async function adapted(file,adapt){
  const url=new URL('../upstream/public/js/'+file,import.meta.url);
  const bundle=await build({stdin:{contents:adapt(await readFile(url,'utf8')),resolveDir:fileURLToPath(new URL('.',url))},bundle:true,write:false,format:'esm',platform:'node'});
  return import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
}
const {AudioManager}=await adapted('audio.js',adaptAudio);
const {sanitizeSettings}=await adapted('ui/gameLogic/settings.js',adaptAudioSettings);
import {preparationCues,WARM_UI} from './audio-feedback.mjs';

const tick=()=>new Promise(r=>setImmediate(r));
function harness(){
  const starts=[],gains=[],listeners=new Map();
  class Context {
    state='running';currentTime=0;destination={};
    createGain(){const g={gain:{value:0,setTargetAtTime(v){this.value=v;}},connect(to){this.to=to;},disconnect(){}};gains.push(g);return g;}
    createBufferSource(){const s={playbackRate:{value:1},connect(to){this.to=to;},disconnect(){},start(){starts.push(this);this.onended?.();},stop(){}};return s;}
  }
  const audio=new AudioManager({win:{AudioContext:Context,addEventListener(k,f){listeners.set(k,f);},removeEventListener(k){listeners.delete(k);},document:{}},getManifest:()=>({audio:{sfx:{ui:Object.fromEntries(WARM_UI.map(k=>[k,k])),battle:{deploy:'battle'}}}})});
  audio._buffer=async()=>({duration:0.001});audio.install();
  return {audio,starts,gains,listeners,unlock(){listeners.get('pointerdown')();}};
}
test('four channels migrate the old combined SFX preference without changing it',()=>{
  const legacy=sanitizeSettings({sfx:0.32});assert.equal(legacy.uiSfx,.32);assert.equal(legacy.sfx,.32);
  const s=sanitizeSettings({sfx:0,uiSfx:.75});assert.equal(s.uiSfx,.75);assert.equal(s.sfx,0);
  assert.equal(sanitizeSettings({sfx:2,uiSfx:NaN}).uiSfx,1);
});
test('every added UI/merge cue stays silent and does not decode before a gesture',async()=>{
  const h=harness();let decodes=0;h.audio._buffer=async()=>{decodes++;return {duration:.001};};
  for(const cue of WARM_UI)h.audio.sfx(cue);
  h.audio.battle('deploy');await tick();
  assert.equal(h.audio.ctx,null);assert.equal(decodes,0);assert.equal(h.starts.length,0);
});
test('context is gesture-created; UI and battle route through independent gains',async()=>{
  const h=harness();assert.equal(h.audio.ctx,null);h.audio.sfx('click');assert.equal(h.starts.length,0);
  h.unlock();h.audio.setVolumes({bgm:0,sfx:.3,uiSfx:.7,voice:.4});
  h.audio.sfx('click');await tick();h.audio.battle('deploy');await tick();
  assert.equal(h.starts.length,2);assert.equal(h.starts[0].to.to,h.audio.uiGain);assert.equal(h.starts[1].to.to,h.audio.sfxGain);
  assert.equal(h.audio.uiGain.gain.value,.7**2*.9);assert.equal(h.audio.sfxGain.gain.value,.3**2*.9);
});
test('UI zero does not mute battle; battle zero does not mute UI; global mute stops both',async()=>{
  const h=harness();h.unlock();h.audio.setVolumes({sfx:.8,uiSfx:0});h.audio.sfx('click');h.audio.battle('deploy');await tick();assert.equal(h.starts.length,1);
  h.audio.setVolumes({sfx:0,uiSfx:.8});h.audio.sfx('click');h.audio.battle('deploy');await tick();assert.equal(h.starts.length,2);
  h.audio.setVolumes({muted:true});h.audio.sfx('buy');h.audio.battle('deploy');await tick();assert.equal(h.starts.length,2);
});
test('rapid UI gestures have bounded pending work and no duplicate audio burst',async()=>{
  const h=harness();h.unlock();let resolve;h.audio._buffer=()=>new Promise(r=>resolve=r);
  for(let i=0;i<100;i++)h.audio.sfx('click');assert.equal(h.audio.uiVoices,1);
  resolve({duration:.001});await tick();assert.equal(h.starts.length,1);assert.equal(h.audio.uiVoices,0);
});
test('late, failed and muted-during-load cues release slots without playing',async()=>{
  for(const kind of ['late','failed','muted']){
    const h=harness();h.unlock();let resolve;h.audio._buffer=()=>new Promise(r=>resolve=r);h.audio.sfx('click');
    if(kind==='late')await new Promise(r=>setTimeout(r,470));
    if(kind==='muted')h.audio.setVolumes({muted:true});
    resolve(kind==='failed'?null:{duration:.001});await tick();assert.equal(h.starts.length,0,kind);assert.equal(h.audio.uiVoices,0,kind);
  }
});
const state=(items=[],merges=0)=>({room:{code:'ROOM'},match:{public:{round:2,phase:'PREP'},private:{playerId:'p',stats:{merges},hand:items}}});
test('confirmed preparation deltas emit merge cues, snapshots and rewards alone do not',()=>{
  const items={base:{upgradeChessId:'gold'},gold:{isGolden:true}};
  const before=state([{uid:'a',kind:'item',id:'base'}]);
  const after=state([{uid:'g',kind:'item',id:'gold'}],1);
  assert.deepEqual(preparationCues(after,before,items),['merge','itemMerge']);
  assert.deepEqual(preparationCues(after,null,items),[]);
  assert.deepEqual(preparationCues(after,state([],1),items),[]);
  assert.deepEqual(preparationCues({...after,room:{code:'OTHER'}},before,items),[]);
  const moved=structuredClone(before);moved.match.private.board=moved.match.private.hand;moved.match.private.hand=[];
  assert.deepEqual(preparationCues(moved,before,items),[]);
  assert.ok(WARM_UI.includes('buy'));assert.ok(WARM_UI.length<20);
});

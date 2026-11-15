import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {extractCheckedContent,checkedContentPlugin} from './checked-content-build.mjs';
import {contentHashOf} from '../upstream/shared/plugins/identity.js';
import {sha256Hex} from '../upstream/shared/sha256.js';

// Exercise the same source extraction as the Worker, without loading the game,
// its browser UI graph or a generated dist. All network fixtures stay in memory.
const bundle = await build({entryPoints:[fileURLToPath(new URL('./custom-stage-loader.mjs',import.meta.url))],
  bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',metafile:true,plugins:[checkedContentPlugin]});
const {loadOriginalStage} = await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const records = JSON.parse(await readFile(new URL('./stages/rainfall-defense/content.json',import.meta.url),'utf8'));
const original = records.entries.find(e=>e.file==='stages').value.options.originalStage;
const descriptorUrl = '/personal/stages/rainfall-defense.json';
const tick = () => new Promise(resolve=>setImmediate(resolve));
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));

function fixture({bom=false}={}) {
  const data = {config:{},stages:{[original.stageId]:{options:{originalStage:original}}}};
  const resources = new Map(), pins = {};
  for (const [name,value] of Object.entries(data)) {
    const bytes = new TextEncoder().encode((bom && name==='stages' ? '\ufeff' : '')+JSON.stringify(value));
    const url = `/data/${name}.json`;
    resources.set(url,bytes);
    pins[name] = {url,bytes:bytes.length,sha256:sha256Hex(bytes)};
  }
  const identity = {app:'0.3.3',sim:'0'.repeat(64),data:Object.fromEntries(Object.entries(pins).map(([name,pin])=>[name,pin.sha256])),plugins:[],settings:{}};
  const cs = contentHashOf(identity), descriptor = {...original,cs};
  resources.set(descriptorUrl,JSON.stringify(descriptor));
  resources.set(`/cs/${cs.slice(0,16)}/index.json`,JSON.stringify({...identity,data:pins,cs,vanilla:false}));
  return {descriptor,data,resources,fetcher:async url=>resources.has(url) ? new Response(resources.get(url)) : new Response('',{status:404})};
}

test('build reuses the exact pinned upstream checked loader and excludes page initialization',async()=>{
  const source = await readFile(new URL('../upstream/public/js/content.js',import.meta.url),'utf8');
  const selected = extractCheckedContent(source);
  assert.match(selected,/Extracted unchanged from upstream\/public\/js\/content.js/);
  assert.ok(selected.includes('export async function fetchChecked('));
  const helperStart=source.indexOf('export async function fetchChecked(');
  const changedHelper=source.slice(0,helperStart)+source.slice(helperStart).replace('attempt < retryDelays.length','attempt <= retryDelays.length');
  assert.throws(()=>extractCheckedContent(changedHelper),/contract changed/);
  assert.throws(()=>extractCheckedContent(source.replace('export const CONTENT_RETRY_MS = Object.freeze([600, 2000]);','export const CONTENT_RETRY_MS = Object.freeze([1, 2]);')),/contract changed/);
  assert.throws(()=>extractCheckedContent(source.replace('function fetchChecked(','function renamedChecked(')),/contract changed/);
  for (const file of Object.keys(bundle.metafile.inputs)) {
    assert.doesNotMatch(file,/\/public\/js\/(?:store|net|cosmetics|data)\.js$|preact|node_modules/);
  }
});

test('stage loading is serial, preserves default cache policy and verifies original bytes including BOM',async()=>{
  const f = fixture({bom:true}), calls = [];let active=0,maximum=0;
  const result = await loadOriginalStage(async(url,init)=>{
    calls.push(url);assert.equal(init.cache,'default');active++;maximum=Math.max(maximum,active);
    await tick();const response=await f.fetcher(url);
    return {ok:response.ok,status:response.status,arrayBuffer:async()=>{await tick();active--;return response.arrayBuffer();}};
  });
  assert.deepEqual(result,{descriptor:f.descriptor,data:f.data});
  assert.equal(maximum,1);assert.equal(active,0);
  assert.deepEqual(calls,[descriptorUrl,`/cs/${f.descriptor.cs.slice(0,16)}/index.json`,'/data/config.json','/data/stages.json']);
});

for (const failure of ['network',503,408,429]) {
  test(`transient ${failure} retries the same resource before continuing`,async()=>{
    const f=fixture(),calls=[];let failed=false,failedSignal;
    const result=await loadOriginalStage(async(url,init)=>{
      calls.push(url);
      if (url==='/data/stages.json'&&!failed) {failed=true;failedSignal=init.signal;if(failure==='network')throw new TypeError('offline');return new Response('',{status:failure});}
      if (url==='/data/stages.json'&&failure!=='network') assert.equal(failedSignal.aborted,true,'stop the HTTP error body before retrying');
      return f.fetcher(url,init);
    },{retryDelays:[0,0]});
    assert.deepEqual(result.descriptor,f.descriptor);
    assert.deepEqual(calls.slice(-2),['/data/stages.json','/data/stages.json']);
    assert.equal(calls.length,5);
  });
}

test('permanent HTTP, byte/hash corruption and malformed JSON fail without retry',async()=>{
  for (const kind of ['404','bytes','hash','json']) {
    const f=fixture(),calls=[];let targetSignal;
    const target=kind==='json'?descriptorUrl:'/data/config.json';
    await assert.rejects(loadOriginalStage(async(url,init)=>{
      calls.push(url);
      if(url!==target)return f.fetcher(url);
      targetSignal=init.signal;
      if(kind==='404')return new Response('',{status:404});
      return new Response(kind==='bytes'?'{} ':kind==='hash'?'[]':'{');
    },{retryDelays:[0,0]}),kind==='404'?/HTTP 404/:kind==='bytes'?/bytes/:kind==='hash'?/hash/:/not JSON/);
    assert.equal(calls.filter(url=>url===target).length,1,kind);
    assert.equal(calls.at(-1),target,kind);
    if(kind==='404')assert.equal(targetSignal.aborted,true,'stop a permanent HTTP error body as well');
  }
});

test('a valid JSON BOM cannot hide a mismatch against the manifest bytes',async()=>{
  const f=fixture();let attempts=0;
  await assert.rejects(loadOriginalStage(async url=>{
    if(url!=='/data/config.json')return f.fetcher(url);
    attempts++;return new Response(new TextEncoder().encode('\ufeff{}'));
  },{retryDelays:[0,0]}),/bytes/);
  assert.equal(attempts,1);
});

test('transient retry count remains bounded by the upstream policy',async()=>{
  let attempts=0;
  await assert.rejects(loadOriginalStage(async()=>{attempts++;return new Response('',{status:503});},{retryDelays:[0,0]}),/HTTP 503/);
  assert.equal(attempts,3);
});

test('a stalled body aborts its attempt and can recover on the next attempt',{timeout:2000},async()=>{
  const f=fixture();let attempts=0,stalledSignal;
  const result=await loadOriginalStage(async(url,init)=>{
    if(url===descriptorUrl&&attempts++===0){stalledSignal=init.signal;return {ok:true,status:200,arrayBuffer:()=>new Promise(()=>{})};}
    return f.fetcher(url);
  },{timeoutMs:15,budgetMs:500,retryDelays:[0]});
  assert.equal(stalledSignal.aborted,true);assert.equal(attempts,2);
  assert.deepEqual(result.descriptor,f.descriptor);
});

for (const stalled of ['headers','body']) {
  test(`whole-load budget stops stalled ${stalled} even when the transport ignores abort`,{timeout:2000},async()=>{
    let attempts=0,requestSignal;
    await assert.rejects(loadOriginalStage(async(url,init)=>{
      attempts++;requestSignal=init.signal;
      if(stalled==='headers')return new Promise(()=>{});
      return {ok:true,status:200,arrayBuffer:()=>new Promise(()=>{})};
    },{budgetMs:20,timeoutMs:1000,retryDelays:[0,0]}),error=>error.name==='TimeoutError');
    assert.equal(requestSignal.aborted,true);await delay(30);assert.equal(attempts,1);
  });
}

test('the total budget is shared across files, not reset for every resource',{timeout:2000},async()=>{
  const f=fixture(),calls=[];
  await assert.rejects(loadOriginalStage(async(url,init)=>{
    calls.push(url);await delay(25);return f.fetcher(url,init);
  },{budgetMs:40,timeoutMs:1000,retryDelays:[0,0]}),error=>error.name==='TimeoutError');
  await delay(40);
  assert.ok(calls.length<=2);assert.equal(calls.includes('/data/stages.json'),false);
});

test('external cancellation stops body loading and retry waits without late downloads',{timeout:2000},async()=>{
  for (const phase of ['body','retry']) {
    const controller=new AbortController(),reason=new DOMException('QA cancelled','AbortError');
    let attempts=0,requestSignal;
    const loading=loadOriginalStage(async(url,init)=>{
      attempts++;requestSignal=init.signal;
      return phase==='retry'?new Response('',{status:503}):{ok:true,status:200,arrayBuffer:()=>new Promise(()=>{})};
    },{signal:controller.signal,budgetMs:1000,retryDelays:[500,500]});
    const assertion=assert.rejects(loading,error=>error===reason);
    await delay(10);controller.abort(reason);await assertion;
    if(phase==='body')assert.equal(requestSignal.aborted,true);
    await delay(20);assert.equal(attempts,1,phase);
  }
});

test('an already-cancelled load performs no request',async()=>{
  const controller=new AbortController();controller.abort();let calls=0;
  await assert.rejects(loadOriginalStage(async()=>{calls++;return new Response('{}');},{signal:controller.signal}),error=>error.name==='AbortError');
  assert.equal(calls,0);
});

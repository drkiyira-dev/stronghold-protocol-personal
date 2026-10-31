import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import http from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {startPersonalServer} from './host.mjs';
import {SCENE_PREFIX,RELEASE,ZIP_ROOT,crc32,createRangeReader,decodeEntry,createSceneReader,createSceneHandler,loadSceneCatalog,sceneManifest} from './scene-assets.mjs';

function fixture(key='scene/test/scene.json',text='{"version":1}'){
  const data=Buffer.from(text),compressed=deflateRawSync(data),name=ZIP_ROOT+key,header=Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);header.writeUInt16LE(8,8);header.writeUInt16LE(Buffer.byteLength(name),26);
  const bytes=Buffer.concat([header,Buffer.from(name),compressed]);
  const entry={name,method:8,crc:crc32(data),compressed:compressed.length,size:data.length,offset:0,span:bytes.length};
  const catalog={source:RELEASE,manifest:{groups:{'scene/test':{scene:{path:'/assets/local/'+key}}}},files:{[key]:entry}};
  return {key,data,bytes,entry,catalog};
}

test('pinned upstream catalog resolves all eleven scenes and implicit board files',async()=>{
  const c=await loadSceneCatalog(),m=sceneManifest(c);
  assert.equal(Object.keys(m.groups).filter(g=>/^scene\/act[12]autochess_m\d\d$/.test(g)).length,11);
  for(const [key,e]of Object.entries(c.files)){
    assert.equal(e.name,ZIP_ROOT+key);assert.ok(e.offset+e.span<=c.source.size);assert.ok(e.size>0&&e.size<=8*1024*1024);assert.ok(e.span<8*1024*1024);
  }
  assert.ok(c.files['map/autochess/tiles.json']);
  for(const [group,entries]of Object.entries(m.groups))if(/^scene\/act/.test(group)){assert.ok(entries.scene);assert.ok(entries.bin);assert.ok(entries.lm0);}
  assert.ok(sceneManifest(c,'https://art.example').groups['scene/act1autochess_m05'].bin.path.startsWith('https://art.example'+SCENE_PREFIX));
  for(const origin of ['http://art.example','https://u:p@art.example','https://art.example/path','https://art.example/'])assert.throws(()=>sceneManifest(c,origin));
});

test('range reader requires exact bounded 206 responses and safe redirects',async()=>{
  let calls=0,cancelled=0;const r=createRangeReader({fetchImpl:async(url,options)=>{
    calls++;assert.equal(options.headers.Range,'bytes=12-14');assert.equal(options.redirect,'manual');
    return calls===1?new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/known-art'}}):new Response('abc',{status:206,headers:{'content-range':`bytes 12-14/${RELEASE.size}`}});
  }});
  assert.equal((await r.read(12,14)).toString(),'abc');assert.equal(calls,2);await r.read(12,14);assert.equal(calls,3);r.close();
  for(const reply of [()=>new Response(new ReadableStream({cancel(){cancelled++;}}),{status:200}),()=>new Response('a',{status:206,headers:{'content-range':`bytes 12-14/${RELEASE.size}`}}),()=>new Response('abcd',{status:206,headers:{'content-range':`bytes 12-14/${RELEASE.size}`}}),()=>new Response(null,{status:302,headers:{location:'https://localhost/private'}})]){
    const bad=createRangeReader({fetchImpl:async()=>reply()});await assert.rejects(bad.read(12,14));bad.close();
  }
  assert.equal(cancelled,1,'never read a server response containing the whole ZIP');
  await assert.rejects(r.read(0,10*1024*1024));
});

test('scene entries reject corrupt, truncated, mismatched and oversized output',async()=>{
  const f=fixture();assert.deepEqual(await decodeEntry(f.bytes,f.entry),f.data);
  for(const entry of [{...f.entry,crc:0},{...f.entry,size:1},{...f.entry,name:'different'},{...f.entry,method:0},{...f.entry,size:9*1024*1024}])await assert.rejects(decodeEntry(f.bytes,entry));
  await assert.rejects(decodeEntry(f.bytes.subarray(0,-1),f.entry));
  assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);
});

test('scene reader coalesces, serializes, bounds queue/cache and retries failures',async()=>{
  const a=fixture('map/a.json','first'),b=fixture('map/b.json','second');b.entry.offset=a.bytes.length;
  const c={...a.catalog,files:{...a.catalog.files,...b.catalog.files}};let active=0,peak=0,reads=0,fail=true;
  const reader=createSceneReader(c,{cooldownMs:0,cacheBytes:5,maxPending:2,rangeReader:{async read(start){reads++;peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,5));active--;if(fail){fail=false;throw Error('offline');}return start===0?a.bytes:b.bytes;},close(){}}});
  await assert.rejects(reader.get(a.key),/offline/);
  const p=reader.get(a.key);assert.equal(reader.get(a.key),p);assert.deepEqual(await p,a.data);
  assert.deepEqual(await reader.get(a.key),a.data);assert.equal(reads,2);
  await Promise.all([reader.get(b.key),reader.get(a.key)]);assert.equal(peak,1);assert.ok(reader.stats().cachedBytes<=5);
  await assert.rejects(reader.get('../secret'));reader.close();await assert.rejects(reader.get(a.key),/closed/);assert.equal(reader.stats().cachedBytes,0);
  let release;const full=createSceneReader(c,{maxPending:1,rangeReader:{read:()=>new Promise(r=>release=()=>r(a.bytes)),close(){}}});
  const waiting=full.get(a.key);await assert.rejects(full.get(b.key),/queue full/);release();await waiting;full.close();
  let time=0,attempts=0;const cooling=createSceneReader(c,{now:()=>time,rangeReader:{async read(){attempts++;if(attempts===1)throw Error('offline');return a.bytes;},close(){}}});
  await assert.rejects(cooling.get(a.key),/offline/);await assert.rejects(cooling.get(b.key),/cooling down/);assert.equal(attempts,1);
  time=30001;assert.deepEqual(await cooling.get(a.key),a.data);cooling.close();
});

test('HTTP scene bridge is public-art-only and fails without poisoning cache',async()=>{
  const f=fixture();let fail=false,gets=0;
  const handler=createSceneHandler(f.catalog,{reader:{async get(){gets++;if(fail)throw Error('offline');return f.data;},close(){}}});
  const server=http.createServer((req,res)=>handler(req,res).then(handled=>{if(!handled){res.writeHead(404);res.end();}}));server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const manifest=await (await fetch(base+'/data/local-assets.json')).json();assert.equal(manifest.groups['scene/test'].scene.path,SCENE_PREFIX+f.key);assert.equal(gets,0);
    const head=await fetch(base+SCENE_PREFIX+f.key,{method:'HEAD'});assert.equal(head.status,200);assert.equal(gets,0);
    const ok=await fetch(base+SCENE_PREFIX+f.key);assert.equal(await ok.text(),f.data.toString());assert.equal(ok.headers.get('access-control-allow-origin'),'*');assert.equal(ok.headers.get('access-control-allow-credentials'),null);
    for(const key of ['https://evil.example/x','constructor','%ZZ','%2e%2e%2fprivate'])assert.ok((await fetch(base+SCENE_PREFIX+key)).status>=400);
    assert.equal((await fetch(base+SCENE_PREFIX+f.key,{method:'POST'})).status,405);
    fail=true;const unavailable=await fetch(base+SCENE_PREFIX+f.key);assert.equal(unavailable.status,503);assert.equal(unavailable.headers.get('cache-control'),'no-store');
  }finally{server.close();await once(server,'close');handler.close();}
});

test('host exposes the scene bridge only when explicitly enabled; metadata/HEAD reads stay offline',async()=>{
  const built=JSON.parse(await readFile(new URL('../dist/data/local-assets.json',import.meta.url),'utf8'));
  for(const enabled of [false,true]){
    const app=await startPersonalServer({port:0,sceneAssets:enabled,log:{info(){},warn(){},error(){},debug(){}}});
    try{
      const manifest=await (await fetch(app.url+'/data/local-assets.json')).json();
      const response=await fetch(app.url+SCENE_PREFIX+'map/autochess/tiles.json',{method:'HEAD'});
      if(enabled){assert.equal(response.status,200);assert.ok(manifest.groups['scene/act2autochess_m04']);assert.deepEqual(app.scenes.stats(),{cachedBytes:0,cached:0,pending:0});}
      else{assert.equal(response.status,404);assert.deepEqual(manifest,built);assert.equal(app.scenes,null);}
    }finally{await app.close();}
  }
});

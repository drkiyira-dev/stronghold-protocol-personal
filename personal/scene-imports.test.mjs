import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cachedSceneManifest} from './scene-imports.mjs';
import {adaptSceneImport,adaptSceneTiles} from './scene-imports-build.mjs';
import {createAssetImport,planFromManifests,importedKeepSet} from '../upstream/public/js/assetPack.js';
const catalog=JSON.parse(await readFile(new URL('./scene-import-catalog.json',import.meta.url)));
const root=new URL('../upstream/public/js/',import.meta.url);

test('11 original scene groups and their tile table are accepted by the upstream hash import plan',()=>{
  const plan=planFromManifests({},catalog.manifest);
  assert.equal(plan.files.size,Object.keys(catalog.files).length);
  assert.equal(Object.keys(catalog.scenes).length,11);
  for(const [key,file]of Object.entries(catalog.files)){
    const entry=plan.files.get('assets/local/'+key);assert.equal(entry.hash,file.sha256.slice(0,16));
    assert.ok(importedKeepSet({},catalog.manifest,null).has(entry.url));
  }
  assert.ok(catalog.manifest.groups['map/autochess'].tiles);
});

test('empty, cancelled and evicted imports preserve fallback without advertising incomplete scene geometry',async()=>{
  const manifest=catalog.manifest,entry=manifest.groups['scene/act1autochess_m01'];
  const paths=new Set([entry.scene.path]);const cache={match:async p=>paths.has(p)?new Response('verified'):undefined};
  assert.deepEqual(await cachedSceneManifest(manifest,null),{groups:{}});
  assert.deepEqual(await cachedSceneManifest(manifest,cache),{groups:{}});
  paths.add(entry.bin.path);
  assert.deepEqual((await cachedSceneManifest(manifest,cache)).groups['scene/act1autochess_m01'],{scene:entry.scene,bin:entry.bin});
  paths.delete(entry.bin.path);assert.deepEqual(await cachedSceneManifest(manifest,cache),{groups:{}});
  await assert.rejects(cachedSceneManifest(manifest,{match:async()=>{throw Error('storage denied');}}));
});

test('upstream importer accepts matching local bytes and rejects corruption, without uploading art',async()=>{
  const bytes=new TextEncoder().encode('scene geometry fixture'),hash=createHash('sha256').update(bytes).digest('hex').slice(0,16);
  const path='/assets/~'+hash+'/local/scene/fixture/scene.bin';
  const manifest={groups:{'scene/fixture':{bin:{path}}}},saved=new Map(),requests=[];
  const cache={match:async p=>saved.get(p)?.clone(),put:async(p,r)=>saved.set(p,r.clone()),keys:async()=>[...saved.keys()].map(url=>({url:'http://localhost'+url}))};
  const importer=createAssetImport({caches:{open:async()=>cache},fetch:async url=>{requests.push(url);return Response.json(url==='/data/local-assets.json'?manifest:{groups:{}});}});
  const source=data=>({type:'files',files:[{path:'Stronghold-Protocol/public/assets/local/scene/fixture/scene.bin',read:async()=>data}]});
  await importer.start(source(bytes));assert.equal(importer.get().accepted,1);assert.ok(saved.has(path));
  saved.clear();await importer.start(source(new Uint8Array([1,2,3])));assert.equal(importer.get().rejected,1);assert.ok(!saved.has(path));
  assert.ok(requests.every(u=>u.startsWith('/data/')));
});

test('a changed catalog cannot mix old geometry into a new scene; rollback remains optional-art only',async()=>{
  const manifest=catalog.manifest,group='scene/act1autochess_m01';
  const old=manifest.groups[group],paths=new Set([old.scene.path,old.bin.path]);
  const cache={match:async path=>paths.has(path)?new Response('previous verified bytes'):undefined};
  const next=structuredClone(manifest);next.groups[group].bin.path=old.bin.path.replace(/~[a-f0-9]{16}/,'~1111111111111111');
  assert.ok((await cachedSceneManifest(manifest,cache)).groups[group]);
  assert.equal((await cachedSceneManifest(next,cache)).groups[group],undefined);
  assert.ok((await cachedSceneManifest(manifest,cache)).groups[group],'old catalog can reuse retained bytes');
  paths.clear();assert.deepEqual(await cachedSceneManifest(manifest,cache),{groups:{}},'evicted rollback art requires reimport, not a broken scene');
});

test('checked build adapters retain upstream code and resolve distinct content hashes for 2D and 3D tiles',async()=>{
  const importer=await readFile(new URL('assetPack.js',root),'utf8');
  assert.equal((adaptSceneImport(importer).match(/\/personal\/scene-import.json/g)||[]).length,2);
  assert.throws(()=>adaptSceneImport('changed upstream source'));
  for(const file of ['render/boardArt.js','render/board3d/load.js']){
    const source=await readFile(new URL(file,root),'utf8');
    assert.match(adaptSceneTiles(source),/assets.localUrl\('map\/autochess', 'tiles'\) \|\|/);
  }
});

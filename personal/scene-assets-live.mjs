// Opt-in, serial source audit. No browser, extraction tool, or art files saved.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {loadSceneCatalog,createSceneReader} from './scene-assets.mjs';
import {parseSceneChunks,SCENE_VERSION} from '../upstream/public/js/render/board3d/load.js';
const catalog=await loadSceneCatalog(),reader=createSceneReader(catalog,{cacheBytes:0}),results=[];
try{
  for(const [group,entries]of Object.entries(catalog.manifest.groups).filter(([g])=>/^scene\/act/.test(g))){
    const key=e=>e.path.replace('/assets/local/','');
    const doc=JSON.parse(await reader.get(key(entries.scene))),bin=await reader.get(key(entries.bin));
    assert.equal(doc.stage,group.slice(6));assert.equal(doc.version,SCENE_VERSION);assert.equal(bin.length,doc.binBytes);
    const chunks=parseSceneChunks(doc,bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.length));
    assert.equal(chunks.length,entries.scene.chunks);
    const names=[...new Set(Object.values(doc.materials||{}).flatMap(m=>['map','emissionMap','normalMap','glossMap'].map(k=>m[k])).filter(Boolean))];
    for(const name of names)assert.ok(catalog.manifest.groups['scene/tex'][name],`${doc.stage}: ${name}`);
    for(let i=0;i<doc.lightmaps;i++)assert.ok(entries['lm'+i]);
    const item={stage:doc.stage,chunks:chunks.length,bytes:bin.length,textureReferences:names.length,lightmaps:doc.lightmaps};results.push(item);console.log(JSON.stringify(item));
  }
  await mkdir('.cache/verification',{recursive:true});await writeFile('.cache/verification/scenes-source-audit.json',JSON.stringify({source:catalog.source,scenes:results,texturePixels:'not audited by this source-only check'},null,2));
}finally{reader.close();}

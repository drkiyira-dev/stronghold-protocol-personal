// Explicit, serial network audit; never run by npm build. Only metadata enters git.
// --fixtures saves private local QA inputs, never a deployment directory.
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {loadSceneCatalog,createSceneReader} from './scene-assets.mjs';
const catalog=await loadSceneCatalog(), reader=createSceneReader(catalog,{cacheBytes:0});
const manifest=structuredClone(catalog.manifest),files={},scenes={};
manifest.groups['map/autochess'].tiles={path:'/assets/local/map/autochess/tiles.json'};
const keys=[...new Set(Object.values(manifest.groups).flatMap(g=>Object.values(g).map(e=>e.path.replace('/assets/local/',''))))].sort();
try{
  for(const [i,key]of keys.entries()){
    const bytes=await reader.get(key),sha256=createHash('sha256').update(bytes).digest('hex');
    files[key]={sha256,bytes:bytes.length,compressedBytes:catalog.files[key].compressed};
    if(/^scene\/act.*\/scene.json$/.test(key)){
      const doc=JSON.parse(bytes);
      scenes[doc.stage]={chunks:doc.chunks.length,lightmaps:doc.lightmaps,textures:[...new Set(Object.values(doc.materials||{}).flatMap(m=>['map','emissionMap','normalMap','glossMap'].map(k=>m[k])).filter(Boolean))]};
    }
    if(process.argv.includes('--fixtures')){
      const path='.cache/scene-import-fixture/Stronghold-Protocol/public/assets/local/'+key;
      await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);
    }
    if(i%20===0||i===keys.length-1)console.log(`Verified ${i+1}/${keys.length}`);
  }
  for(const group of Object.values(manifest.groups))for(const e of Object.values(group)){
    const key=e.path.replace('/assets/local/','');e.path='/assets/~'+files[key].sha256.slice(0,16)+'/local/'+key;
  }
  await writeFile(new URL('./scene-import-catalog.json',import.meta.url),JSON.stringify({source:catalog.source,files,scenes,manifest},null,2)+'\n');
}finally{reader.close();}

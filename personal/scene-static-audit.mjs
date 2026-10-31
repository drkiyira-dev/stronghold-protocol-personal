// Explicit source/header audit; serial requests, no credentials or art published.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRangeReader} from './scene-assets.mjs';
const origin='https://blackshore-protocol-kiriya.fluffymelon1026.chatgpt.site';
const rows=[];
function record(label,response,url){
  const names=['content-type','content-length','access-control-allow-origin','cache-control','etag','last-modified','content-range'];
  rows.push({label,url,https:new URL(response.url).protocol==='https:',status:response.status,headers:Object.fromEntries(names.map(k=>[k,response.headers.get(k)]))});
}
async function head(label,url){
  try{const r=await fetch(encodeURI(url),{method:'HEAD',headers:{Origin:origin},signal:AbortSignal.timeout(15000)});record(label,r,url);await r.body?.cancel();}catch(e){rows.push({label,url,error:e.message});}
}
await head('legacy upstream site','https://weishuxieyi.icu/');
try{
  const root=await fetch('https://weishuxieyiwangye.cn:8443/',{signal:AbortSignal.timeout(15000)}),base=root.url;await root.body?.cancel();
  const r=await fetch(new URL('data/local-assets.json',base),{headers:{Origin:origin},signal:AbortSignal.timeout(15000)});record('upstream scene manifest',r,r.url);
  const manifest=await r.json(),scene=manifest.groups['scene/act1autochess_m05'];
  await head('converted scene JSON',new URL(scene.scene.path,base).href);
  await head('converted scene binary',new URL(scene.bin.path,base).href);
  await head('converted board texture',new URL(manifest.groups['map/autochess'].TX_autochessi_D.path,base).href);
}catch(e){rows.push({label:'upstream converted scene source',error:e.message});}
const reader=createRangeReader({fetchImpl:async(url,opts)=>{
  const r=await fetch(url,{...opts,headers:{...opts.headers,Origin:origin}});
  // Never record the signed redirect URL or Location header.
  record('release range '+new URL(url).hostname,r,new URL(url).origin);
  return r;
}});
try{await reader.read(0,7);}catch(e){rows.push({label:'release byte-range',error:e.message});}finally{reader.close();}
const assets=JSON.parse(await readFile('dist/data/assets.json'));
await head('UI click audio',assets.audio.sfx.ui.click);
await head('battle deployment audio',assets.audio.sfx.battle.deploy);
await head('current public production (read only)',origin);
const catalog=JSON.parse(await readFile('personal/scene-import-catalog.json')),groups=catalog.manifest.groups;
const key=e=>e.path.replace(/^\/assets\/~[a-f0-9]{16}\/local\//,'');
const sizes=keys=>{const unique=[...new Set(keys)];return{files:unique.length,bytes:unique.reduce((n,k)=>n+catalog.files[k].bytes,0),compressedBytes:unique.reduce((n,k)=>n+catalog.files[k].compressedBytes,0)};};
const inventory=Object.entries(catalog.scenes).map(([stage,doc])=>({stage,...sizes([...Object.values(groups['scene/'+stage]).map(key),...doc.textures.map(t=>key(groups['scene/tex'][t]))]),chunks:doc.chunks,lightmaps:doc.lightmaps,staticDirect:false,privateImport:true}));
const shared=sizes(Object.entries(groups).filter(([g])=>!g.startsWith('scene/')).flatMap(([,g])=>Object.values(g).map(key)));
const formats={};for(const [k,f]of Object.entries(catalog.files)){const ext=k.split('.').at(-1);const r=formats[ext] ||= {files:0,bytes:0};r.files++;r.bytes+=f.bytes;}
const result={at:new Date().toISOString(),requestOrigin:origin,source:catalog.source,headers:rows,inventory,shared,formats,total:sizes(Object.keys(catalog.files)),rights:'Game art remains third-party intellectual property; no redistribution permission inferred from HTTPS availability. No art is included in the static build.'};
await mkdir('.cache/verification',{recursive:true});await writeFile('.cache/verification/scene-static-source-audit.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({headers:rows,inventory,shared,formats,total:result.total}));

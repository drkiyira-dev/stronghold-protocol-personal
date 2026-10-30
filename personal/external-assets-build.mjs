// Asset binaries remain at their recorded external origins. Only URL/dimension metadata is shipped.
import {readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {parseAtlas} from '../upstream/tools/assets/atlas.mjs';
import {RAW,safeName} from '../upstream/tools/assets/sources.mjs';
import {VOICE_DIRS,VOICE_CUSTOM_DIR} from '../upstream/tools/assets/audio.mjs';
import {FONTS} from '../upstream/tools/assets/fonts.mjs';
import {STATS_CSS} from './stats-external.mjs';
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist');
const read=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const visual=await read('personal/visual-source-map.json'),audio=await read('personal/audio-font-source-map.json');
const sources={...visual.files,...audio.files},cache=await read('personal/asset-cache-report.json');
const proven=new Map(cache.records.map(r=>[r.path,r.source]));
const manifest=await read('upstream/data/assets.json');
let metadata={};try{metadata=await read('personal/atlas-metadata.json');}catch{}
const files={},unmapped=[],atlas={},samples={};
for(const [local,source]of Object.entries(sources)){
  files[local]=[...new Set([proven.get(local),...source.urls,...(source.mirrors||[])].filter(u=>typeof u==='string'&&u.startsWith('https://')))];
}
Object.assign(files,(await read('personal/music-sources.json')).files);
for(const [local,source]of Object.entries(sources))if(!files[local]?.length&&local.startsWith('/assets/ui/statistics/')){
  const name=source.manifestKeys[0].split('/').at(-1);
  files[local]=[name==='fontStyles'?'/personal/stats-fonts.css':STATS_CSS+'#personal='+name];
}
await writeFile(path.join(dist,'personal/stats-fonts.css'),`@font-face{font-family:'Official Stats Numerals';font-display:swap;src:url('${files['/assets/ui/statistics/number-font.woff2'][0]}')}@font-face{font-family:'Official Stats Labels';font-display:swap;src:url('${files['/assets/ui/statistics/label-font.woff2'][0]}')}`);
function urls(local){
  if(files[local]?.length)return files[local];
  if(local.startsWith('/assets/audio/sfx/'))return files[local]=[new URL(local.slice('/assets/audio/sfx/'.length),RAW.aa2voice).href];
  const voice=/^\/assets\/audio\/voice\/(cn|jp|en|kr|native)\/([a-z0-9_]+\/cn_\d+\.mp3)$/.exec(local);
  if(voice){const dir=voice[1]==='native'?VOICE_CUSTOM_DIR:VOICE_DIRS[voice[1]];return files[local]=[new URL(dir+'/'+voice[2],RAW.aa2voice).href];}
  unmapped.push(local);return [local];
}
async function scan(v){
  if(!v||typeof v!=='object')return;
  if(typeof v.atlas==='string'&&v.atlas.startsWith('/assets/')){
    let m=metadata[v.atlas];
    if(!m){const raw=await readFile(path.join(dist,v.atlas),'utf8');const pages=parseAtlas(raw).pages;m={pma:!!v.pma,sizes:{}};for(const page of pages){const [width,height]=String(page.fields.size).split(',').map(Number);if(!width||!height)throw new Error(`Missing atlas dimensions: ${v.atlas}`);m.sizes[safeName(page.name)]={width,height};}metadata[v.atlas]=m;}
    for(const url of urls(v.atlas))atlas[url]=m;
  }
  for(const x of Object.values(v))await scan(x);
}
await scan(manifest);
function rewrite(v){
  if(typeof v==='string'&&v.startsWith('/assets/'))return urls(v)[0];
  if(Array.isArray(v))return v.map(rewrite);
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rewrite(x)]));
  return v;
}
const transformed=rewrite(manifest);
if(unmapped.length)throw new Error(`Unmapped assets: ${[...new Set(unmapped)].slice(0,15).join(', ')}`);
for(const [name,pattern]of Object.entries({avatar:'/char/avatar/',skeleton:'/spine/op/',texture:'/spine/enemy/',music:'/audio/bgm/',voice:'/audio/voice/cn/'})){
  const entry=Object.entries(files).find(([p])=>p.includes(pattern)&&(name==='skeleton'?p.endsWith('.skel'):name==='texture'?p.endsWith('.png'):true));if(entry)samples[name]=entry[1];
}
// Generate the same HUD font families from external URLs, including on a clean checkout.
await rm(path.join(dist,'fonts'),{recursive:true,force:true});
await mkdir(path.join(dist,'fonts'),{recursive:true});
await writeFile(path.join(dist,'fonts/fonts.css'),FONTS.map(f=>{
  const candidates=files[`/fonts/${f.name}.${f.ext}`];
  if(!candidates?.length)throw new Error(`Missing external font: ${f.name}`);
  return `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:${f.style};font-display:swap;src:${candidates.map(u=>`url('${u}')`).join(',')}}`;
}).join('\n'));
await writeFile(path.join(root,'personal/atlas-metadata.json'),JSON.stringify(metadata));
await writeFile(path.join(dist,'data/assets.json'),JSON.stringify(transformed));
await writeFile(path.join(dist,'personal/external-assets.json'),JSON.stringify({version:1,files,atlas,unmapped:[],samples}));
// These are ignored build outputs, never the source cache or user data.
await rm(path.join(dist,'assets'),{recursive:true,force:true});
console.log(JSON.stringify({externalAssets:Object.keys(files).length,atlasAdapters:Object.keys(metadata).length,unmapped:0}));

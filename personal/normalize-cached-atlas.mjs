import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { normalizeAtlas } from '../upstream/tools/assets/atlas.mjs';
import { safeName } from '../upstream/tools/assets/sources.mjs';
const root=path.resolve(import.meta.dirname,'..');
const data=JSON.parse(readFileSync(`${root}/upstream/data/assets.json`,'utf8'));
const entries=new Map();
function walk(v){if(v&&typeof v==='object'){if(typeof v.atlas==='string'&&v.atlas.startsWith('/assets/')&&typeof v.skel==='string')entries.set(v.atlas,v);for(const x of Object.values(v))walk(x);}}
walk(data);let normalized=0,unchanged=0;const missing=[];
for(const [url,e]of entries){const file=root+'/dist'+url;if(!existsSync(file)){missing.push({atlas:url,reason:'atlas missing'});continue;}
try{const raw=readFileSync(file,'utf8');const r=normalizeAtlas(raw,{pma:!!e.pma,renamePage:safeName,pageSize:(name)=>{const f=path.join(path.dirname(file),safeName(name));if(!existsSync(f))return null;const b=readFileSync(f);if(b.length<24||b[0]!==137||b.toString('ascii',1,4)!=='PNG')return null;return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};}});if(r.missingSize.length){missing.push({atlas:url,reason:'missing page dimensions',pages:r.missingSize});continue;}if(r.changed){writeFileSync(file,r.text);normalized++;}else unchanged++;}catch(error){missing.push({atlas:url,reason:String(error)});}}
const report={models:entries.size,normalized,unchanged,missing};writeFileSync(`${root}/personal/atlas-normalization-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({models:entries.size,normalized,unchanged,missing:missing.length}));

import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const hash=value=>createHash('sha256').update(value).digest('hex');
export function replaceContract(source,anchor,replacement,label){
  const matches=typeof anchor==='string'?source.split(anchor).length-1:[...source.matchAll(new RegExp(anchor.source,'g'))].length;
  if(matches!==1)throw new Error(`Upstream adapter contract changed: ${label} (${matches} matches)`);
  return source.replace(anchor,replacement);
}
export async function buildIdentity({read=path=>readFile(new URL(path,root)),lock}={}){
  lock ||= JSON.parse(await read('personal/upstream-lock.json'));
  const rows=[];
  for(const [path,expected] of Object.entries(lock.files)){
    const actual=hash(await read(path));
    if(actual!==expected)throw new Error(`Upstream baseline changed: ${path}. Review and update the lock explicitly.`);
    rows.push([path,actual]);
  }
  const group=prefix=>hash(JSON.stringify(rows.filter(([p])=>prefix.some(s=>p.startsWith(s)))));
  const adapters=['checkpoint.mjs','room-checkpoint.mjs','local-server.mjs','room-recovery.mjs','challenges.mjs','build-worker.mjs',
    ...(await readdir(new URL('personal/shims/',root))).filter(p=>p.endsWith('.mjs')).map(p=>'shims/'+p)].sort();
  const adapterHash=hash(JSON.stringify(await Promise.all(adapters.map(async p=>[p,hash(await read('personal/'+p))]))));
  const upstreamEngineHash=group(['upstream/server/','upstream/shared/']);
  return {version:1,edition:'Stronghold Protocol: Alliance — Enhanced Edition',upstream:lock.upstream,
    upstreamEngineHash,adapterHash,engineHash:hash(JSON.stringify([upstreamEngineHash,adapterHash])),dataHash:group(['upstream/data/']),
    baselineHash:hash(JSON.stringify(rows)),protocol:2};
}
export async function verifyNoUntrackedEngineFiles(){
  const lock=JSON.parse(await readFile(new URL('personal/upstream-lock.json',root),'utf8'));
  async function walk(path){for(const entry of await readdir(new URL(path,root),{withFileTypes:true})){
    const file=path+'/'+entry.name;if(entry.isDirectory())await walk(file);
    else if(/\.(js|mjs|json)$/.test(file)&&!lock.files[file])throw new Error(`Unreviewed upstream runtime file: ${file}`);
  }}
  for(const path of ['upstream/server','upstream/shared'])await walk(path);
}

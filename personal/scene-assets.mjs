// Optional self-hosted bridge to the original upstream release, not a renderer.
// Only catalogued files are served. No full ZIP download, credentials, or disk cache.
import {readFile} from 'node:fs/promises';
import {inflateRaw} from 'node:zlib';
import {promisify} from 'node:util';

const inflate=promisify(inflateRaw), MiB=1024*1024;
export const SCENE_PREFIX='/personal/scene-assets/v0.3.3/';
export const RELEASE={tag:'v0.3.3',url:'https://api.github.com/repos/sganggs/Stronghold-Protocol/releases/assets/673357309',size:861090941};
export const ZIP_ROOT='Stronghold-Protocol/public/assets/local/';
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
export function crc32(bytes){let n=0xffffffff;for(const b of bytes)n=(n>>>8)^crcTable[(n^b)&255];return (n^0xffffffff)>>>0;}

// GitHub's short-lived redirect stays in memory, and only its asset host is allowed.
export function createRangeReader({source=RELEASE,fetchImpl=fetch,timeoutMs=15000}={}){
  let location=source.url,renewAt=0;
  const stopped=new AbortController();
  async function read(start,end){
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>=source.size||end-start+1>8*MiB)throw Error('Invalid asset range');
    if(Date.now()>renewAt)location=source.url;
    const signal=AbortSignal.any([stopped.signal,AbortSignal.timeout(timeoutMs)]);
    for(let tries=0;tries<4;tries++){
      const response=await fetchImpl(location,{redirect:'manual',headers:{Accept:'application/octet-stream',Range:`bytes=${start}-${end}`},signal});
      if([301,302,303,307,308].includes(response.status)){
        const next=new URL(response.headers.get('location'),location);await response.body?.cancel();
        if(next.protocol!=='https:'||next.hostname!=='release-assets.githubusercontent.com'||next.port||next.username||next.password)throw Error('Unexpected release redirect');
        location=next.href;renewAt=Date.now()+20*60*1000;continue;
      }
      if([401,403].includes(response.status)&&location!==source.url){await response.body?.cancel();location=source.url;continue;}
      const length=end-start+1;
      if(response.status!==206||response.headers.get('content-range')!==`bytes ${start}-${end}/${source.size}`){await response.body?.cancel();throw Error('Scene source did not honor the byte range');}
      const chunks=[];let received=0;
      for await(const chunk of response.body){received+=chunk.length;if(received>length)throw Error('Oversized scene response');chunks.push(chunk);}
      if(received!==length)throw Error('Truncated scene response');
      return Buffer.concat(chunks,received);
    }
    throw Error('Scene redirect limit');
  }
  return {read,close:()=>stopped.abort()};
}

export async function decodeEntry(bytes,entry){
  if(bytes.length<30||bytes.readUInt32LE(0)!==0x04034b50||(bytes.readUInt16LE(6)&1))throw Error('Invalid scene ZIP entry');
  const method=bytes.readUInt16LE(8),nameLength=bytes.readUInt16LE(26),start=30+nameLength+bytes.readUInt16LE(28);
  if(bytes.toString('utf8',30,30+nameLength)!==entry.name||method!==entry.method||![0,8].includes(method)||entry.size>8*MiB||start+entry.compressed>bytes.length)throw Error('Scene entry mismatch');
  const compressed=bytes.subarray(start,start+entry.compressed);
  const data=method===0?Buffer.from(compressed):await inflate(compressed,{maxOutputLength:Math.max(1,entry.size)});
  if(data.length!==entry.size||crc32(data)!==entry.crc)throw Error('Scene integrity check failed');
  return data;
}

export function createSceneReader(catalog,{rangeReader=createRangeReader({source:catalog.source}),cacheBytes=16*MiB,maxPending=48,cooldownMs=30000,now=Date.now}={}){
  const entries=new Map(Object.entries(catalog.files)),cache=new Map(),pending=new Map();
  let bytes=0,tail=Promise.resolve(),closed=false,retryAt=0;
  function get(key){
    const entry=entries.get(key);if(!entry)return Promise.reject(Error('Unknown scene asset'));
    if(closed)return Promise.reject(Error('Scene reader closed'));
    if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return Promise.resolve(value);}
    if(pending.has(key))return pending.get(key);
    if(pending.size>=maxPending)return Promise.reject(Error('Scene queue full'));
    // Serialize remote reads and decompression to bound CPU and memory pressure.
    const task=tail.then(async()=>{
      if(closed)throw Error('Scene reader closed');
      if(now()<retryAt)throw Error('Scene source cooling down');
      let value;
      try{value=await decodeEntry(await rangeReader.read(entry.offset,entry.offset+entry.span-1),entry);}
      catch(error){retryAt=now()+cooldownMs;throw error;}
      if(closed)throw Error('Scene reader closed');
      if(value.length<=cacheBytes){
        while(bytes+value.length>cacheBytes&&cache.size){const first=cache.keys().next().value;bytes-=cache.get(first).length;cache.delete(first);}
        cache.set(key,value);bytes+=value.length;
      }
      return value;
    }).finally(()=>pending.delete(key));
    pending.set(key,task);tail=task.catch(()=>{});return task;
  }
  return {get,stats:()=>({cachedBytes:bytes,cached:cache.size,pending:pending.size}),close(){closed=true;rangeReader.close();cache.clear();bytes=0;}};
}

export function sceneManifest(catalog,origin=''){
  if(origin){const url=new URL(origin);if(url.protocol!=='https:'||url.username||url.password||url.origin!==origin)throw Error('Scene origin must be an HTTPS origin');}
  const manifest=structuredClone(catalog.manifest);
  for(const group of Object.values(manifest.groups))for(const entry of Object.values(group)){
    const key=entry.path.replace(/^\/assets\/local\//,'');
    if(!Object.hasOwn(catalog.files,key))throw Error('Scene manifest file missing');
    entry.path=origin+SCENE_PREFIX+key;
  }
  return manifest;
}

export async function loadSceneCatalog(){return JSON.parse(await readFile(new URL('./scene-catalog.json',import.meta.url),'utf8'));}
const types={json:'application/json',bin:'application/octet-stream',obj:'text/plain',webp:'image/webp',png:'image/png',jpg:'image/jpeg'};
export function createSceneHandler(catalog,{reader=createSceneReader(catalog)}={}){
  const manifest=Buffer.from(JSON.stringify(sceneManifest(catalog)));
  const handler=async(req,res)=>{
    const raw=req.url.split('?')[0],isManifest=raw==='/data/local-assets.json';
    if(!isManifest&&!raw.startsWith(SCENE_PREFIX))return false;
    res.setHeader('Access-Control-Allow-Origin','*'); // Public art only; no credentials or room state.
    res.setHeader('X-Content-Type-Options','nosniff');
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return true;}
    let key;try{key=decodeURIComponent(raw.slice(SCENE_PREFIX.length));}catch{res.writeHead(400);res.end();return true;}
    const entry=Object.hasOwn(catalog.files,key)?catalog.files[key]:null;
    if(!isManifest&&!entry){res.writeHead(404);res.end();return true;}
    try{
      const body=isManifest?manifest:req.method==='HEAD'?null:await reader.get(key);
      res.writeHead(200,{'Content-Type':isManifest?'application/json':types[key.split('.').at(-1)]||'application/octet-stream','Content-Length':isManifest?manifest.length:entry.size,'Cache-Control':isManifest?'no-cache':'public, max-age=31536000, immutable'});
      res.end(req.method==='HEAD'?undefined:body);
    }catch{res.writeHead(503,{'Cache-Control':'no-store','Retry-After':'30'});res.end('Optional scene asset unavailable');}
    return true;
  };
  handler.close=()=>reader.close();handler.stats=()=>reader.stats();return handler;
}

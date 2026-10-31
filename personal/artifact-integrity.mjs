// Build-time checks only. No game state, hosting access or external art requests.
import {createReadStream} from 'node:fs';
import {readFile,readdir,lstat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {VENDOR_FILES} from '../upstream/tools/vendor.mjs';

export const MANIFEST='artifact-manifest.json';
export const REQUIRED_FILES=[
  ...VENDOR_FILES.map(([,name])=>'vendor/'+name),
  'index.html','sw.js','data/assets.json','data/local-assets.json',
  'personal/build-info.json','personal/external-assets.json','personal/scene-import.json',
  'LICENSE','NOTICE.md','THIRD-PARTY-NOTICES.md','upstream/LICENSE',
  'upstream/NOTICE.md','upstream/THIRD-PARTY-NOTICES.md','licenses/README.md',
];

async function inventory(dir){
  const files={};
  async function walk(relative=''){
    const target=path.join(dir,relative),stat=await lstat(target);
    if(stat.isSymbolicLink())throw new Error('Symbolic link in static output: '+relative);
    if(stat.isDirectory()){
      for(const name of (await readdir(target)).sort())await walk(relative?relative+'/'+name:name);
    }else if(!stat.isFile())throw new Error('Non-regular static output: '+relative);
    else if(relative!==MANIFEST){
      const hash=createHash('sha256');
      for await(const chunk of createReadStream(target))hash.update(chunk);
      files[relative]={size:stat.size,sha256:hash.digest('hex')};
    }
  }
  await walk();return files;
}

async function checkEntrypoints(dir,files){
  const required=new Set(REQUIRED_FILES),html=await readFile(path.join(dir,'index.html'),'utf8');
  const local=value=>{
    const url=new URL(value,'https://artifact.invalid/');
    if(url.origin==='https://artifact.invalid')required.add(decodeURIComponent(url.pathname.slice(1)));
  };
  for(const tag of html.matchAll(/<(?:script|link)\b[^>]*>/gi)){
    const attr=/\b(?:src|href)\s*=\s*(["'])(.*?)\1/i.exec(tag[0]);if(attr)local(attr[2]);
  }
  const maps=[...html.matchAll(/<script\b[^>]*\btype\s*=\s*(["'])importmap\1[^>]*>([\s\S]*?)<\/script>/gi)];
  if(maps.length!==1)throw new Error('Expected one browser import map');
  const map=JSON.parse(maps[0][2]);
  for(const value of Object.values(map.imports||{}))local(value);
  const clients=[...required].filter(p=>/^personal\/local-client-[a-f0-9]{12}\.mjs$/.test(p));
  if(clients.length!==1)throw new Error('Missing hashed browser client entry');
  const client=await readFile(path.join(dir,clients[0]),'utf8');
  const workers=[...new Set(client.match(/personal\/local-server-[a-f0-9]{12}\.js/g)||[])];
  if(workers.length!==1)throw new Error('Missing hashed simulation worker reference');
  workers.forEach(p=>required.add(p));
  for(const file of required)if(!files[file]?.size)throw new Error('Missing or empty static dependency: '+file);
  for(const file of [...clients,...workers]){
    if(!file.includes('-'+files[file].sha256.slice(0,12)+'.'))throw new Error('Stale content hash in entry: '+file);
  }
}

export async function writeArtifactManifest(dir){
  const files=await inventory(dir);await checkEntrypoints(dir,files);
  await writeFile(path.join(dir,MANIFEST),JSON.stringify({version:1,files},null,2)+'\n');
}

export async function checkDist(dir){
  const manifestStat=await lstat(path.join(dir,MANIFEST));
  if(!manifestStat.isFile()||manifestStat.isSymbolicLink())throw new Error('Invalid artifact manifest file');
  const manifest=JSON.parse(await readFile(path.join(dir,MANIFEST),'utf8'));
  if(manifest.version!==1||!manifest.files||Array.isArray(manifest.files)||typeof manifest.files!=='object')throw new Error('Unsupported artifact manifest');
  const actual=await inventory(dir);await checkEntrypoints(dir,actual);
  for(const file of new Set([...Object.keys(manifest.files),...Object.keys(actual)])){
    const expected=manifest.files[file],found=actual[file];
    if(!expected)throw new Error('Unexpected static file: '+file);
    if(!found)throw new Error('Missing static file: '+file);
    if(found.size!==expected.size||found.sha256!==expected.sha256)throw new Error('Changed static file: '+file);
  }
  return {files:Object.keys(actual).length,manifest:MANIFEST};
}

export async function checkArchive(archive,dir,hosting){
  await checkDist(dir);
  // Python's standard tar reader handles GNU/BSD/PAX headers without extracting
  // anything. Read one member at a time, using the trusted local build manifest.
  const script=fileURLToPath(new URL('./check-archive.py',import.meta.url));
  try{
    return JSON.parse(execFileSync('python3',[script,path.resolve(archive),path.join(dir,MANIFEST),hosting],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024}));
  }catch(error){
    throw new Error(error.code==='ENOENT'?'Archive verification requires python3 on PATH':String(error.stderr||error.message).trim());
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2);
  try{
    if(args.length&&!(args.length===2&&args[0]==='--archive'))throw new Error('Usage: node personal/artifact-integrity.mjs [--archive /absolute/site.tar.gz]');
    const result=args.length?await checkArchive(args[1],path.join(root,'dist'),path.join(root,'.openai/hosting.json')):await checkDist(path.join(root,'dist'));
    console.log(JSON.stringify({passed:true,...result}));
  }catch(error){console.error(error.message);process.exitCode=1;}
}

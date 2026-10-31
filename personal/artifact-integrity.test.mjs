import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {writeArtifactManifest,checkDist,checkArchive,MANIFEST,REQUIRED_FILES} from './artifact-integrity.mjs';

const digest=data=>createHash('sha256').update(data).digest('hex').slice(0,12);
async function fixture(t){
  const root=await mkdtemp(path.join(tmpdir(),'sp-artifact-')),dist=path.join(root,'dist');
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const file of REQUIRED_FILES){await mkdir(path.dirname(path.join(dist,file)),{recursive:true});await writeFile(path.join(dist,file),'fixture\n');}
  const worker='postMessage("ready");',workerName=`personal/local-server-${digest(worker)}.js`;
  const client=`new Worker('/${workerName}');`,clientName=`personal/local-client-${digest(client)}.mjs`;
  await writeFile(path.join(dist,workerName),worker);await writeFile(path.join(dist,clientName),client);
  await writeFile(path.join(dist,'style.css'),'body{}');
  await writeFile(path.join(dist,'index.html'),`<script type="importmap">{"imports":{"preact":"/vendor/preact.module.js"}}</script>
    <link rel="stylesheet" href="/style.css?v=1"><link rel="stylesheet" href="https://external.invalid/font.css">
    <script type="module" src="/${clientName}"></script>`);
  const hosting=path.join(root,'hosting.json');await writeFile(hosting,JSON.stringify({project_id:'test-only',static:{directory:'dist'}}));
  await writeArtifactManifest(dist);return {root,dist,hosting,clientName,workerName};
}

// Test archives use Python's PAX writer. Production verification reads archives
// produced by either BSD/GNU tar or the Sites helper, without extracting them.
function archiveFixture(f,mutation={}){
  const output=path.join(f.root,'test.tar.gz');
  execFileSync('python3',['-c',String.raw`
import io,json,sys,tarfile
from pathlib import Path
args=json.load(sys.stdin); folder=Path(args['dist']); mutation=args['mutation']; target=mutation.get('path')
with tarfile.open(args['output'],'w:gz',format=tarfile.PAX_FORMAT) as archive:
    rows=[('dist/'+str(p.relative_to(folder)),p.read_bytes()) for p in sorted(folder.rglob('*')) if p.is_file()]
    rows.append(('dist/.openai/hosting.json',Path(args['hosting']).read_bytes()))
    for name,data in rows:
        if name==target:
            if mutation['kind']=='missing': continue
            if mutation['kind']=='corrupt': data=bytes([data[0]^1])+data[1:]
            if mutation['kind']=='size': data+=b'!'
            if mutation['kind']=='hosting': data=b'{"project_id":"wrong","static":{"directory":"dist"}}'
        item=tarfile.TarInfo(name);item.size=len(data)
        if name==target and mutation['kind'] in ['symlink','hardlink','directory']:
            item.type={'symlink':tarfile.SYMTYPE,'hardlink':tarfile.LNKTYPE,'directory':tarfile.DIRTYPE}[mutation['kind']]
            item.linkname='outside';item.size=0;archive.addfile(item)
        else: archive.addfile(item,io.BytesIO(data))
        if name==target and mutation['kind']=='duplicate': archive.addfile(item,io.BytesIO(data))
    if mutation.get('kind')=='extra':
        item=tarfile.TarInfo(target);item.size=1;archive.addfile(item,io.BytesIO(b'x'))
if mutation.get('kind')=='truncated':
    p=Path(args['output']);p.write_bytes(p.read_bytes()[:-8])
if mutation.get('kind')=='concatenated':
    tail=io.BytesIO()
    with tarfile.open(fileobj=tail,mode='w:gz') as archive:
        item=tarfile.TarInfo('dist/hidden-extra.js');item.size=1;archive.addfile(item,io.BytesIO(b'x'))
    with open(args['output'],'ab') as output: output.write(tail.getvalue())
`],{input:JSON.stringify({...f,output,mutation}),encoding:'utf8'});
  return output;
}

test('static integrity catches missing vendor, HTML and worker dependencies before sealing',async t=>{
  const f=await fixture(t);
  for(const file of [...REQUIRED_FILES.filter(p=>p.startsWith('vendor/')),'style.css',f.clientName,f.workerName]){
    const target=path.join(f.dist,file),original=await readFile(target);await rm(target);
    await assert.rejects(writeArtifactManifest(f.dist),undefined,file);
    await writeFile(target,original);
  }
  await writeFile(path.join(f.dist,'vendor/preact.module.js'),'');
  await assert.rejects(writeArtifactManifest(f.dist),/empty static dependency/);
});

test('static integrity rejects stale hash names, changed files, extras and symbolic links',async t=>{
  const f=await fixture(t),target=path.join(f.dist,f.workerName),original=await readFile(target);
  await writeFile(target,'postMessage("stale");');await assert.rejects(writeArtifactManifest(f.dist),/Stale content hash/);await writeFile(target,original);
  const style=path.join(f.dist,'style.css');await writeFile(style,'body[]');await assert.rejects(checkDist(f.dist),/Changed static file/);await writeFile(style,'body{}');
  await writeFile(path.join(f.dist,'qa-probe.js'),'test');await assert.rejects(checkDist(f.dist),/Unexpected static file/);await rm(path.join(f.dist,'qa-probe.js'));
  await rm(style);await symlink(path.join(f.dist,'index.html'),style);await assert.rejects(checkDist(f.dist),/Symbolic link/);await rm(style);await writeFile(style,'body{}');
  assert.ok((await checkDist(f.dist)).files>20);
});

test('actual tar.gz gate accepts a complete archive and rejects incomplete or altered delivery',async t=>{
  const f=await fixture(t);
  assert.ok((await checkArchive(archiveFixture(f),f.dist,f.hosting)).files>20);
  for(const [kind,p,error] of [
    ...['preact.module.js','hooks.module.js','htm.module.js','pixi.min.js','pixi-spine.js','three.module.js','three.core.js','ses.umd.js','acorn.mjs']
      .map(name=>['missing','vendor/'+name,/Missing archive files/]),
    ['missing',f.workerName,/Missing archive files/],['missing','LICENSE',/Missing archive files/],
    ['missing',MANIFEST,/Missing archive files/],['missing','.openai/hosting.json',/Missing archive files/],
    ['corrupt','vendor/preact.module.js',/Wrong archive file hash/],['size','style.css',/Wrong archive file size/],
    ['corrupt',MANIFEST,/Wrong archive file hash/],['hosting','.openai/hosting.json',/Hosting metadata differs/],
    ['symlink','vendor/preact.module.js',/Non-regular/],['hardlink','vendor/preact.module.js',/Non-regular/],
    ['directory','vendor/preact.module.js',/Expected file/],['duplicate','index.html',/Duplicate archive entry/],
    ['directory','.openai/hosting.json',/Expected file/],
    ['extra','qa-probe.js',/Unexpected archive file/],['extra','../escape',/Unsafe archive path/],
  ])await t.test(kind+': '+p,async()=>{
    await assert.rejects(checkArchive(archiveFixture(f,{kind,path:'dist/'+p}),f.dist,f.hosting),error);
  });
  await assert.rejects(checkArchive(archiveFixture(f,{kind:'extra',path:'/absolute'}),f.dist,f.hosting),/Unsafe archive path/);
  await assert.rejects(checkArchive(archiveFixture(f,{kind:'truncated'}),f.dist,f.hosting),/end-of-stream|Compressed file ended/);
  await assert.rejects(checkArchive(archiveFixture(f,{kind:'concatenated'}),f.dist,f.hosting),/Unexpected archive file/);
});

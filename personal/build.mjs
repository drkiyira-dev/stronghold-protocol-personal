import {cp, mkdir, writeFile, readFile, readdir, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {buildFonts} from '../upstream/tools/assets/fonts.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
await mkdir(dist, {recursive:true});
// Keep downloaded, ignored art intact between builds.
for (const [from,to] of [['public',''],['shared','shared'],['server/sim','sim'],['data','data']]) {
  await cp(path.join(root,'upstream',from), path.join(dist,to), {recursive:true, filter: source => !/(?:\/assets|\/fonts)(?:\/|$)/.test(source)});
}
await cp(path.join(root,'personal/templates'),dist,{recursive:true});
await mkdir(path.join(dist,'personal'),{recursive:true});
for (const name of ['local-client.mjs','personal.css','skeleton-codec.mjs']) await cp(path.join(root,'personal',name),path.join(dist,'personal',name));
for (const name of ['LICENSE','NOTICE.md']) await cp(path.join(root,name),path.join(dist,name));
for (const [file,value] of Object.entries({
  'healthz':{ok:true,build:'personal-1',content:{plugins:0,notices:false},personal:true},
  'data/local-assets.json':{groups:{}},
  'plugins/index.json':{version:1,plugins:[]},
})) {
  await mkdir(path.dirname(path.join(dist,file)),{recursive:true});
  await writeFile(path.join(dist,file),JSON.stringify(value));
}
await mkdir(path.join(dist,'packs'),{recursive:true});
execFileSync(process.execPath,[path.join(root,'upstream/tools/packs.mjs'),'index'],{cwd:path.join(root,'upstream'),stdio:'inherit'});
await cp(path.join(root,'upstream/packs/index.json'),path.join(dist,'packs/index.json'));
await buildFonts(path.join(dist,'fonts'));
await import('./normalize-cached-atlas.mjs');
await import('./optimize-package.mjs');
await import('./compress-skeletons.mjs');
await import('./build-worker.mjs');
// Content names prevent an older open tab from reusing an outdated engine.
for (const name of await readdir(path.join(dist,'personal'))) if (/^local-(server|client)-[a-f0-9]{12}\.(js|mjs)$/.test(name)) await rm(path.join(dist,'personal',name));
const hash = value => createHash('sha256').update(value).digest('hex').slice(0,12);
const workerCode = await readFile(path.join(dist,'personal/local-server.js'));
const workerName = `local-server-${hash(workerCode)}.js`;
await writeFile(path.join(dist,'personal',workerName),workerCode);
let clientCode = await readFile(path.join(dist,'personal/local-client.mjs'),'utf8');
clientCode = clientCode.replace('/personal/local-server.js',`/personal/${workerName}`);
clientCode = clientCode.replace('./skeleton-codec.mjs', './skeleton-codec.mjs?v='+hash(await readFile(path.join(dist,'personal/skeleton-codec.mjs'))));
const clientName = `local-client-${hash(clientCode)}.mjs`;
await writeFile(path.join(dist,'personal',clientName),clientCode);
let html = await readFile(path.join(dist,'index.html'),'utf8');
html = html.replace('/personal/local-client.mjs',`/personal/${clientName}`);
html = html.replace('/personal/personal.css','/personal/personal.css?v='+hash(await readFile(path.join(dist,'personal/personal.css'))));
await writeFile(path.join(dist,'index.html'),html);
console.log('Personal build ready in dist/');

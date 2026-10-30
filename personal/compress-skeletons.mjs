import {readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import path from 'node:path';
const root = path.resolve(import.meta.dirname,'..');
const dist = path.join(root,'dist');
let rawBytes=0,storedBytes=0,count=0;
async function compress(directory) {
  for (const item of await readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,item.name);
    if (item.isDirectory()) {await compress(file);continue;}
    if (!item.name.endsWith('.skel')) continue;
    const existing=await readFile(file);
    const raw=existing[0]===0x1f&&existing[1]===0x8b?gunzipSync(existing):existing;
    const packed=gzipSync(raw,{level:9});
    if (!gunzipSync(packed).equals(raw)) throw new Error(`Skeleton roundtrip failed: ${file}`);
    const backup=path.join(root,'.cache/art-originals',path.relative(dist,file));
    await mkdir(path.dirname(backup),{recursive:true});
    await writeFile(backup,raw);
    if (!existing.equals(packed)) await writeFile(file,packed);
    rawBytes+=raw.length;storedBytes+=packed.length;count++;
  }
}
await compress(path.join(dist,'assets/spine'));
// These belong to the upstream developer tools or disabled historical modes.
for(const directory of ['dev','studio','data/versions']) await rm(path.join(dist,directory),{recursive:true,force:true});
console.log(JSON.stringify({compressedSkeletons:count,originalMiB:Math.round(rawBytes/1048576),storedMiB:Math.round(storedBytes/1048576)}));

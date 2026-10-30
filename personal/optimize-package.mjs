// Keep every gameplay asset; large reference pictures use their recorded public
// origin. This keeps the private static archive below Sites' 256 MiB limit.
import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname,'..');
const selected = p => p.startsWith('/assets/char/portrait/') || p.startsWith('/assets/ui/guide/');
const report = JSON.parse(await readFile(path.join(root,'personal/asset-cache-report.json'),'utf8'));
const sources = new Map(report.records.filter(x => selected(x.path)).map(x => [x.path,x.source]));
const manifestPath = path.join(root,'dist/data/assets.json');
const manifest = JSON.parse(await readFile(manifestPath,'utf8'));
const replaced = new Set();
function transform(value) {
  if (typeof value === 'string' && selected(value)) {
    const source = sources.get(value);
    if (!source || !source.startsWith('https://raw.githubusercontent.com/')) throw new Error(`Missing recorded image origin: ${value}`);
    replaced.add(value); return source;
  }
  if (Array.isArray(value)) return value.map(transform);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,transform(child)]));
  return value;
}
await writeFile(manifestPath,JSON.stringify(transform(manifest)));
let movedBytes = 0;
for (const relative of replaced) {
  const from = path.join(root,'dist',relative);
  const to = path.join(root,'.cache/art-originals',relative);
  try {
    const info = await stat(from);
    await mkdir(path.dirname(to),{recursive:true});
    await rename(from,to);
    movedBytes += info.size;
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
console.log(JSON.stringify({referenceImagesFromPublicOrigin:replaced.size,movedMiB:Math.round(movedBytes/1048576)}));

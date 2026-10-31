// Explicit metadata refresh only. Not part of npm build; fetches ~5 MiB of ZIP
// index and ~22 KiB of compressed manifest, never the 861 MB art archive.
import {writeFile} from 'node:fs/promises';
import {RELEASE,ZIP_ROOT,createRangeReader,decodeEntry,sceneManifest} from './scene-assets.mjs';
const reader=createRangeReader();
try{
  const tail=await reader.read(RELEASE.size-65536,RELEASE.size-1),eocd=tail.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  if(eocd<0||tail.readUInt16LE(eocd+4)!==0||tail.readUInt16LE(eocd+6)!==0)throw Error('Unsupported ZIP directory');
  const count=tail.readUInt16LE(eocd+10),size=tail.readUInt32LE(eocd+12),offset=tail.readUInt32LE(eocd+16);
  const directory=await reader.read(offset,offset+size-1),entries=[];
  for(let i=0;i<directory.length;){
    if(directory.readUInt32LE(i)!==0x02014b50)throw Error('Invalid central directory');
    const n=directory.readUInt16LE(i+28),x=directory.readUInt16LE(i+30),c=directory.readUInt16LE(i+32);
    entries.push({name:directory.toString('utf8',i+46,i+46+n),method:directory.readUInt16LE(i+10),crc:directory.readUInt32LE(i+16),compressed:directory.readUInt32LE(i+20),size:directory.readUInt32LE(i+24),offset:directory.readUInt32LE(i+42)});i+=46+n+x+c;
  }
  if(entries.length!==count)throw Error('Directory count mismatch');
  entries.sort((a,b)=>a.offset-b.offset);entries.forEach((e,i)=>e.span=(entries[i+1]?.offset??offset)-e.offset);
  const entry=entries.find(e=>e.name==='Stronghold-Protocol/data/local-assets.json');
  const original=JSON.parse(await decodeEntry(await reader.read(entry.offset,entry.offset+entry.span-1),entry));
  const catalog={source:RELEASE,manifest:{version:original.version,source:'upstream-release-v0.3.3',groups:Object.fromEntries(Object.entries(original.groups).filter(([g])=>/^(scene|map|mesh)\//.test(g)))},files:Object.fromEntries(entries.filter(e=>e.name.startsWith(ZIP_ROOT)&&/^(scene|map|mesh)\//.test(e.name.slice(ZIP_ROOT.length))&&e.size).map(e=>[e.name.slice(ZIP_ROOT.length),e]))};
  sceneManifest(catalog); // Every declared file must have a pinned range.
  await writeFile(new URL('./scene-catalog.json',import.meta.url),JSON.stringify(catalog,null,2)+'\n');
  console.log(`Pinned ${Object.keys(catalog.files).length} optional board/scene files; no art binaries saved.`);
}finally{reader.close();}

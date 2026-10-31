import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {publishLicenses} from './licenses-build.mjs';
test('static distribution retains linked upstream notices and bundled-worker licence supplements verbatim',async()=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),out=await mkdtemp(path.join(tmpdir(),'sp-licences-'));
  try{
    await publishLicenses(root,out);
    for(const file of ['LICENSE','NOTICE.md','upstream/LICENSE','upstream/NOTICE.md','upstream/THIRD-PARTY-NOTICES.md']){
      assert.deepEqual(await readFile(path.join(out,file)),await readFile(path.join(root,file)));
    }
    assert.deepEqual(await readFile(path.join(out,'THIRD-PARTY-NOTICES.md')),await readFile(path.join(root,'upstream/THIRD-PARTY-NOTICES.md')));
    const index=await readFile(path.join(out,'licenses/README.md'),'utf8');
    for(const file of ['ses/LICENSE','ses/LICENSE-aura','ses/LICENSE-caja','ses/LICENSE-corejs','ses/LICENSE-v8','acorn/LICENSE','@endo/cache-map/LICENSE','@endo/env-options/LICENSE','@endo/immutable-arraybuffer/LICENSE']){
      assert.ok(index.includes(']('+file+')'));
      assert.deepEqual(await readFile(path.join(out,'licenses',file)),await readFile(path.join(root,'node_modules',file)));
    }
  }finally{await rm(out,{recursive:true,force:true});}
});

// Regression for the v8 incident: installed dependencies alone, no postinstall
// output. The isolated checkout cannot borrow vendor files from this worktree.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,symlink,writeFile,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {checkDist,MANIFEST} from './artifact-integrity.mjs';

test('clean checkout builds all browser vendors with reused dependencies and rejects missing installs',async t=>{
  const root=fileURLToPath(new URL('../',import.meta.url)),clean=await mkdtemp(path.join(tmpdir(),'sp-clean-build-'));
  t.after(()=>rm(clean,{recursive:true,force:true}));
  const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
  for(const file of new Set(files)){
    const dest=path.join(clean,file);await mkdir(path.dirname(dest),{recursive:true});await copyFile(path.join(root,file),dest);
  }
  for(const dir of ['node_modules','upstream/node_modules'])await symlink(path.join(root,dir),path.join(clean,dir),'dir');
  await assert.rejects(access(path.join(clean,'upstream/public/vendor/preact.module.js')));
  await mkdir(path.join(clean,'dist/vendor'),{recursive:true});
  await writeFile(path.join(clean,'dist/vendor/preact.module.js'),'stale library');
  await writeFile(path.join(clean,'dist/qa-probe.js'),'stale test probe');
  const run=()=>spawnSync(process.execPath,['personal/build.mjs'],{cwd:clean,encoding:'utf8',timeout:120000,env:{...process.env,PERSONAL_SCENE_ORIGIN:''}});
  const built=run();assert.equal(built.status,0,built.stderr);assert.match(built.stdout,/Personal build ready/);
  await checkDist(path.join(clean,'dist'));
  await assert.rejects(access(path.join(clean,'dist/qa-probe.js')));
  const vendor=await readFile(path.join(clean,'dist/vendor/preact.module.js'),'utf8');assert.notEqual(vendor,'stale library');
  for(const file of ['preact.module.js','hooks.module.js','htm.module.js','pixi.min.js','pixi-spine.js','three.module.js','three.core.js','ses.umd.js','acorn.mjs']){
    assert.ok((await readFile(path.join(clean,'dist/vendor',file))).length>100);
  }
  await rm(path.join(clean,'upstream/node_modules')); // Only our temporary symlink.
  await mkdir(path.join(clean,'upstream/node_modules'));
  for(const pkg of ['ses','acorn','pixi.js','pixi-spine','preact','htm']){
    await symlink(path.join(root,'upstream/node_modules',pkg),path.join(clean,'upstream/node_modules',pkg),'dir');
  }
  // Upstream treats Three as optional. The enhanced static build requires it;
  // previously generated Three files must not conceal an incomplete install.
  const noThree=run();assert.notEqual(noThree.status,0);assert.match(noThree.stderr,/Missing browser libraries: three\.core\.js, three\.module\.js/);
  await assert.rejects(access(path.join(clean,'dist',MANIFEST)));
  await rm(path.join(clean,'upstream/node_modules'),{recursive:true});
  const failed=run();assert.notEqual(failed.status,0);assert.match(failed.stderr,/npm --prefix upstream ci --omit=dev/);
  await assert.rejects(access(path.join(clean,'dist',MANIFEST)),'a failed rebuild leaves no apparently valid old manifest');
});

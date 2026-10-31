import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('local plugins stay private while upstream plugin sources and templates remain trackable',()=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  for(const [file,ignored] of [
    ['plugins/private/plugin.json',true],['plugins/config.json',true],
    ['upstream/plugins/private/plugin.json',true],['upstream/plugins/config.json',true],
    ['upstream/plugins/README.md',false],['upstream/plugins/AGENTS.md',false],
    ['upstream/plugins/_template/content/plugin.json',false],
    ['upstream/test/plugins/manifest.test.js',false],['upstream/shared/plugins/manifest.js',false],
  ]){
    const result=spawnSync('git',['check-ignore','-q','--no-index',file],{cwd:root,encoding:'utf8'});
    assert.ifError(result.error);
    assert.equal(result.status,ignored?0:1,`${file}: ${result.stderr}`);
  }
});

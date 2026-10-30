import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIdentity,replaceContract,verifyNoUntrackedEngineFiles} from './build-identity.mjs';
test('locked upstream runtime and content have reproducible identities',async()=>{
  const a=await buildIdentity(),b=await buildIdentity();assert.deepEqual(a,b);
  assert.match(a.engineHash,/^[a-f0-9]{64}$/);await verifyNoUntrackedEngineFiles();
});
test('an upstream change cannot silently pass the baseline or adapter check',async()=>{
  await assert.rejects(buildIdentity({lock:{files:{'engine.js':'old'}},read:async()=>Buffer.from('changed')}),/baseline changed/);
  assert.throws(()=>replaceContract('changed','import(path)','patched','dynamic import'),/contract changed/);
  assert.throws(()=>replaceContract('x x','x','patched','ambiguous'),/2 matches/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {decodeSkeletonResponse} from './skeleton-codec.mjs';
test('skeleton transport restores every byte and passes through plain files and errors',async()=>{
  const raw=Uint8Array.from({length:10000},(_,i)=>i%251);
  const packed=new Response(gzipSync(raw),{headers:{'content-type':'application/octet-stream'}});
  assert.deepEqual(new Uint8Array(await (await decodeSkeletonResponse(packed)).arrayBuffer()),raw);
  const plain=new Response(raw);
  assert.equal(await decodeSkeletonResponse(plain),plain);
  const missing=new Response('missing',{status:404});
  assert.equal(await decodeSkeletonResponse(missing),missing);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createRestoreSession} from './restore-session.mjs';

const snapshot={runId:'run_'+'a'.repeat(32),round:2};
test('timed-out worker acknowledgements and subsequent automatic frames cannot replace progress',async()=>{
  const sent=[];let timeout,committed=false;
  const r=createRestoreSession({send:m=>sent.push(m),commit:()=>{committed=true;},setTimer:fn=>{timeout=fn;return 1;},clearTimer:()=>{}});
  const result=r.start(snapshot),rejection=assert.rejects(result,/超时/);
  timeout();await rejection;
  assert.equal(r.receive({t:'local.restored',requestId:sent[0].requestId,snapshot}),false);
  assert.equal(r.accepts({restoreRequestId:sent[0].requestId}),false);
  assert.equal(committed,false);
});
test('only a matching successful restore commits active progress; stale and failed frames do not',async()=>{
  const sent=[],commits=[];const r=createRestoreSession({send:m=>sent.push(m),commit:s=>{commits.push(s);return s;}});
  const failed=r.start(snapshot);const rejected=assert.rejects(failed,/invalid/);
  assert.equal(commits.length,0);assert.equal(r.accepts({restoreRequestId:sent[0].requestId}),false);
  r.receive({t:'local.restore-error',requestId:sent[0].requestId,message:'invalid'});await rejected;
  const good=r.start(snapshot),id=sent[1].requestId;
  assert.equal(r.receive({t:'local.restored',requestId:sent[0].requestId,snapshot}),false);
  assert.equal(commits.length,0);
  r.receive({t:'local.restored',requestId:id,snapshot});
  r.receive({t:'local.restored',requestId:id,snapshot});
  assert.deepEqual(await good,snapshot);assert.equal(commits.length,1);
  assert.equal(r.accepts({restoreRequestId:id}),true);
  assert.equal(r.accepts({restoreRequestId:sent[0].requestId}),false);
});
test('failed persistence or wrong run confirmation cannot activate later automatic checkpoints',async()=>{
  const sent=[];let active='previous';
  const r=createRestoreSession({send:m=>sent.push(m),commit:()=>{throw new Error('QuotaExceededError');}});
  const failed=r.start(snapshot).then(v=>{active=v;});
  const rejection=assert.rejects(failed,/Quota/);
  r.receive({t:'local.restored',requestId:sent[0].requestId,snapshot});await rejection;
  assert.equal(active,'previous');assert.equal(r.accepts({restoreRequestId:sent[0].requestId}),false);
  const wrong=r.start(snapshot),bad=assert.rejects(wrong,/不一致/);
  r.receive({t:'local.restored',requestId:sent[1].requestId,snapshot:{...snapshot,runId:'run_'+'b'.repeat(32)}});await bad;
});

import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {openRoomStore,supportedSqlite} from './room-store.mjs';
import {DatabaseSync} from 'node:sqlite';
test('durable room transactions preserve last commit, reject stale revisions, encrypt secrets and back up consistently',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'stronghold-store-'));let store;let fail=false;
 try{store=openRoomStore(path.join(root,'state'),{beforeCommit:()=>{if(fail)throw new Error('injected write failure');}});
  assert.deepEqual(store.settings(),{journal:'wal',synchronous:2});assert.throws(()=>openRoomStore(path.join(root,'state')),/writer/);
  const first=store.commit('ABCD',{snapshot:{round:2},credentials:[{token:'never-plaintext'}]},{expectedRevision:0});assert.equal(first.revision,1);
  fail=true;assert.throws(()=>store.commit('ABCD',{snapshot:{round:3}}),/injected/);fail=false;assert.equal(store.loadAll()[0].value.snapshot.round,2);
  assert.throws(()=>store.commit('ABCD',{}, {expectedRevision:0}),/Stale/);
  await store.backupTo(path.join(root,'backup'));store.close();store=null;
  for(const f of ['rooms.sqlite'])assert.ok(!(await readFile(path.join(root,'state',f))).includes(Buffer.from('never-plaintext')));
  store=openRoomStore(path.join(root,'state'));assert.equal(store.loadAll()[0].value.credentials[0].token,'never-plaintext');store.close();store=null;
  store=openRoomStore(path.join(root,'backup'));assert.equal(store.loadAll()[0].value.credentials[0].token,'never-plaintext');store.close();store=null;
  assert.ok((await readFile(path.join(root,'backup','recovery.key'))).length===32);
  assert.equal(supportedSqlite('3.51.2'),false);assert.equal(supportedSqlite('3.52.0'),false);assert.equal(supportedSqlite('3.53.4'),true);
 }finally{store?.close();await rm(root,{recursive:true,force:true});}
});
test('corrupt rows are isolated and cannot turn a completed room into a live PREP',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'stronghold-corrupt-'));let store;
 try{store=openRoomStore(root);store.commit('GOOD',{snapshot:{round:1}});store.commit('DONE',{snapshot:{round:9}},{status:'complete'});store.close();store=null;
  const db=new DatabaseSync(path.join(root,'rooms.sqlite'));db.prepare("UPDATE rooms SET status='prep' WHERE code='DONE'").run();db.close();
  store=openRoomStore(root);const rows=store.loadAll();assert.equal(rows.find(r=>r.code==='GOOD').value.snapshot.round,1);assert.equal(rows.find(r=>r.code==='DONE').status,'blocked');
 }finally{store?.close();await rm(root,{recursive:true,force:true});}
});

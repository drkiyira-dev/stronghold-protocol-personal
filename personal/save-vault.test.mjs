import test from 'node:test';import assert from 'node:assert/strict';
import {makeMatch} from '../upstream/test/match/harness.js';
import {captureCheckpoint,checkpointCompatibility} from './checkpoint.mjs';
import {createSaveVault,LEGACY_SAVE_KEY,VAULT_KEYS,saveCompatibility} from './save-vault.mjs';
import {sha256Hex} from '../upstream/shared/sha256.js';
const h=makeMatch({mode:'solo',seed:812,botRehearsal:0});h.start();h.toPrep(1);const original=captureCheckpoint(h.m),compat=checkpointCompatibility(h.m.data);h.m.dispose();
function storage(){const map=new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
const snapshot=(n)=>({...structuredClone(original),state:{...structuredClone(original.state),testRevision:n}});
test('old PREP saves migrate without deleting the original, and export/import preserves every RNG/state field',()=>{
 const s=storage();s.setItem(LEGACY_SAVE_KEY,JSON.stringify(original));const a=createSaveVault(s);assert.deepEqual(a.active(),original);assert.equal(a.list().length,1);assert.ok(s.getItem(LEGACY_SAVE_KEY));const b=createSaveVault(storage());b.import(a.export());assert.deepEqual(b.active(),original);assert.equal(saveCompatibility(b.active(),compat).ok,true);
});
test('corrupt newest journal falls back to previous snapshot; quota failure cannot destroy it',()=>{
 const s=storage(),v=createSaveVault(s);v.save(original);v.save(snapshot(2));const key=VAULT_KEYS[0];s.setItem(key,s.getItem(key).replace('"checksum":"','"checksum":"x'));const recovered=createSaveVault(s);assert.deepEqual(recovered.active(),original);assert.match(recovered.warning(),/损坏/);s.setItem=()=>{throw new Error('QuotaExceededError');};assert.throws(()=>recovered.save(snapshot(3)),/Quota/);assert.deepEqual(recovered.active(),original);
});
test('incompatible engines are retained/exportable and two broken journals are never overwritten',()=>{
 const s=storage(),v=createSaveVault(s);v.save({...original,engine:'future-version'});assert.equal(saveCompatibility(v.active(),compat).ok,false);assert.match(v.export(),/future-version/);s.setItem(VAULT_KEYS[0],'broken');s.setItem(VAULT_KEYS[1],'also broken');const blocked=createSaveVault(s),raw=blocked.exportRaw();assert.throws(()=>blocked.save(original),/保护原数据/);assert.equal(blocked.exportRaw(),raw);
});
test('completion retains backups; independent tab vaults merge the latest journal before writing',()=>{
 const s=storage(),a=createSaveVault(s),b=createSaveVault(s);a.save(original,{manual:true});b.save(snapshot(2));a.save(snapshot(3));b.complete(snapshot(3));assert.equal(b.active(),null);assert.equal(a.list().length,3);assert.ok(a.list().some(x=>x.manual));for(let i=4;i<10;i++)a.save(snapshot(i));assert.equal(a.list().length,4);
});
test('future envelope versions and tampered exports are rejected without changing current saves',()=>{
 const s=storage(),v=createSaveVault(s);v.save(original);const before=v.export();const body=JSON.stringify({version:99});assert.throws(()=>v.import(JSON.stringify({kind:'stronghold-save-vault',body,checksum:sha256Hex(body)})),/版本/);assert.throws(()=>v.import(before.replace('"checksum":"','"checksum":"bad')),/校验/);assert.equal(v.export(),before);
});
test('explicit repair import archives corrupt originals; pinning an old snapshot does not change active progress',()=>{
 const s=storage();s.setItem(VAULT_KEYS[0],'bad-a');s.setItem(VAULT_KEYS[1],'bad-b');const v=createSaveVault(s);v.import(JSON.stringify(original));assert.deepEqual(v.active(),original);assert.match(v.exportRaw(),/bad-a/);assert.match(v.exportRaw(),/bad-b/);v.save(snapshot(9));v.save(original,{manual:true,activate:false});assert.deepEqual(v.active(),snapshot(9));
});

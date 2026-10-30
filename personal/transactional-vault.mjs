import {createSaveVault,VAULT_KEYS,LEGACY_SAVE_KEY,RECOVERY_KEY} from './save-vault.mjs';
import {sha256Hex} from '../upstream/shared/sha256.js';
export const VAULT_DB='stronghold.personal.vault';
const keys=[...VAULT_KEYS,LEGACY_SAVE_KEY,RECOVERY_KEY];
const copy=v=>structuredClone(v);
function view(raw){const map=new Map(Object.entries(raw));return {map,vault:createSaveVault({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)})};}
export function planVaultMigration(raw,now=Date.now()){
  const original=copy(raw),v=view(raw); // Reuse the validated legacy codec; never modify the source storage.
  return {version:3,revision:0,raw:Object.fromEntries(v.map),sourceDigest:sha256Hex(JSON.stringify(original)),
    migration:{id:'vault-v2-to-v3',at:now,original,sourceDigest:sha256Hex(JSON.stringify(original))},receipts:[]};
}
export async function createTransactionalVault(indexedDB,legacy,{onChange=()=>{},channel=true}={}){
  if(!indexedDB)throw new Error('浏览器不支持事务存档；旧原文已保留，请先导出或使用支持 IndexedDB 的浏览器。');
  const readLegacy=()=>Object.fromEntries(keys.map(k=>[k,legacy.getItem(k)]));
  const source=readLegacy(),candidate=planVaultMigration(source);
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(VAULT_DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('vault');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('存档数据库被旧标签页占用，请关闭旧标签页'));});
  let cached,closed=false;const subscribers=new Set([onChange]);
  const notify=()=>{for(const fn of subscribers)try{fn();}catch{/* Observers cannot fail an already committed transaction. */}};
  const bus=channel&&typeof BroadcastChannel==='function'?new BroadcastChannel(VAULT_DB):null;
  function transact(action,{reconcile=false}={}){return new Promise((resolve,reject)=>{
    const tx=db.transaction('vault','readwrite'),store=tx.objectStore('vault'),request=store.get('active');let next,result;
    request.onsuccess=()=>{try{
      const current=request.result || candidate;
      if(current.version!==3)throw new Error('不支持此事务存档版本，已保留原文');
      if(!current.raw||!current.migration?.original||sha256Hex(JSON.stringify(current.migration.original))!==current.migration.sourceDigest)throw new Error('迁移原始副本校验失败；已停止写入并保留数据库');
      if(action&&!reconcile&&sha256Hex(JSON.stringify(readLegacy()))!==current.sourceDigest)throw new Error('旧版本标签页修改了存档。已停止写入，请关闭旧标签页并在保险库确认归档冲突。');
      next=copy(current);
      if(action){result=action(next);next.revision=current.revision+1;}
      if(!request.result||action)store.put(next,'active');
    }catch(e){tx.abort();reject(e);}};
    tx.oncomplete=()=>{cached=next;if(action&&!closed){try{bus?.postMessage({revision:cached.revision});}catch{}notify();}resolve(result);};
    tx.onabort=()=>reject(tx.error || new Error('存档事务未提交；原活动进度未改变'));tx.onerror=()=>{};
  });}
  try{await transact();}catch(e){bus?.close();db.close();throw e;}
  const reload=()=>new Promise((resolve,reject)=>{const tx=db.transaction('vault'),r=tx.objectStore('vault').get('active');r.onsuccess=()=>{if(r.result?.version===3&&r.result.revision>=cached.revision)cached=r.result;resolve();};r.onerror=()=>reject(r.error);});
  bus?.addEventListener('message',()=>{if(!closed)reload().then(notify).catch(()=>{});});
  db.onversionchange=()=>{closed=true;db.close();notify();};
  const mutate=(method,args)=>transact(next=>{const v=view(next.raw),result=v.vault[method](...args);next.raw=Object.fromEntries(v.map);
    if(method==='save'){next.receipts=[...next.receipts,{revision:next.revision+1,operation:'checkpoint',runId:result.runId,round:result.snapshot.round,digest:sha256Hex(JSON.stringify(result.snapshot.state)),at:Date.now()}].slice(-20);}
    return result;
  });
  return {
    list:()=>view(cached.raw).vault.list(),active:()=>view(cached.raw).vault.active(),warning:()=>closed?'数据库连接已过期，请刷新后继续。':view(cached.raw).vault.warning(),
    save:(...a)=>mutate('save',a),complete:(...a)=>mutate('complete',a),select:(...a)=>mutate('select',a),
    import:raw=>mutate('import',[raw]),export:()=>view(cached.raw).vault.export(),exportOne:id=>view(cached.raw).vault.exportOne(id),
    exportRaw:()=>JSON.stringify({version:3,current:cached,legacyNow:readLegacy()}),
    migration:()=>({id:cached.migration.id,at:cached.migration.at,sourceDigest:cached.migration.sourceDigest,revision:cached.revision,receipts:copy(cached.receipts)}),
    legacyConflict:()=>sha256Hex(JSON.stringify(readLegacy()))!==cached.sourceDigest,
    reconcileLegacy:()=>transact(next=>{
      const raw=readLegacy(),digest=sha256Hex(JSON.stringify(raw));if(digest===next.sourceDigest)return;
      if((next.legacyArchives?.length || 0)>=3)throw new Error('旧页冲突归档已达 3 份；请先导出完整原始数据');
      next.legacyArchives=[...(next.legacyArchives || []),{raw,digest,at:Date.now()}];next.sourceDigest=digest;
      next.receipts=[...next.receipts,{revision:next.revision+1,operation:'archive-old-tab-write',at:Date.now()}].slice(-20);
    },{reconcile:true}),
    rollbackMigration:()=>transact(next=>{next.rollbackBackup=copy(next.raw);next.raw=copy(next.migration.original);next.receipts.push({revision:next.revision+1,operation:'rollback-migration',at:Date.now()});next.receipts=next.receipts.slice(-20);}),
    undoRollback:()=>transact(next=>{if(!next.rollbackBackup)throw new Error('没有回退前备份');const previous=copy(next.raw);next.raw=next.rollbackBackup;next.rollbackBackup=previous;}),
    reload,subscribe:fn=>{subscribers.add(fn);return()=>subscribers.delete(fn);},
    close(){closed=true;bus?.close();db.close();},
  };
}

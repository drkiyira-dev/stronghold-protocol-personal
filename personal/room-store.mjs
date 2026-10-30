import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,readFileSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv,randomUUID} from 'node:crypto';
export function supportedSqlite(version){const [a,b,c]=version.split('.').map(Number);return a>3||a===3&&(b>=53||b===51&&c>=3);}
export function openRoomStore(directory,{now=Date.now,beforeCommit=()=>{}}={}){
  mkdirSync(directory,{recursive:true,mode:0o700});
  const filename=path.join(directory,'rooms.sqlite'),keyFile=path.join(directory,'recovery.key'),existing=existsSync(filename);
  if(!existsSync(keyFile)){if(existing)throw new Error('Recovery key missing; existing room data was not modified');writeFileSync(keyFile,randomBytes(32),{mode:0o600,flag:'wx'});}
  const key=readFileSync(keyFile);if(key.length!==32)throw new Error('Invalid recovery key');
  const db=new DatabaseSync(filename,{timeout:1000});chmodSync(filename,0o600);
  const sqlite=db.prepare('SELECT sqlite_version() AS version').get().version;
  if(!supportedSqlite(sqlite)){db.close();throw new Error('Recovery requires patched SQLite 3.51.3 or >=3.53.0');}
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
  db.exec('CREATE TABLE IF NOT EXISTS writer (id INTEGER PRIMARY KEY CHECK(id=1), pid INTEGER NOT NULL, owner TEXT NOT NULL); CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, revision INTEGER NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, updated INTEGER NOT NULL);');
  const owner=randomUUID();let closed=false;
  const encrypt=(code,value)=>{const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from(code));const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return JSON.stringify({v:1,iv:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:bytes.toString('base64')});};
  const decrypt=(code,raw)=>{const e=JSON.parse(raw);if(e.v!==1)throw new Error('Unknown envelope');const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(e.iv,'base64'));decipher.setAAD(Buffer.from(code));decipher.setAuthTag(Buffer.from(e.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(e.data,'base64')),decipher.final()]).toString());};
  function transaction(fn,check=true){db.exec('BEGIN IMMEDIATE');try{if(check&&db.prepare('SELECT owner FROM writer WHERE id=1').get()?.owner!==owner)throw new Error('Recovery writer ownership lost');const value=fn();beforeCommit();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}
  try{transaction(()=>{const previous=db.prepare('SELECT pid FROM writer WHERE id=1').get();if(previous){let alive=true;try{process.kill(previous.pid,0);}catch(e){alive=e.code!=='ESRCH';}if(alive)throw new Error('Another recovery writer is active; stop it before opening this state directory');}db.prepare('INSERT OR REPLACE INTO writer VALUES(1,?,?)').run(process.pid,owner);},false);}catch(e){db.close();throw e;}
  return {
    sqlite,filename,
    settings:()=>({journal:db.prepare('PRAGMA journal_mode').get().journal_mode,synchronous:db.prepare('PRAGMA synchronous').get().synchronous}),
    loadAll(){return db.prepare('SELECT * FROM rooms ORDER BY code').all().map(row=>{try{
      const value=decrypt(row.code,row.payload);
      if(value.revision!==row.revision||value.status!==row.status||value.committedAt!==row.updated)throw new Error('Envelope metadata mismatch');
      return {...row,value,payload:undefined};
    }catch{return {code:row.code,revision:row.revision,status:'blocked',error:'检查点无法解密或校验失败；已保留原文'};}});},
    commit(code,value,{expectedRevision,status='prep'}={}){return transaction(()=>{
      const old=db.prepare('SELECT revision FROM rooms WHERE code=?').get(code),revision=(old?.revision || 0)+1;
      if(expectedRevision!==undefined&&expectedRevision!==(old?.revision || 0))throw new Error('Stale room revision');
      const next={...value,revision,status,committedAt:now()};
      db.prepare('INSERT INTO rooms VALUES(?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET revision=excluded.revision,status=excluded.status,payload=excluded.payload,updated=excluded.updated').run(code,revision,status,encrypt(code,next),next.committedAt);
      return next;
    });},
    async backupTo(destination){if(existsSync(destination))throw new Error('Backup destination must be new');mkdirSync(destination,{recursive:true,mode:0o700});await backup(db,path.join(destination,'rooms.sqlite'));const cloned=new DatabaseSync(path.join(destination,'rooms.sqlite'));try{cloned.exec('DELETE FROM writer');}finally{cloned.close();}writeFileSync(path.join(destination,'recovery.key'),key,{mode:0o600,flag:'wx'});chmodSync(path.join(destination,'rooms.sqlite'),0o600);},
    close(){if(closed)return;transaction(()=>db.prepare('DELETE FROM writer WHERE owner=?').run(owner));closed=true;db.close();},
  };
}

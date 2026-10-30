const copy = v => JSON.parse(JSON.stringify(v));
export const REPLAY_KIND = 'stronghold-tactical-replay';
const DROP_KEYS=['frames','events','frameUnits','unitMetadata'];
export function replayQuality(record) {
  const tracked=record.quality?.version===1;
  return {version:1,resultReceived:!!record.result,truncated:tracked?record.quality.truncated:null,
    dropped:tracked?{...record.quality.dropped}:null};
}
export function replayStatusText(record) {
  if(record.summaryOnly)return '旧版整局汇总 · 无时间轴';
  const q=replayQuality(record);
  return `${q.resultReceived?'已收到结算':'未收到结算'} · ${q.truncated===true?'采样已截断':q.truncated===false?'采样未触及录制上限':'采样完整性未知'}`;
}
export function validateReplay(value) {
  if (!value || value.format !== REPLAY_KIND || value.version !== 1 || typeof value.id !== 'string' || value.id.length > 160) throw new Error('不支持的复盘文件');
  if (!Array.isArray(value.frames) || value.frames.length > 600 || !Array.isArray(value.events) || value.events.length > 2500 || !value.units || typeof value.units !== 'object') throw new Error('复盘数据结构无效');
  if (Object.keys(value.units).length > 1500 || JSON.stringify(value).length > 5000000) throw new Error('复盘文件过大');
  if(value.quality!==undefined){
    const q=value.quality;
    if(!q || q.version!==1 || typeof q.resultReceived!=='boolean' || q.resultReceived!==!!value.result || typeof q.truncated!=='boolean' ||
      !q.dropped || DROP_KEYS.some(k=>!Number.isSafeInteger(q.dropped[k])||q.dropped[k]<0) ||
      q.truncated!==DROP_KEYS.some(k=>q.dropped[k]>0))throw new Error('复盘质量标记无效');
  }
  let last=-1;
  for (const frame of value.frames) {
    if (!Number.isFinite(frame.t) || frame.t < last || !Array.isArray(frame.units) || frame.units.length > 300) throw new Error('复盘时间轴损坏');
    last=frame.t;
    for (const u of frame.units) if (!Array.isArray(u) || u.length < 5 || !['string','number'].includes(typeof u[0]) || u.slice(1,5).some(n=>!Number.isFinite(n)) || Math.abs(u[1])>1000 || Math.abs(u[2])>1000) throw new Error('复盘坐标或生命数据无效');
  }
  for (const event of value.events) if (!Number.isFinite(event.t) || typeof event.type !== 'string' || !['string','number'].includes(typeof event.unit)) throw new Error('复盘事件无效');
  if (value.result?.perPlayer) for (const p of Object.values(value.result.perPlayer)) {
    if (!p || !Array.isArray(p.unitStats) || p.unitStats.length > 160 || p.unitStats.some(u=>!u||typeof u!=='object'||Array.isArray(u)) || !Array.isArray(p.leaked) || p.leaked.some(u=>!u||typeof u!=='object')) throw new Error('复盘结算无效');
  }
  return copy(value);
}
export function createRecorder({save, context=()=>({}), now=Date.now, onError=()=>{}}) {
  const records=new Map();
  const fields=new Map();
  const lastSamples=new WeakMap();
  let writes=Promise.resolve();
  const persist=r=>{
    let snapshot;try{snapshot=validateReplay(r);}catch(error){onError(error);return Promise.resolve();}
    writes=writes.then(()=>save(snapshot)).catch(onError);return writes;
  };
  const drop=(r,key,count=1)=>{r.quality.truncated=true;r.quality.dropped[key]=Math.min(Number.MAX_SAFE_INTEGER,r.quality.dropped[key]+count);};
  return {
    start(message) {
      if (!message.battleId || records.has(message.battleId)) return;
      const c=context();
      const r={format:REPLAY_KIND,version:1,id:message.battleId,at:now(),round:c.round || 1,seed:message.spec?.seed,
        kind:message.spec?.kind || message.kind || 'normal',fieldId:message.fieldId,selfId:c.selfId,
        title:c.title || '',challenge:c.challenge || null,preparation:c.preparation || null,
        names:{},units:{},frames:[],events:[],result:null,partial:true,rect:message.spec?.rect || null,
        quality:{version:1,resultReceived:false,truncated:false,dropped:{frames:0,events:0,frameUnits:0,unitMetadata:0}}};
      records.set(r.id,r); fields.set(r.fieldId,r.id);
      if (records.size > 5) {const old=records.get(records.keys().next().value);persist(old);records.delete(old.id);if(fields.get(old.fieldId)===old.id)fields.delete(old.fieldId);}
    },
    field(message) {
      const r=records.get(message.battleId || fields.get(message.fieldId)); if(!r)return;
      r.rect=message.rect || r.rect;
      for(const u of message.units || []) this.unit(r,u);
    },
    unit(r,u) {
      if(!u || !['string','number'].includes(typeof u.id))return;
      if(!Object.hasOwn(r.units,u.id)&&Object.keys(r.units).length>=1500){drop(r,'unitMetadata');return;}
      r.units[u.id]={id:u.id,uid:u.uid,ownerId:u.ownerId,name:String(u.name || u.defId || u.id).slice(0,120),defId:u.defId,kind:u.kind,side:u.side,facing:u.facing,dir:u.dir};
      if(u.defId)r.names[u.defId]=r.units[u.id].name;
    },
    snap(message) {
      const r=records.get(fields.get(message.fieldId)); if(!r || !Number.isFinite(message.gt))return;
      const last=lastSamples.get(r) ?? -2;
      if(message.gt-last < 1)return;
      lastSamples.set(r,message.gt);
      if(r.frames.length>=600){drop(r,'frames');return;}
      if(message.units?.length>300)drop(r,'frameUnits',message.units.length-300);
      r.frames.push({t:Math.round(message.gt*10)/10,killed:Number.isFinite(message.killed)&&message.killed>=0?message.killed:null,total:Number.isFinite(message.total)&&message.total>=0?message.total:null,
        units:(message.units || []).slice(0,300).map(u=>u.slice(0,6).map((n,i)=>i&&Number.isFinite(n)?Math.round(n*100)/100:n))});
      if(r.frames.length%10===0)persist(r);
    },
    events(message) {
      const r=records.get(fields.get(message.fieldId)); if(!r)return;
      for(const ev of message.ev || []) {
        if(ev[0]==='spawn') {this.unit(r,ev[1]);continue;}
        if(!['die','leak','deploy','skill'].includes(ev[0]) || (ev[0]==='skill' && !ev[2]))continue;
        if(r.events.length>=2500){drop(r,'events');continue;}
        r.events.push({t:Math.round(message.gt*10)/10,type:ev[0],unit:ev[1]});
      }
    },
    finish(message) {
      const r=records.get(message.battleId); if(!r)return;
      if(!message.result || typeof message.result!=='object')return;
      r.result=copy(message.result);r.partial=false;r.quality.resultReceived=true;persist(r);
    },
    flush() {return Promise.all([...records.values()].map(persist));},
  };
}

export function createReplayStore(indexedDB) {
  let database;
  const open=()=> database ||= new Promise((resolve,reject)=>{
    if(!indexedDB){reject(new Error('浏览器不支持复盘数据库'));return;}
    const req=indexedDB.open('stronghold.personal.tactics',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('replays',{keyPath:'id'});
    req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result);
  });
  return {
    async list() {const db=await open();return new Promise((resolve,reject)=>{const req=db.transaction('replays').objectStore('replays').getAll();req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.at-a.at));});},
    async put(value) {
      const r=validateReplay(value),db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('replays','readwrite'),os=tx.objectStore('replays');os.put(r);
        const req=os.getAll();req.onsuccess=()=>{const rows=req.result.sort((a,b)=>b.at-a.at);for(const old of rows.slice(30))os.delete(old.id);};
        tx.oncomplete=()=>resolve(r);tx.onabort=()=>reject(tx.error || new Error('复盘存储空间不足'));tx.onerror=()=>{};
      });
    },
  };
}

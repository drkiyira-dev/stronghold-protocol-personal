const copy = v => JSON.parse(JSON.stringify(v));
export const REPLAY_KIND = 'stronghold-tactical-replay';
export function validateReplay(value) {
  if (!value || value.format !== REPLAY_KIND || value.version !== 1 || typeof value.id !== 'string' || value.id.length > 160) throw new Error('不支持的复盘文件');
  if (!Array.isArray(value.frames) || value.frames.length > 600 || !Array.isArray(value.events) || value.events.length > 2500 || !value.units || typeof value.units !== 'object') throw new Error('复盘数据结构无效');
  if (Object.keys(value.units).length > 1500 || JSON.stringify(value).length > 5000000) throw new Error('复盘文件过大');
  let last=-1;
  for (const frame of value.frames) {
    if (!Number.isFinite(frame.t) || frame.t < last || !Array.isArray(frame.units) || frame.units.length > 300) throw new Error('复盘时间轴损坏');
    last=frame.t;
    for (const u of frame.units) if (!Array.isArray(u) || u.length < 5 || !['string','number'].includes(typeof u[0]) || u.slice(1,5).some(n=>!Number.isFinite(n)) || Math.abs(u[1])>1000 || Math.abs(u[2])>1000) throw new Error('复盘坐标或生命数据无效');
  }
  for (const event of value.events) if (!Number.isFinite(event.t) || typeof event.type !== 'string' || !['string','number'].includes(typeof event.unit)) throw new Error('复盘事件无效');
  if (value.result?.perPlayer) for (const p of Object.values(value.result.perPlayer)) {
    if (!p || !Array.isArray(p.unitStats) || p.unitStats.length > 160 || !Array.isArray(p.leaked)) throw new Error('复盘结算无效');
  }
  return copy(value);
}
export function createRecorder({save, context=()=>({}), now=Date.now, onError=()=>{}}) {
  const records=new Map();
  const fields=new Map();
  const persist=r=>Promise.resolve().then(()=>save(validateReplay(r))).catch(onError);
  return {
    start(message) {
      if (!message.battleId || records.has(message.battleId)) return;
      const c=context();
      const r={format:REPLAY_KIND,version:1,id:message.battleId,at:now(),round:c.round || 1,seed:message.spec?.seed,
        kind:message.spec?.kind || message.kind || 'normal',fieldId:message.fieldId,selfId:c.selfId,
        title:c.title || '',challenge:c.challenge || null,preparation:c.preparation || null,
        names:{},units:{},frames:[],events:[],result:null,partial:true,rect:message.spec?.rect || null};
      records.set(r.id,r); fields.set(r.fieldId,r.id);
      if (records.size > 5) records.delete(records.keys().next().value);
    },
    field(message) {
      const r=records.get(message.battleId || fields.get(message.fieldId)); if(!r)return;
      r.rect=message.rect || r.rect;
      for(const u of message.units || []) this.unit(r,u);
    },
    unit(r,u) {
      if(!u || !['string','number'].includes(typeof u.id) || Object.keys(r.units).length>=1500)return;
      r.units[u.id]={id:u.id,uid:u.uid,ownerId:u.ownerId,name:String(u.name || u.defId || u.id).slice(0,120),defId:u.defId,kind:u.kind,side:u.side,facing:u.facing,dir:u.dir};
      if(u.defId)r.names[u.defId]=r.units[u.id].name;
    },
    snap(message) {
      const r=records.get(fields.get(message.fieldId)); if(!r || !Number.isFinite(message.gt))return;
      const last=r.frames.at(-1)?.t ?? -2;
      if(message.gt-last < 1 || r.frames.length>=600)return;
      r.frames.push({t:Math.round(message.gt*10)/10,killed:message.killed || 0,total:message.total || 0,
        units:(message.units || []).slice(0,300).map(u=>u.slice(0,6).map((n,i)=>i&&Number.isFinite(n)?Math.round(n*100)/100:n))});
      if(r.frames.length%10===0)persist(r);
    },
    events(message) {
      const r=records.get(fields.get(message.fieldId)); if(!r)return;
      for(const ev of message.ev || []) {
        if(ev[0]==='spawn') {this.unit(r,ev[1]);continue;}
        if(!['die','leak','deploy','skill'].includes(ev[0]) || (ev[0]==='skill' && !ev[2]) || r.events.length>=2500)continue;
        r.events.push({t:Math.round(message.gt*10)/10,type:ev[0],unit:ev[1]});
      }
    },
    finish(message) {
      const r=records.get(message.battleId); if(!r)return;
      r.result=copy(message.result);r.partial=false;persist(r);
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

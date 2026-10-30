import {randomUUID,createHash} from 'node:crypto';
import {Match} from '../upstream/server/match/Match.js';
import {Room} from '../upstream/server/lobby.js';
import {Session} from '../upstream/server/net.js';
import {captureRoomCheckpoint,restoreRoomCheckpoint,releaseRoomCheckpoint,roomCaptureReason} from './room-checkpoint.mjs';
import {newRunId} from './run-identity.mjs';
const fail=detail=>({error:'BAD_TARGET',detail});
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const copy=v=>JSON.parse(JSON.stringify(v));
const SESSION_FIELDS=['playerId','token','name','loadout','ops','notOwned','diy','skins','card'];
const ROOM_FIELDS=['code','mode','difficulty','version','hostId','aiPicksLast','aiTakeoverEnabled','soloUnlimited','matchCount','seats'];
export function createRoomRecovery(store,identity,{ttlMs=86400000,allowedOrigins=[]}={}){
  let app,closing=false;const loaded=new Map(),revisions=new Map(),scheduled=new WeakSet(),pendingFinal=new Map(),blocked=new Map();
  const send=(session,msg)=>{if(session?.ws?.readyState===1)session.ws.send(JSON.stringify(msg));};
  const humans=m=>m.order.filter(p=>!p.isBot).map(p=>app.registry.byId(p.playerId));
  const enabled=m=>m.opts.mode==='coop'&&!m.requireCs&&!m.opts.version&&!m.test&&!m.externalAI&&!m.personalDisabled&&humans(m).every(s=>s?.personalProtocol===1);
  function status(m){const saved=m.personalCommitted;return {t:'personal.recovery',enabled:enabled(m),protocol:1,engineHash:identity.engineHash,dataHash:m.requireCs||m.opts.version?null:identity.dataHash,runId:m.personalRunId,epoch:m.personalEpoch,
    status:m.personalStorageError?'blocked':m.personalRecoveryWaiting?'awaiting-consent':saved?'saved':'waiting-prep',
    checkpoint:saved?{round:saved.snapshot.round,revision:saved.revision,at:saved.committedAt}:null,
    message:m.personalStorageError || (m.personalRecoveryWaiting?`服务器已回退到第 ${saved.snapshot.round} 回合休整（修订 ${saved.revision}）。之后的操作、战斗和未提交结算均已回退；等待所有成员确认。`:saved?`服务器休整检查点 R${saved.snapshot.round} · 修订 ${saved.revision} · 战斗中断回退此处`:enabled(m)?'服务器休整恢复已启用，等待首个稳定检查点':'此房间未启用持久化：需要增强版客户端、默认版本和无玩法插件的联盟。')};}
  function publish(m){if(!app||closing)return;const msg=status(m);for(const s of humans(m))send(s,msg);}
  function record(m,snapshot){const room=app.lobby.rooms.get(m.roomCode);if(!room)throw new Error('Room is no longer active');return {snapshot,epoch:m.personalEpoch,
    room:Object.fromEntries(ROOM_FIELDS.map(k=>[k,copy(room[k])])),
    credentials:humans(m).map(s=>{if(!s)throw new Error('Session missing');return {...Object.fromEntries(SESSION_FIELDS.map(k=>[k,s[k]])),expiresAt:(s.connected?Date.now():s.disconnectedAt)+ttlMs};})};}
  function persist(m,force=false){
    if(closing||!app||m.personalRecoveryWaiting||!enabled(m))return false;
    const reason=roomCaptureReason(m);if(reason){if(force)throw new Error(reason);return false;}
    const snapshot=captureRoomCheckpoint(m,identity),signature=digest(snapshot.state);
    if(!force&&signature===m.personalSavedSignature)return true;
    const value=store.commit(m.roomCode,record(m,snapshot),{expectedRevision:m.personalCommitted?.revision ?? revisions.get(m.roomCode) ?? 0});
    revisions.set(m.roomCode,value.revision);m.personalCommitted=value;m.personalSavedSignature=signature;m.personalStorageError=null;publish(m);return true;
  }
  function schedule(m){if(closing||scheduled.has(m))return;scheduled.add(m);queueMicrotask(()=>{scheduled.delete(m);if(m.disposed||m.ended)return;try{persist(m);}catch{m.personalStorageError='服务器检查点写入失败；旧检查点仍保留，不能进入下一场战斗。';publish(m);}});}
  function finalize(m,summary,original){
    const finish=()=>{
      const base=m.personalCommitted;
      if(base&&!closing&&base.status!=='complete'){const value=store.commit(m.roomCode,{...base,finalFrames:m.personalFinalFrames,finalPublic:m.publicView(),summary},{expectedRevision:base.revision,status:'complete'});m.personalCommitted=value;revisions.set(m.roomCode,value.revision);}
      for(const [pid,msg,encoded]of m.personalFinalFrames)m.personalSend(pid,msg,encoded);
      m.personalFinalFrames=[];pendingFinal.delete(m);original(summary);
    };
    try{finish();}catch{m.personalStorageError='最终结算尚未提交；等待存储恢复，结算不会重复发放。';pendingFinal.set(m,finish);publish(m);}
  }
  function abandon(m){
    if(!m?.personalCommitted)return;
    const value=store.commit(m.roomCode,{...m.personalCommitted,reason:'member-left'},{expectedRevision:m.personalCommitted.revision,status:'abandoned'});
    revisions.set(m.roomCode,value.revision);m.personalCommitted=null;m.personalDisabled=true;m.personalRecoveryWaiting=false;
    m.personalStorageError='成员已退出，本局检查点已作废；剩余对局仅在当前进程内继续，重启不会恢复退出前的成员。';publish(m);
  }
  class TrackedMatch extends Match{
    constructor(opts){let self;
      super({...opts,send:(pid,msg,encoded)=>{if(self?.personalCommitted&&self.personalCommitted.status!=='complete'&&msg.t==='m.result')self.personalFinalFrames.push([pid,copy(msg),encoded]);else opts.send(pid,msg,encoded);},
        onEnd:summary=>finalize(self,summary,opts.onEnd)});
      self=this;this.personalRunId=newRunId();this.personalEpoch=randomUUID();this.personalFinalFrames=[];this.personalSend=opts.send;
    }
    start(){const result=super.start();publish(this);return result;}
    flush(...args){const value=super.flush(...args);if(app)schedule(this);return value;}
    handle(pid,msg){
      if(this.personalRecoveryWaiting)return fail('请在战术终端确认服务器回退范围，等待所有成员同意恢复。');
      if(this.personalCommitted&&!enabled(this))return fail('所有成员需要增强版客户端并完成恢复协议协商');
      if(this.personalCommitted&&msg.personalEpoch!==this.personalEpoch)return fail('旧恢复代次的操作已拒绝，请重新连接增强版客户端。');
      const result=super.handle(pid,msg);schedule(this);return result;
    }
    maybeEndPrep(){if(!this.personalRecoveryWaiting)super.maybeEndPrep();}
    endPrep(){
      if(this.personalRecoveryWaiting)return;
      if(this.personalCommitted&&!enabled(this)){this.setDeadline(0);this.personalStorageError='恢复协议协商未完成，已停留休整；所有成员需要增强版客户端。';publish(this);return;}
      if(enabled(this)){try{persist(this,true);}catch{this.setDeadline(0);this.personalStorageError='战斗前检查点提交失败；停留休整，请修复服务器存储后重新准备。';publish(this);return;}}
      super.endPrep();
    }
  }
  class RecoveryMatch {
    constructor(opts){const saved=loaded.get(opts.roomCode);if(!saved||saved.status!=='prep')return new TrackedMatch(opts);
      const m=restoreRoomCheckpoint(saved.snapshot,identity,opts,TrackedMatch);m.personalCommitted=saved;m.personalEpoch=randomUUID();
      // Battle IDs are transport identities, not gameplay RNG. Old client-run
      // results cannot collide with re-simulated fields after a rewind.
      m.battlePrefix='r'+m.personalEpoch.replaceAll('-','');m.personalAccepted=new Set();return m;
    }
  }
  const retry=setInterval(()=>{for(const [m,finish]of pendingFinal)try{finish();}catch{}},1000);retry.unref();
  function attach(server){app=server;
    const genCode=app.lobby.genCode.bind(app.lobby);app.lobby.genCode=(...args)=>{for(let n=0;n<100;n++){const code=genCode(...args);if(!code||!blocked.has(code))return code;}return null;};
    // Permanent departure must invalidate the durable room before upstream
    // returns its pool copies. A failed write refuses that departure.
    for(const method of ['handleMessage','routeGameNow']){
      const original=app.lobby[method].bind(app.lobby);app.lobby[method]=(session,msg,...args)=>{
        const room=app.lobby.roomOf(session),m=room?.match;
        if(['room.leave','g.leave'].includes(msg.t)&&m?.personalCommitted&&room.seatOf(session.playerId)){
          if(msg.personalEpoch!==m.personalEpoch)return fail('旧恢复代次的退出操作已拒绝');
          try{const waiting=m.personalRecoveryWaiting;abandon(m);if(waiting){app.lobby.disposeRoom(room,'recovery-abandoned');return {ok:true};}}catch{return fail('退出前检查点作废失败，请修复服务器存储后重试');}
        }
        return original(session,msg,...args);
      };
    }
    const hello=app.lobby.onHello.bind(app.lobby);app.lobby.onHello=(session,meta)=>{if(!meta.repeat)session.personalProtocol=0;hello(session,meta);const m=app.lobby.roomOf(session)?.match;if(m)publish(m);};
    // A completed run retains the original result frames for authenticated
    // resync; a committed tombstone can never resurrect its old PREP.
    for(const row of store.loadAll()){
      try{
        revisions.set(row.code,row.revision);if(row.error)throw new Error(row.error);const value=row.value;
        if(value.credentials.some(s=>s.expiresAt<Date.now()))throw new Error('重连凭据已到期；检查点保留但不自动恢复');
        if(value.snapshot.engineHash!==identity.engineHash||value.snapshot.dataHash!==identity.dataHash)throw new Error('引擎或内容版本不兼容');
        for(const saved of value.credentials){
          if(app.registry.byId(saved.playerId)||app.registry.byToken(saved.token))throw new Error('恢复身份冲突');
          const session=new Session(saved);Object.assign(session,Object.fromEntries(SESSION_FIELDS.map(k=>[k,saved[k]])));
          session.resumeWindowMs=Math.max(0,saved.expiresAt-Date.now());session.personalProtocol=0;
          app.registry.byPlayerId.set(session.playerId,session);app.registry.byTokenMap.set(session.token,session);
          if(row.status==='complete'){session.notice='completed';session.pendingResult=[JSON.stringify(value.finalPublic),...value.finalFrames.filter(([pid])=>pid===session.playerId).map(([,msg])=>JSON.stringify(msg))];}
          else if(row.status==='abandoned')session.notice='recovery-abandoned';
          else session.roomCode=row.code;
        }
        if(['complete','abandoned'].includes(row.status))continue;
        if(row.status!=='prep')throw new Error('不支持的恢复状态');
        const room=new Room(row.code,value.room.mode,value.room.difficulty,Date.now(),value.room.version);
        Object.assign(room,value.room);room.seats=room.seats.map(s=>s?{...s,connected:!!s.isBot}:s);room.content=Object.freeze({cs:app.content.cs,vanilla:true,plugins:[]});
        room.matchCount--;app.lobby.rooms.set(room.code,room);loaded.set(row.code,value);
        const started=app.lobby.startMatch(room);if(!started.ok)throw new Error('原引擎拒绝恢复检查点');
        loaded.delete(row.code);publish(room.match);
      }catch(e){blocked.set(row.code,e.message);const room=app.lobby.rooms.get(row.code);if(room){room.match?.dispose();app.lobby.rooms.delete(row.code);}for(const session of app.registry.all())if(session.roomCode===row.code){session.roomCode=null;session.notice='recovery-blocked';} }
    }
  }
  async function http(req,res){if(req.url?.split('?')[0]!=='/api/personal/recovery')return false;
    const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    const origin=req.headers.origin,same=origin===`${req.socket.encrypted?'https':'http'}://${req.headers.host}`;
    if(origin&&!same&&!allowedOrigins.includes(origin)){json(403,{error:'Origin not allowed'});return true;}
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'});res.end();return true;}
    if(req.method!=='POST'){json(405,{error:'POST required'});return true;}
    const token=String(req.headers.authorization || '').replace(/^Bearer /,''),session=app.registry.byToken(token);
    if(!session?.connected){json(401,{error:'Active authenticated WebSocket session required'});return true;}
    try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048)throw new Error('Request too large');}const input=JSON.parse(raw);
      const m=app.lobby.roomOf(session)?.match;
      if(input.action==='register'&&input.protocol===1){session.personalProtocol=1;session.resumeWindowMs=ttlMs;if(m){schedule(m);publish(m);}json(200,{enabled:true,protocol:1,blockedRooms:blocked.size});return true;}
      if(input.action!=='accept'||!m?.personalRecoveryWaiting||input.epoch!==m.personalEpoch||input.revision!==m.personalCommitted?.revision)throw new Error('恢复代次或检查点修订不一致');
      if(session.personalProtocol!==1)throw new Error('请先协商恢复协议');m.personalAccepted.add(session.playerId);
      const all=humans(m).every(s=>s?.connected&&s.personalProtocol===1&&m.personalAccepted.has(s.playerId));
      if(all){releaseRoomCheckpoint(m);publish(m);}json(200,{accepted:true,waiting:!all});
    }catch(e){json(400,{error:e.message});}return true;
  }
  return {MatchClass:RecoveryMatch,attach,http,info:()=>({enabled:true,protocol:1,mode:'committed-prep',blockedRooms:blocked.size,sqlite:store.sqlite}),
    get blocked(){return [...blocked].map(([code,reason])=>({code,reason}));},publish,persist,
    backupTo:destination=>store.backupTo(destination),
    stop(){closing=true;clearInterval(retry);},close(){store.close();}};
}

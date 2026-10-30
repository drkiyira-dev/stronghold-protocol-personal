import {Match} from '../upstream/server/match/Match.js';
import {collectViolations} from '../upstream/server/match/invariants.js';
import {checkpointCodec as c} from './checkpoint.mjs';
import {newRunId,validRunId} from './run-identity.mjs';
const kind='stronghold-room-prep';
const reject=message=>{throw new Error(`房间检查点：${message}`);};
export function roomCaptureReason(m){
  if(m.mode!=='coop'&&m.opts.mode!=='coop')return '仅多人联盟使用服务器检查点';
  if(m.opts.requireCs||m.opts.version||m.externalAI||m.test||m.offers.length||m.offerWin.length)return '当前版本、插件或扩展不支持休整恢复';
  if(m.order.some(p=>p.left||p.autoplay))return '离场或托管中的对局暂不支持恢复';
  if(m.phase!=='PREP'||m.ended||m.disposed||m.runner||m.fields.length||m.bossPool)return '等待稳定休整';
  if(m.dispatcher.depth||m._rehearsalTasks.size||m.order.some(p=>p._deferItemMerge||p.botControlled&&!p.ready))return '等待原 AI 或当前操作完成';
  return null;
}
export function captureRoomCheckpoint(m,identity){
  const reason=roomCaptureReason(m);if(reason)reject(reason);
  const violations=collectViolations(m);if(violations.length)reject(violations[0]);
  const options=Object.fromEntries(c.OPTION_FIELDS.filter(k=>m.opts[k]!==undefined).map(k=>[k,m.opts[k]]));
  Object.assign(options,{roomCode:m.roomCode,mode:'coop',modeId:m.modeId,difficulty:m.difficulty,seed:m.seed,
    timerScale:m.timerScale,combatSpeed:m.gameSpeed,clientCombat:m.clientCombat,verify:m.verifyMode,botStrategy:m.bot.id,
    botRehearsal:m.botRehearsal,botRehearsalDelegate:m.botRehearsalDelegate,
    seats:m.order.map(p=>({seat:p.seat,playerId:p.playerId,name:p.name,isBot:p.isBot,connected:p.connected,loadout:p.loadout,ops:p.ops,notOwned:p.standIns,diy:p.diy,skins:p.skins}))});
  const at=m.sched.now();
  return {kind,version:1,engineHash:identity.engineHash,dataHash:identity.dataHash,dataFingerprint:c.fingerprint(m.data),runId:m.personalRunId ||= newRunId(),
    round:m.round,savedAt:at,elapsedMs:at-m.startedAt,remainingMs:m.deadline?Math.max(1,m.deadline-at):null,options:JSON.parse(JSON.stringify(options)),
    state:c.encode({match:Object.fromEntries(c.MATCH_FIELDS.filter(k=>Object.hasOwn(m,k)).map(k=>[k,m[k]])),
      players:m.order.map(p=>({player:Object.fromEntries(Object.entries(p).filter(([k])=>!c.PLAYER_EXCLUDE.has(k))),diyEntries:p.diyStock.entries})),
      poolEntries:m.pool.entries,itemDebt:m.itemPool.debt,factionSchedule:m.factions.schedule,rng:Object.fromEntries(c.RNG_NAMES.map(k=>[k,m[k].state()]))})};
}
export function restoreRoomCheckpoint(s,identity,platform={},MatchClass=Match){
  if(s?.kind!==kind||s.version!==1||!validRunId(s.runId)||s.engineHash!==identity.engineHash||s.dataHash!==identity.dataHash||s.dataFingerprint!==c.fingerprint(platform.data))reject('版本或内容不兼容');
  if(s.options?.mode!=='coop'||!Array.isArray(s.options.seats)||s.options.seats.length<1||s.options.seats.length>4||!Number.isSafeInteger(s.round)||s.round<1||!Number.isFinite(s.elapsedMs)||s.elapsedMs<0||!Number.isFinite(s.savedAt)||s.remainingMs!==null&&(!Number.isFinite(s.remainingMs)||s.remainingMs<0))reject('元数据损坏');
  const state=c.decode(s.state);
  if(!Array.isArray(state.players)||state.players.length!==s.options.seats.length||state.match.round!==s.round||Object.keys(state.match).some(k=>!c.MATCH_FIELDS.includes(k)))reject('全员状态不完整');
  if(!(state.poolEntries instanceof Map)||!(state.itemDebt instanceof Map)||!state.factionSchedule)reject('共享库存或波次缺失');
  for(const name of c.RNG_NAMES)if(!Number.isInteger(state.rng?.[name])||state.rng[name]<0||state.rng[name]>0xffffffff)reject('随机流损坏');
  const runtime=Object.fromEntries(Object.entries(platform).filter(([k])=>['data','send','broadcast','onEnd','log','now','scheduler','simPool'].includes(k)));
  const m=new MatchClass({...s.options,...runtime,journal:false,externalAI:null});
  try{
    Object.assign(m,state.match);Object.defineProperty(m.factions,'schedule',{value:Object.freeze(state.factionSchedule),enumerable:false});
    m.stage=m.gd.stage(m.stageId);if(!m.stage)reject('战场不存在');m.pool.entries=state.poolEntries;m.pool.banned=m.bannedChess.slice();m.itemPool.debt=state.itemDebt;
    for(const [i,saved]of state.players.entries()){
      const p=m.order[i],value=saved.player;
      if(value.playerId!==p.playerId||value.seat!==p.seat||value.isBot!==p.isBot||value.left||value.autoplay||!(value.board instanceof Map)||!(saved.diyEntries instanceof Map)||Object.keys(value).some(k=>c.PLAYER_EXCLUDE.has(k)||['__proto__','constructor','prototype'].includes(k)))reject('玩家或库存不兼容');
      Object.assign(p,value);p.diyStock.entries=saved.diyEntries;p.connected=p.isBot;
      if(Number.isFinite(p.lastEmoteAt))p.lastEmoteAt+=m.sched.now()-s.savedAt;
      p._deployField=m.deployFieldOf(p);p._deployMap=m.deployMapFor(p,p._deployField);p._legalityStale=false;p._lastPriv=null;
    }
    for(const name of c.RNG_NAMES)m[name]=c.rngAt(state.rng[name]);
    m.personalRunId=s.runId;m.phase='PREP';m.deadline=0;m.overtimeAt=0;m.startedAt=m.sched.now()-s.elapsedMs;
    m.personalRecoveryWaiting=true;m.personalRemainingMs=s.remainingMs;
    const violations=collectViolations(m);if(violations.length)reject(violations[0]);
    for(const p of m.order)m.markPrivate(p);m.markPublic();return m;
  }catch(e){m.dispose();throw e;}
}
export function releaseRoomCheckpoint(m){
  m.personalRecoveryWaiting=false;
  if(m.personalRemainingMs!==null){m.deadline=m.sched.now()+Math.max(1,m.personalRemainingMs);m._phaseTimer=m.later(Math.max(1,m.personalRemainingMs),()=>{m._phaseTimer=null;m.prepDeadline();});}
  m.markPublic();m.maybeEndPrep();m.flush(true);
}

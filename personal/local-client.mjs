import {newRunId} from './run-identity.mjs';
import {installExternalAssets} from './external-assets.mjs';
import {net,identity,createIdentity} from '/js/net.js';
import {store,selectRoute} from '/js/store.js';
import {isCombatPhase} from '/js/ui/gameLogic/phases.js';
import {battleRunner} from '/js/battle/runner.js';
import {loadStats,selfRowOf} from '/js/ui/stats.js';
import {createSaveVault,saveCompatibility} from './save-vault.mjs';
import {createTransactionalVault} from './transactional-vault.mjs';
import {createRecorder,createReplayStore,REPLAY_KIND} from './replays.mjs';
import {mountToolkit} from './toolkit.mjs';
import {readConnection} from './connection.mjs';
import {sha256Hex} from '../upstream/shared/sha256.js';
import {createRestoreSession} from './restore-session.mjs';
import {terminalCapabilities} from './terminal-session.mjs';
import {getLang,onLangChange} from '/shared/i18n.js';
await installExternalAssets();
let buildInfo={};try{const response=await fetch('/personal/build-info.json');if(response.ok)buildInfo=await response.json();}catch{}
const connection=readConnection(localStorage,location);
document.documentElement.dataset.personalTransport=connection.mode;
let vault;
try{vault=await createTransactionalVault(globalThis.indexedDB,localStorage);}catch(error){
  vault=createSaveVault({getItem:k=>localStorage.getItem(k),setItem:()=>{throw new Error('事务保险库不可用；写入已停止，原文保留');}});
  vault.warning=()=>`事务保险库不可用：${error.message}。请导出旧数据或刷新后重试。`;
}
const replays=createReplayStore(globalThis.indexedDB);
let checkpoint=vault.active(),compatibility=null,saveError=vault.warning(),recordError='',challenge=null;
let worker,ready=false,currentSocket=null,fatal=null,resume,saveStatus,toolkit,restoring=false,challengePending=null;
let preparation=null,attemptId=newRunId();
let roomRecovery=null;
async function recoveryRequest(body){
  const url=new URL(connection.url);url.protocol=url.protocol==='wss:'?'https:':'http:';url.pathname='/api/personal/recovery';
  const response=await fetch(url,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json',Authorization:`Bearer ${identity.getToken()}`},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  const value=await response.json();if(!response.ok)throw new Error(value.error || '服务器恢复服务不可用');return value;
}
net.on('room.state',message=>{if(!message.inMatch){roomRecovery=null;updatePersonalUI();}});
net.on('personal.recovery',message=>{roomRecovery=message;updatePersonalUI();toolkit?.refreshStatus?.();});
try{challenge=JSON.parse(localStorage.getItem('stronghold.personal.challenge'));}catch{}
const vaultWrite=fn=>navigator.locks ? navigator.locks.request('stronghold.personal.vault',fn) : Promise.resolve().then(fn);
const stagedRestore=()=>{const id=sessionStorage.getItem('stronghold.personal.restore');return id==='1'?checkpoint:vault.list().find(s=>s.id===id)?.snapshot;};
const restoreSession=createRestoreSession({
  send:message=>worker.postMessage(message),
  commit:snapshot=>vaultWrite(()=>vault.save(snapshot)).then(item=>{attemptId=newRunId();return item.snapshot;}),
  onChange:pending=>{restoring=pending;updatePersonalUI();},
});
function updatePersonalUI(){
  if(!resume)return;const route=selectRoute(store.get());
  resume.hidden=connection.mode!=='local'||route!=='lobby'||!checkpoint;
  const compatible=checkpoint&&saveCompatibility(checkpoint,compatibility);
  resume.disabled=restoring||store.get().connection.status!=='online'||!compatible?.ok;
  resume.textContent=restoring?'正在恢复…':`继续上次休整 · 第 ${checkpoint?.round || 1} 回合`;
  resume.title=compatible?.reason || '';
  saveStatus.hidden=route!=='game';
  saveStatus.textContent=connection.mode==='remote'?(roomRecovery?.message || '服务器联机 · 本地休整存档不适用'):saveError || (checkpoint?`休整存档 R${checkpoint.round} · 事务保护`:'等待首次休整存档');
}
function capturePreparation(text){
  try{const m=JSON.parse(text),s=store.get(),p=s.match.private;if(m.t==='g.ready'&&m.ready!==false&&p)preparation={funds:p.funds,deployed:p.deployCount,cap:Math.min(p.deployCap,challenge?.rules.maxDeploy ?? Infinity),bench:(p.hand||[]).filter(x=>x?.kind==='chess').length};}catch{}
}
const recorder=createRecorder({save:r=>replays.put(r),onError:e=>{recordError=`复盘未保存：${e.message}`;toolkit?.notify(recordError);},context:()=>{
  const s=store.get(),m=s.match.public;return {attemptId,round:m?.round,selfId:s.me.playerId,preparation,challenge,
    engineHash:connection.mode==='local'?buildInfo.engineHash:roomRecovery?.engineHash,dataHash:connection.mode==='local'?buildInfo.dataHash:roomRecovery?.dataHash,runId:connection.mode==='local'?checkpoint?.runId:roomRecovery?.runId,
    scenario:{mode:m?.modeId,difficulty:m?.difficulty,stageId:m?.stageId},title:`${challenge?challenge.name+' · ':''}第 ${m?.round || 1} 回合`};
}});
net.on('b.start',m=>recorder.start(m));
net.on('status',s=>{if(s.status!=='online')recorder.gap(null,'disconnect');});
battleRunner.on('takeover',m=>recorder.gap(m,'takeover'));
for(const [event,method]of [['field','field'],['snap','snap'],['ev','events'],['result','finish']])battleRunner.on(event,m=>recorder[method](m));
function engine(){
  if(worker)return worker;
  worker=new Worker('/personal/local-server.js',{type:'module',name:'stronghold-personal-engine'});
  worker.onmessage=({data})=>{
    if(data.t==='local.ready'){
      ready=true;compatibility=data.compatibility;
      const preferred=stagedRestore() || checkpoint;
      if(preferred)worker.postMessage({t:'local.identity',playerId:preferred.options.seats[0].playerId});
      if(challenge)worker.postMessage({t:'local.challenge',challenge});
      if(currentSocket?.readyState===0)currentSocket._open();
      document.documentElement.dataset.personalEngine='ready';updatePersonalUI();return;
    }
    if(data.t==='local.checkpoint'){
      if(!restoreSession.accepts(data))return;
      const snapshot=data.snapshot;
      vaultWrite(()=>vault.save(snapshot)).then(()=>{checkpoint=snapshot;saveError='';updatePersonalUI();}).catch(e=>{saveError=`休整保存失败：${e.message}`;updatePersonalUI();});return;
    }
    if(data.t==='local.clear-checkpoint'){
      if(!restoreSession.accepts(data)||!data.runId)return;
      const completed={runId:data.runId};
      vaultWrite(()=>vault.complete(completed)).then(()=>{checkpoint=vault.active();updatePersonalUI();}).catch(e=>{saveError=e.message;updatePersonalUI();});return;
    }
    if(data.t==='local.restored'||data.t==='local.restore-error'){
      restoreSession.receive(data);return;
    }
    if(data.t==='local.challenge-set'){challenge=data.challenge;localStorage.setItem('stronghold.personal.challenge',JSON.stringify(challenge));challengePending?.resolve();challengePending=null;return;}
    if(data.t==='local.challenge-error'){challengePending?.reject(new Error(data.message));challengePending=null;saveError=data.message;updatePersonalUI();return;}
    if(data.t==='local.save-unavailable'){saveError=data.message;updatePersonalUI();return;}
    if(data.t==='local.log'){(console[data.level]||console.warn)('[personal engine]',data.message);return;}
    if(data.t==='local.closed'){currentSocket?.close(data.code,data.reason);return;}
    if(data.t==='local.error'){fatal=data.message || '本地引擎启动失败';restoreSession.fail(new Error(fatal));const el=document.getElementById('boot-err');if(el)el.textContent=fatal;currentSocket?.onerror?.({message:fatal});return;}
    if(currentSocket?.readyState===1)currentSocket.onmessage?.({data:JSON.stringify(data)});
  };
  worker.onerror=event=>{fatal=event.message || '本地引擎加载失败';restoreSession.fail(new Error(fatal));saveError=fatal;updatePersonalUI();currentSocket?.onerror?.({message:fatal});};
  return worker;
}
class LocalSocket{
  static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
  constructor(url){this.url=url;this.readyState=0;this.bufferedAmount=0;currentSocket=this;engine();if(ready)queueMicrotask(()=>this._open());}
  _open(){if(this.readyState!==0)return;this.readyState=1;this.onopen?.({target:this});}
  send(text){if(this.readyState!==1)throw new Error('Personal engine is not ready');capturePreparation(text);worker.postMessage(JSON.parse(text));}
  close(code=1000,reason=''){this.readyState=3;if(currentSocket===this)currentSocket=null;queueMicrotask(()=>this.onclose?.({code,reason,wasClean:true}));}
  addEventListener(type,fn){this['on'+type]=fn;}
  removeEventListener(type,fn){if(this['on'+type]===fn)this['on'+type]=null;}
}
if(connection.mode==='remote'){
  const prefix=`stronghold.server.${sha256Hex(connection.url).slice(0,20)}.`;
  const scoped=storage=>({getItem:k=>storage.getItem(k==='sp.name'?k:prefix+k),setItem:(k,v)=>storage.setItem(k==='sp.name'?k:prefix+k,v),removeItem:k=>storage.removeItem(prefix+k)});
  Object.assign(identity,createIdentity({local:scoped(localStorage),session:scoped(sessionStorage),channel:typeof BroadcastChannel==='function'?new BroadcastChannel(prefix+'claims'):null,onYield:()=>net.reconnectNow(net.helloName||net.name)}));
  net.url=connection.url;
  net.WS=class extends WebSocket{send(text){capturePreparation(text);const value=JSON.parse(text);if(roomRecovery?.epoch&&/^(?:[gb]\.|room\.leave$)/.test(value.t))value.personalEpoch=roomRecovery.epoch;super.send(JSON.stringify(value));}};
  net.on('welcome',()=>{queueMicrotask(()=>recoveryRequest({action:'register',protocol:1}).catch(()=>{}));});
  challenge=null;
}else net.WS=LocalSocket;
await import('/js/main.js');
const updateGameTitle=()=>{document.title=/^en/i.test(getLang())?'Stronghold Protocol: Alliance':'卫戍协议：盟约';};
onLangChange(updateGameTitle);updateGameTitle();
const badge=document.createElement('button');badge.className='personal-edition';badge.textContent=connection.mode==='remote'?'房间服务器':'本地单人';badge.title='项目说明';
const about=document.createElement('dialog');about.className='personal-about';about.innerHTML=`<h2>卫戍协议：盟约 / Stronghold Protocol: Alliance</h2><p>基于 <a href="https://github.com/sganggs/Stronghold-Protocol" target="_blank" rel="noopener noreferrer">Stronghold Protocol 0.3.3</a> 二次开发。Enhanced Edition 开发版本的扩展与测试由 OpenAI Codex 完成，保留上游署名。</p><p>本地单人使用浏览器引擎；多人联盟需要另行启动自托管房间服务器。原站账号同步与远程 AI 队友尚未接入。</p><p>招募、升级与机变需要点击两次确认。拖入干员后选择朝向；三名同名干员合成精锐。<strong>休整结束剩余资金清零。</strong></p><p>W 招募，R 刷新，F 冻结，D 升级，Q 撤退，X 出售，空格准备或暂停。单人切到后台自动暂停。</p><p>休整存档仅保存准备阶段。战斗中退出会回到最近的休整；战术复盘用于分析，不能作为战斗存档。</p><p>代码采用 <a href="/LICENSE">GPL-3.0-or-later</a>。明日方舟角色和素材属于原权利人，详见 <a href="/NOTICE.md">声明</a>。</p><button>返回游戏</button>`;
resume=document.createElement('button');resume.className='personal-resume';resume.hidden=true;
saveStatus=document.createElement('div');saveStatus.className='personal-save-status';saveStatus.hidden=true;
document.body.append(saveStatus);
const assertLobby=()=>{if(!['lobby','title'].includes(selectRoute(store.get()))||store.get().room)throw new Error('请先返回大厅并离开房间');};
async function resumeCheckpoint(value=checkpoint){
  if(!value)throw new Error('存档不存在');
  const c=saveCompatibility(value,compatibility);if(!c.ok)throw new Error(c.reason);
  try{
    checkpoint=await restoreSession.start(value);challenge=checkpoint.challenge || null;saveError='';
    try{localStorage.setItem('stronghold.personal.challenge',JSON.stringify(challenge));}
    catch{saveError='休整恢复已完成；挑战偏好未能写入浏览器，请在下次新局前核对挑战设置。';}
  }catch(error){saveError=`恢复未完成：${error.message}；原活动存档已保留。`;toolkit?.notify(saveError);throw error;}
  finally{updatePersonalUI();}
}
resume.onclick=()=>{resumeCheckpoint().catch(()=>{});};
let importedHistory=false;
toolkit=mountToolkit({vault,replays,connection,vaultWrite,compatibility:()=>compatibility,challenge:()=>challenge,
  resumeButton:resume,aboutHTML:about.innerHTML.replace(/<button>.*<\/button>/,''),getLang,onLangChange,
  capabilities:()=>terminalCapabilities({mode:connection.mode,online:store.get().connection.status==='online',persistence:roomRecovery,phase:store.get().match.public?.phase}),
  async acceptRecovery(){if(!roomRecovery?.checkpoint)throw new Error('没有可确认的服务器检查点');return recoveryRequest({action:'accept',epoch:roomRecovery.epoch,revision:roomRecovery.checkpoint.revision});},
  status:()=>recordError || saveError,
  refreshSave:()=>{checkpoint=vault.active();updatePersonalUI();},
  async restore(id){assertLobby();if(connection.mode!=='local')throw new Error('请先切回本地单人模式');const value=vault.list().find(s=>s.id===id)?.snapshot;if(!value)throw new Error('存档不存在');const c=saveCompatibility(value,compatibility);if(!c.ok)throw new Error(c.reason);if(store.get().me.playerId!==value.options.seats[0].playerId){sessionStorage.setItem('stronghold.personal.restore',id);location.reload();return;}await resumeCheckpoint(value);},
  async setChallenge(value){assertLobby();if(connection.mode!=='local')throw new Error('挑战工坊当前用于本地单人模式');if(!ready)throw new Error('请等待本地引擎就绪');return new Promise((resolve,reject)=>{challengePending={resolve,reject};worker.postMessage({t:'local.challenge',challenge:value});});},
  assertCanSwitch:assertLobby,
  async pauseCombat(){const m=store.get().match.public;if(connection.mode==='local'&&m&&isCombatPhase(m.phase)&&!m.paused){const lease={runId:checkpoint?.runId,round:m.round,phase:m.phase};await net.request('g.pause',{on:true});return lease;}return null;},
  resumeCombat(lease){const m=store.get().match.public;if(connection.mode==='local'&&m&&m.round===lease.round&&m.phase===lease.phase&&checkpoint?.runId===lease.runId&&m.paused)return net.request('g.pause',{on:false});},
  async importHistory(){if(importedHistory)return;const existing=new Set((await replays.list()).map(r=>r.id));for(const r of loadStats().records.slice(-15)){const id=`legacy-${r.id}`;if(existing.has(id))continue;const row=selfRowOf(r),s=row?.stats || {};await replays.put({format:REPLAY_KIND,version:1,id,at:r.t || Date.now(),round:r.roundsPassed || 1,seed:r.seed,kind:'match-summary',title:`旧版整局汇总 · ${r.roundsPassed || 0} 回合`,summaryOnly:true,partial:false,frames:[],events:[],units:{},names:{},result:null,summary:{damage:s.dmgDealt ?? s.damageDealt,healing:s.healingDone ?? s.healing,deaths:s.deaths,leaks:s.leaks}});}importedHistory=true;},
});
let autoRestoreStarted=false;
store.subscribe(()=>{const route=selectRoute(store.get());badge.classList.toggle('in-match',route==='game');updatePersonalUI();if(route==='lobby'&&ready&&!autoRestoreStarted&&sessionStorage.getItem('stronghold.personal.restore')){autoRestoreStarted=true;const value=stagedRestore();resumeCheckpoint(value || null).catch(e=>{saveError=e.message;updatePersonalUI();}).finally(()=>sessionStorage.removeItem('stronghold.personal.restore'));}});
window.addEventListener('storage',()=>{checkpoint=vault.active();updatePersonalUI();});
vault.subscribe?.(()=>{checkpoint=vault.active();updatePersonalUI();});
updatePersonalUI();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)return;recorder.flush();const m=store.get().match.public;if(connection.mode==='local'&&m&&isCombatPhase(m.phase)&&!m.paused)net.request('g.pause',{on:true}).catch(()=>{});});

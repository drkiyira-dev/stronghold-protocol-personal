import {installSkeletonTransport} from './skeleton-codec.mjs';
installSkeletonTransport();
// Personal browser host adapter, GPL-3.0-or-later. Upstream game logic is unchanged.
import { net } from '/js/net.js';
import { store, selectRoute } from '/js/store.js';
import { isCombatPhase } from '/js/ui/gameLogic/phases.js';
let worker, ready = false, currentSocket = null, fatal = null;
const SAVE_KEY = 'stronghold.personal.prep.v1';
let checkpoint = null, resume, saveStatus, restoring = false, saveError = '';
try { checkpoint = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch {}
if (checkpoint?.kind !== 'stronghold-solo-prep') checkpoint = null;
function updatePersonalUI() {
  if (!resume) return;
  const route = selectRoute(store.get());
  resume.hidden = route !== 'lobby' || !checkpoint;
  resume.disabled = restoring || store.get().connection.status !== 'online';
  resume.textContent = restoring ? '正在恢复…' : `继续上次休整 · 第 ${checkpoint?.round || 1} 回合`;
  saveStatus.hidden = route !== 'game' || (!checkpoint && !saveError);
  saveStatus.textContent = saveError || `休整存档 R${checkpoint?.round} · 已保存在此浏览器`;
}
function engine() {
  if (worker) return worker;
  worker = new Worker('/personal/local-server.js', { type: 'module', name: 'stronghold-personal-engine' });
  worker.onmessage = ({data}) => {
    if (data.t === 'local.ready') {
      ready = true;
      if (checkpoint) worker.postMessage({ t:'local.identity', playerId:checkpoint.options?.seats?.[0]?.playerId });
      if (currentSocket?.readyState === 0) currentSocket._open();
      document.documentElement.dataset.personalEngine = 'ready';
      return;
    }
    if (data.t === 'local.checkpoint') {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(data.snapshot)); checkpoint = data.snapshot; saveError = ''; }
      catch { saveError = '存储空间不足，无法保存休整'; }
      updatePersonalUI(); return;
    }
    if (data.t === 'local.clear-checkpoint') {
      checkpoint = null;
      try { localStorage.removeItem(SAVE_KEY); } catch {}
      updatePersonalUI(); return;
    }
    if (data.t === 'local.restored' || data.t === 'local.restore-error') {
      restoring = false;
      if (data.t === 'local.restore-error') { about.querySelector('.personal-restore-error').textContent = data.message; about.showModal(); }
      updatePersonalUI(); return;
    }
    if (data.t === 'local.save-unavailable') { saveError = data.message; console.warn('[personal save]', data.message); updatePersonalUI(); return; }
    if (data.t === 'local.log') {
      (console[data.level] || console.warn)('[personal engine]', data.message); return;
    }
    if (data.t === 'local.closed') {
      currentSocket?.close(data.code, data.reason); return;
    }
    if (data.t === 'local.error') {
      fatal = data.message || '本地引擎启动失败';
      console.error('[personal engine]', fatal);
      const el = document.getElementById('boot-err'); if (el) el.textContent = fatal;
      currentSocket?.onerror?.({message:fatal});
      return;
    }
    if (currentSocket?.readyState === 1) currentSocket.onmessage?.({data:JSON.stringify(data)});
  };
  worker.onerror = event => {
    fatal = event.message || '本地引擎加载失败，请刷新页面';
    console.error('[personal worker]', fatal);
    const el = document.getElementById('boot-err'); if (el) el.textContent = fatal;
    currentSocket?.onerror?.({message:fatal});
  };
  return worker;
}
class LocalSocket {
  static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3;
  constructor(url) {
    this.url=url; this.readyState=0; this.bufferedAmount=0; currentSocket=this;
    engine(); if(ready)queueMicrotask(()=>this._open());
  }
  _open(){if(this.readyState!==0)return;this.readyState=1;this.onopen?.({target:this});}
  send(text){if(this.readyState!==1)throw new Error('Personal engine is not ready');worker.postMessage(JSON.parse(text));}
  close(code=1000,reason=''){this.readyState=3;if(currentSocket===this)currentSocket=null;queueMicrotask(()=>this.onclose?.({code,reason,wasClean:true}));}
  addEventListener(type,fn){this['on'+type]=fn;}
  removeEventListener(type,fn){if(this['on'+type]===fn)this['on'+type]=null;}
}
net.WS=LocalSocket;
// No remote room server is contacted. Each tab owns its isolated match engine.
await import('/js/main.js');

const badge = document.createElement('button');
badge.className = 'personal-edition';
badge.textContent = '个人演习版 · 本地引擎';
badge.title = '关于此个人版与操作说明';
document.body.append(badge);
const about = document.createElement('dialog');
about.className = 'personal-about';
about.innerHTML = `<h2>卫戍协议 · 个人演习版</h2><p>基于 <a href="https://github.com/sganggs/Stronghold-Protocol" target="_blank" rel="noopener noreferrer">Stronghold Protocol 0.3.3</a> 的个人单机移植。保留上游的干员、技能、盟约、装备、策略、难度与自动作战规则。</p><p><strong>独立模拟</strong>在你的浏览器中运行，无需连接原站或创建账号。此版只提供单人演习；每个页面有独立的本地引擎。</p><p>休整阶段可自由操作。招募、升级与机变需要点击两次确认；把干员拖到棋盘后选择朝向。三名同名干员合为精锐，并获得晋升招募。<strong>休整结束时剩余资金清零。</strong></p><p>快捷键：W 招募鼠标指向的商品，R 刷新，F 冻结，D 升级，Q 撤退，X 出售，空格准备或暂停。切到后台会自动暂停单人作战。</p><p>本版当前使用 2D 战场；原版 Spine 小人、头像与立绘按需载入。代码及修改遵循 <a href="/LICENSE" target="_blank">GPL-3.0-or-later</a>；明日方舟相关角色与素材归原权利人，详见 <a href="/NOTICE.md" target="_blank">上游声明</a>。私人非商业使用。</p><button>返回游戏</button>`;
document.body.append(about);
const saveHelp = document.createElement('p');
saveHelp.innerHTML = '<strong>休整自动存档</strong>会保存购买、部署、资金、盟约与随机状态。重新打开后，先进入大厅，再点击“继续上次休整”。战斗中关闭页面会回到最后一次休整；存档仅保存在当前浏览器。';
about.insertBefore(saveHelp, about.querySelector('button'));
const restoreError = document.createElement('p');
restoreError.className = 'personal-restore-error'; about.prepend(restoreError);
resume = document.createElement('button');
resume.className = 'personal-resume'; resume.hidden = true;
resume.onclick = () => {
  if (!checkpoint || restoring) return;
  restoring = true; updatePersonalUI(); worker.postMessage({t:'local.restore', snapshot:checkpoint});
};
saveStatus = document.createElement('div');
saveStatus.className = 'personal-save-status'; saveStatus.hidden = true;
document.body.append(resume, saveStatus);
badge.onclick = () => about.showModal();
about.querySelector('button').onclick = () => about.close();
store.subscribe(() => { badge.classList.toggle('in-match', selectRoute(store.get()) === 'game'); updatePersonalUI(); });
updatePersonalUI();
document.addEventListener('visibilitychange', () => {
  const m = store.get().match.public;
  if (document.hidden && m && isCombatPhase(m.phase) && !m.paused) net.request('g.pause', {on:true}).catch(()=>{});
});

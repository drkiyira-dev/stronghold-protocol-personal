import {analyzeBattle,compareBattles,coachPayload} from './tactics.mjs';
import {validateReplay, replayStatusText} from './replays.mjs';
import {saveCompatibility} from './save-vault.mjs';
import {CHALLENGE_PRESETS,validateChallenge} from './challenges.mjs';
import {CONNECTION_KEY,validateServerAddress} from './connection.mjs';
import {resolveEvidence,modelEvidence,validateModelCards} from './evidence.mjs';
import {createTerminalSession} from './terminal-session.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number.isFinite(v)?Math.round(v).toLocaleString():'—';
const date=v=>new Date(v).toLocaleString();
export function downloadJSON(name,value) {
  const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function mountToolkit(api) {
  const button=document.createElement('button');button.className='tactics-open';button.textContent='战术终端';button.title='复盘、战术教练、存档与挑战';
  const dialog=document.createElement('dialog');dialog.className='tactics';dialog.setAttribute('aria-label','战术终端');
  dialog.innerHTML=`<header class="tactics-header"><div><small>TACTICAL TERMINAL</small><h2>战术终端</h2></div><button data-close aria-label="关闭战术终端">返回游戏 ×</button></header><nav aria-label="战术终端分页"></nav><p class="tactics-status" role="status"></p><main class="tactics-body"></main>`;
  document.body.append(button,dialog);
  const tabs=[['overview','终端概览'],['replays','战斗复盘'],['saves','存档保险库'],['challenges','自定义挑战'],['network','联机与 AI'],['assets','素材状态']];
  let tab='replays',records=[],selected=null,timer=null,at=0,renderToken=0,requestAbort=null,returnFocus=null;
  const body=dialog.querySelector('main'),nav=dialog.querySelector('nav'),status=dialog.querySelector('[role=status]');
  const say=message=>{status.textContent=message;};
  const stop=()=>{clearInterval(timer);timer=null;};
  const run=fn=>async()=>{try{await fn();}catch(error){say(error.message || String(error));}};
  const session=createTerminalSession({pause:()=>api.pauseCombat?.(),release:lease=>api.resumeCombat?.(lease),
    onOpen:()=>{returnFocus=document.activeElement;dialog.showModal();render();},
    onClose:()=>{stop();requestAbort?.abort();renderToken++;dialog.close();if(returnFocus?.isConnected)returnFocus.focus();},onError:e=>say(e.message)});
  const close=()=>session.close();
  window.addEventListener('keydown',event=>{if(!dialog.open)return;if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)&&event.target?.getAttribute('role')==='tab'){event.preventDefault();const bs=[...nav.children],i=bs.indexOf(event.target),n=event.key==='Home'?0:event.key==='End'?bs.length-1:(i+(event.key==='ArrowRight'?1:-1)+bs.length)%bs.length;bs[n].click();bs[n].focus();}event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}},true);
  dialog.querySelector('[data-close]').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  const en={overview:'Overview',replays:'Battle review',saves:'Save vault',challenges:'Challenges',network:'Multiplayer & AI',assets:'Resources'};
  const updateLabels=()=>{const english=/^en/i.test(api.getLang?.() || '');button.textContent=english?'Tactical terminal':'战术终端';dialog.setAttribute('aria-label',button.textContent);dialog.querySelector('h2').textContent=button.textContent;dialog.querySelector('[data-close]').textContent=english?'Return to game ×':'返回游戏 ×';dialog.querySelector('[data-close]').setAttribute('aria-label',english?'Close tactical terminal':'关闭战术终端');for(const el of nav.children)el.textContent=english?en[el.dataset.tab]:tabs.find(x=>x[0]===el.dataset.tab)[1];};
  nav.setAttribute('role','tablist');nav.innerHTML=tabs.map(([id,name])=>`<button role="tab" aria-controls="tactical-panel" data-tab="${id}">${name}</button>`).join('');
  body.id='tactical-panel';body.setAttribute('role','tabpanel');
  nav.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...nav.children],i=buttons.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].click();buttons[next].focus();});
  api.onLangChange?.(()=>{updateLabels();if(dialog.open)render();});updateLabels();
  for(const el of nav.children)el.onclick=()=>{tab=el.dataset.tab;stop();render();};
  async function render() {
    requestAbort?.abort();const token=++renderToken;
    for(const el of nav.children){const active=el.dataset.tab===tab;el.setAttribute('aria-pressed',String(active));el.setAttribute('aria-selected',String(active));el.tabIndex=active?0:-1;}
    say(api.status?.() || '');
    if(tab==='overview'){renderOverview();return;}
    if(tab==='replays') {
      body.innerHTML='<p>正在读取本机复盘记录…</p>';
      try {await api.importHistory?.();records=await api.replays.list();}catch(error){body.textContent=error.message;return;}
      if(token!==renderToken)return;
      if(!records.some(r=>r.id===selected))selected=records[0]?.id;
      const r=records.find(r=>r.id===selected);
      body.innerHTML=`<div class="tactics-actions"><label>战斗记录<select data-record aria-label="选择战斗记录">${records.map(x=>`<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.title || `第 ${x.round} 回合`)} · ${esc(date(x.at))} · ${esc(replayStatusText(x))}</option>`).join('')}</select></label><button data-import>导入复盘</button>${r?'<button data-export>导出复盘</button>':''}<input type="file" accept=".json,application/json" data-file hidden></div><section data-replay></section>`;
      body.querySelector('[data-import]').onclick=()=>body.querySelector('[data-file]').click();
      body.querySelector('[data-file]').onchange=run(async()=>{const file=body.querySelector('[data-file]').files[0];if(!file)return;if(file.size>5000000)throw new Error('复盘文件不能超过 5 MB');const value=validateReplay(JSON.parse(await file.text()));await api.replays.put(value);selected=value.id;await render();say('复盘已导入');});
      body.querySelector('[data-record]').onchange=event=>{selected=event.target.value;stop();at=0;render();};
      if(!r){body.querySelector('[data-replay]').innerHTML='<div class="tactics-empty"><h3>从下一场战斗开始记录</h3><p>完成战斗后，这里会显示时间轴、输出排名和战术建议。旧版历史记录只提供结算汇总。</p></div>';return;}
      body.querySelector('[data-export]').onclick=()=>downloadJSON(`replay-${r.id.replace(/[^a-zA-Z0-9_-]/g,'_')}.json`,r);
      renderReplay(r,body.querySelector('[data-replay]'));
    } else if(tab==='saves')renderSaves();
    else if(tab==='challenges')renderChallenges();
    else if(tab==='network')renderNetwork();
    else renderAssets();
  }
  function renderOverview(){
    const c=api.capabilities?.() || {};
    body.innerHTML=`<h3>战术与进度</h3><p data-capability>${esc(c.summary || '')} · ${c.online?'已连接':'未连接'}</p><p>复盘、证据建议、休整存档和服务器恢复集中在同一个终端。多人战斗持续进行；打开终端不会暂停整个房间。</p><div data-resume-slot></div><p>${esc(c.roomStatus?.message || '本地存档只恢复休整，不恢复战斗中途。')}</p>${c.roomStatus?.status==='awaiting-consent'?'<button data-accept-recovery>我已了解回退范围，确认恢复</button>':''}<div class="tactics-actions"><button data-open-saves>查看休整备份</button><button data-open-replays>查看战斗证据</button></div><hr>${api.aboutHTML || ''}`;
    if(api.resumeButton)body.querySelector('[data-resume-slot]').append(api.resumeButton);
    const accept=body.querySelector('[data-accept-recovery]');if(accept)accept.onclick=run(async()=>{const result=await api.acceptRecovery();say(result.waiting?'已确认，等待其他成员。':'所有成员已确认，已恢复休整。');});
    body.querySelector('[data-open-saves]').onclick=()=>{tab='saves';render();};body.querySelector('[data-open-replays]').onclick=()=>{tab='replays';render();};
  }
  function renderReplay(r,root) {
    const viewToken=renderToken;let highlightUnit=null,modelTicket=0;const current=()=>dialog.open&&viewToken===renderToken&&root.isConnected;
    const analysis=analyzeBattle(r),max=Math.max(0,r.frames.length-1);at=Math.min(at,max);
    root.innerHTML=`<p class="tactics-note" data-replay-quality>${esc(replayStatusText(r))}。未记录的数值显示为“—”，不表示 0。</p><div class="tactics-metrics">${[['伤害',analysis.totals.damage],['治疗',analysis.totals.healing],['漏敌',analysis.totals.leaks],['己方死亡',analysis.totals.deaths]].map(([k,v])=>`<article data-metric="${({伤害:'damage',治疗:'healing',漏敌:'leaks',己方死亡:'deaths'})[k]}"><small>${k}</small><strong>${num(v)}</strong></article>`).join('')}</div>
      ${r.frames.length?`<div class="tactics-replay-grid"><section><canvas width="900" height="450" aria-label="战斗复盘位置示意图"></canvas><div class="tactics-actions"><button data-play>播放</button><select data-speed aria-label="复盘速度"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select><input type="range" min="0" max="${max}" value="${at}" data-time aria-label="复盘时间"><output data-clock></output></div><p class="tactics-note">每秒采样的位置和生命示意，非逐帧视频。绿色为己方，红色为敌方，灰色为工事；不用于恢复战斗。</p></section><aside><h3>关键事件</h3><p class="tactics-note">每页显示 80 条；所有已录制事件均可翻页查看和导出。</p><div class="tactics-events"></div></aside></div>`:'<p class="tactics-note">此记录没有可用的时间轴，无法还原未录制的战斗过程。</p><h3>已记录事件</h3><div class="tactics-events"></div>'}
      <h3>干员表现</h3><div class="tactics-table"><table><thead><tr><th>干员</th><th>伤害</th><th>DPS</th><th>治疗</th><th>承伤</th><th>攻击次数</th></tr></thead><tbody>${analysis.rows.map((u,i)=>`<tr data-unit-row="${i}"><td>${esc(u.name)}</td><td>${num(u.dmg)}</td><td>${num(u.dps)}</td><td>${num(u.heal)}</td><td>${num(u.taken)}</td><td>${num(u.attacks)}</td></tr>`).join('') || '<tr><td colspan="6">本记录没有干员级统计</td></tr>'}</tbody></table></div>
      <h3>战术教练 2.0 <small>本地规则 v2 · 无需密钥</small></h3><div class="tactics-advice">${analysis.advice.map(a=>`<article><small>${esc(a.priority)}</small><h4>${esc(a.title)}</h4><p><strong>观察：</strong>${esc(a.evidence)}</p><p><strong>假设：</strong>${esc(a.hypothesis)}</p><p><strong>下次调整：</strong>${esc(a.action)}</p><div class="tactics-citations">${a.refs.map(id=>`<button data-evidence="${esc(id)}">${esc(resolveEvidence(analysis.evidence,id)?.label || '依据')}</button>`).join('')}</div></article>`).join('')}</div>
      <section class="tactics-evidence" tabindex="-1" aria-live="polite" data-evidence-detail>点击建议下的引用，可核查原始事实或定位事件。</section><div class="tactics-actions"><button data-coach>请大模型分析本场</button><button data-prompt>导出教练分析包</button><label>对比记录<select data-compare aria-label="对比战斗"><option value="">选择另一场</option>${records.filter(x=>x.id!==r.id).map(x=>`<option value="${esc(x.id)}">${esc(x.title || `第 ${x.round} 回合`)} · ${esc(date(x.at))}</option>`).join('')}</select></label></div><p data-comparison></p><div class="tactics-model" data-model></div>`;
    root.querySelector('[data-prompt]').onclick=()=>downloadJSON('tactical-coach.json',coachPayload(r));
    root.querySelector('[data-coach]').onclick=async()=>{
      const ticket=++modelTicket,stillCurrent=()=>current()&&ticket===modelTicket;
      try{
      const endpoint=sessionStorage.getItem('stronghold.coach.endpoint');
      if(!endpoint)throw new Error('请在“联机与 AI”中配置可选教练服务；本地分析已经可以直接使用');
      root.querySelector('[data-model]').textContent='大模型正在分析…';
      requestAbort?.abort();requestAbort=new AbortController();const controller=requestAbort,timeout=setTimeout(()=>controller.abort(),45000);
      let response,value;try{response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(api.coachToken?{Authorization:`Bearer ${api.coachToken}`}:{})},body:JSON.stringify(coachPayload(r)),signal:controller.signal,credentials:'omit'});value=await response.json();}finally{clearTimeout(timeout);}if(!stillCurrent())return;
      if(!response.ok)throw new Error(value.error || `服务返回 ${response.status}`);
      if(!stillCurrent())return;const mapping=modelEvidence(analysis),cards=validateModelCards(value,mapping.map(e=>e.id));
      root.querySelector('[data-model]').innerHTML=`<p>可选模型建议（${esc(value.model || '已配置服务')}）；假设需要下一局验证。</p>${cards.map(c=>`<article><p>观察：${esc(c.observation)}</p><p>假设：${esc(c.hypothesis)}</p><p>调整：${esc(c.action)}</p>${c.refs.map(id=>`<button data-evidence="${esc(mapping.find(e=>e.id===id).localId)}">${esc(mapping.find(e=>e.id===id).label)}</button>`).join('')}</article>`).join('')}`;
      }catch(e){if(stillCurrent()){root.querySelector('[data-model]').textContent='模型建议不可用：'+e.message+'。本地证据和建议仍可查看。';}}
    };
    root.querySelector('[data-compare]').onchange=event=>{const b=records.find(x=>x.id===event.target.value);if(!b)return;const d=compareBattles(r,b);root.querySelector('[data-comparison]').textContent=`对比记录相对当前记录：伤害 ${d.damage!=null&&d.damage>=0?'+':''}${num(d.damage)}，治疗 ${d.healing!=null&&d.healing>=0?'+':''}${num(d.healing)}，漏敌 ${d.leaks!=null&&d.leaks>=0?'+':''}${num(d.leaks)}，己方死亡 ${d.deaths!=null&&d.deaths>=0?'+':''}${num(d.deaths)}。${d.reason}`;};
    const showEvidence=id=>{const evidence=resolveEvidence(analysis.evidence,id);if(!evidence)return;root.querySelectorAll('.evidence-selected').forEach(el=>el.classList.remove('evidence-selected'));const detail=root.querySelector('[data-evidence-detail]');detail.textContent=evidence.kind==='event'?`${evidence.label} · ${evidence.scope==='personal'?'个人事件':'战场事件（不推断归属于当前玩家）'}`:`${evidence.label}：${evidence.known?String(evidence.value):'未记录'} · 来源 ${evidence.path}`;
      if(evidence.kind==='event'){highlightUnit=evidence.unit;if(r.frames.length){at=r.frames.reduce((best,f,i)=>Math.abs(f.t-evidence.t)<Math.abs(r.frames[best].t-evidence.t)?i:best,0);draw();detail.textContent+=` · 最近采样 ${r.frames[at].t}s（非战斗存档）`;}else detail.textContent+=' · 无可用画面，仅保留事件记录';}
      else {const key=evidence.key,el=key.startsWith('total.')?root.querySelector(`[data-metric="${key.slice(6)}"]`):key.startsWith('unit.')?root.querySelector(`[data-unit-row="${key.split('.')[1]}"]`):null;el?.classList.add('evidence-selected');}
      detail.focus();};
    root.addEventListener('click',event=>{const button=event.target.closest('[data-evidence]');if(button)showEvidence(button.dataset.evidence);});
    const draw=()=>{if(!r.frames.length)return;const f=r.frames[at];root.querySelector('[data-time]').value=at;root.querySelector('[data-clock]').textContent=`${f.t.toFixed(1)}s`;drawFrame(root.querySelector('canvas'),f,r,highlightUnit);};
    if(r.frames.length){root.querySelector('[data-time]').oninput=event=>{at=Number(event.target.value);draw();};
    root.querySelector('[data-play]').onclick=()=>{if(timer){stop();root.querySelector('[data-play]').textContent='播放';return;}if(at===max)at=0;root.querySelector('[data-play]').textContent='暂停';timer=setInterval(()=>{if(at>=max){stop();root.querySelector('[data-play]').textContent='播放';return;}at++;draw();},1000/Number(root.querySelector('[data-speed]').value));};
    root.querySelector('[data-speed]').onchange=()=>{if(timer){stop();root.querySelector('[data-play]').textContent='播放';root.querySelector('[data-play]').click();}};
    }
    let eventPage=0;const events=r.events;const list=root.querySelector('.tactics-events');const renderEvents=()=>{list.innerHTML=events.slice(eventPage*80,(eventPage+1)*80).map(e=>{const ref=analysis.evidence.events[r.events.indexOf(e)];return `<button data-evidence="${esc(ref?.id)}">${esc(ref?.label)}</button>`;}).join('') || '<p>未记录到关键事件</p>';list.insertAdjacentHTML('beforeend',`<div class="tactics-actions"><button data-prev ${eventPage?'':'disabled'}>上一页</button><span>${eventPage+1}/${Math.max(1,Math.ceil(events.length/80))}</span><button data-next ${(eventPage+1)*80>=events.length?'disabled':''}>下一页</button></div>`);list.querySelector('[data-prev]').onclick=()=>{eventPage--;renderEvents();};list.querySelector('[data-next]').onclick=()=>{eventPage++;renderEvents();};};renderEvents();draw();
  }
  function drawFrame(canvas,frame,r,highlightUnit) {
    const ctx=canvas.getContext('2d');ctx.fillStyle='#091713';ctx.fillRect(0,0,900,450);
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const f of r.frames)for(const u of f.units){minX=Math.floor(Math.min(minX,u[1]));maxX=Math.ceil(Math.max(maxX,u[1]));minY=Math.floor(Math.min(minY,u[2]));maxY=Math.ceil(Math.max(maxY,u[2]));}
    if(!Number.isFinite(minX)){minX=0;maxX=10;minY=0;maxY=4;}
    minX--;maxX++;minY--;maxY++;
    const scale=Math.min(800/(maxX-minX+1),360/(maxY-minY+1));
    const left=(900-(maxX-minX+1)*scale)/2,top=(450-(maxY-minY+1)*scale)/2;
    const px=x=>left+(x-minX+.5)*scale,py=y=>top+(maxY-y+.5)*scale;
    ctx.strokeStyle='#224138';for(let x=minX;x<=maxX+1;x++){ctx.beginPath();ctx.moveTo(px(x-.5),py(minY-.5));ctx.lineTo(px(x-.5),py(maxY+.5));ctx.stroke();}for(let y=minY;y<=maxY+1;y++){ctx.beginPath();ctx.moveTo(px(minX-.5),py(y-.5));ctx.lineTo(px(maxX+.5),py(y-.5));ctx.stroke();}
    for(const [id,x,y,hp,maxHp] of frame.units){const u=r.units[id]||{},cx=px(x),cy=py(y);if(u.kind==='device'){ctx.fillStyle='#718477';ctx.fillRect(cx-13,cy-13,26,26);continue;}ctx.globalAlpha=hp>0?1:.3;ctx.fillStyle=u.side==='ally'?'#69e0b6':'#ff857b';ctx.beginPath();ctx.arc(cx,cy,Math.max(5,Math.min(12,scale*.25)),0,Math.PI*2);ctx.fill();ctx.fillStyle='#14291f';ctx.fillRect(cx-16,cy-20,32,4);ctx.fillStyle='#8ce4a6';ctx.fillRect(cx-16,cy-20,32*Math.max(0,Math.min(1,hp/Math.max(1,maxHp))),4);if(u.side==='ally'){ctx.fillStyle='#e2f2eb';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText(String(u.name||id).slice(0,8),cx,cy+25);}if(String(id)===String(highlightUnit)){ctx.strokeStyle='#fff1a8';ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,cy,18,0,Math.PI*2);ctx.stroke();}ctx.globalAlpha=1;}
  }
  function renderSaves() {
    const saves=api.vault.list();
    body.innerHTML=`<h3>休整存档保险库</h3><p>这里只保存休整阶段。战斗中退出会回到最近一次休整，不会恢复到战斗中的某一帧。</p><p>自动保留同一局最近 3 个不同状态，最多 18 份存档。手动备份不自动淘汰；IndexedDB 事务原子提交，保留旧副本和迁移前原文。规则或引擎不兼容时保留原档，并说明原因。</p><div class="tactics-actions"><button data-export-all>导出全部备份</button><button data-export-raw>导出原始恢复数据</button><button data-import-save>导入存档</button><input type="file" accept=".json,application/json" data-save-file hidden></div><p>${esc(api.vault.warning())}</p><div class="tactics-save-list">${saves.map(s=>{const c=saveCompatibility(s.snapshot,api.compatibility());return `<article><div><h4>第 ${s.snapshot.round} 回合 ${s.manual?'· 手动备份':''}</h4><p>${esc(date(s.at))} · ${esc(s.label || s.snapshot.options.difficulty)}</p><small>${esc(c.reason)}</small></div><div class="tactics-actions"><button data-restore="${esc(s.id)}" ${c.ok&&api.connection.mode==='local'?'':'disabled'}>恢复休整</button><button data-pin="${esc(s.id)}">保留备份</button><button data-export="${esc(s.id)}">导出</button></div></article>`;}).join('') || '<p>暂无休整存档。进入独立模拟的休整阶段后自动保存。</p>'}</div>`;
    body.querySelector('[data-export-all]').onclick=()=>downloadJSON('stronghold-saves.json',api.vault.export());
    body.querySelector('[data-export-raw]').onclick=()=>downloadJSON('stronghold-recovery.json',api.vault.exportRaw());
    body.querySelector('[data-import-save]').onclick=()=>body.querySelector('[data-save-file]').click();
    body.querySelector('[data-save-file]').onchange=run(async()=>{const f=body.querySelector('[data-save-file]').files[0];if(!f)return;if(f.size>1800000)throw new Error('存档文件过大');const raw=await f.text();await api.vaultWrite(()=>api.vault.import(raw));api.refreshSave();renderSaves();say('已合并导入；原有存档仍保留。恢复不同身份的存档前，请在大厅刷新页面。');});
    if(api.vault.migration){const migration=api.vault.migration();body.insertAdjacentHTML('beforeend',`<section><h3>迁移与回退</h3><p>已无损迁移旧目录到事务保险库。修订 ${migration.revision}；旧浏览器原文保持不变。规则和引擎不同的存档仍拒绝恢复。</p><p>回退会切换到首次升级前的目录；回退前目录另行保留，可撤销。此操作不直接恢复游戏。</p><button data-rollback>回退到升级前目录</button><button data-undo-rollback>撤销目录回退</button></section>`);
      if(api.vault.legacyConflict?.()){body.insertAdjacentHTML('beforeend','<p>检测到旧标签页写入。请先关闭旧版本标签页并导出原始数据，再选择保留当前事务进度。旧写入会完整归档，不会变成活动存档。</p><button data-reconcile>已关闭旧页：归档冲突并继续当前进度</button>');body.querySelector('[data-reconcile]').onclick=run(async()=>{api.assertCanSwitch();await api.vault.reconcileLegacy();api.refreshSave();renderSaves();say('旧写入已归档，当前活动进度保持不变。');});}
      body.querySelector('[data-rollback]').onclick=run(async()=>{api.assertCanSwitch();await api.vault.rollbackMigration();api.refreshSave();renderSaves();say('目录已回退，回退前数据仍保留。选择休整存档后再恢复游戏。');});
      body.querySelector('[data-undo-rollback]').onclick=run(async()=>{api.assertCanSwitch();await api.vault.undoRollback();api.refreshSave();renderSaves();say('已恢复回退前目录。');});
    }
    for(const el of body.querySelectorAll('[data-restore]'))el.onclick=run(async()=>{await api.restore(el.dataset.restore);close();});
    for(const el of body.querySelectorAll('[data-pin]'))el.onclick=run(async()=>{const s=saves.find(s=>s.id===el.dataset.pin);await api.vaultWrite(()=>api.vault.save(s.snapshot,{manual:true,label:'手动保留',activate:false}));api.refreshSave();renderSaves();say('备份已保留');});
    for(const el of body.querySelectorAll('[data-export]'))el.onclick=()=>downloadJSON(`prep-round-${saves.find(s=>s.id===el.dataset.export).snapshot.round}.json`,api.vault.exportOne(el.dataset.export));
  }
  function renderChallenges() {
    const active=api.challenge();
    body.innerHTML=`<h3>声明式挑战工坊</h3><p>固定种子让对比更有意义。挑战支持部署上限、禁用干员、禁止刷新与禁止装备，独立记录复盘，不计入标准战绩。挑战包仅包含 JSON，不执行脚本。</p><div class="tactics-advice">${CHALLENGE_PRESETS.map((c,i)=>`<article><h4>${esc(c.name)}</h4><p>${esc(c.description)}</p><small>种子 ${c.seed}</small><div class="tactics-actions"><button data-preset="${i}">载入配置</button></div></article>`).join('')}</div><label>挑战配置<textarea data-challenge aria-label="挑战 JSON 配置" spellcheck="false" rows="14">${esc(JSON.stringify(active || CHALLENGE_PRESETS[0],null,2))}</textarea></label><div class="tactics-actions"><button data-activate>启用此挑战</button><button data-standard>恢复标准模拟</button><button data-export-challenge>导出挑战包</button><button data-import-challenge>导入挑战包</button><input type="file" data-challenge-file accept=".json,application/json" hidden></div><p>当前：${esc(active?.name || '标准模拟')}。启用后从大厅建立新的独立模拟；请先完成或离开当前对局。</p><h3>开发自己的 Mod</h3><p>自托管服务器支持上游内容插件。仓库附有无需脚本的实验守卫与训练资金示例；安装和规则说明见 <a href="https://github.com/drkiyira-dev/stronghold-protocol-personal/blob/main/docs/PERSONAL.zh-CN.md" target="_blank" rel="noopener noreferrer">开发指南</a>。浏览器单人模式暂不加载服务器 Mod。</p>`;
    for(const el of body.querySelectorAll('[data-preset]'))el.onclick=()=>{body.querySelector('textarea').value=JSON.stringify(CHALLENGE_PRESETS[Number(el.dataset.preset)],null,2);};
    const read=()=>validateChallenge(JSON.parse(body.querySelector('textarea').value));
    body.querySelector('[data-activate]').onclick=run(async()=>{await api.setChallenge(read());renderChallenges();say('挑战已启用：下一场独立模拟使用此种子和规则');});
    body.querySelector('[data-standard]').onclick=run(async()=>{await api.setChallenge(null);renderChallenges();say('已恢复标准模拟');});
    body.querySelector('[data-export-challenge]').onclick=run(()=>downloadJSON('challenge.json',read()));
    body.querySelector('[data-import-challenge]').onclick=()=>body.querySelector('[data-challenge-file]').click();
    body.querySelector('[data-challenge-file]').onchange=run(async()=>{const f=body.querySelector('[data-challenge-file]').files[0];if(!f)return;if(f.size>30000)throw new Error('挑战包过大');body.querySelector('textarea').value=JSON.stringify(validateChallenge(JSON.parse(await f.text())),null,2);say('已载入，请核对规则后启用');});
  }
  function renderNetwork() {
    body.innerHTML=`<h3>多人联机</h3><p>当前连接：<strong>${api.connection.mode==='remote'?'自托管房间服务器':'本地单人引擎'}</strong></p><p>本机或局域网运行 <code>npm run server</code>，从服务器输出的地址打开游戏。房间服务器负责共享状态与身份重连；静态站点本身不托管联机房间。原站账号同步和远程 AI 队友尚未接入。</p><label>房间服务器 WebSocket 地址<input data-server aria-label="房间服务器地址" placeholder="wss://your-server.example/ws" value="${esc(api.connection.url || '')}"></label><div class="tactics-actions"><button data-connect>保存并连接服务器</button><button data-local>切回本地单人</button></div><h3>可选大模型战术教练</h3><p>本地建议始终无需密钥。自托管后端配置模型服务后，可把选中战斗的数值摘要与建议发送给它；不会发送存档、身份令牌或博士代号。仅点击“请大模型分析本场”时发送。</p><label>教练接口地址<input data-endpoint aria-label="教练接口地址" placeholder="https://your-server.example/api/coach" value="${esc(sessionStorage.getItem('stronghold.coach.endpoint') || '')}"></label><label>服务访问令牌（仅本次会话）<input data-token aria-label="教练服务访问令牌" type="password" autocomplete="off"></label><button data-ai>保存教练连接</button><p class="tactics-note">模型提供商密钥只配置在后端环境变量中，不放进网页或 GitHub。</p>`;
    body.querySelector('[data-token]').value=api.coachToken || '';
    body.querySelector('[data-connect]').onclick=run(()=>{api.assertCanSwitch();const url=validateServerAddress(body.querySelector('[data-server]').value,location.protocol);localStorage.setItem(CONNECTION_KEY,JSON.stringify({mode:'remote',url}));const next=new URL(location.href);next.searchParams.delete('server');location.assign(next.href);});
    body.querySelector('[data-local]').onclick=run(()=>{api.assertCanSwitch();localStorage.removeItem(CONNECTION_KEY);const next=new URL(location.href);next.searchParams.delete('server');location.assign(next.href);});
    body.querySelector('[data-ai]').onclick=run(()=>{const raw=body.querySelector('[data-endpoint]').value.trim();if(raw){const url=new URL(raw);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.search)throw new Error('教练接口地址无效');if(location.protocol==='https:'&&url.protocol!=='https:')throw new Error('当前站点需要 HTTPS 教练接口');sessionStorage.setItem('stronghold.coach.endpoint',url.href);}else sessionStorage.removeItem('stronghold.coach.endpoint');api.coachToken=body.querySelector('[data-token]').value;say('教练连接已保存，本次尚未发送战斗数据');});
  }
  async function renderAssets() {
    body.innerHTML='<h3>外部素材与诊断</h3><p>正在读取素材索引…</p>';
    try {const r=await fetch('/personal/external-assets.json');if(!r.ok)throw new Error('素材索引尚未生成');const a=await r.json();if(tab!=='assets')return;body.innerHTML=`<h3>外部素材与诊断</h3><p>角色、立绘、模型贴图、音乐与语音按需从记录的外部地址读取。站点保留必要的格式适配元数据。外部服务不可用时可能缺图或无声，不改变战斗规则。</p><div class="tactics-metrics"><article><small>外部资源映射</small><strong>${num(Object.keys(a.files).length)}</strong></article><article><small>未映射资源</small><strong>${num(a.unmapped.length)}</strong></article></div><button data-check>检查代表性素材连接</button><pre data-asset-status></pre>`;body.querySelector('[data-check]').onclick=run(async()=>{const lines=[];for(const [path,urls] of Object.entries(a.samples || {})){try{const res=await fetch(urls[0],{method:'GET',signal:AbortSignal.timeout(10000)});await res.body?.cancel();lines.push(`${res.ok?'可用':'异常 '+res.status} · ${path}`);}catch{lines.push(`无法访问 · ${path}`);}body.querySelector('[data-asset-status]').textContent=lines.join('\n');}});}catch(e){body.textContent=e.message;}
  }
  button.onclick=()=>session.open();
  return {open:()=>button.click(),notify:say,refreshStatus:()=>{if(dialog.open&&tab==='overview')renderOverview();},refresh:()=>{if(dialog.open)render();},close};
}

// Automated integration: real static content, local Match + browser Battle Worker.
// Commands below are normal player requests; no fabricated battle result or forced outcome.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {validateReplay} from './replays.mjs';
import {analyzeBattle} from './tactics.mjs';
import {VAULT_DB} from './transactional-vault.mjs';
import {startStagePreview} from './custom-stage-preview.mjs';
const app=await startStagePreview();let browser,page;
const report={kind:'automated-browser',manualAcceptance:false,externalAssets:'blocked',checks:[]};
await mkdir('.cache/verification',{recursive:true});
try{
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900}});page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
  const connectStore=()=>page.evaluate(async()=>{window.__stageQAStore=(await import('/js/store.js')).store;});
  await page.goto(app.url);await connectStore();await page.getByPlaceholder(/输入你的代号/).fill('V15Auto');
  await page.getByRole('button',{name:'开始',exact:true}).click();
  const request=(t,fields={})=>page.evaluate(async({t,fields})=>{try{return await (await import('/js/net.js')).net.request(t,fields);}catch(e){const s=(await import('/js/store.js')).store.get();throw Error(JSON.stringify({command:t,fields,phase:s.match.public?.phase,round:s.match.public?.round,ready:s.match.private?.ready,detail:e.detail,code:e.code,message:e.message}));}},{t,fields});
  const phase=(round,p='PREP')=>page.waitForFunction(({round,p})=>{const m=window.__stageQAStore.get().match.public;return m?.round===round&&m?.phase===p;},{round,p},{timeout:120000});
  const measure=()=>page.evaluate(async()=>{
    const values=[];await new Promise(resolve=>{let n=0;function tick(){if(n++>=60)values.push(__SP_VIEW__.raw.stats());if(n<180)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});
    return {samples:values.length,fps:values.reduce((a,v)=>a+v.fps,0)/values.length,frameMs:values.reduce((a,v)=>a+v.frameMs,0)/values.length,optionalMeshes:values.at(-1).environment.meshes,mainHeapBytes:performance.memory?.usedJSHeapSize??null};
  });
  const finishToLobby=async()=>{
    await page.locator('.settle__next').click();await page.locator('.settle__back').click();
    await page.locator('.rs-exit').click();await page.locator('.lobby-screen').waitFor();
  };
  const enter=async()=>{
    await page.waitForFunction(()=>window.__stageQAStore.get().connection.status==='online');
    await page.locator('.tactics-open').click();await page.getByRole('tab',{name:'自定义挑战',exact:true}).click();
    assert.match(await page.locator('.tactics-original-stage').innerText(),/不支持恢复/);
    await page.locator('[data-start-original]').click();await page.getByRole('button',{name:'开始模拟',exact:true}).waitFor();
    await page.waitForFunction(()=>{const s=window.__stageQAStore.get();return s.room?.content?.modeId==='mode_x_rainfall_defense_patrol'&&s.room.seats[0]?.content==='ready';});
    await page.locator('.solo-brief h2').filter({hasText:'雨夜防线'}).waitFor();
    assert.match(await page.locator('.solo-brief').innerText(),/共 3 回合/);
    assert.doesNotMatch(await page.locator('.solo-brief').innerText(),/共 9 回合|常规奖励/);
    await page.getByRole('button',{name:'开始模拟',exact:true}).click();
    await page.getByRole('button',{name:'准备就绪',exact:true}).waitFor();
    assert.equal(await page.locator('.personal-stage-brief').count(),1);assert.equal(await page.locator('.brief-reroll').count(),0);
    await page.getByRole('button',{name:'准备就绪',exact:true}).click();
    await page.waitForFunction(()=>window.__stageQAStore.get().match.public?.phase==='BAND_DRAFT');
    await request('g.band',{bandId:'band_sarkazb'});await phase(1);
  };
  const vaultSnapshot=()=>page.evaluate(VAULT_DB=>{
    return new Promise((resolve,reject)=>{const r=indexedDB.open(VAULT_DB,1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('vault').objectStore('vault').get('active');q.onsuccess=()=>{db.close();resolve(JSON.stringify(q.result));};q.onerror=()=>{db.close();reject(q.error);};};});
  },VAULT_DB);
  // Create a real standard preparation checkpoint before entering the custom stage.
  await request('room.create',{mode:'solo',difficulty:'FUNNY'});await request('room.start');
  await page.waitForFunction(()=>window.__stageQAStore.get().match.public?.phase==='INFO_CHECK');await request('g.infoReady');
  await page.waitForFunction(()=>window.__stageQAStore.get().match.public?.phase==='BAND_DRAFT');await request('g.band',{bandId:'band_amiya'});await phase(1);
  await page.locator('.personal-save-status').filter({hasText:'休整存档 R1'}).waitFor();
  const originalSave=await vaultSnapshot();await page.reload();await connectStore();
  const officialBefore=await page.evaluate(async()=>{const {loadStats,isModdedRecord}=await import('/js/ui/stats.js');return loadStats().records.filter(r=>!isModdedRecord(r));});
  await page.locator('.lobby-screen').waitFor();
  await enter();
  await page.locator('.gtop__exit').click();await page.getByRole('button',{name:'放弃模拟',exact:true}).click();
  await page.locator('.lobby-screen').waitFor();assert.equal(await vaultSnapshot(),originalSave);
  await request('room.create',{mode:'solo',difficulty:'FUNNY'});
  assert.equal(await page.evaluate(()=>window.__stageQAStore.get().room.content.vanilla),true);
  await page.locator('.solo-brief').filter({hasText:'共 9 回合'}).waitFor();
  await page.locator('.rs-exit').click();await page.locator('.lobby-screen').waitFor();
  report.checks.push('Abandon button clears original-stage selection and restores standard mode without changing the save');
  await enter();
  report.checks.push('UI entry, data-only content handshake and accurate three-assault briefing');
  for(let round=1;round<=3;round++){
    await phase(round);
    await page.locator('.shopbar:not(.is-locked)').waitFor();
    console.log('prep',round,await page.evaluate(async()=>{const s=(await import('/js/store.js')).store.get();return {phase:s.match.public?.phase,round:s.match.public?.round,players:s.match.public?.players.map(p=>({id:p.playerId,ready:p.ready}))};}));
    for(const slot of round===3?[0,1,2]:[0,1])await request('g.buy',{slot});
    await page.evaluate(async()=>{
      const {net}=await import('/js/net.js'),{store}=await import('/js/store.js'),{data}=await import('/js/data.js');
      for(const piece of store.get().match.private.hand.filter(p=>p?.kind==='chess')){
        const ranged=data.get('chess')[piece.id].position==='RANGED';let placed=false;
        for(const [row,col]of ranged?[[10,5],[10,6],[11,3],[9,6],[12,5],[10,8]]:[[11,4],[11,7],[10,4],[9,4],[9,7],[12,7]]){
          if(store.get().match.private.board.some(p=>p.row===row&&p.col===col))continue;
          try{await net.request('g.move',{uid:piece.uid,to:{area:'board',row,col},dir:'RIGHT'});placed=true;break;}catch{}
        }
        if(!placed)throw Error('No legal placement for '+piece.id);
      }
    });
    if(round===1){
      await page.screenshot({path:'.cache/verification/v15-automated-map.png'});
      await page.evaluate(async()=>{(await import('/js/ui/settingsStore.js')).settingsStore.set({quality:'high'});(await import('/personal/visual-state.mjs')).setMenuMotion(true);});
      report.before=await page.evaluate(()=>__SP_VIEW__.raw.stats());report.performance={viewport:'1440x900 DPR 1',kind:'headless Chrome, preparation only',high:await measure()};
      await page.evaluate(async()=>{(await import('/js/ui/settingsStore.js')).settingsStore.set({quality:'low'});(await import('/personal/visual-state.mjs')).setMenuMotion(false);});
      await page.waitForFunction(()=>__SP_VIEW__.raw.stats().environment?.meshes===0);
      report.performance.static=await measure();
      report.checks.push('Low quality and static mode remove optional environment geometry');
    }
    await request('g.ready',{ready:true});
    await page.waitForFunction(()=>window.__stageQAStore.get().match.battle?.authoritative===true);
    if(round<3)await phase(round+1);
    else await page.waitForFunction(()=>window.__stageQAStore.get().match.result?.victory===true,null,{timeout:120000});
  }
  report.victory=await page.evaluate(async()=>(await import('/js/store.js')).store.get().match.result);
  assert.equal(report.victory.roundsPassed,3);assert.equal(report.victory.players[0].stats.leaks,0);
  await page.locator('.settle__next').waitFor();
  await page.screenshot({path:'.cache/verification/v15-automated-victory.png'});
  const separated=await page.evaluate(async()=>{
    const {loadStats,isModdedRecord}=await import('/js/ui/stats.js');const records=loadStats().records;
    return {modded:records.filter(r=>isModdedRecord(r)&&r.end==='settled').length,
      abandoned:records.filter(r=>isModdedRecord(r)&&r.end==='quit').length,official:records.filter(r=>!isModdedRecord(r))};
  });assert.equal(separated.modded,1);assert.equal(separated.abandoned,1);assert.deepEqual(separated.official,officialBefore);
  const actualReplays=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const r=indexedDB.open('stronghold.personal.tactics',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('replays').objectStore('replays').getAll();q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>{db.close();reject(q.error);};};
  }));
  report.replays=actualReplays.filter(r=>r.provenance?.scenario?.originalStage==='rainfall-defense').map(r=>{validateReplay(r);const a=analyzeBattle(r);return {round:r.round,provenance:r.provenance,frames:r.frames.length,events:r.events.length,quality:r.quality,damage:a.totals.damage,leaks:a.totals.leaks};});
  assert.equal(report.replays.length,3);assert.equal(new Set(report.replays.map(r=>r.provenance.runId)).size,1);
  assert.ok(report.replays.every(r=>r.provenance.scenario.originalStage==='rainfall-defense'&&r.provenance.cs===r.provenance.dataHash&&r.frames>0&&r.events>0&&r.quality.resultReceived&&!r.quality.truncated&&r.quality.gaps.length===0&&r.damage>0&&r.leaks===0));
  assert.equal(await vaultSnapshot(),originalSave);
  report.checks.push('Three real browser battles, victory, zero leaks, preserved standard save, replay/coach provenance and unofficial statistics isolation');
  await page.locator('.tactics-open').click();await page.getByRole('tab',{name:'战斗复盘',exact:true}).click();
  await page.locator('[data-record] option').nth(2).waitFor({state:'attached'});assert.equal(await page.locator('[data-record] option').count(),3);
  assert.equal(await page.getByText('个人统计不可用',{exact:true}).count(),0);
  await page.screenshot({path:'.cache/verification/v15-automated-replay.png'});
  await page.getByRole('button',{name:'关闭战术终端',exact:true}).click();
  await finishToLobby();await page.reload();await connectStore();
  await page.locator('.lobby-screen').waitFor();
  await page.locator('.tactics-open').click();await page.getByRole('tab',{name:'终端概览',exact:true}).click();
  await page.getByRole('button',{name:/继续上次休整.*第 1 回合/}).waitFor();
  assert.equal(await vaultSnapshot(),originalSave);
  await page.getByRole('button',{name:'关闭战术终端',exact:true}).click();
  await enter();await request('g.ready',{ready:true});
  await page.waitForFunction(()=>window.__stageQAStore.get().match.result?.victory===false,null,{timeout:120000});
  report.defeat=await page.evaluate(async()=>(await import('/js/store.js')).store.get().match.result);
  assert.ok(report.defeat.players[0].stats.leaks>4);
  await page.locator('.sself.is-lose .settle__next').waitFor();
  await page.screenshot({path:'.cache/verification/v15-automated-defeat.png'});
  assert.equal(await vaultSnapshot(),originalSave);
  await finishToLobby();await request('room.create',{mode:'solo',difficulty:'FUNNY'});
  assert.equal(await page.evaluate(()=>window.__stageQAStore.get().room.content.vanilla),true);
  await page.locator('.solo-brief').filter({hasText:'共 9 回合'}).waitFor();
  report.checks.push('Empty defence loses, reload retains only the original standard save, standard nine-round mode remains available');
  assert.deepEqual(errors,[]);report.pageErrors=errors;
  await writeFile('.cache/verification/v15-browser.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({checks:report.checks,rounds:report.victory.roundsPassed,leaks:report.victory.players[0].stats.leaks}));
}catch(error){await writeFile('.cache/verification/v15-browser-incomplete.json',JSON.stringify({...report,error:error.message},null,2)+'\n');if(page){await page.screenshot({path:'.cache/verification/v15-browser-failure.png'});console.error(await page.evaluate(async()=>{const s=(await import('/js/store.js')).store.get();return {pub:s.match.public,private:s.match.private,body:document.body.innerText.slice(-4500)};}));}console.error(error);throw error;}finally{await browser?.close();await app.close();}

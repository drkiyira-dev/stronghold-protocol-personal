// Disposable, local-only Chrome checks. Provider responses and external art
// are mocked; this is not a live-provider or production acceptance test.
import assert from 'node:assert/strict';import {build} from 'esbuild';import {fileURLToPath} from 'node:url';import {mkdir,writeFile} from 'node:fs/promises';
import {startPersonalServer} from './host.mjs';import {makeMatch} from '../upstream/test/match/harness.js';import {captureCheckpoint} from './checkpoint.mjs';
import {createSaveVault,VAULT_KEYS} from './save-vault.mjs';import {createRecorder} from './replays.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),output=root+'.cache/verification/';await mkdir(output,{recursive:true});
const bundled=await build({stdin:{contents:"export * from './personal/transactional-vault.mjs';",resolveDir:root},bundle:true,platform:'browser',format:'esm',write:false});
const h=makeMatch({mode:'solo',seed:812,botRehearsal:0});h.start();h.toPrep(1);const snapshot=captureCheckpoint(h.m);h.m.dispose();
const memory=new Map(),legacy=createSaveVault({getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)});legacy.save(snapshot);
const records=[],r=createRecorder({save:v=>records.push(v),context:()=>({selfId:'p_a',runId:'private-run',scenario:{mode:'solo',difficulty:'NORMAL',stageId:'fixture'}})});
r.start({battleId:'fixture-battle',fieldId:'f'});r.field({fieldId:'f',units:[{id:1,ownerId:'p_a',name:'Guard',kind:'op',side:'ally'},{id:2,ownerId:'other',name:'Enemy',side:'enemy'}]});
for(const t of [0,5,10])r.snap({fieldId:'f',gt:t,units:[[1,1,1,50,100],[2,4,1,100,100]]});
r.events({fieldId:'f',gt:4,ev:[['die',1]]});for(let i=0;i<160;i++)r.events({fieldId:'f',gt:5+i/20,ev:[['skill',1,true]]});
r.finish({battleId:'fixture-battle',result:{time:10,perPlayer:{p_a:{damageDealt:100,healingDone:0,deaths:1,leaked:[],unitStats:[]}}}});await r.flush();
const record={...records.at(-1),title:'Evidence fixture',at:2};const other={...record,version:1,id:'other',title:'Other record',at:1,frames:[],events:[]};
const app=await startPersonalServer({port:0,log:{info(){},warn(){},error(){},debug(){}}});let browser;
const checks=[];
try{
 browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
 const context=await browser.newContext();
 await context.route('**/__tests.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated vault checks</title>'}));
 await context.route('**/__vault.mjs',route=>route.fulfill({contentType:'text/javascript',body:bundled.outputFiles[0].text}));
 const a=await context.newPage(),b=await context.newPage();await a.goto(app.url+'/__tests.html');
 await a.evaluate(async entries=>{for(const [k,v]of entries)localStorage.setItem(k,v);window.v=await (await import('/__vault.mjs')).createTransactionalVault(indexedDB,localStorage,{channel:false});},[...memory]);
 await b.goto(app.url+'/__tests.html');await b.evaluate(async()=>{window.v=await (await import('/__vault.mjs')).createTransactionalVault(indexedDB,localStorage,{channel:false});});
 assert.deepEqual(await a.evaluate(()=>v.active()),snapshot);checks.push('legacy migration retains exact snapshot');
 const next=n=>({...structuredClone(snapshot),runId:'run_'+String(n).repeat(32)});
 await Promise.all([a.evaluate(s=>v.save(s,{manual:true,activate:false}),next(1)),b.evaluate(s=>v.save(s,{manual:true,activate:false}),next(2))]);
 await a.evaluate(()=>v.reload());assert.equal(await a.evaluate(()=>v.list().length),3);assert.deepEqual(await a.evaluate(()=>v.active()),snapshot);checks.push('two real tabs retain both concurrent writes');
 for(const failure of ['quota','abort']){
  const verified=await a.evaluate(async({snapshot,failure})=>{const before=v.exportRaw(),put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name!=='vault')return put.apply(this,args);if(failure==='quota')throw new DOMException('Quota exceeded','QuotaExceededError');const r=put.apply(this,args);this.transaction.abort();return r;};let refused=false;
   try{await v.save(snapshot);}catch{refused=true;}finally{IDBObjectStore.prototype.put=put;}await v.reload();return refused&&v.exportRaw()===before;},{snapshot:next(3),failure});assert.equal(verified,true);checks.push(failure+' leaves committed vault unchanged');
 }
 await a.evaluate(()=>v.rollbackMigration());assert.equal(await a.evaluate(()=>v.list().length),1);await a.evaluate(()=>v.undoRollback());assert.equal(await a.evaluate(()=>v.list().length),3);checks.push('migration rollback and undo retain both versions');
 assert.deepEqual(await a.evaluate(keys=>keys.map(k=>[k,localStorage.getItem(k)]),[...memory.keys()]),[...memory]);
 const conflict=await a.evaluate(async({key,snapshot})=>{const before=v.exportRaw();localStorage.setItem(key,' '+localStorage.getItem(key));let message='';try{await v.save(snapshot);}catch(e){message=e.message;}return {blocked:message.includes('旧版本标签页'),unchanged:JSON.parse(v.exportRaw()).current.revision===JSON.parse(before).current.revision};},{key:VAULT_KEYS.find(k=>memory.has(k)),snapshot:next(4)});
 assert.deepEqual(conflict,{blocked:true,unchanged:true});checks.push('old-tab writes block mutation without discarding either source');await a.evaluate(()=>v.reconcileLegacy());await a.evaluate(s=>v.save(s,{manual:true,activate:false}),next(5));assert.equal(await a.evaluate(()=>JSON.parse(v.exportRaw()).current.legacyArchives.length),1);checks.push('explicit conflict reconciliation archives old writes before resuming');await a.evaluate(()=>v.close());await b.evaluate(()=>v.close());await context.close();

 const ui=await browser.newContext({viewport:{width:1440,height:900}});await ui.route('**/*',route=>new URL(route.request().url()).origin===app.url?route.continue():route.abort());
 await ui.addInitScript(()=>{Object.defineProperty(crypto,'randomUUID',{value:undefined});});
 const page=await ui.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(app.url);
 await page.getByPlaceholder(/输入你的代号/).fill('终端测试');await page.getByRole('button',{name:'开始',exact:true}).click();await page.locator('[data-mode="solo"]').waitFor();
 await page.evaluate(async rows=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('stronghold.personal.tactics',1);r.onupgradeneeded=()=>r.result.createObjectStore('replays',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('replays','readwrite');for(const row of rows)tx.objectStore('replays').put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();},[record,other]);
 await page.getByRole('button',{name:'战术终端',exact:true}).click();await page.locator('[data-record]').waitFor();
 await page.locator('.tactics-advice [data-evidence]').filter({hasText:'4.0s'}).click();assert.equal(await page.locator('[data-time]').inputValue(),'1');assert.match(await page.locator('[data-evidence-detail]').textContent(),/最近采样 5s/);
 await page.locator('.tactics-advice [data-evidence]').filter({hasText:'个人死亡'}).first().click();assert.equal(await page.locator('[data-metric="deaths"]').evaluate(el=>el.classList.contains('evidence-selected')),true);checks.push('citations focus facts and seek the nearest recorded frame');
 assert.equal(await page.locator('.tactics-events [data-evidence]').count(),80);await page.locator('[data-next]').click();await page.locator('[data-next]').click();assert.equal(await page.locator('.tactics-events [data-evidence]').count(),1);checks.push('all 161 recorded events are accessible through pagination');
 await page.evaluate(()=>{window.keyLeaks=0;document.addEventListener('keydown',()=>window.keyLeaks++);});await page.keyboard.press('r');assert.equal(await page.evaluate(()=>keyLeaks),0);
 await page.getByRole('tab',{name:'战斗复盘',exact:true}).focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.getByRole('tab',{name:'终端概览',exact:true}).getAttribute('aria-selected'),'true');await page.keyboard.press('Escape');assert.equal(await page.locator('.tactics-open').evaluate(el=>document.activeElement===el),true);checks.push('modal traps shortcuts, supports tab arrows and returns focus');
 await page.getByRole('button',{name:'战术终端',exact:true}).click();await page.getByRole('tab',{name:'战斗复盘',exact:true}).click();
 let mode='valid',delayed;await page.route('**/api/mock-coach',async route=>{const body=route.request().postDataJSON();assert.ok(!JSON.stringify(body).includes('private-run'));if(mode==='delayed'){delayed=route;return;}
  await route.fulfill({contentType:'application/json',body:JSON.stringify({model:'local mock',cards:[{observation:'Mock observed fact',hypothesis:'Mock hypothesis',action:'Mock next action',refs:[mode==='valid'?body.references[0].id:'foreign-evidence']}]})});});
 await page.evaluate(url=>sessionStorage.setItem('stronghold.coach.endpoint',url+'/api/mock-coach'),app.url);
 await page.locator('[data-coach]').click();await page.getByText('观察：Mock observed fact',{exact:true}).waitFor();assert.ok(await page.locator('[data-model] [data-evidence]').count());
 mode='invalid';await page.locator('[data-coach]').click();await page.getByText(/模型引用不在本场证据范围内/).waitFor();assert.ok(await page.locator('.tactics-advice article').count());checks.push('model cards require allowed citations and failures retain local advice');
 mode='delayed';const requested=page.waitForRequest('**/api/mock-coach');await page.locator('[data-coach]').click();await requested;await page.locator('[data-record]').selectOption('other');await page.locator('[data-model]').waitFor({state:'attached'});
 if(delayed)await delayed.fulfill({contentType:'application/json',body:JSON.stringify({cards:[{observation:'STALE RESPONSE',hypothesis:'Old',action:'Old',refs:['e1']}]})}).catch(()=>{});
 assert.ok(!(await page.locator('.tactics').textContent()).includes('STALE RESPONSE'));checks.push('switching records aborts and discards stale model responses');
 await page.evaluate(async()=>{(await import('/shared/i18n.js')).setLang('en');});await page.getByRole('tab',{name:'Battle review',exact:true}).waitFor();await page.locator('[data-record]').selectOption(record.id);
 await page.evaluate(()=>document.documentElement.style.setProperty('--bg-1','rgb(20, 40, 60)'));assert.equal(await page.locator('dialog.tactics').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(20, 40, 60)');
 await page.screenshot({path:output+'enhanced-terminal-desktop.png'});await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('dialog.tactics').evaluate(el=>el.scrollWidth<=el.clientWidth+2));await page.screenshot({path:output+'enhanced-terminal-mobile.png'});checks.push('core English navigation, theme inheritance and narrow viewport');
 assert.deepEqual(errors,[]);await ui.close();
 const report={checks:checks.length,passed:checks,externalAssets:'blocked',model:'mock only',productionModified:false};await writeFile(output+'enhanced-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser?.close();await app.close();}

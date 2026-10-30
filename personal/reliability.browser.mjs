// Optional browser integration check. Supply PLAYWRIGHT_MODULE if Playwright is
// provided by the development environment; BROWSER_CHANNEL defaults to chrome.
// Uses an ephemeral localhost server and a fresh browser profile, never production.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {startPersonalServer} from './host.mjs';
import {makeMatch} from '../upstream/test/match/harness.js';
import {captureCheckpoint} from './checkpoint.mjs';
import {createSaveVault,VAULT_KEYS} from './save-vault.mjs';
import {REPLAY_KIND} from './replays.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output=fileURLToPath(new URL('../.cache/verification/',import.meta.url));
await mkdir(output,{recursive:true});
function fixture(playerId){
  const h=makeMatch({mode:'solo',seed:812,botRehearsal:0,seats:[{seat:0,playerId,name:'Browser test',isBot:false,connected:true}]});
  try{h.start();h.toPrep(1);return captureCheckpoint(h.m);}finally{h.m.dispose();}
}
const first=fixture('p_a'),second=fixture('p_b'),invalid=structuredClone(second);
delete first.runId; // Exercise an actual old checkpoint on the new client.
invalid.state.match.stageId='missing-stage';
const storage=new Map(),vault=createSaveVault({getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)});
vault.save(first);const good=vault.save(second,{manual:true,activate:false});
const bad=vault.save(invalid,{manual:true,activate:false});
const activeBefore=JSON.parse(JSON.parse(vault.export()).body).activeId;
const base={format:REPLAY_KIND,version:1,round:1,kind:'normal',selfId:'p_a',units:{},frames:[],events:[],result:null,partial:true};
const result={time:8,perPlayer:{p_a:{damageDealt:0,healingDone:0,deaths:0,leaked:[],unitStats:[]}}};
const records=[
  {...base,id:'partial',at:3,title:'Missing result'},
  {...base,id:'capped',at:2,title:'Capped recording',result,partial:false,quality:{version:1,resultReceived:true,truncated:true,dropped:{frames:1,events:1,frameUnits:0,unitMetadata:0}}},
  {...base,id:'legacy',at:1,title:'Legacy recording',result,partial:false},
];
const quiet={info(){},warn(){},error(){},debug(){}};
const app=await startPersonalServer({port:0,log:quiet});let browser,page;
try{
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  // Keep this test deterministic and independent of external art availability.
  await context.route('**/*',route=>new URL(route.request().url()).origin===app.url?route.continue():route.abort());
  await context.addInitScript(entries=>{
    if(!localStorage.getItem('reliability-fixtures')){
      for(const [k,v]of entries)localStorage.setItem(k,v);
      localStorage.setItem('reliability-fixtures','1');
    }
  },[...storage]);
  page=await context.newPage();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const readVault=()=>page.evaluate(keys=>{
    const states=keys.map(k=>localStorage.getItem(k)).filter(Boolean).map(raw=>JSON.parse(JSON.parse(raw).body)).sort((a,b)=>b.revision-a.revision);
    const state=states[0];return {activeId:state.activeId,snapshot:state.saves.find(s=>s.id===state.activeId)?.snapshot};
  },VAULT_KEYS);
  const login=async()=>{
    await page.waitForFunction(()=>document.querySelector('.title-login input') || document.querySelector('[data-mode="solo"]'));
    if(await page.getByPlaceholder(/输入你的代号/).isVisible()){
      await page.getByPlaceholder(/输入你的代号/).fill('可靠性测试');
      await page.getByRole('button',{name:'开始',exact:true}).click();
    }
    await page.locator('[data-mode="solo"]').waitFor();
  };
  await page.goto(app.url,{waitUntil:'domcontentloaded'});
  await login();
  await page.evaluate(async rows=>{
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('stronghold.personal.tactics',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('replays',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    await new Promise((resolve,reject)=>{const tx=db.transaction('replays','readwrite');for(const row of rows)tx.objectStore('replays').put(row);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    db.close();
  },records);
  await page.getByRole('button',{name:'战术终端',exact:true}).click();
  const quality=page.locator('[data-replay-quality]');
  await quality.waitFor();
  assert.match(await quality.textContent(),/未收到结算/);
  assert.deepEqual(await page.locator('.tactics-metrics strong').allTextContents(),['—','—','—','—']);
  await page.locator('[data-record]').selectOption('capped');
  assert.match(await quality.textContent(),/已收到结算.*采样已截断/);
  assert.deepEqual(await page.locator('.tactics-metrics strong').allTextContents(),['0','0','0','0']);
  await page.screenshot({path:output+'replay-quality.png'});
  await page.locator('[data-record]').selectOption('legacy');
  assert.match(await quality.textContent(),/采样完整性未知/);
  await page.getByRole('button',{name:'存档保险库',exact:true}).click();
  await page.locator(`[data-restore="${bad.id}"]`).click();
  await page.waitForLoadState('domcontentloaded');
  // Restoring a different identity reloads without committing that candidate.
  await login();
  await page.waitForFunction(()=>!sessionStorage.getItem('stronghold.personal.restore'));
  assert.equal((await readVault()).activeId,activeBefore,'failed restore must preserve old active progress');
  await page.getByRole('button',{name:'战术终端',exact:true}).click();
  await page.getByRole('button',{name:'存档保险库',exact:true}).click();
  // A nonessential preference write must not turn a committed restore into a
  // misleading failure or roll active progress back.
  await page.evaluate(()=>{
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(k==='stronghold.personal.challenge')throw new DOMException('test quota','QuotaExceededError');return set.call(this,k,v);};
  });
  await page.locator(`[data-restore="${good.id}"]`).click();
  await page.waitForFunction(({keys,runId})=>{
    const s=keys.map(k=>localStorage.getItem(k)).filter(Boolean).map(v=>JSON.parse(JSON.parse(v).body)).sort((a,b)=>b.revision-a.revision)[0];
    return s.saves.find(x=>x.id===s.activeId)?.snapshot.runId===runId;
  },{keys:VAULT_KEYS,runId:second.runId});
  const once=await readVault();assert.equal(once.snapshot.runId,second.runId);
  assert.match(await page.locator('.personal-save-status').textContent(),/恢复已完成.*挑战偏好/);
  await page.reload({waitUntil:'domcontentloaded'});await login();
  await page.locator('.personal-resume').click();
  await page.waitForFunction(({keys,oldRoom})=>{
    const s=keys.map(k=>localStorage.getItem(k)).filter(Boolean).map(v=>JSON.parse(JSON.parse(v).body)).sort((a,b)=>b.revision-a.revision)[0];
    return s.saves.find(x=>x.id===s.activeId)?.snapshot.options.roomCode!==oldRoom;
  },{keys:VAULT_KEYS,oldRoom:once.snapshot.options.roomCode});
  const twice=await readVault();assert.equal(twice.snapshot.runId,second.runId);
  assert.deepEqual(twice.snapshot.state,once.snapshot.state);
  await page.screenshot({path:output+'restored-preparation.png'});
  assert.deepEqual(errors,[],'unexpected browser exceptions');
  const report={checks:7,missingMetrics:'unknown',truncation:'visible',legacyQuality:'unknown',failedRestore:'old active retained',identityReload:'passed',preferenceWriteFailure:'restore committed, warning visible',repeatedRestore:'same runId and state',externalAssets:'intentionally blocked',productionModified:false};
  await writeFile(output+'reliability-browser.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}catch(error){
  if(page){await page.screenshot({path:output+'reliability-failure.png'}).catch(()=>{});console.error((await page.locator('body').innerText().catch(()=>'' )).slice(-1600));}
  throw error;
}finally{await browser?.close();await app.close();}

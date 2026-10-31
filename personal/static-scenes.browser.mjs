// Serial static-only regression. --live additionally uses privately prepared original art.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {startStaticPreview} from './static-scenes-preview.mjs';
const live=process.argv.includes('--live'),app=await startStaticPreview();let browser;
const checks=[];
try{
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
  if(!live)await page.route('**/*',r=>new URL(r.request().url()).origin===app.url?r.continue():r.abort());
  await page.goto(app.url+'/?board=3d');await page.getByPlaceholder(/输入你的代号/).waitFor();
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  assert.equal(app.result().audioBeforeGesture,null);
  // Synthetic private bytes exercise the real built importer + worker in offline CI.
  const alias=await page.evaluate(async()=>{
    const pack=await import('/js/assetPack.js'),storage=await import('/js/assetCache.js');
    const bytes=new TextEncoder().encode('bracket-path regression'),hash=await pack.sha256Hex16(bytes);
    const url='/assets/~'+hash+'/local/map/fx/[fixture].bin',manifest={groups:{fixture:{bin:{path:url}}}};
    const read=async path=>Response.json(path==='/personal/scene-import.json'?manifest:{groups:{}});
    const importer=pack.createAssetImport({fetch:read});
    await importer.start({type:'files',files:[{path:'public/assets/local/map/fx/[fixture].bin',read:async()=>bytes}]});
    await pack.pruneImportedAssets({fetch:read});
    const r=await fetch(encodeURI(url)),text=await r.text(),kept=pack.importedKeepSet({},manifest,null).has(encodeURI(url));
    await storage.clearImportedAssets();return{status:r.status,text,kept,accepted:importer.get().accepted};
  });
  assert.deepEqual(alias,{status:200,text:'bracket-path regression',kept:true,accepted:1});checks.push('encoded filename cache hit survives upstream pruning');
  if(live){
    await page.getByTestId('asset-import').click();
    await page.locator('input[type=file][accept]').setInputFiles(resolve('.cache/scene-import-fixture.zip'));
    await page.getByTestId('asset-import-status').filter({hasText:'导入完成'}).waitFor({timeout:90000});
    const imported=await page.evaluate(async()=>(await import('/js/assetPack.js')).assetImport.get());
    assert.equal(imported.accepted,171,JSON.stringify(imported));assert.equal(imported.rejected,0);checks.push('171 original files imported with upstream SHA validation');
    await page.reload();await page.getByPlaceholder(/输入你的代号/).waitFor();
    await page.locator('#static-audio').click();await page.waitForFunction(()=>['audio checked','failed'].includes(JSON.parse(document.querySelector('#static-status').textContent).phase));
    assert.equal(app.result().audio.context,'running');assert.ok(app.result().audio.decodedSeconds>0);assert.ok(app.result().audio.starts>0);assert.ok(app.result().audio.failedBufferIsNull);
    checks.push('real HTTPS UI audio decoded and started after gesture; failed audio returns null');
  }
  const cacheCount=()=>page.evaluate(async()=>((await (await caches.open('sp-imported-assets-v1')).keys()).length));
  const beforeRejected=await cacheCount();
  await page.getByTestId('asset-import').click();
  await page.getByTestId('asset-import-zip-input').setInputFiles({name:'invalid.zip',mimeType:'application/zip',buffer:Buffer.from('invalid QA zip')});
  await page.getByTestId('asset-import-status').filter({hasText:'素材包不是有效的 zip'}).waitFor();
  const badRoot=resolve('.cache/scene-incompatible/Stronghold-Protocol');
  await mkdir(badRoot+'/public/assets/local/scene/act1autochess_m01',{recursive:true});
  await writeFile(badRoot+'/public/assets/local/scene/act1autochess_m01/scene.bin','wrong-version QA bytes');
  await page.getByTestId('asset-import-folder-input').setInputFiles(badRoot);
  await page.getByTestId('asset-import-counts').filter({hasText:'校验不符 1 个'}).waitFor();
  assert.match(await page.getByTestId('asset-import-status').innerText(),/没有找到|未通过校验/);
  const rejected=await page.evaluate(async()=>(await import('/js/assetPack.js')).assetImport.get());
  assert.equal(rejected.accepted,0);assert.equal(rejected.rejected,1);assert.equal(await cacheCount(),beforeRejected);
  await page.keyboard.press('Escape');await page.getByTestId('asset-import-zip').waitFor({state:'hidden'});
  checks.push('invalid ZIP and incompatible hash show actionable rejection without overwriting cached art');
  await page.locator('#static-scenes').click();await page.waitForFunction(()=>['scenes checked','failed'].includes(JSON.parse(document.querySelector('#static-status').textContent).phase),null,{timeout:90000});
  assert.equal(app.result().phase,'scenes checked');assert.equal(app.result().cachedSceneGroups,live?11:0);
  if(live){assert.equal(app.result().sceneChecks.length,11);assert.ok(app.result().tileTable);assert.equal(app.requests.length,0,'original art must come from browser cache, not the static server');}
  checks.push(live?'all 11 scenes and independently hashed tile table load from browser cache':'empty cache does not advertise unavailable 3D art');
  await page.getByPlaceholder(/输入你的代号/).fill('Static QA');await page.getByRole('button',{name:'开始',exact:true}).click();
  await page.getByRole('button',{name:'战术终端',exact:true}).waitFor();
  await page.locator('#static-prepare').click();await page.waitForFunction(()=>/"phase": "(ready|failed)"/.test(document.querySelector('#static-status').textContent),null,{timeout:120000});
  assert.equal(app.result().phase,'ready',JSON.stringify(app.result()));assert.equal(app.result().transport,'local');
  if(live){assert.ok(app.result().scene.active);assert.ok(app.result().render.triangles>0);assert.equal(app.result().render.lost,false);}
  await mkdir('.cache/verification',{recursive:true});await page.screenshot({path:`.cache/verification/static-scenes-chrome-${live?'live':'fallback'}.png`});
  await page.locator('#static-fight').click();await page.waitForFunction(()=>/"phase": "(complete|failed)"/.test(document.querySelector('#static-status').textContent),null,{timeout:120000});
  assert.equal(app.result().phase,'complete',JSON.stringify(app.result()));assert.equal(app.result().round,2);assert.deepEqual(app.result().errors,[]);assert.deepEqual(errors,[]);
  checks.push('static browser worker: original deployment, combat and R2 settlement');
  const result=structuredClone(app.result());
  if(live){
    await page.locator('#static-evict').click();await page.waitForFunction(()=>document.querySelector('#static-status').textContent.includes('cache cleared'));
    await page.reload();await page.locator('#static-scenes').click();await page.waitForFunction(()=>document.querySelector('#static-status').textContent.includes('scenes checked'));
    assert.equal(app.result().cachedSceneGroups,0);checks.push('eviction followed by reload restores missing-art fallback');
  }
  await writeFile(`.cache/verification/static-scenes-chrome-${live?'live':'fallback'}.json`,JSON.stringify({browser:browser.version(),live,checks,result,requests:app.requests,errors},null,2));
  console.log(JSON.stringify({checks,errors}));
}finally{await browser?.close();await app.close();}

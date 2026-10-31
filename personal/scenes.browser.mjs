// npm run build first. Default: deterministic failed-source fallback in Chrome.
// --live: original external art. --manual --live: native Safari via the printed URL.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startPersonalServer} from './host.mjs';
import {SCENE_PREFIX} from './scene-assets.mjs';
const live=process.argv.includes('--live'),manual=process.argv.includes('--manual');
const seed=Number(process.env.SCENE_SEED||12),expected=new Map([[12,'act1autochess_m05'],[3,'act1autochess_m06'],[30,'act1autochess_m07']]).get(seed);
const app=await startPersonalServer({port:manual?4178:0,sceneAssets:true,seedFn:()=>seed,log:{info(){},warn(){},error(){},debug(){}}});
const html=(await readFile('dist/index.html','utf8')).replace('</body>','<script type="module" src="/__scene-probe.mjs"></script></body>');
const probe=await readFile('personal/scenes-probe.mjs'),handlers=app.server.listeners('request'),requests=[];
await mkdir('.cache/verification',{recursive:true});
let result=null,browser;
app.server.removeAllListeners('request');
app.server.on('request',(req,res)=>{
  const pathname=req.url.split('?')[0];
  if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(pathname==='/__scene-probe.mjs'){res.setHeader('Content-Type','text/javascript');res.end(probe);return;}
  if(pathname==='/__scene-audio-failure.mp3'){requests.push({path:pathname,status:503});res.writeHead(503);res.end('QA: failed audio source');return;}
  if(pathname==='/__scene-result'){
    let body='';req.on('data',c=>body+=c);req.on('end',async()=>{result=JSON.parse(body);await writeFile(`.cache/verification/scenes-${manual?'safari':'chrome'}-${live?'live':'fallback'}-${seed}.json`,JSON.stringify({...result,requests,cache:app.scenes.stats()},null,2));res.end('ok');});return;
  }
  if(pathname.startsWith(SCENE_PREFIX)){
    res.on('finish',()=>requests.push({path:pathname,status:res.statusCode}));
    if(!live){res.writeHead(503,{'Cache-Control':'no-store'});res.end('QA: failed scene source');return;}
  }
  for(const h of handlers)h.call(app.server,req,res);
});
const url=app.url+`/?server=local&board=3d&sceneQA=${live?'live':'fallback'}`;
if(manual){
  console.log('Native browser QA: '+url);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>app.close().then(()=>process.exit(0)));
}else try{
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1200,height:760}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Only scene art goes through the bridge. Other art is blocked in this focused run.
  await page.route('**/*',r=>new URL(r.request().url()).origin===app.url?r.continue():r.abort());
  await page.goto(url);await page.getByPlaceholder(/输入你的代号/).fill('Scene QA');await page.getByRole('button',{name:'开始',exact:true}).click();
  await page.getByTestId('version-switch').click();await page.locator('.verpick__pick[data-version="act1autochess@V1_1"]').click();
  await page.waitForFunction(async()=>{const c=(await import('/js/content.js')).contentSet.get();return c.status==='ready'&&c.version==='act1autochess@V1_1';});
  await page.locator('#scene-prepare').click();
  await page.waitForFunction(()=>/"phase": "(ready|failed)"/.test(document.querySelector('#scene-status').textContent),{},{timeout:120000});
  assert.equal(result.phase,'ready',JSON.stringify(result.errors));assert.equal(result.stage,expected);
  if(live){assert.ok(result.scene.active&&result.scene.chunks>0&&result.scene.textures>0);assert.equal(result.scene.lightmaps,result.scene.expectedLightmaps);assert.ok(result.render.triangles>0);}
  await page.screenshot({path:`.cache/verification/scenes-chrome-${live?'live':'fallback'}-${seed}.png`});
  await page.locator('#scene-fight').click();await page.waitForFunction(()=>/"phase": "(complete|failed)"/.test(document.querySelector('#scene-status').textContent),{},{timeout:120000});
  assert.equal(result.phase,'complete',JSON.stringify(result.errors));assert.equal(result.round,2);assert.deepEqual(result.errors,[]);assert.deepEqual(errors,[]);
  assert.ok(requests.some(r=>r.path.startsWith(SCENE_PREFIX)));assert.ok(requests.every(r=>r.status===(live?200:503)));
  if(!live){assert.ok(result.audioFailure.bufferIsNull);assert.ok(requests.some(r=>r.path==='/__scene-audio-failure.mp3'));}
  console.log(JSON.stringify({...result,requests:requests.length,cache:app.scenes.stats()}));
}finally{await browser?.close();await app.close();}

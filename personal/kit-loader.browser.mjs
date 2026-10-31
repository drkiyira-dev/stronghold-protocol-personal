// Build first. Default: one Chromium instance; --manual: open the printed URL
// in real Safari. --baseline serves the original registry to reproduce the bug.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {KITS} from '../upstream/server/sim/content/kits/index.js';

const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'dist');
const manual=process.argv.includes('--manual'),baseline=process.argv.includes('--baseline');
const original=await readFile(path.join(root,'upstream/server/sim/content/kits/index.js'),'utf8');
const built=await readFile(path.join(dist,'sim/content/kits/index.js'),'utf8');
assert.equal(built,original.replace('export const KIT_FILES =',"import './shared/tier4.js';\n\nexport const KIT_FILES ="),
  'the built registry changes only shared-helper initialization order');

async function probe(){
  const errors=[],saved=console.error;
  console.error=(...args)=>{errors.push(args.map(String).join(' '));saved(...args);};
  try{
    const {loadBrowserSim}=await import('/js/battle/simLoader.js');
    await loadBrowserSim();
    const {KITS,TIER_KITS}=await import('/sim/content/kits/index.js');
    return {keys:Object.keys(KITS).sort(),tiers:TIER_KITS.map(t=>Object.keys(t).length),errors};
  }catch(error){return {errors:[...errors,`${error.name}: ${error.message}`]};}
  finally{console.error=saved;}
}
const html=`<!doctype html><meta charset="utf-8"><title>RC kit loader regression</title>
<h1>Browser kit loader regression</h1><pre id="out">Running main-thread check…</pre><script type="module">
const probe=${probe.toString()};
const result={ua:navigator.userAgent,baseline:${baseline},main:await probe()};
document.querySelector('#out').textContent='Running fresh module Worker check…';
const worker=new Worker('/rc-kit-worker.js',{type:'module'});
try{result.worker=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Worker import timed out')),30000);
  worker.onmessage=e=>{clearTimeout(timer);resolve(e.data);};
  worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message));};
});}catch(e){result.worker={errors:[e.message]};}finally{worker.terminate();}
const response=await fetch('/rc-kit-result',{method:'POST',body:JSON.stringify(result)});
const verdict=await response.json();
document.querySelector('#out').textContent=JSON.stringify({...verdict,...result},null,2);
</script>`;
let settle;
const completed=new Promise(resolve=>{settle=resolve;});
const server=http.createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  res.setHeader('cache-control','no-store');
  if(pathname==='/rc-kit-result'&&req.method==='POST'){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>1000000)throw new Error('Oversized report');}
    const result=JSON.parse(body);let failure=null;
    try{for(const scope of ['main','worker']){
      assert.deepEqual(result[scope].errors,[],`${scope}: no skipped modules`);
      assert.deepEqual(result[scope].keys,Object.keys(KITS).sort(),`${scope}: complete upstream registry`);
    }}catch(error){failure=error;}
    res.setHeader('content-type','application/json');res.end(JSON.stringify({passed:!failure,error:failure?.message}));
    settle({result,failure});return;
  }
  if(pathname==='/rc-kit-test'){res.setHeader('content-type','text/html; charset=utf-8');res.end(html);return;}
  if(pathname==='/rc-kit-worker.js'){res.setHeader('content-type','text/javascript');res.end(`const probe=${probe.toString()};postMessage(await probe());`);return;}
  const file=path.resolve(dist,'.'+decodeURIComponent(pathname));
  if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
  res.setHeader('content-type',file.endsWith('.json')?'application/json':'text/javascript');
  res.end(baseline&&pathname==='/sim/content/kits/index.js'?original:await readFile(file));
}catch{res.writeHead(404).end('Not found');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/rc-kit-test`;
let browser,timer;
try{
  console.log(url);
  if(!manual){
    const {chromium}=await import('playwright');
    browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
    const page=await browser.newPage();await page.goto(url);
  }
  const {result,failure}=await Promise.race([completed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Browser check timed out')),120000);})]);
  if(process.env.RC_KIT_REPORT)await writeFile(process.env.RC_KIT_REPORT,JSON.stringify({at:new Date().toISOString(),passed:!failure,...result},null,2)+'\n');
  console.log(JSON.stringify({passed:!failure,ua:result.ua,main:result.main.keys?.length,worker:result.worker.keys?.length}));
  if(failure)throw failure;
}finally{clearTimeout(timer);await browser?.close();await new Promise(resolve=>server.close(resolve));}

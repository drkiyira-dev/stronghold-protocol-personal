// Actual Chrome + upstream client simulation; one room/browser at a time.
// External assets deliberately fail: map geometry and game flow must survive.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startPersonalServer} from './host.mjs';
const results=[];
await mkdir('.cache/verification',{recursive:true});
for(const [seed,stageId]of [[12,'act1autochess_m05'],[3,'act1autochess_m06'],[30,'act1autochess_m07']]){
  const app=await startPersonalServer({port:0,log:{info(){},warn(){},error(){},debug(){}},seedFn:()=>seed});let browser;
  try{
    browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
    const page=await browser.newPage({viewport:{width:1365,height:850}}),errors=[],blocked=new Set();page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===app.url)return r.continue();blocked.add(u.pathname);return r.abort();});
    await page.goto(app.url+'/?server=local');await page.getByPlaceholder(/输入你的代号/).fill('Map QA');
    await page.evaluate(async()=>{(await import('/js/ui/settings.js')).updateSettings({muted:true});});
    await page.getByRole('button',{name:'开始',exact:true}).click();
    await page.getByTestId('version-switch').click();
    assert.equal(await page.getByTestId('version-picker').getByRole('option').count(),4);
    await page.locator('.verpick__pick[data-version="act1autochess@V1_1"]').click();
    await page.waitForFunction(async()=>{const c=(await import('/js/content.js')).contentSet.get();return c.status==='ready'&&c.version==='act1autochess@V1_1';});
    await page.evaluate(async()=>{
      window.store=(await import('/js/store.js')).store;window.net=(await import('/js/net.js')).net;window.data=(await import('/js/data.js')).data;
      await net.request('room.create',{mode:'solo',difficulty:'HARD',version:'act1autochess@V1_1'});
    });
    await page.waitForFunction(()=>{const room=store.get().room;return room&&room.seats.filter(s=>s&&!s.isBot).every(s=>s.content==='ready');});
    await page.evaluate(()=>net.request('room.start'));
    await page.waitForFunction(()=>store.get().match.public?.phase==='INFO_CHECK');await page.evaluate(()=>net.request('g.infoReady'));
    await page.waitForFunction(()=>store.get().match.public?.phase==='BAND_DRAFT');
    await page.evaluate(()=>{const band=Object.values(data.get('bands')).find(x=>!Array.isArray(x.modeTypeList)||x.modeTypeList.includes('SINGLE'));return net.request('g.band',{bandId:band.bandId});});
    await page.waitForFunction(()=>store.get().match.public?.phase==='PREP');
    assert.equal(await page.evaluate(()=>store.get().match.public.stageId),stageId);
    const deployed=await page.evaluate(async()=>{
      const p=store.get().match.private,chess=data.get('chess');
      const slot=p.shop.slots.findIndex(s=>s&&s.kind==='chess'&&!s.sold&&s.price<=p.funds&&chess[s.id]?.position==='MELEE');
      if(slot<0)throw new Error('Fixture shop must contain an affordable melee operator');
      await net.request('g.buy',{slot});const piece=store.get().match.private.hand.find(x=>x?.kind==='chess');
      const stage=data.get('stages')[store.get().match.public.stageId];
      for(const [row,col]of stage.deployTiles.normal.melee){try{await net.request('g.move',{uid:piece.uid,to:{area:'board',row,col},dir:'RIGHT'});return {uid:piece.uid,row,col};}catch{}}
      throw new Error('No valid deployment tile');
    });
    assert.ok(await page.locator('canvas').count()>0);
    await page.screenshot({path:'.cache/verification/'+stageId+'-fallback.png'});
    await page.evaluate(()=>net.request('g.ready',{ready:true}));
    await page.waitForFunction(()=>store.get().match.public?.phase==='PREP'&&store.get().match.public.round===2,{},{timeout:90000});
    assert.deepEqual(errors,[]);
    assert.ok([...blocked].some(p=>p.endsWith('/sprite_shadow.png')),'exercise optional shadow load rejection');
    results.push({stageId,seed,deployed,round:2,externalAssets:'blocked',version:'act1autochess@V1_1',errors});
    console.log(JSON.stringify(results.at(-1)));
  }finally{await browser?.close();await app.close();}
}
await writeFile('.cache/verification/maps-chromium.json',JSON.stringify(results,null,2));

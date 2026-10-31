// Local-only name/statement regression. No art download or production access.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {startPersonalServer} from './host.mjs';

const output=fileURLToPath(new URL('../.cache/verification/',import.meta.url));
await mkdir(output,{recursive:true});
const statement='本项目为非官方、非商业性同人二次创作，与《明日方舟》官方无关。';
const retired=/个人演习版|个人演习服|个人版|Personal Edition|PERSONAL TACTICAL LAB/i;
const app=await startPersonalServer({port:0,log:{info(){},warn(){},error(){},debug(){}}});
let browser;const checks=[];
try{
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
  for(const [device,options] of [
    ['desktop',{viewport:{width:1440,height:900}}],
    ['mobile-landscape',{viewport:{width:852,height:393},isMobile:true,hasTouch:true}],
  ]){
    const context=await browser.newContext(options);
    await context.route('**/*',route=>new URL(route.request().url()).origin===app.url?route.continue():route.abort());
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000);
    const checkNotice=async(route)=>{
      // Let entrance transitions settle before measuring hit areas or taking evidence.
      await page.evaluate(async()=>{await Promise.all(document.getAnimations()
        .filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime))
        .map(a=>a.finished.catch(()=>{})));});
      const notice=page.locator('.project-notice');
      await notice.waitFor({state:'visible'});
      assert.equal(await notice.count(),1);
      assert.ok((await notice.innerText()).includes(statement));
      const box=await notice.boundingBox(),size=page.viewportSize();
      assert.ok(box.x>=0&&box.x<80&&box.y>size.height*.7,`${device}/${route}: lower-left statement`);
      assert.ok(box.x+box.width<=size.width&&box.y+box.height<=size.height,`${device}/${route}: statement fits viewport`);
      assert.ok(await notice.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'statement does not overflow');
      assert.ok(await notice.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=12),'readable font size');
      const terminal=page.locator('.tactics-open');
      assert.equal(await terminal.count(),1,'one terminal trigger across screen transitions');
      assert.equal(await terminal.evaluate(el=>el.parentElement.tagName),'PERSONAL-TERMINAL-SLOT');
      const terminalBox=await terminal.boundingBox();
      assert.ok(terminalBox.x>=0&&terminalBox.y>=0&&terminalBox.x+terminalBox.width<=size.width&&terminalBox.y+terminalBox.height<=size.height,'terminal fits viewport');
      assert.ok(await terminal.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'terminal is clickable');
      if(route==='title'){
        assert.ok(await page.locator('.project-notice .title-foot__meta .title-repo').count(),'repository grouped with attribution');
        assert.ok(await page.locator('.title-repo').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'repository remains clickable inside notice');
      }
      await page.screenshot({path:output+`branding-${device}-${route}.png`});
      for(const selector of ['.title-login','[data-testid=asset-import]','.tactics-open','[data-mode="solo"]','[data-mode="coop"]']){
        const target=page.locator(selector).first();if(!await target.isVisible())continue;
        const b=await target.boundingBox();
        assert.ok(box.x+box.width<=b.x||b.x+b.width<=box.x||box.y+box.height<=b.y||b.y+b.height<=box.y,`${device}/${route}: no statement overlap with ${selector}: ${JSON.stringify({notice:box,control:b})}`);
      }
      assert.doesNotMatch(await page.locator('body').innerText(),retired);
      checks.push(`${device}: ${route} statement fits, is readable and leaves controls clear`);
    };
    await page.goto(app.url,{waitUntil:'domcontentloaded'});
    await page.getByPlaceholder(/输入你的代号/).waitFor();
    await page.locator('#boot').waitFor({state:'hidden'});
    assert.equal(await page.title(),'卫戍协议：盟约');
    assert.equal(await page.locator('h1').innerText().then(s=>s.replace(/\s/g,'')),'卫戍协议：盟约');
    assert.equal(await page.locator('dialog[open]').count(),0,'no added statement popup');
    assert.ok(await page.locator('.title-foot').innerText().then(s=>s.includes('Yostar')));
    assert.equal(await page.locator('.title-repo').getAttribute('href'),'https://github.com/sganggs/Stronghold-Protocol');
    assert.equal(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content'),'卫戍协议：盟约');
    assert.doesNotMatch(await page.locator('meta[name="description"]').getAttribute('content'),retired);
    await checkNotice('title');
    await page.locator('[data-testid="lang-toggle"] select').selectOption('en');
    await page.waitForFunction(()=>document.title==='Stronghold Protocol: Alliance');
    await page.getByRole('heading',{name:'Stronghold Protocol: Alliance',exact:true}).waitFor();
    await page.getByRole('button',{name:'Tactical terminal',exact:true}).click();
    await page.getByRole('button',{name:'Close tactical terminal',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.activeElement?.className),'tactics-open','focus returns to docked trigger');
    await page.locator('[data-testid="lang-toggle"] select').selectOption('zh');
    await page.getByPlaceholder(/输入你的代号/).fill('名称回归');
    await page.getByRole('button',{name:'开始',exact:true}).click();
    await page.locator('[data-mode="solo"]').waitFor();
    await checkNotice('lobby');
    await page.getByRole('button',{name:'战术终端',exact:true}).click();
    await page.getByRole('tab',{name:'终端概览',exact:true}).click();
    assert.ok((await page.locator('dialog.tactics').innerText()).includes('卫戍协议：盟约 / Stronghold Protocol: Alliance'));
    assert.doesNotMatch(await page.locator('dialog.tactics').innerText(),retired);
    for(const href of ['/LICENSE','/NOTICE.md','/THIRD-PARTY-NOTICES.md','/licenses/README.md','https://github.com/sganggs/Stronghold-Protocol','https://github.com/drkiyira-dev/stronghold-protocol-personal'])assert.ok(await page.locator(`dialog.tactics a[href="${href}"]`).count());
    for(const file of ['/THIRD-PARTY-NOTICES.md','/upstream/NOTICE.md','/upstream/THIRD-PARTY-NOTICES.md','/upstream/LICENSE','/licenses/README.md','/licenses/ses/LICENSE-v8']){
      const response=await page.request.get(app.url+file);assert.equal(response.status(),200,file);assert.doesNotMatch(await response.text(),/<html/i,file);
    }
    assert.deepEqual(errors,[]);
    checks.push(`${device}: Chinese/English titles, terminal attribution and rights links retained`);
    await page.getByRole('button',{name:'关闭战术终端',exact:true}).click();
    await page.evaluate(async()=>{
      const {net}=await import('/js/net.js'),{store}=await import('/js/store.js'),{data}=await import('/js/data.js');
      const until=async fn=>{const end=Date.now()+20000;while(!fn()){if(Date.now()>end)throw Error('Layout fixture readiness timeout');await new Promise(r=>setTimeout(r,100));}};
      await net.request('room.create',{mode:'solo',difficulty:'FUNNY'});
      await until(()=>store.get().room.seats.filter(s=>s&&!s.isBot).every(s=>s.content==null||s.content==='ready'));
      await net.request('room.start');await until(()=>store.get().match.public?.phase==='INFO_CHECK');
      await net.request('g.infoReady');await until(()=>store.get().match.public?.phase==='BAND_DRAFT'&&data.get('bands'));
      const band=Object.values(data.get('bands')).find(b=>!Array.isArray(b.modeTypeList)||b.modeTypeList.includes('SINGLE'));
      await net.request('g.band',{bandId:band.bandId});
    });
    const docked=page.locator('.gm__corner personal-terminal-slot .tactics-open');await docked.waitFor();
    await page.waitForFunction(async()=>(await import('/js/store.js')).store.get().match.public?.phase==='PREP');
    await page.locator('.shopbar').waitFor({state:'visible'});
    assert.equal(await page.locator('.tactics-open').count(),1,'screen replacement keeps one trigger');
    await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})));});
    const dockBox=await docked.boundingBox(),viewport=page.viewportSize();
    assert.ok(dockBox.x>=0&&dockBox.y>=0&&dockBox.x+dockBox.width<=viewport.width&&dockBox.y+dockBox.height<=viewport.height);
    for(const other of await page.locator('.gm__corner button:not(.tactics-open),.shopbar').all()){
      if(!await other.isVisible())continue;const b=await other.boundingBox();
      assert.ok(dockBox.x+dockBox.width<=b.x||b.x+b.width<=dockBox.x||dockBox.y+dockBox.height<=b.y||b.y+b.height<=dockBox.y,'terminal leaves game controls clear');
    }
    await docked.click();await page.keyboard.press('Escape');
    assert.ok(await docked.evaluate(el=>el===document.activeElement),'game terminal returns keyboard focus');
    await page.screenshot({path:output+`branding-${device}-game.png`});
    checks.push(`${device}: game toolbar trigger remains singular, clickable and clear of controls`);
    assert.deepEqual(errors,[]);
    await context.close();
  }
  const report={checks:checks.length,passed:checks,externalAssets:'blocked',physicalMobile:false,productionModified:false};
  await writeFile(output+'branding-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await app.close();}

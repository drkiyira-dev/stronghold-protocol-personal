// One browser, fixture PCM for repeatable CI, external-origin failure injected explicitly.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startPersonalServer} from './host.mjs';
const wave=Buffer.alloc(44+4410*2);wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(44100,24);wave.writeUInt32LE(88200,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(wave.length-44,40);for(let i=0;i<4410;i++)wave.writeInt16LE(Math.round(Math.sin(i*440*2*Math.PI/44100)*500),44+i*2);
const app=await startPersonalServer({port:0,log:{info(){},warn(){},error(){},debug(){}}});let browser;
const checks=[];
try{
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
  const page=await browser.newPage();page.setDefaultTimeout(25000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin===app.url)return route.continue();
    if(url.pathname.endsWith('.mp3')&&!url.pathname.includes('forced-failure'))return route.fulfill({contentType:'audio/wav',body:wave});
    return route.abort();
  });
  await page.goto(app.url);await page.getByPlaceholder(/输入你的代号/).waitFor();
  await page.evaluate(async()=>{
    window.a=(await import('/js/audio.js')).audio;window.cues=[];window.started=0;
    const s=a.sfx.bind(a);a.sfx=(name,opts)=>{cues.push(name);return s(name,opts);};
    const old=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer?.length>1)started++;return old.apply(this,args);};
    (await import('/js/ui/settings.js')).updateSettings({bgm:0,voice:0});
  });
  assert.equal(await page.evaluate(()=>a.ctx),null);
  await page.getByPlaceholder(/输入你的代号/).fill('Audio regression');
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByLabel(/界面音效/).waitFor();
  await page.waitForFunction(()=>a.ctx?.state==='running'&&started>0);
  checks.push('gesture unlock, menu click, four channel controls');
  const ui=page.getByLabel(/界面音效/),battle=page.getByLabel(/战斗音效/);
  await ui.fill('35');await battle.fill('0');
  assert.deepEqual(await page.evaluate(()=>[a.volumes.uiSfx,a.volumes.sfx]),[.35,0]);
  await page.getByRole('button',{name:'完成',exact:true}).click();
  assert.equal(await page.evaluate(()=>cues.at(-1)),'back');
  await page.reload();await page.getByPlaceholder(/输入你的代号/).waitFor();
  assert.deepEqual(await page.evaluate(async()=>{const a=(await import('/js/audio.js')).audio;return[a.volumes.uiSfx,a.volumes.sfx];}),[.35,0]);
  checks.push('UI slider independent of battle; preferences survive reload; close cue');
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.keyboard.press('Escape');await page.locator('.set-list').waitFor({state:'detached'});
  const failure=await page.evaluate(async()=>{const a=(await import('/js/audio.js')).audio;return await a._buffer('https://audio.invalid/forced-failure.mp3');});
  assert.equal(failure,null);
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByLabel(/界面音效/).fill('0');
  await page.getByRole('button',{name:'完成',exact:true}).click();
  await page.getByPlaceholder(/输入你的代号/).fill('Failure safe');
  await page.getByRole('button',{name:'开始',exact:true}).click();
  await page.getByRole('button',{name:'战术终端',exact:true}).waitFor();
  checks.push('Escape close, failed external audio, muted UI and game entry remain usable');
  assert.deepEqual(errors,[]);
  await mkdir('.cache/verification',{recursive:true});
  await writeFile('.cache/verification/audio-chromium.json',JSON.stringify({browser:browser.version(),fixtureAudio:true,checks,errors},null,2));
  console.log(JSON.stringify({checks,errors}));
}finally{await browser?.close();await app.close();}

// Serial local-only regressions. External art is unavailable by design in this suite.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startPersonalServer } from './host.mjs';

const output = fileURLToPath(new URL('../.cache/verification/', import.meta.url));
await mkdir(output, { recursive: true });
const app = await startPersonalServer({ port: 0, log: { info(){}, warn(){}, error(){}, debug(){} } });
let browser; const checks = [];
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  await context.route('**/*', r => new URL(r.request().url()).origin === app.url ? r.continue() : r.abort());
  await context.addInitScript(() => {
    window.menuListeners = [];
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function(type, fn, options) {
      if (/^pointer(move|leave)$/.test(type) && this.classList?.contains('screen')) window.menuListeners.push({ target: this, type, fn, active: true });
      return add.call(this, type, fn, options);
    };
    EventTarget.prototype.removeEventListener = function(type, fn, options) {
      for (const item of window.menuListeners) if (item.target === this && item.type === type && item.fn === fn) item.active = false;
      return remove.call(this, type, fn, options);
    };
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return /webgl/.test(type) ? null : getContext.call(this, type, ...args);
    };
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
  const waitParticles = n => page.waitForFunction(n => document.querySelectorAll('.menu-atmosphere .hub-bg__mote').length === n, n);
  const setQuality = quality => page.evaluate(async quality => (await import('/js/ui/settings.js')).updateSettings({ quality }), quality);
  const setMotion = motion => page.evaluate(async motion => (await import('/personal/visual-state.mjs')).setMenuMotion(motion), motion);
  const settle = () => page.evaluate(async () => Promise.all(document.getAnimations()
    .filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))));
  await page.goto(app.url); await page.getByRole('button', { name: '开始', exact: true }).waitFor();
  await waitParticles(18); await settle();
  const light = page.locator('.menu-light--far');
  const before = await light.evaluate(el => getComputedStyle(el).transform);
  await page.waitForTimeout(250);
  assert.notEqual(await light.evaluate(el => getComputedStyle(el).transform), before, 'light actually moves without WebGL');
  await page.mouse.move(1200, 200);
  await page.waitForFunction(() => parseFloat(document.querySelector('.title-bg').style.getPropertyValue('--menu-x')) > 0);
  assert.equal(await page.locator('.menu-atmosphere').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  await page.screenshot({ path: output + 'v12-title-animated.jpg', type: 'jpeg', quality: 85 });
  checks.push('animated title, bounded pointer parallax, no WebGL and no external assets');

  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.locator('[data-menu-motion-choice="false"]').click(); await waitParticles(0);
  assert.equal(await light.evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.getByRole('button', { name: '完成', exact: true }).click(); await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.menuMotion === 'off');
  await waitParticles(0); await page.screenshot({ path: output + 'v12-title-static.png' });
  await setMotion(true); await setQuality('medium'); await waitParticles(8); await page.reload(); await waitParticles(8);
  await setQuality('low'); await waitParticles(0);
  assert.equal(await light.evaluate(el => getComputedStyle(el).animationName), 'none');
  await setQuality('high'); await waitParticles(18);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await waitParticles(0);
  assert.equal(await light.evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await waitParticles(18);
  checks.push('static toggle and existing quality persist across reload; live system reduced motion wins');

  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await waitParticles(0);
  assert.equal(await light.evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
  assert.equal(await page.evaluate(() => window.menuListeners.filter(x => x.active).length), 0);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await waitParticles(18);
  checks.push('visibility event pauses upstream and added decoration, releases pointer handlers');

  await page.getByPlaceholder(/输入你的代号/).fill('视觉验收');
  await page.getByRole('button', { name: '开始', exact: true }).click();
  await page.locator('[data-mode="solo"]').waitFor(); await settle();
  await page.screenshot({ path: output + 'v12-lobby-animated.jpg', type: 'jpeg', quality: 85 });
  await page.getByRole('button', { name: '战术终端', exact: true }).click();
  await page.getByRole('button', { name: '关闭战术终端', exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement.className), 'tactics-open');
  await page.evaluate(async () => (await import('/js/ui/lobbyMedia.js')).setScene('frost'));
  await page.locator('[data-hub-theme="frost"]').waitFor();
  assert.equal(await page.locator('.menu-atmosphere').count(), 0, 'reuse existing themed scene without extra particles');
  await setMotion(false);
  assert.equal(await page.locator('.hub-bg__mote').first().evaluate(el => getComputedStyle(el).animationName), 'none');
  await page.evaluate(async () => (await import('/js/ui/lobbyMedia.js')).setScene('official'));
  await setMotion(true); await waitParticles(18);
  // Small synthetic, locally generated video: no third-party fixture or codec download.
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d'), stream = canvas.captureStream(5), chunks = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => chunks.push(e.data);
    const stopped = new Promise(resolve => recorder.onstop = resolve);
    recorder.start(); ctx.fillStyle = '#254b40'; ctx.fillRect(0, 0, 16, 16);
    await new Promise(resolve => setTimeout(resolve, 400));
    ctx.fillStyle = '#628d78'; ctx.fillRect(0, 0, 16, 16);
    await new Promise(resolve => setTimeout(resolve, 400));
    recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop());
    window.testVideoUrl = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
    const { mediaStore } = await import('/js/ui/lobbyMedia.js');
    mediaStore.set({ backdrop: { kind: 'video', url: window.testVideoUrl }, prefs: { ...mediaStore.get().prefs, backdrop: true } });
  });
  await page.waitForFunction(() => { const v = document.querySelector('.hub-bg__own video'); return v && !v.paused && v.currentTime > 0; });
  assert.equal(await page.locator('.menu-atmosphere').count(), 0, 'custom background has no competing overlay');
  await setMotion(false); await page.waitForFunction(() => document.querySelector('.hub-bg__own video')?.paused);
  await setMotion(true); await page.waitForFunction(() => !document.querySelector('.hub-bg__own video')?.paused);
  await setQuality('low'); await page.waitForFunction(() => document.querySelector('.hub-bg__own video')?.paused);
  await setQuality('high'); await page.waitForFunction(() => !document.querySelector('.hub-bg__own video')?.paused);
  await page.evaluate(async () => {
    (await import('/js/ui/lobbyMedia.js')).mediaStore.set({ backdrop: null }); URL.revokeObjectURL(window.testVideoUrl);
  });
  await waitParticles(18);
  checks.push('user-owned video pauses/resumes on static and low quality; custom scenes keep a single atmosphere');
  for (let n = 0; n < 6; n++) {
    await page.evaluate(async () => (await import('/js/store.js')).store.patch('session', { entered: false }));
    await page.locator('.title-screen').waitFor();
    await page.evaluate(async () => (await import('/js/store.js')).store.patch('session', { entered: true }));
    await page.locator('.lobby-hub').waitFor();
  }
  await settle();
  assert.equal(await page.locator('.menu-atmosphere').count(), 1);
  assert.equal(await page.evaluate(() => window.menuListeners.filter(x => x.active).length), 2);
  assert.equal(await page.evaluate(() => window.menuListeners.filter(x => x.active && !x.target.isConnected).length), 0);
  assert.equal(await page.locator('.tactics-open').count(), 1);
  checks.push('title/lobby transition, terminal focus, existing frost scene and six route cycles release old resources');

  await page.setViewportSize({ width: 852, height: 393 }); await settle();
  const button = page.locator('.tactics-open');
  assert.ok(await button.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }));
  await page.screenshot({ path: output + 'v12-lobby-mobile.png' });
  await page.evaluate(async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === 'sp.pref.personal.visuals.v1') throw new Error('quota'); return original.call(this, key, value); };
    (await import('/personal/visual-state.mjs')).setMenuMotion(false);
  });
  await waitParticles(0);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByText('浏览器未能保存此设置，本次页面仍然生效。', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  checks.push('mobile landscape controls remain hit-testable; denied storage reports failure without stopping UI');
  await context.close();
} finally { await browser?.close(); await app.close(); }
await writeFile(output + 'v12-visuals.json', JSON.stringify({ checks }, null, 2));
console.log(JSON.stringify({ suite: 'v12 menu visuals', passed: checks.length, checks }, null, 2));

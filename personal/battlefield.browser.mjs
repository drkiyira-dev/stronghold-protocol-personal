// Serial, real renderer + browser simulation on a plain static server. No art
// downloads; comparisons contain only upstream GPL procedural graphics.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startBattlefieldPreview } from './battlefield-preview.mjs';

const app = await startBattlefieldPreview(), results = [];
let browser;
await mkdir('.cache/verification', { recursive: true });
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true,
    args: ['--enable-precise-memory-info'] });
  for (const seed of [5, 3]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
    await context.route('**/*', route => new URL(route.request().url()).origin === app.url ? route.continue() : route.abort());
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(30000);
    await page.goto(app.url + '/?seed=' + seed);
    await page.getByPlaceholder(/输入你的代号/).fill('V13 QA'); await page.getByRole('button', { name: '开始', exact: true }).click();
    await page.locator('#v13-prepare').click();
    await page.waitForFunction(() => /"phase": "(ready|failed)"/.test(document.querySelector('#v13-status').textContent), {}, { timeout: 90000 });
    const result = () => JSON.parse(app.reports.at(-1) ? JSON.stringify(app.reports.at(-1)) : '{}');
    assert.equal(result().phase, 'ready', JSON.stringify(result()));
    const env = () => page.evaluate(() => __SP_VIEW__.raw.stats().environment);
    const meshState = () => page.evaluate(() => {
      const root = __SP_VIEW__.raw.debug.app.stage.children.flatMap(c => c.children || []).flatMap(c => c.children || [])
        .find(c => c.label === 'personal-battlefield-atmosphere');
      return root?.children.map(m => ({ alpha: m.alpha, vertices: [...m.vertices] }));
    });
    await page.waitForFunction(() => __SP_VIEW__?.raw.stats().environment.meshes > 0);
    await page.waitForTimeout(2500); // Let the original PREP banner/camera transition finish.
    const high = await env(); assert.ok(high.meshes <= 24); assert.equal(high.error, null);
    const rendered = await page.evaluate(() => {
      const app = __SP_VIEW__.raw.debug.app;
      const root = app.stage.children.flatMap(c => c.children || []).flatMap(c => c.children || []).find(c => c.label === 'personal-battlefield-atmosphere');
      // Pixi's extractor disposes its temporary render target. Test actual GPU
      // output: changing CPU vertices alone is not proof of visible animation.
      const pixels = app.renderer.extract.pixels(root);
      return { bytes: pixels.length, nonempty: pixels.some(value => value !== 0) };
    });
    assert.ok(rendered.bytes > 0 && rendered.nonempty, 'projected atmosphere must draw visible pixels');
    const moved = await meshState(); await page.waitForTimeout(200); assert.notDeepEqual(await meshState(), moved);
    const shot = suffix => page.screenshot({ path: `.cache/verification/v13-${seed}-${suffix}.jpg`, type: 'jpeg', quality: 85,
      style: 'aside:has(#v13-prepare){visibility:hidden}' });
    await shot('animated');
    for (const [control, cap] of [['static', 0], ['low', 0], ['medium', 8], ['high', 24]]) {
      await page.locator('#v13-' + control).click();
      await page.waitForFunction(cap => { const e = __SP_VIEW__.raw.stats().environment; return cap === 0 ? e.meshes === 0 : e.meshes > 0 && e.meshes <= cap; }, cap);
      if (!cap) { const clock = (await env()).clock; await page.waitForTimeout(100); assert.equal((await env()).clock, clock); }
      if (control === 'static') await shot('static');
    }
    // Freeze cosmetics, not the original event timers. Imported scene test uses
    // synthetic material uniforms, never downloads or republishes original art.
    const sceneClock = await page.evaluate(async () => {
      const { BoardScene } = await import('/js/render/board3d/scene.js');
      const scene = Object.create(BoardScene.prototype), cam = { version: 1 };
      const material = () => ({ uniforms: { uTime: { value: 0 } } });
      Object.assign(scene, { camRef: cam, camVersion: 1, time: 0, focus: { uFocus: { value: {} } },
        mat: Object.fromEntries(['water', 'mire', 'infection', 'smog'].map(k => [k, material()])),
        flashes: [{ t: 0 }], sceneWater: [material()], official: {}, renderer: { render() {} }, frames: 0, lastMs: 0 });
      for (let i = 1; i <= 15; i++) scene.render(cam, i * .1, 0);
      const staticState = { water: scene.mat.water.uniforms.uTime.value, official: scene.sceneWater[0].uniforms.uTime.value, flashes: scene.flashes.length };
      scene.render(cam, 1.6, 7);
      return { staticState, moving: scene.sceneWater[0].uniforms.uTime.value };
    });
    assert.deepEqual(sceneClock, { staticState: { water: 0, official: 0, flashes: 0 }, moving: 7 });
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForFunction(() => __SP_VIEW__.raw.stats().environment.meshes === 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.waitForFunction(() => __SP_VIEW__.raw.stats().environment.meshes > 0);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal((await env()).meshes, 0);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => __SP_VIEW__.raw.stats().environment.meshes > 0);
    // Exercise the actual Pixi context-loss path, without creating another GPU context.
    const lossSupported = await page.evaluate(() => {
      window.__qaLoss = __SP_VIEW__.raw.debug.app.renderer.gl.getExtension('WEBGL_lose_context');
      if (!__qaLoss) return false; __qaLoss.loseContext(); return true;
    });
    if (lossSupported) {
      await page.waitForFunction(() => __SP_VIEW__.raw.stats().environment.meshes === 0);
      await page.waitForTimeout(100); await page.evaluate(() => __qaLoss.restoreContext());
      try { await page.waitForFunction(() => __SP_VIEW__.raw.stats().environment.meshes > 0, {}, { timeout: 10000 }); }
      catch (error) { console.error('Context restore:', await env(), errors); throw error; }
      await page.evaluate(() => { delete window.__qaLoss; });
    }
    // No alternate geometry: original picking still returns the same board tile.
    assert.ok(await page.evaluate(() => { const v = __SP_VIEW__.raw, p = v.tileScreen(10, 6); return p && v.debug.pick.groundTile(p.x, p.y); }));
    await page.locator('#v13-perf').click();
    await page.waitForFunction(() => /"phase": "(measured|failed)"/.test(document.querySelector('#v13-status').textContent), {}, { timeout: 60000 });
    assert.equal(result().phase, 'measured'); assert.equal(result().perf.length, 3);
    assert.ok(result().perf.every(p => p.samples > 10));
    // Quality toggles and room teardown must not accumulate added geometry.
    for (let i = 0; i < 6; i++) { await page.locator('#v13-static').click(); await page.locator('#v13-high').click(); }
    await page.waitForFunction(n => __SP_VIEW__.raw.stats().environment.meshes === n, high.meshes);
    assert.equal((await env()).meshes, high.meshes);
    await page.locator('#v13-fight').click();
    await page.waitForFunction(() => /"phase": "(complete|failed)"/.test(document.querySelector('#v13-status').textContent), {}, { timeout: 90000 });
    assert.equal(result().round, 2, JSON.stringify(result())); assert.deepEqual(result().errors, []); assert.deepEqual(errors, []);
    const final = result();
    await page.evaluate(() => {
      window.__qaReleasedRoot = __SP_VIEW__.raw.debug.app.stage.children.flatMap(c => c.children || []).flatMap(c => c.children || []).find(c => c.label === 'personal-battlefield-atmosphere');
    });
    await page.getByRole('button', { name: '离开', exact: true }).click();
    await page.getByRole('button', { name: '放弃模拟', exact: true }).click();
    await page.waitForFunction(() => !globalThis.__SP_VIEW__);
    assert.equal(await page.evaluate(() => __qaReleasedRoot.destroyed), true);
    results.push({ ...final, high, rendered, contextLoss: lossSupported ? 'passed' : 'unsupported', teardown: true, lifecycleToggles: 6, errors });
    console.log(JSON.stringify({ seed, stage: result().stage, meshes: high.meshes, round: result().round, errors }));
    await context.close();
  }
  // No WebGL: upstream DOM fallback still buys, deploys, simulates and settles.
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === app.url ? route.continue() : route.abort());
  await context.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /webgl/i.test(type) ? null : get.call(this, type, ...args); }; });
  const page = await context.newPage(); await page.goto(app.url + '/?seed=3');
  await page.getByPlaceholder(/输入你的代号/).fill('Fallback QA'); await page.getByRole('button', { name: '开始', exact: true }).click();
  await page.locator('#v13-prepare').click(); await page.waitForFunction(() => /"phase": "(ready|failed)"/.test(document.querySelector('#v13-status').textContent), {}, { timeout: 90000 });
  assert.equal(app.reports.at(-1).phase, 'ready'); assert.equal(await page.evaluate(() => __SP_VIEW__.kind), 'fallback');
  await page.locator('#v13-fight').click(); await page.waitForFunction(() => /"phase": "(complete|failed)"/.test(document.querySelector('#v13-status').textContent), {}, { timeout: 90000 });
  assert.equal(app.reports.at(-1).round, 2); assert.deepEqual(app.reports.at(-1).errors, []);
  results.push({ webglUnavailable: true, round: 2 }); await context.close();
} finally { await browser?.close(); await app.close(); }
await writeFile('.cache/verification/v13-browser.json', JSON.stringify(results, null, 2));

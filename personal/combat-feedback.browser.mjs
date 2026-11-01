import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startBattlefieldPreview } from './battlefield-preview.mjs';

const app = await startBattlefieldPreview({ combat: true });
let browser;
const errors = [], evidence = {};
await mkdir('.cache/verification', { recursive: true });
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  await context.route('**/*', r => new URL(r.request().url()).origin === app.url ? r.continue() : r.abort());
  const page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(e.message));
  globalThis.qaPage = page;
  await page.goto(app.url + '/?seed=3');
  await page.getByPlaceholder(/输入你的代号/).fill('Combat QA');
  await page.getByRole('button', { name: '开始', exact: true }).click();
  await page.locator('#v13-prepare').click();
  await page.waitForFunction(() => /"phase": "(ready|failed)"/.test(document.querySelector('#v13-status').textContent), {}, { timeout: 90000 });
  assert.equal(app.reports.findLast(r => r.phase === 'ready' || r.phase === 'failed')?.phase, 'ready');
  const feedback = () => page.evaluate(() => __SP_VIEW__.raw.stats().combatFeedback);
  assert.equal((await feedback()).counts.deploy, 1);
  await page.waitForTimeout(1800); // Original prep camera flight/banner.
  const choose = async () => {
    await page.waitForFunction(() => [...__SP_VIEW__.raw.debug.views.values()].every(v => !v._tween));
    const at = await page.evaluate(async () => {
      const { store } = await import('/js/store.js'), piece = store.get().match.private.board[0];
      const tile = __SP_VIEW__.raw.tileScreen(piece.row, piece.col);
      return { x: tile.x, y: tile.y };
    });
    await page.mouse.click(at.x, at.y); await page.locator('.uframe').waitFor();
  };
  const shot = name => page.screenshot({ path: `.cache/verification/v13-combat-${name}.jpg`, type: 'jpeg', quality: 85,
    style: 'aside:has(#v13-prepare),aside:has(#cf-retreat){visibility:hidden}' });
  await choose();
  assert.equal(await page.locator('.uframe__dia').evaluate(e => getComputedStyle(e).animationName), 'personal-selection-in');
  await shot('selected');
  // Actual original action button, not a forged render event.
  await page.locator('.uframe__btn--retreat').click();
  await page.waitForFunction(() => __SP_VIEW__.raw.stats().combatFeedback.counts.retreat === 1);
  await shot('retreat');
  await page.locator('#cf-deploy').click();
  await page.waitForFunction(() => __SP_VIEW__.raw.stats().combatFeedback.counts.deploy === 2);
  await shot('deploy');
  await page.locator('#cf-move').click();
  await page.waitForFunction(() => __SP_VIEW__.raw.stats().combatFeedback.counts.move === 1);
  await shot('move');
  evidence.confirmedActions = await feedback();
  // A rejected command must not produce a success cue or change the board.
  const rejected = await page.evaluate(async () => {
    const { net } = await import('/js/net.js'), { store } = await import('/js/store.js');
    const before = JSON.stringify(store.get().match.private.board), uid = store.get().match.private.board[0].uid;
    try { await net.request('g.move', { uid, to: { area: 'board', row: -1, col: -1 } }); return false; }
    catch { return before === JSON.stringify(store.get().match.private.board); }
  });
  assert.equal(rejected, true);
  assert.deepEqual((await feedback()).counts, evidence.confirmedActions.counts);
  await page.locator('#v13-static').click();
  await page.locator('#cf-move').click();
  assert.deepEqual((await feedback()).counts, evidence.confirmedActions.counts);
  await choose();
  assert.equal(await page.locator('.uframe__dia').evaluate(e => getComputedStyle(e).animationName), 'none');
  await shot('static');
  await page.locator('#v13-high').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.uframe__dia').evaluate(e => getComputedStyle(e).animationName), 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#v13-fight').click();
  await page.waitForFunction(() => __SP_VIEW__.raw.stats().combatFeedback.counts.skill > 0);
  assert.ok(await page.evaluate(() => [...__SP_VIEW__.raw.debug.tiles.highlights.entries()]
    .some(([key, value]) => key.startsWith('personal-combat-') && value.style.color === 0xffd37a && value.tiles.length)),
  'the actual skill activation reaches the upstream terrain highlight renderer');
  await shot('skill');
  await page.locator('.rdialog').waitFor({ timeout: 90000 });
  assert.equal(await page.locator('.rdialog').evaluate(e => getComputedStyle(e).pointerEvents), 'none');
  assert.equal(await page.locator('.rdialog__box').evaluate(e => getComputedStyle(e).animationName), 'personal-result-in');
  await shot('settlement');
  await page.waitForFunction(() => /"phase": "(complete|failed)"/.test(document.querySelector('#v13-status').textContent), {}, { timeout: 90000 });
  await page.locator('#cf-inspect').click();
  await page.waitForFunction(() => {
    try { return JSON.parse(document.querySelector('#cf-status').textContent).round === 2; } catch { return false; }
  });
  evidence.final = app.reports.findLast(r => r.phase === 'combat-feedback');
  assert.equal(evidence.final.round, 2); assert.equal(evidence.final.results.length, 1);
  assert.ok(evidence.final.stats.counts.skill > 0, 'original simulation emitted and presented an ally skill');
  assert.equal(evidence.final.stats.error, null); assert.deepEqual(errors, []);
  await page.getByRole('button', { name: '离开', exact: true }).click();
  await page.getByRole('button', { name: '放弃模拟', exact: true }).click();
  await page.waitForFunction(() => !globalThis.__SP_VIEW__);
  evidence.teardown = true; evidence.errors = errors;
  await context.close();
} catch (error) {
  await globalThis.qaPage?.screenshot({ path: '.cache/verification/v13-combat-failure.jpg' });
  throw error;
} finally { await browser?.close(); await app.close(); }
await writeFile('.cache/verification/v13-combat-browser.json', JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));

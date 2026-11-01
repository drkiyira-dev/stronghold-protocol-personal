// Instrumented preview, never shipped. Game actions use normal worker protocol;
// fixed-seed challenge selection still uses the original HARD mode map pool.
import { store } from '/js/store.js';
import { net } from '/js/net.js';
import { data } from '/js/data.js';
import { updateSettings } from '/js/ui/settings.js';
import { setMenuMotion } from '/personal/visual-state.mjs';

const seed = new URL(location).searchParams.get('seed') === '5' ? 5 : 3;
const report = { seed, startedAt: new Date().toISOString(), ua: navigator.userAgent, errors: [], phase: 'idle', perf: [] };
const panel = document.createElement('aside');
panel.style.cssText = 'position:fixed;right:8px;top:100px;z-index:99999;background:#101917ed;color:#e0fff3;padding:8px;width:310px;font:12px monospace';
panel.innerHTML = `<strong>LOCAL V13 QA · ${seed === 5 ? '排气格栅' : '涨潮控制'}</strong>
<div><button id="v13-prepare">准备真实对局</button><button id="v13-fight">战斗至 R2</button></div>
<div><button id="v13-static">静态</button><button id="v13-low">低</button><button id="v13-medium">中</button><button id="v13-high">高</button></div>
<div><button id="v13-perf">测量静态/动态/静态</button><button id="v13-inspect">采集状态</button><button id="v13-hide">隐藏面板</button></div>
<pre id="v13-status" style="max-height:170px;overflow:auto;white-space:pre-wrap">先填写代号并进入大厅，再准备对局。</pre>`;
document.body.append(panel);
panel.querySelector('#v13-hide').onclick = () => { panel.style.display = 'none'; };
window.addEventListener('error', e => report.errors.push(e.message));
window.addEventListener('unhandledrejection', e => report.errors.push(String(e.reason?.message || e.reason)));
const until = async (fn, timeout = 90000) => {
  const start = performance.now();
  while (!fn()) { if (performance.now() - start > timeout) throw Error('Timed out: ' + report.phase); await new Promise(r => setTimeout(r, 100)); }
};
const view = () => globalThis.__SP_VIEW__?.raw;
function snapshot() {
  const v = view(), renderer = v?.debug?.app?.renderer;
  return { ...(v?.stats?.() || {}), viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
    visibility: document.visibilityState, focused: document.hasFocus(), rendererKind: globalThis.__SP_VIEW__?.kind ?? null,
    heapBytes: performance.memory?.usedJSHeapSize ?? null,
    pixiTextures: renderer?.texture?.managedTextures?.length ?? null,
    pixiGeometries: renderer?.geometry?.managedGeometries ? Object.keys(renderer.geometry.managedGeometries).length : null,
    gpuBytes: null, gpuUtilization: null, matchPhase: store.get().match?.public?.phase };
}
async function publish() {
  report.current = snapshot();
  const { phase, stage, round, errors } = report;
  const display = JSON.stringify({ phase, stage, round,
    environment: report.current.environment, errors,
    perf: report.perf.map(p => ({ label: p.label, fps: Math.round(p.fps * 10) / 10, frameP95Ms: p.frameP95Ms })) }, null, 2);
  const response = await fetch('/__v13-result', { method: 'POST', body: JSON.stringify(report) });
  if (!response.ok) throw Error('QA report rejected: ' + response.status);
  // UI completion is the harness's synchronization point. Publish it only
  // after the receiver has acknowledged this exact report, not before fetch.
  panel.querySelector('pre').textContent = display;
}
async function prepare() {
  report.phase = 'preparing'; updateSettings({ quality: 'high' }); setMenuMotion(true);
  await net.request('room.create', { mode: 'solo', difficulty: 'HARD' });
  await net.request('room.start'); await until(() => store.get().match.public?.phase === 'INFO_CHECK');
  await net.request('g.infoReady'); await until(() => store.get().match.public?.phase === 'BAND_DRAFT');
  const band = Object.values(data.get('bands')).find(x => !Array.isArray(x.modeTypeList) || x.modeTypeList.includes('SINGLE'));
  await net.request('g.band', { bandId: band.bandId });
  await until(() => store.get().match.public?.phase === 'PREP');
  await until(() => !!view()?.stats?.().environment || globalThis.__SP_VIEW__?.kind === 'fallback');
  report.stage = store.get().match.public.stageId;
  if (report.stage !== (seed === 5 ? 'act2autochess_m03' : 'act2autochess_m04')) throw Error('Unexpected original map selection');
  // Exercise ordinary buy and valid deployment. No injected units or changed rules.
  const p = store.get().match.private, chess = data.get('chess');
  const slot = p.shop.slots.findIndex(s => s?.kind === 'chess' && !s.sold && s.price <= p.funds && chess[s.id]);
  if (slot < 0) throw Error('No affordable fixture operator');
  await net.request('g.buy', { slot }); const piece = store.get().match.private.hand.find(x => x?.kind === 'chess');
  for (const [row, col] of data.get('stages')[report.stage].deployTiles.normal.melee) {
    try { await net.request('g.move', { uid: piece.uid, to: { area: 'board', row, col }, dir: 'RIGHT' }); report.deployed = { row, col, uid: piece.uid }; break; } catch { /* try next legal original tile */ }
  }
  if (!report.deployed) throw Error('No legal tile for fixture');
  report.phase = 'ready';
}
async function fight() {
  report.phase = 'combat'; await publish(); await net.request('g.ready', { ready: true });
  await until(() => store.get().match.public?.phase === 'PREP' && store.get().match.public.round === 2);
  report.phase = 'complete'; report.round = 2;
}
async function sample(label, duration = 4000) {
  const frames = [], cpu = [], renders = []; let previous, raf;
  const before = snapshot(), start = performance.now();
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { cancelAnimationFrame(raf); reject(Error('Performance sample suspended')); }, duration + 10000);
    const tick = now => {
      if (document.hidden) { clearTimeout(timeout); reject(Error('Hidden sample is invalid')); return; }
      if (previous !== undefined) frames.push(now - previous); previous = now;
      const s = view()?.stats(); if (s) { cpu.push(s.cpuMs); renders.push(s.renderMs); }
      if (now - start >= duration) { clearTimeout(timeout); resolve(); } else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
  const percentile = (a, p) => a.length ? [...a].sort((a, b) => a - b)[Math.min(a.length - 1, Math.floor(a.length * p))] : null;
  return { label, durationMs: performance.now() - start, samples: frames.length,
    fps: frames.length * 1000 / frames.reduce((a, b) => a + b, 0), frameP95Ms: percentile(frames, .95),
    cpuP50Ms: percentile(cpu, .5), renderP50Ms: percentile(renders, .5), before, after: snapshot() };
}
async function perf() {
  report.phase = 'measuring'; report.perf = []; updateSettings({ quality: 'high' });
  for (const [label, motion] of [['static-before', false], ['animated', true], ['static-after', false]]) {
    setMenuMotion(motion); await new Promise(r => setTimeout(r, 1000));
    report.perf.push(await sample(label)); await publish();
  }
  setMenuMotion(true); report.phase = 'measured';
}
for (const [id, action] of [['prepare', prepare], ['fight', fight], ['perf', perf], ['inspect', async () => {}],
  ['static', async () => setMenuMotion(false)], ...['low', 'medium', 'high'].map(quality => [quality, async () => { setMenuMotion(true); updateSettings({ quality }); }])]) {
  panel.querySelector('#v13-' + id).onclick = async e => {
    e.target.disabled = true;
    try { await action(); } catch (error) { report.errors.push(error.stack || String(error)); report.phase = 'failed'; }
    finally {
      // Settings reach the field through Preact; report the resulting frame,
      // not the previous tier captured synchronously inside the button event.
      await new Promise(resolve => {
        let frame;
        const finish = () => { cancelAnimationFrame(frame); clearTimeout(timeout); resolve(); };
        const timeout = setTimeout(finish, 250);
        frame = requestAnimationFrame(() => { frame = requestAnimationFrame(finish); });
      });
      e.target.disabled = false; await publish();
    }
  };
}
await publish();

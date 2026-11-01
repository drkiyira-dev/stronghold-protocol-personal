// LOCAL QA ONLY: normal worker commands and observations, no modified units,
// simulation events, clock or rule values. Not shipped in the static artifact.
import { store } from '/js/store.js';
import { net } from '/js/net.js';
import { data } from '/js/data.js';
const panel = document.createElement('aside');
panel.style.cssText = 'position:fixed;right:8px;top:410px;z-index:99999;background:#101917ed;color:#e0fff3;padding:8px;width:310px;font:12px monospace';
panel.innerHTML = `<strong>LOCAL QA · COMMITTED FEEDBACK</strong><div>
<button id="cf-retreat">撤退</button><button id="cf-deploy">部署</button><button id="cf-move">移动</button>
<button id="cf-inspect">采集反馈</button></div><pre id="cf-status" style="white-space:pre-wrap">先准备真实对局。</pre>`;
document.body.append(panel);
const stats = () => globalThis.__SP_VIEW__?.raw?.stats?.().combatFeedback;
const state = () => store.get().match;
const records = [], results = [];
const publish = async () => {
  const record = { seed: 'combat', ua: navigator.userAgent, phase: 'combat-feedback',
    stats: stats(), records, results, matchPhase: state()?.public?.phase, round: state()?.public?.round };
  const res = await fetch('/__v13-result', { method: 'POST', body: JSON.stringify(record) });
  if (!res.ok) throw Error('QA report refused');
  panel.querySelector('pre').textContent = JSON.stringify({ ...record, ua: undefined, records: records.slice(-2) }, null, 2);
};
new MutationObserver(() => {
  const box = document.querySelector('.rdialog');
  if (box && !box.dataset.qaObserved) {
    box.dataset.qaObserved = 'true';
    results.push({ text: box.textContent.trim(), animation: getComputedStyle(box.querySelector('.rdialog__box')).animationName,
      pointerEvents: getComputedStyle(box).pointerEvents, round: state()?.public?.round, feedback: stats() });
  }
}).observe(document.body, { childList: true, subtree: true });
for (const id of ['retreat', 'deploy', 'move', 'inspect']) panel.querySelector('#cf-' + id).onclick = async e => {
  e.target.disabled = true;
  try {
    const p = state().private;
    if (id === 'retreat') {
      const piece = p.board.find(x => x?.kind === 'chess');
      if (!piece) throw Error('No board operator');
      const idx = p.hand.findIndex(x => !x);
      if (idx < 0) throw Error('Bench full');
      await net.request('g.move', { uid: piece.uid, to: { area: 'hand', idx } });
    } else if (id === 'deploy' || id === 'move') {
      const piece = id === 'deploy' ? p.hand.find(x => x?.kind === 'chess') : p.board.find(x => x?.kind === 'chess');
      if (!piece) throw Error('No available operator');
      const stage = data.get('stages')[state().public.stageId], targets = stage.deployTiles.normal;
      let moved = false;
      for (const [row, col] of [...targets.melee, ...targets.rangedOnly]) {
        if (p.board.some(x => x.row === row && x.col === col)) continue;
        try { await net.request('g.move', { uid: piece.uid, to: { area: 'board', row, col }, dir: 'RIGHT' }); moved = true; break; } catch { /* original placement validation */ }
      }
      if (!moved) throw Error('No legal target');
    }
    // Wait for the actual presentation to consume the committed snapshot.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    records.push({ action: id, stats: stats() });
  } catch (error) { records.push({ action: id, error: String(error) }); }
  finally { e.target.disabled = false; await publish(); }
};

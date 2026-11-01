// Local QA only. A static host plus a bounded report sink; no game server,
// asset proxy or production endpoint. This file/probe are never copied to dist.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Runs synchronously before the client modules: preview startup and the first
// Start gesture must be silent, not just the later preparation helper.
export const PREVIEW_INIT = `let prefs = {};
try { prefs = JSON.parse(localStorage.getItem('sp.pref.settings') || '{}') || {}; } catch {}
localStorage.setItem('sp.pref.settings', JSON.stringify({...prefs, muted:true}));
const seed = new URL(location).searchParams.get('seed') === '5' ? 5 : 3;
localStorage.setItem('stronghold.personal.challenge', JSON.stringify({kind:'stronghold-personal-challenge',version:1,id:'v13-qa-'+seed,name:'LOCAL V13 QA',description:'Unmodified HARD map pool with a fixed seed.',seed,difficulty:'HARD',rules:{maxDeploy:10,noRefresh:false,noEquipment:false,bannedOperators:[]}}));`;

export async function startBattlefieldPreview({ port = 0, reportDelayMs = 0, combat = false } = {}) {
  const root = resolve('dist'), reports = [];
  const html = (await readFile(root + '/index.html', 'utf8')).replace('</head>', '<script src="/__v13-init.js"></script></head>')
    .replace('</body>', '<script type="module" src="/__v13-probe.mjs"></script>'
      + (combat ? '<script type="module" src="/__v13-combat-probe.mjs"></script>' : '') + '</body>');
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/__v13-result' && req.method === 'POST') {
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 300000) { res.writeHead(413).end(); return; } }
        const report = JSON.parse(body);
        // Regression fixture: the UI must not announce a phase before this
        // receiving side has accepted its evidence, even on a slow CI runner.
        if (reportDelayMs > 0) await new Promise(r => setTimeout(r, reportDelayMs));
        reports.push(report);
        await mkdir('.cache/verification', { recursive: true });
        const browser = report.ua?.includes('Chrome') ? 'chrome' : 'safari';
        await writeFile(`.cache/verification/v13-${browser}-${report.seed}.json`, JSON.stringify(report, null, 2));
        res.end('ok'); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
      let body, type;
      if (url.pathname === '/') { body = html; type = 'text/html'; }
      else if (url.pathname === '/__v13-init.js') { body = PREVIEW_INIT; type = 'text/javascript'; }
      else if (url.pathname === '/__v13-probe.mjs') { body = await readFile('personal/battlefield-probe.mjs'); type = 'text/javascript'; }
      else if (combat && url.pathname === '/__v13-combat-probe.mjs') { body = await readFile('personal/combat-feedback-probe.mjs'); type = 'text/javascript'; }
      else {
        const file = resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + '/')) throw Error('path');
        body = await readFile(file); type = mime[extname(file)] || 'application/octet-stream';
      }
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        // Phase-2 evidence intentionally uses only shipped procedural art.
        // Keeps native screenshots free of newly redistributed game assets.
        ...(combat ? { 'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'" } : {}) });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404).end('Not found'); }
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, reports,
    close: () => new Promise(r => { server.closeIdleConnections(); server.close(r); }) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await startBattlefieldPreview({ port: 4183, combat: process.argv.includes('--combat') });
  console.log(app.url + '/?seed=5'); console.log(app.url + '/?seed=3');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close().then(() => process.exit()));
}
